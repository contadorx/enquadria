import { createAdminClient } from "./supabase-admin";
import {
  avaliarDisjuntor,
  acaoPara,
  instrumentoConfiavel,
  AVISO_SEM_INSTRUMENTO,
  DIAS_ATE_APAGAR_CORPO,
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

/**
 * GRAVA O RESULTADO DA VARREDURA — o que faz a quebra deixar de ser cega.
 *
 * Sem isto, o estado da última varredura vive só no JSON de retorno do cron e
 * no log da Vercel: dois lugares onde ninguém passa. É o mesmo defeito que
 * esta série corrige — informação que existe e não chega a quem decide.
 *
 * Roda SEMPRE, inclusive (e principalmente) quando a varredura se declara
 * cega: é justamente esse o estado que precisa aparecer na tela.
 */
export async function registrarVarredura(r: {
  cega: boolean;
  aviso: string | null;
  resumo: Record<string, unknown>;
}): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;
  try {
    await admin
      .from("email_disjuntor")
      .update({
        varredura_em: new Date().toISOString(),
        varredura_cega: r.cega,
        varredura_aviso: r.aviso,
        varredura_resumo: r.resumo,
      })
      .eq("id", 1);
  } catch (e) {
    console.error("[entrega] não consegui registrar a varredura:", e instanceof Error ? e.message : e);
  }
}

/** o que a tela lê para montar o monitor */
export async function lerVarredura(): Promise<{ em: string | null; cega: boolean; aviso: string | null }> {
  const admin = createAdminClient();
  if (!admin) return { em: null, cega: false, aviso: null };
  try {
    const { data } = await admin
      .from("email_disjuntor")
      .select("varredura_em, varredura_cega, varredura_aviso")
      .eq("id", 1)
      .maybeSingle();
    return {
      em: (data?.varredura_em as string) ?? null,
      cega: Boolean(data?.varredura_cega),
      aviso: (data?.varredura_aviso as string) ?? null,
    };
  } catch {
    return { em: null, cega: false, aviso: null };
  }
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
  /** o envelope guardado para o reenvio ser idêntico, não parecido */
  corpo_html?: string | null;
  nome_destinatario?: string | null;
  responder_para?: string | null;
  responder_nome?: string | null;
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
        corpo_html: r.corpo_html ?? null,
        nome_destinatario: r.nome_destinatario ?? null,
        responder_para: r.responder_para ?? null,
        responder_nome: r.responder_nome ?? null,
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
        /* O CORPO SOME NA CONFIRMAÇÃO — o conteúdo existe exatamente enquanto
           pode ser útil. Entregue (ou recusado em definitivo), reenviar deixou
           de ser possibilidade e guardar dado de cliente deixou de ter razão. */
        corpo_html: null,
        corpo_apagado_em: new Date().toISOString(),
        corpo_apagado_motivo: status === "entregue" ? "entrega confirmada" : "falha definitiva",
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
      .update({
        status,
        confirmado_em: new Date().toISOString(),
        corpo_html: null,
        corpo_apagado_em: new Date().toISOString(),
        corpo_apagado_motivo: status === "entregue" ? "entrega confirmada" : "falha definitiva",
      })
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
  semCorpo: number;
  corposApagados: number;
  disjuntor: Disjuntor;
  mudou: boolean;
  /** true quando a varredura se recusou a concluir por falta de instrumento */
  cega: boolean;
  aviso: string | null;
  erros: string[];
}

export interface MensagemReenvio {
  para: string;
  nome?: string;
  assunto: string;
  html: string;
  responderPara?: { email: string; nome?: string };
}

/**
 * A VARREDURA — o coração da garantia, e ela roda no cron.
 *
 * A ORDEM DAS QUATRO ETAPAS É A REGRA DE NEGÓCIO:
 *
 *  0. CONFERE O INSTRUMENTO. Se nenhuma confirmação de entrega existe na
 *     janela, a varredura NÃO conclui nada — nem reenvia, nem mexe no
 *     disjuntor. Ausência total de sinal é webhook desligado, não base
 *     perdida. Sem esta etapa, um segredo errado no ambiente reenviaria a base
 *     inteira a cada 15 minutos e desligaria um servidor que está são.
 *  1. Marca como perdida a mensagem aceita além da janela.
 *  2. REENVIA O DOCUMENTO ORIGINAL pela Brevo, com o mesmo assunto, o mesmo
 *     HTML e o mesmo reply-to. Sem corpo guardado, degrada para o aviso.
 *  3. Reavalia o disjuntor com a foto já atualizada.
 *
 * `enviar` entra por parâmetro para este arquivo não depender do driver e para
 * o teste rodar a varredura inteira sem rede.
 */
export async function varrerEntregas(
  enviar: (m: MensagemReenvio) => Promise<{ enviado: boolean; motivo?: string }>,
  agora = new Date()
): Promise<ResultadoVarredura> {
  const vazio: ResultadoVarredura = {
    examinadas: 0,
    reenviadas: 0,
    desistidas: 0,
    semCorpo: 0,
    corposApagados: 0,
    disjuntor: DISJUNTOR_FECHADO,
    mudou: false,
    cega: false,
    aviso: null,
    erros: [],
  };
  const admin = createAdminClient();
  if (!admin) return { ...vazio, erros: ["SUPABASE_SERVICE_ROLE_KEY ausente"] };

  const desde = new Date(agora.getTime() - 4 * 3_600_000).toISOString();
  const { data, error } = await admin
    .from("emails_saida")
    .select(
      "id, chave, para, tag, assunto, caminho, status, mensagem_id, criado_em, confirmado_em, tentativas, corpo_html, nome_destinatario, responder_para, responder_nome, referencia"
    )
    .eq("caminho", "postal")
    .gte("criado_em", desde)
    .order("criado_em", { ascending: false })
    .limit(500);

  if (error) return { ...vazio, erros: [error.message] };

  type Linha = LinhaSaida & {
    assunto: string | null;
    corpo_html: string | null;
    nome_destinatario: string | null;
    responder_para: string | null;
    responder_nome: string | null;
    referencia: string | null;
  };
  const linhas = (data ?? []) as unknown as Linha[];

  /* ─────────────────────────────────────── 0. O INSTRUMENTO FUNCIONA? ──── */
  const confirmadas = linhas.filter((l) => l.status === "entregue" || l.confirmado_em).length;
  const confiavel = instrumentoConfiavel({
    temConfirmacoes: confirmadas > 0,
    totalObservado: linhas.length,
  });

  if (!confiavel) {
    console.error("[entrega] varredura CEGA — " + AVISO_SEM_INSTRUMENTO);
    await registrarVarredura({
      cega: true,
      aviso: AVISO_SEM_INSTRUMENTO,
      resumo: { examinadas: linhas.length, confirmadas: 0 },
    });
    return {
      ...vazio,
      examinadas: linhas.length,
      disjuntor: await lerDisjuntor(),
      cega: true,
      aviso: AVISO_SEM_INSTRUMENTO,
    };
  }

  let reenviadas = 0;
  let desistidas = 0;
  let semCorpo = 0;
  let perdidas = 0;
  const erros: string[] = [];

  for (const l of linhas) {
    const acao = acaoPara(l, agora);
    if (acao === "nada") continue;
    perdidas++;

    if (acao === "desistir") {
      await admin.from("emails_saida").update({ status: "perdido" }).eq("id", l.id);
      desistidas++;
      continue;
    }

    /* ─────────────────────────────── 2. O DOCUMENTO, e não um bilhete ──── */
    const temCorpo = !!l.corpo_html;
    if (!temCorpo) semCorpo++;

    const r = await enviar({
      para: l.para,
      nome: l.nome_destinatario ?? undefined,
      assunto: l.assunto ?? "Mensagem do Enquadria",
      html: l.corpo_html ?? htmlAviso(l.assunto ?? "uma mensagem"),
      ...(l.responder_para
        ? { responderPara: { email: l.responder_para, nome: l.responder_nome ?? undefined } }
        : {}),
    });

    if (r.enviado) {
      await admin
        .from("emails_saida")
        .update({
          status: "reenviado",
          reenviado_em: agora.toISOString(),
          tentativas: l.tentativas + 1,
          /* o corpo cumpriu a função: sai do banco junto com o reenvio */
          corpo_html: null,
          corpo_apagado_em: agora.toISOString(),
          corpo_apagado_motivo: "reenviado pela Brevo",
        })
        .eq("id", l.id);

      await registrarSaida({
        chave: l.chave,
        para: l.para,
        tag: l.tag,
        assunto: l.assunto ?? undefined,
        caminho: "brevo",
        status: "aceito",
        tentativas: l.tentativas + 1,
        referencia: l.referencia,
        erro: temCorpo ? null : "reenviado sem o corpo original (expirado ou não guardado)",
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

  /* ──────────────────────────────── 3. O DISJUNTOR, com a foto nova ────── */
  const atual = await lerDisjuntor();
  const novo = avaliarDisjuntor(atual, { total: linhas.length, perdidas }, agora.toISOString());
  const mudou = novo.estado !== atual.estado;
  if (mudou) {
    await gravarDisjuntor(novo);
    console.warn(`[entrega] disjuntor ${atual.estado} → ${novo.estado}: ${novo.motivo}`);
  }

  /* ─────────────────────── 4. A FAXINA, que não depende de mais nada ───── */
  let corposApagados = 0;
  try {
    const { data: n } = await admin.rpc("limpar_corpos_expirados", { p_dias: DIAS_ATE_APAGAR_CORPO });
    corposApagados = typeof n === "number" ? n : 0;
  } catch (e) {
    erros.push(`faxina de corpos: ${e instanceof Error ? e.message : "falhou"}`);
  }

  await registrarVarredura({
    cega: false,
    aviso: semCorpo > 0 ? `${semCorpo} reenvio(s) saíram sem o corpo original.` : null,
    resumo: { examinadas: linhas.length, perdidas, reenviadas, desistidas, semCorpo, corposApagados },
  });

  return {
    examinadas: linhas.length,
    reenviadas,
    desistidas,
    semCorpo,
    corposApagados,
    disjuntor: novo,
    mudou,
    cega: false,
    aviso: semCorpo > 0 ? `${semCorpo} reenvio(s) saíram sem o corpo original.` : null,
    erros,
  };
}

/**
 * O AVISO — a degradação, para quando o corpo não existe mais (expirou, ou a
 * mensagem é anterior à 0061). Não é o documento e não finge ser: diz que algo
 * ficou pelo caminho e pede contato.
 */
function htmlAviso(assunto: string): string {
  return `<p>Olá,</p>
<p>Enviamos a você a mensagem <b>"${assunto}"</b> e o nosso servidor não conseguiu confirmar a entrega.
Este aviso sai por um segundo caminho justamente para você saber que existe algo esperando.</p>
<p>Se a mensagem original não chegou, responda a este e-mail que reenviamos o conteúdo completo.</p>
<p>— Enquadria</p>`;
}
