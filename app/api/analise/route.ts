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
  dDASsegregado,
  ehSegregado,
  fatorRSegregado,
  PARAMETROS_2027,
  type Respostas,
  type DetalheQual,
  type DetalheCred,
  type Segmento,
} from "@/lib/motor";
import { anexoPorCnae } from "@/lib/triagem";

/**
 * Persiste uma análise: recebe empresa + respostas, recalcula o motor NO
 * SERVIDOR (nunca confia no número que veio do cliente) e grava congelando
 * TUDO o que o laudo vai precisar imprimir — cenários, carimbo da alíquota,
 * conversão em reais, sensibilidade e a origem de cada premissa.
 *
 * Congelar em `parametros` é o que impede um laudo de agosto virar mentira
 * quando a alíquota mudar em outubro. E é também o que evita uma migration:
 * `analises.parametros` já é jsonb e já é copiado para o snapshot do laudo.
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

  let corpo: {
    empresa_id: string;
    janela_id?: string;
    respostas: Respostas;
    rbt12?: number | null;
    /** premissa declarada pelo contador; sem ela o laudo não calcula payback */
    custo_apuracao_anual?: number | null;
    detalhes?: { qual?: DetalheQual; cred?: DetalheCred };
    origens?: Record<string, string>;
    /** anexo corrigido na tela (alerta de fator R) */
    anexo?: number | null;
    anexo_confirmado?: boolean;
    /**
     * Receita segregada por anexo. Ausente, ou com um item só, mantém o
     * comportamento de sempre. Com dois ou mais, o dDAS passa a ser a soma
     * ponderada — o número certo para a empresa que segrega receita entre
     * comércio, indústria e serviço dentro do mesmo CNPJ.
     */
    segmentos?: Segmento[] | null;
  };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }
  if (!corpo.empresa_id || !corpo.respostas) {
    return NextResponse.json({ erro: "empresa_id e respostas obrigatórios" }, { status: 400 });
  }

  // parâmetros vigentes do exercício (fonte da verdade é o banco)
  const { data: param } = await supabase
    .from("parametros_exercicio")
    .select("aliquota_cbs, aliquota_ibs, corte_s1, fronteira_min, fronteira_max")
    .eq("exercicio", 2027)
    .maybeSingle();

  // anexo + RBT12 da empresa sustentam a alíquota EFETIVA do dDAS
  const { data: empresa } = await supabase
    .from("empresas")
    .select("anexo, rbt12, cnae_principal")
    .eq("id", corpo.empresa_id)
    .maybeSingle();

  // RBT12 informada na tela tem prioridade; persiste para reuso e para o laudo
  const rbt12Informado =
    corpo.rbt12 != null && Number.isFinite(corpo.rbt12) && Number(corpo.rbt12) > 0
      ? Number(corpo.rbt12)
      : null;

  const anexoInformado =
    corpo.anexo != null && Number(corpo.anexo) >= 1 && Number(corpo.anexo) <= 5
      ? Number(corpo.anexo)
      : null;

  const patch: Record<string, unknown> = {};
  if (rbt12Informado != null && rbt12Informado !== Number(empresa?.rbt12 ?? 0)) {
    patch.rbt12 = rbt12Informado;
  }
  if (anexoInformado != null && anexoInformado !== Number(empresa?.anexo ?? 0)) {
    patch.anexo = anexoInformado;
  }
  if (Object.keys(patch).length > 0) {
    await supabase.from("empresas").update(patch).eq("id", corpo.empresa_id);
  }

  const anexoEfetivo = anexoInformado ?? empresa?.anexo ?? anexoPorCnae(empresa?.cnae_principal) ?? 1;
  const rbt12Efetivo = rbt12Informado ?? (empresa?.rbt12 != null ? Number(empresa.rbt12) : null);

  /**
   * SEGREGAÇÃO — validada aqui, não confiada à tela.
   * Só entram anexos de 1 a 5 com participação positiva. Um segmento (ou
   * nenhum) cai no caminho de sempre; dois ou mais viram soma ponderada.
   */
  const segmentos: Segmento[] = (corpo.segmentos ?? [])
    .filter((s) => s && Number(s.anexo) >= 1 && Number(s.anexo) <= 5 && Number(s.share) > 0)
    .map((s) => ({ anexo: Number(s.anexo), share: Number(s.share) }));

  // dDAS EFETIVO por empresa: com RBT12 usa a alíquota efetiva; sem, topo da faixa
  const ddas =
    segmentos.length > 1
      ? dDASsegregado(segmentos, rbt12Efetivo)
      : dDASefetivo(anexoEfetivo, rbt12Efetivo);
  const partilha = sharePCDe(ddas.anexo, ddas.faixa, 2027);

  const aliquota = param
    ? Number(param.aliquota_cbs) + Number(param.aliquota_ibs)
    : PARAMETROS_2027.aliquota;

  const base = {
    ...PARAMETROS_2027,
    aliquota,
    das: ddas.das,
    corteS1: param ? Number(param.corte_s1) : PARAMETROS_2027.corteS1,
    fronteiraMin: param ? Number(param.fronteira_min) : PARAMETROS_2027.fronteiraMin,
    fronteiraMax: param ? Number(param.fronteira_max) : PARAMETROS_2027.fronteiraMax,
    rbt12: rbt12Efetivo,
  };

  const agora = new Date().toISOString();
  const r = decidir(corpo.respostas, base);
  const doisCenarios = cenarios(corpo.respostas, base);
  const custo =
    corpo.custo_apuracao_anual != null && Number(corpo.custo_apuracao_anual) > 0
      ? Number(corpo.custo_apuracao_anual)
      : null;
  const dinheiro = emReais(r, rbt12Efetivo, custo);
  const linhasSensibilidade = sensibilidade(corpo.respostas, base, dinheiro);
  /**
   * Com receita segregada, a pergunta do fator R deixa de ser "o anexo da
   * empresa está certo?" e vira "a receita de SERVIÇO está no anexo certo?".
   * O alerta antigo continua valendo para quem tem um anexo só.
   */
  const alerta =
    segmentos.length > 1
      ? fatorRSegregado(segmentos, corpo.respostas.folha)
      : alertaFatorR(anexoEfetivo, corpo.respostas.folha);

  const parametros = {
    exercicio: 2027,
    aliquota,
    das: ddas.das,
    corteS1: base.corteS1,
    fronteiraMin: base.fronteiraMin,
    fronteiraMax: base.fronteiraMax,
    sublimite: base.sublimite,
    bandaSublimite: base.bandaSublimite,
    rbt12: rbt12Efetivo,
    anexo: ddas.anexo,
    /**
     * A segregação vai CONGELADA junto com o resto. O laudo imprime a
     * composição que foi usada; se a empresa mudar o mix depois, o documento
     * assinado continua explicando o número que ele traz.
     */
    segmentos: segmentos.length > 1 ? segmentos : null,
    segregado: ehSegregado(ddas),
    // rastreabilidade da premissa do dDAS, congelada com a análise
    ddas,
    partilha,
    // por que esta saída, congelado com o resto: a seção 7 do laudo imprime isto
    motivo: r.motivo,
    banda_sublimite: !!r.banda_sublimite,
    carimbo: carimboAliquota(aliquota, agora),
    cenarios: doisCenarios,
    dinheiro,
    sensibilidade: linhasSensibilidade,
    custo_apuracao_anual: custo,
    detalhes: corpo.detalhes ?? null,
    origens: corpo.origens ?? null,
    fator_r: alerta,
    anexo_confirmado: !!corpo.anexo_confirmado,
  };

  const registro = {
    tenant_id: tenantId,
    empresa_id: corpo.empresa_id,
    janela_id: corpo.janela_id ?? null,
    status: "laudo_emitido" as const,
    respostas: corpo.respostas,
    rq: r.rq,
    ch: r.ch,
    cl: r.cl,
    re: isFinite(r.re) ? r.re : null,
    fc: r.fc,
    saida: r.saida,
    prioridade: r.prioridade,
    parametros,
    calculado_em: agora,
  };

  const { data, error } = await supabase
    .from("analises")
    .upsert(registro, { onConflict: "empresa_id,janela_id" })
    .select("id")
    .single();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, analise_id: data.id, resultado: r, alerta_fator_r: alerta });
}
