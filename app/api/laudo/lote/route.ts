import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { situacaoPlano, type Assinatura } from "@/lib/plano";
import { ORIGEM_LOTE } from "@/lib/premissas-padrao";
import { erroDeBanco } from "@/lib/erro-banco";

/**
 * TEMPO DE FUNÇÃO — declarado em 08/08/2026.
 *
 * Nenhuma rota de lote declarava `maxDuration`: rodavam no default da
 * plataforma, enquanto os crons — que ninguém espera na frente da tela — já
 * pediam 60 s. Esta rota trabalha por item (RPC, gravação, e às vezes um
 * e-mail que pode levar segundos), e estourar no meio não é uma tela lenta: é
 * documento criado e e-mail já enviado, com "falha de rede" escrito para o
 * contador. Sessenta segundos não resolvem uma carteira de 400 de uma vez —
 * resolvem a maioria dos lotes reais, e o que passa disso agora é interrompido
 * com aviso honesto em vez de silêncio.
 */
export const maxDuration = 60;


/**
 * EMISSÃO DE LAUDOS EM LOTE.
 *
 * Depois da análise em lote, o contador tem dezenas de análises e precisaria
 * clicar uma a uma para gerar o papel. Aqui sai tudo de uma vez.
 *
 * O GATE CONTINUA VALENDO, e de um jeito honesto: em vez de recusar o lote
 * inteiro quando o plano é gratuito, emite até o limite e diz exatamente
 * quantos ficaram de fora. O contador sente o valor e vê o teto ao mesmo tempo.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });

  let corpo: { analise_ids?: string[] };
  try {
    corpo = await req.json();
  } catch {
    corpo = {};
  }

  /**
   * LISTA VAZIA NÃO É "TODAS" — conserto de 08/08/2026.
   *
   * `analise_ids: []` caía no ramo "todas as análises do tenant", e o Cockpit
   * consegue mandar `[]` por dois caminhos reais: selecionar linhas que ainda
   * não têm análise, ou selecionar tudo e depois digitar na busca (a busca não
   * limpa a seleção). Um clique em "Emitir laudos" nesse estado agia sobre a
   * carteira inteira — e no lote de termos isso é e-mail já enviado a cliente
   * de verdade, sem volta.
   *
   * A distinção que importa: campo AUSENTE continua significando "todas" (é
   * como a esteira do importador chama esta rota); campo PRESENTE e vazio é
   * seleção vazia, e seleção vazia não faz nada.
   */
  if (Array.isArray(corpo.analise_ids) && corpo.analise_ids.length === 0) {
    return NextResponse.json(
      { erro: "nenhuma empresa selecionada — selecione ao menos uma para emitir em lote" },
      { status: 400 }
    );
  }

  // análises candidatas: as informadas ou todas as do tenant
  let q = supabase.from("analises").select("id, empresa_id, parametros");
  if (corpo.analise_ids?.length) q = q.in("id", corpo.analise_ids);
  const { data: analises, error: errA } = await q.limit(1000);
  if (errA) return NextResponse.json({ erro: erroDeBanco(errA, "laudo/lote") }, { status: 500 });
  if (!analises?.length) {
    return NextResponse.json({ ok: true, emitidos: 0, ja_tinham: 0, bloqueados: 0, sem_confirmar: 0 });
  }

  /**
   * O LOTE NÃO EMITE EM CIMA DE PREMISSA ESTIMADA — conserto de 08/08/2026.
   *
   * A importação roda uma análise automática para as faixas A e B a partir do
   * perfil típico do CNAE, e marca `origem_premissas: "lote_cnae"`. O produto
   * inteiro trata isso como rascunho: a fila troca a ação de "Emitir laudo" por
   * "Confirmar premissas", o formulário abre com um aviso amarelo, e o painel
   * repete que o laudo sai com a assinatura do contador.
   *
   * Esta rota era a única porta que furava a regra. Dois cliques —
   * "Selecionar tudo" e "Emitir laudos" — produziam dezenas de documentos
   * numerados, com o CRC do contador na capa, sobre premissas que ninguém
   * conferiu. Rapidez comprada com o risco profissional de quem assina não é
   * simplificação: é a conta empurrada para a frente.
   *
   * O lote continua existindo e continua rápido — só que para o que já foi
   * confirmado. As estimadas voltam contadas, para a tela dizer quantas ficaram
   * e por quê.
   */
  const estimada = (a: { parametros?: { origem_premissas?: string } | null }) =>
    a.parametros?.origem_premissas === ORIGEM_LOTE;

  const semConfirmar = analises.filter(estimada).length;
  const confirmadas = analises.filter((a) => !estimada(a));

  if (!confirmadas.length) {
    return NextResponse.json({
      ok: true,
      emitidos: 0,
      ja_tinham: 0,
      bloqueados: 0,
      sem_confirmar: semConfirmar,
    });
  }

  // quem já tem laudo não consome cota nem precisa reemitir
  const { data: laudosExistentes } = await supabase
    .from("laudos")
    .select("analise_id")
    .in(
      "analise_id",
      confirmadas.map((a) => a.id)
    );
  const jaTem = new Set((laudosExistentes ?? []).map((l) => l.analise_id));
  const pendentes = confirmadas.filter((a) => !jaTem.has(a.id));

  // quanto ainda cabe no plano
  const { data: assinRaw } = await supabase.rpc("assinatura_ativa");
  const assinatura = (Array.isArray(assinRaw) ? assinRaw[0] : assinRaw) as Assinatura | null;
  const { count } = await supabase.from("laudos").select("id", { count: "exact", head: true });
  const situacao = situacaoPlano(assinatura, count ?? 0);

  const cabem = situacao.ilimitado ? pendentes.length : Math.min(situacao.restantes, pendentes.length);
  const bloqueados = pendentes.length - cabem;

  const emitidos: { analise_id: string; laudo_id: string; numero: number }[] = [];
  const falhas: { analise_id: string; erro: string }[] = [];

  // sequencial de propósito: a RPC numera por tenant e precisa de ordem estável
  for (const a of pendentes.slice(0, cabem)) {
    const { data, error } = await supabase
      .rpc("emitir_laudo", { p_analise: a.id })
      .single();
    if (error) {
      falhas.push({ analise_id: a.id, erro: error.message });
      continue;
    }
    const laudo = data as { id: string; numero: number };
    emitidos.push({ analise_id: a.id, laudo_id: laudo.id, numero: laudo.numero });
  }

  return NextResponse.json({
    ok: true,
    emitidos: emitidos.length,
    ja_tinham: jaTem.size,
    bloqueados,
    sem_confirmar: semConfirmar,
    falhas,
    limite_atingido: bloqueados > 0,
    detalhes: emitidos,
  });
}
