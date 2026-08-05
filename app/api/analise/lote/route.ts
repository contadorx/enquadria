import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import {
  decidir,
  dDASefetivo,
  cenarios,
  emReais,
  sensibilidade,
  carimboAliquota,
  alertaFatorR,
  sharePCDe,
  PARAMETROS_2027,
  type Respostas,
} from "@/lib/motor";
import { anexoPorCnae } from "@/lib/triagem";
import { premissasPadrao, ORIGEM_LOTE } from "@/lib/premissas-padrao";

/**
 * ANÁLISE EM LOTE — a primeira passada da carteira inteira.
 *
 * Recebe a lista de empresas, aplica as premissas típicas do CNAE de cada uma e
 * grava as análises de uma vez. Como em toda rota do produto, o motor roda NO
 * SERVIDOR — o cliente nunca dita o número.
 *
 * Cada análise gerada aqui fica marcada com origem "lote_cnae" dentro de
 * `parametros`, para que a tela e o laudo possam avisar que as premissas foram
 * ESTIMADAS e ainda não confirmadas pelo contador.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });

  const { data: perfil } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();
  const tenantId = perfil?.tenant_id;
  if (!tenantId) return NextResponse.json({ erro: "workspace não encontrado" }, { status: 400 });

  let corpo: { empresa_ids?: string[]; sobrescrever?: boolean };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  // empresas alvo: as informadas, ou toda a fila de análise (faixas A e B)
  let query = supabase
    .from("empresas")
    .select("id, cnae_principal, anexo, rbt12")
    .is("arquivada_em", null)
    .eq("tenant_id", tenantId);
  query = corpo.empresa_ids?.length
    ? query.in("id", corpo.empresa_ids)
    : query.in("faixa", ["A", "B"]);

  const { data: empresas, error: errEmp } = await query.limit(1000);
  if (errEmp) return NextResponse.json({ erro: errEmp.message }, { status: 500 });
  if (!empresas?.length) {
    return NextResponse.json({ ok: true, gravadas: 0, puladas: 0, resultados: [] });
  }

  // análises já existentes: por padrão o lote NÃO sobrescreve trabalho manual
  const { data: existentes } = await supabase
    .from("analises")
    .select("empresa_id, parametros")
    .in(
      "empresa_id",
      empresas.map((e) => e.id)
    );
  const jaTem = new Map(
    (existentes ?? []).map((a) => [
      a.empresa_id,
      (a.parametros as { origem_premissas?: string } | null)?.origem_premissas,
    ])
  );

  const { data: param } = await supabase
    .from("parametros_exercicio")
    .select("aliquota_cbs, aliquota_ibs, corte_s1, fronteira_min, fronteira_max")
    .eq("exercicio", 2027)
    .maybeSingle();

  const aliquota = param
    ? Number(param.aliquota_cbs) + Number(param.aliquota_ibs)
    : PARAMETROS_2027.aliquota;

  const agora = new Date().toISOString();
  const registros: Record<string, unknown>[] = [];
  const resultados: unknown[] = [];
  let puladas = 0;

  for (const e of empresas) {
    const origemAtual = jaTem.get(e.id);
    const existe = jaTem.has(e.id);
    // pula o que o contador já revisou à mão, a menos que ele peça para sobrescrever
    if (existe && origemAtual !== ORIGEM_LOTE && !corpo.sobrescrever) {
      puladas++;
      continue;
    }

    const perfilCnae = premissasPadrao(e.cnae_principal);
    const respostas: Respostas = perfilCnae.respostas;
    const anexo = e.anexo ?? anexoPorCnae(e.cnae_principal) ?? 1;
    const rbt12 = e.rbt12 != null ? Number(e.rbt12) : null;
    const ddas = dDASefetivo(anexo, rbt12);

    // mesma base do cálculo unitário: o lote não pode gerar um laudo mais pobre
    const base = {
      ...PARAMETROS_2027,
      aliquota,
      das: ddas.das,
      corteS1: param ? Number(param.corte_s1) : PARAMETROS_2027.corteS1,
      fronteiraMin: param ? Number(param.fronteira_min) : PARAMETROS_2027.fronteiraMin,
      fronteiraMax: param ? Number(param.fronteira_max) : PARAMETROS_2027.fronteiraMax,
      rbt12,
    };

    const r = decidir(respostas, base);
    const dinheiro = emReais(r, rbt12, null);

    const parametros = {
      exercicio: 2027,
      aliquota,
      das: ddas.das,
      corteS1: base.corteS1,
      fronteiraMin: base.fronteiraMin,
      fronteiraMax: base.fronteiraMax,
      sublimite: base.sublimite,
      bandaSublimite: base.bandaSublimite,
      /* CONGELADOS porque o laudo BRANCHEIA neles. `rqMin` e `absorcaoMax`
         ficavam de fora e o laudo caía no padrão: mudar a convenção amanhã
         reescreveria em silêncio o que um documento assinado ontem afirma. */
      rqMin: base.rqMin,
      absorcaoMax: base.absorcaoMax,
      rbt12,
      anexo,
      ddas,
      partilha: sharePCDe(anexo, ddas.faixa, 2027),
      // por que esta saída, congelado com o resto: a seção 7 do laudo imprime isto
      motivo: r.motivo,
      banda_sublimite: !!r.banda_sublimite,
      carimbo: carimboAliquota(aliquota, agora),
      cenarios: cenarios(respostas, base),
      dinheiro,
      sensibilidade: sensibilidade(respostas, base, dinheiro),
      custo_apuracao_anual: null,
      detalhes: null,
      // toda premissa do lote nasce como padrão do sistema — nenhuma foi informada
      origens: Object.fromEntries(Object.keys(respostas).map((k) => [k, "padrao"])),
      fator_r: alertaFatorR(anexo, respostas.folha),
      anexo_confirmado: false,
      origem_premissas: ORIGEM_LOTE,
      confianca_premissas: perfilCnae.confianca,
    };

    registros.push({
      tenant_id: tenantId,
      empresa_id: e.id,
      janela_id: null,
      status: "em_analise",
      respostas,
      rq: r.rq,
      ch: r.ch,
      cl: r.cl,
      re: isFinite(r.re) ? r.re : null,
      fc: r.fc,
      saida: r.saida,
      prioridade: r.prioridade,
      parametros,
      calculado_em: agora,
    });

    resultados.push({
      empresa_id: e.id,
      saida: r.saida,
      re: isFinite(r.re) ? r.re : null,
      confianca: perfilCnae.confianca,
      justificativa: perfilCnae.justificativa,
      sem_rbt12: rbt12 == null,
    });
  }

  if (registros.length === 0) {
    return NextResponse.json({ ok: true, gravadas: 0, puladas, resultados: [] });
  }

  const { error } = await supabase
    .from("analises")
    .upsert(registros, { onConflict: "empresa_id,janela_id" });

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    gravadas: registros.length,
    puladas,
    resultados,
  });
}
