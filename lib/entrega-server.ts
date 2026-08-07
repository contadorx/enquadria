import { createAdminClient } from "./supabase-admin";
import {
  avaliarDisjuntor,
  acaoPara,
  type Disjuntor,
  type Caminho,
  type StatusSaida,
  type LinhaSaida,
} from "./entrega-garantida";

/**
 * O LADO DE SERVIDOR DA ENTREGA GARANTIDA — banco e nada de decisão.
 *
 * As regras (o que é perdido, quando reenviar, quando abrir o disjuntor) moram
 * em `lib/entrega-garantida.ts`, puras e testadas. Aqui é só ler e gravar.
 *
 * UMA REGRA ATRAVESSA O ARQUIVO INTEIRO: **nada aqui pode impedir um e-mail de
 * sair.** Se o Supabase estiver fora, se a migration não tiver rodado, se a
 * chave de serviço faltar — o registro se perde e a mensagem vai embora do
 * mesmo jeito. Um sistema de auditoria que derruba o que audita é pior que não
 * ter auditoria nenhuma.
 */

const DISJUNTOR_FECHADO: Disjuntor = { estado: "fechado", motivo: null, desde: null };

/**
 * O estado do envio próprio.
 *
 * Falha de leitura devolve FECHADO, e a escolha é deliberada: na dúvida, usar
 * o caminho normal. Devolver "aberto" por erro de banco desviaria tudo para a
 * Brevo em silêncio e queimaria a cota dela por causa de um timeout.
 */
export async function lerDisjuntor(): Promise<Disjuntor> {
  const admin = createAdminClient();
  if (!admin) return DISJUNTOR_FECHADO;
  try {
    const { data, error } = await admin
      .from("email_disjuntor")
      .select("estado, motivo, desde")
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) return DISJUNTOR_FECHADO;
    return {
      estado: (data.estado as Disjuntor["estado"]) ?? "fechado",
      motivo: (data.motivo as string) ?? null,
      desde: (data.desde as string) ?? null,
    };
  } catch {
    return DISJUNTOR_FECHADO;
  }
}

export async function gravarDisjuntor(d: Disjuntor): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;
  await admin
    .from("email_disjuntor")
    .update({
      estado: d.estado,
      motivo: d.motivo,
      desde: d.desde,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", 1);
}

export interface RegistroSaida {
  chave: string;
  para: string;
  tag: string;
  assunto?: string;
  caminho: Caminho;
  mensagem_id?: string | null;
  status: StatusSaida;
  tentativas?: number;
  erro?: string | null;
  referencia?: string | null;
}

/**
 * Registra a saída. `upsert` por (chave, caminho) porque a mesma mensagem pelo
 * mesmo caminho é a MESMA mensagem — retry de rota, duplo clique, replay de
 * fila. Reenvio pelo outro caminho cria linha nova, e é isso que permite
 * auditar depois "saiu duas vezes, por caminhos diferentes, e por quê".
 */
export async function registrarSaida(r: RegistroSaida): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;
  try {
    await admin.from("emails_saida").upsert(
      {
        chave: r.chave,
        para: r.para,
        tag: r.tag,
        assunto: r.assunto ?? null,
        caminho: r.caminho,
        mensagem_id: r.mensagem_id ?? null,
        status: r.status,
        tentativas: r.tentativas ?? 0,
        erro: r.erro ?? null,
        referencia: r.referencia ?? null,
        ...(r.status === "entregue" ? { confirmado_em: new Date().toISOString() } : {}),
      },
      { onConflict: "chave,caminho" }
    );
  } catch (e) {
    // ver a nota do topo: o registro nunca derruba o envio
    console.error("[entrega] não consegui registrar a saída:", e instanceof Error ? e.message : e);
  }
}

/**
 * O WEBHOOK ENCONTROU A MENSAGEM — marca o que aconteceu com ela.
 *
 * Só avança o ciclo de vida: uma mensagem já `entregue` não volta para
 * `aceito` porque chegou um evento atrasado, e `falhou` não vira `entregue`.
 * Webhooks chegam fora de ordem e repetidos; tratar isso aqui evita que a
 * varredura reenvie algo que já foi entregue.
 */
export async function confirmarPorMensagemId(
  mensagemId: string,
  status: Extract<StatusSaida, "entregue" | "falhou">,
  erro?: string | null
): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin || !mensagemId) return false;
  try {
    const { data } = await admin
      .from("emails_saida")
      .update({
        status,
        confirmado_em: new Date().toISOString(),
        ...(erro ? { erro } : {}),
      })
      .eq("mensagem_id", mensagemId)
      .in("status", ["aceito", "perdido"])
      .select("id");
    return (data?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Mesmo efeito, quando o provedor não devolve id que dê para casar (a Brevo
 * manda o e-mail, não o id). Casa pelo destinatário mais recente ainda em
 * aberto — e só isso: casar por e-mail sem limite marcaria como entregue uma
 * mensagem antiga que nunca chegou.
 */
export async function confirmarPorEmail(
  para: string,
  status: Extract<StatusSaida, "entregue" | "falhou">
): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin || !para) return false;
  try {
    const { data: alvo } = await admin
      .from("emails_saida")
      .select("id")
      .eq("para", para.toLowerCase())
      .in("status", ["aceito", "perdido"])
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!alvo?.id) return false;
    await admin
      .from("emails_saida")
      .update({ status, confirmado_em: new Date().toISOString() })
      .eq("id", alvo.id);
    return true;
  } catch {
    return false;
  }
}

/* ══════════════════════════ A VARREDURA ══════════════════════════════════ */

export interface ResultadoVarredura {
  examinadas: number;
  reenviadas: number;
  desistidas: number;
  disjuntor: Disjuntor;
  mudou: boolean;
  erros: string[];
}

/**
 * A VARREDURA — o coração da garantia, e ela roda no cron.
 *
 * Faz três coisas, nesta ordem, e a ordem importa:
 *
 *  1. marca como PERDIDA toda mensagem aceita pelo Postal que passou da janela
 *     sem confirmação;
 *  2. REENVIA as perdidas pela Brevo (uma linha nova, caminho novo);
 *  3. só então reavalia o DISJUNTOR — com a foto já atualizada, senão a
 *     decisão sairia de dados velhos.
 *
 * `enviarPelaBrevo` entra por parâmetro para este arquivo não depender do
 * driver, e para o teste poder rodar a varredura inteira sem rede.
 */
export async function varrerEntregas(
  enviarPelaBrevo: (m: { para: string; assunto: string; html: string }) => Promise<{ enviado: boolean; motivo?: string }>,
  agora = new Date()
): Promise<ResultadoVarredura> {
  const vazio: ResultadoVarredura = {
    examinadas: 0,
    reenviadas: 0,
    desistidas: 0,
    disjuntor: DISJUNTOR_FECHADO,
    mudou: false,
    erros: [],
  };
  const admin = createAdminClient();
  if (!admin) return { ...vazio, erros: ["SUPABASE_SERVICE_ROLE_KEY ausente"] };

  const desde = new Date(agora.getTime() - 4 * 3_600_000).toISOString();
  const { data, error } = await admin
    .from("emails_saida")
    .select("id, chave, para, tag, assunto, caminho, status, mensagem_id, criado_em, confirmado_em, tentativas")
    .eq("caminho", "postal")
    .gte("criado_em", desde)
    .order("criado_em", { ascending: false })
    .limit(500);

  if (error) return { ...vazio, erros: [error.message] };
  const linhas = (data ?? []) as unknown as (LinhaSaida & { assunto: string | null })[];

  let reenviadas = 0;
  let desistidas = 0;
  const erros: string[] = [];
  let perdidas = 0;

  for (const l of linhas) {
    const acao = acaoPara(l, agora);
    if (acao === "nada") continue;
    perdidas++;

    if (acao === "desistir") {
      await admin.from("emails_saida").update({ status: "perdido" }).eq("id", l.id);
      desistidas++;
      continue;
    }

    /* O REENVIO NÃO REMONTA O HTML — e é a limitação honesta desta versão.
       O corpo original não é guardado (armazenar o HTML de todo e-mail é
       espaço e é dado de cliente parado no banco). O reenvio leva um aviso
       curto com o assunto original e o pedido de contato, que é infinitamente
       melhor que silêncio — e a linha fica marcada para o humano decidir se
       reemite o documento. */
    const r = await enviarPelaBrevo({
      para: l.para,
      assunto: l.assunto ?? "Mensagem do Enquadria",
      html: htmlReenvio(l.assunto ?? "uma mensagem"),
    });

    if (r.enviado) {
      await admin
        .from("emails_saida")
        .update({ status: "reenviado", reenviado_em: agora.toISOString(), tentativas: l.tentativas + 1 })
        .eq("id", l.id);
      await registrarSaida({
        chave: l.chave,
        para: l.para,
        tag: l.tag,
        assunto: l.assunto ?? undefined,
        caminho: "brevo",
        status: "aceito",
        tentativas: l.tentativas + 1,
      });
      reenviadas++;
    } else {
      erros.push(`${l.para}: ${r.motivo ?? "falha no reenvio"}`);
      await admin
        .from("emails_saida")
        .update({ tentativas: l.tentativas + 1, erro: r.motivo ?? null })
        .eq("id", l.id);
    }
  }

  /* o disjuntor decide DEPOIS, com a foto atualizada */
  const atual = await lerDisjuntor();
  const novo = avaliarDisjuntor(
    atual,
    { total: linhas.length, perdidas },
    agora.toISOString()
  );
  const mudou = novo.estado !== atual.estado;
  if (mudou) {
    await gravarDisjuntor(novo);
    console.warn(`[entrega] disjuntor ${atual.estado} → ${novo.estado}: ${novo.motivo}`);
  }

  return {
    examinadas: linhas.length,
    reenviadas,
    desistidas,
    disjuntor: novo,
    mudou,
    erros,
  };
}

function htmlReenvio(assunto: string): string {
  return `<p>Olá,</p>
<p>Enviamos a você a mensagem <b>"${assunto}"</b> e o nosso servidor não conseguiu confirmar a entrega.
Este aviso sai por um segundo caminho justamente para você saber que existe algo esperando.</p>
<p>Se a mensagem original não chegou, responda a este e-mail que reenviamos o conteúdo completo.</p>
<p>— Enquadria</p>`;
}
