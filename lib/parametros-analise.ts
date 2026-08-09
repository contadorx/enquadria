/**
 * OS PARÂMETROS CONGELADOS DE UMA ANÁLISE — uma receita só, três cozinhas.
 *
 * POR QUE ESTE ARQUIVO EXISTE (08/08/2026).
 *
 * Três rotas gravam análise: `/api/analise` (uma empresa, premissas do
 * contador), `/api/analise/lote` (a carteira, premissas estimadas pelo CNAE) e
 * `/api/janela` (a rodada seguinte, partindo das respostas anteriores). As três
 * montam o objeto `parametros`, que é o que o LAUDO lê — e o laudo não
 * recalcula nada, de propósito: ele imprime o que foi congelado.
 *
 * A consequência de montar isso em três lugares apareceu na terceira: a rota de
 * nova rodada gravava só seis campos. Sem `cenarios`, `sensibilidade`,
 * `dinheiro`, `carimbo`, `partilha`, `motivo`, `fator_r`, `origens`. O laudo da
 * SEGUNDA rodada — que é o produto que sustenta a assinatura depois que a
 * janela fecha — sairia mais pobre que o da primeira: sem os dois cenários de
 * alíquota, sem a análise de sensibilidade, sem o quadro em reais. O contador
 * cobraria de novo por um documento pior.
 *
 * Aqui a receita é uma. Quem gravar análise nova monta por esta função, e o
 * campo que faltar falta em todo lugar ao mesmo tempo — que é como um defeito
 * deve se comportar para ser encontrado.
 */

import {
  decidir,
  cenarios,
  emReais,
  sensibilidade,
  carimboAliquota,
  alertaFatorR,
  sharePCDe,
  dDASefetivo,
  PARAMETROS_2027,
  MOTOR_VERSAO,
  type Respostas,
  type Resultado,
} from "./motor";

/** a linha de `parametros_exercicio`, como as rotas a leem */
export interface ParametrosDoExercicio {
  aliquota_cbs: number | string;
  aliquota_ibs: number | string;
  corte_s1: number | string;
  fronteira_min: number | string;
  fronteira_max: number | string;
  /** de onde veio o número — vai para o carimbo impresso no laudo */
  fonte?: string | null;
  /** true só depois da Resolução do Senado; muda o texto do carimbo */
  fixada?: boolean | null;
}

/**
 * A ALÍQUOTA VIGENTE E DE ONDE ELA VEIO.
 *
 * Enquanto a Resolução do Senado não sair (o prazo é 31/10/2026), o valor é a
 * constante do motor e o laudo diz isso na cara do leitor. Quando sair, a
 * linha de `parametros_exercicio` passa a mandar — e o carimbo muda junto, sem
 * ninguém precisar tocar no texto do documento.
 */
export function aliquotaVigente(param: ParametrosDoExercicio | null): number {
  return param ? Number(param.aliquota_cbs) + Number(param.aliquota_ibs) : PARAMETROS_2027.aliquota;
}

/** a base numérica que o motor recebe: a do exercício quando existe, a do código quando não */
export function baseDoExercicio(param: ParametrosDoExercicio | null, rbt12: number | null, das: number) {
  return {
    ...PARAMETROS_2027,
    aliquota: aliquotaVigente(param),
    das,
    corteS1: param ? Number(param.corte_s1) : PARAMETROS_2027.corteS1,
    fronteiraMin: param ? Number(param.fronteira_min) : PARAMETROS_2027.fronteiraMin,
    fronteiraMax: param ? Number(param.fronteira_max) : PARAMETROS_2027.fronteiraMax,
    rbt12,
  };
}

export interface EntradaParametros {
  respostas: Respostas;
  anexo: number;
  rbt12: number | null;
  exercicio: number;
  param: ParametrosDoExercicio | null;
  /** de onde vieram as premissas: "lote_cnae", "rodada_anterior", "contador"… */
  origemPremissas: string;
  /** confiança do perfil do CNAE, quando as premissas foram estimadas */
  confianca?: string | null;
  /** marca de tempo do cálculo — recebida de fora para o resultado ser determinístico em teste */
  agora: string;
  custoApuracaoAnual?: number | null;
}

/**
 * Monta o par (resultado do motor, parâmetros congelados). O resultado sai
 * junto porque quem grava a análise precisa dos dois, e calcular duas vezes é
 * como as duas versões passam a discordar.
 */
export function calcularEcongelar(e: EntradaParametros): {
  resultado: Resultado;
  parametros: Record<string, unknown>;
} {
  const ddas = dDASefetivo(e.anexo, e.rbt12);
  const base = baseDoExercicio(e.param, e.rbt12, ddas.das);

  const resultado = decidir(e.respostas, base);
  const dinheiro = emReais(resultado, e.rbt12, e.custoApuracaoAnual ?? null);

  const parametros: Record<string, unknown> = {
    exercicio: e.exercicio,
    aliquota: base.aliquota,
    das: ddas.das,
    corteS1: base.corteS1,
    fronteiraMin: base.fronteiraMin,
    fronteiraMax: base.fronteiraMax,
    sublimite: base.sublimite,
    bandaSublimite: base.bandaSublimite,
    /* CONGELADOS porque o laudo BRANCHEIA neles: mudar a convenção amanhã
       reescreveria em silêncio o que um documento assinado ontem afirma. */
    rqMin: base.rqMin,
    absorcaoMax: base.absorcaoMax,
    motor: MOTOR_VERSAO,
    rbt12: e.rbt12,
    anexo: e.anexo,
    ddas,
    partilha: sharePCDe(e.anexo, ddas.faixa, e.exercicio),
    // por que esta saída: a seção 7 do laudo imprime isto
    motivo: resultado.motivo,
    banda_sublimite: !!resultado.banda_sublimite,
    /* o carimbo carrega a procedência do número: enquanto a Resolução não sai,
       o laudo diz que é estimativa de trabalho; quando sair, cita a norma */
    carimbo: carimboAliquota(base.aliquota, e.agora, {
      fixada: e.param?.fixada,
      fonte: e.param?.fonte,
    }),
    cenarios: cenarios(e.respostas, base),
    dinheiro,
    sensibilidade: sensibilidade(e.respostas, base, dinheiro),
    custo_apuracao_anual: e.custoApuracaoAnual ?? null,
    detalhes: null,
    origens: Object.fromEntries(Object.keys(e.respostas).map((k) => [k, "padrao"])),
    fator_r: alertaFatorR(e.anexo, e.respostas.folha),
    anexo_confirmado: false,
    origem_premissas: e.origemPremissas,
    confianca_premissas: e.confianca ?? null,
  };

  return { resultado, parametros };
}

/** a origem gravada nas análises criadas por uma rodada nova de janela */
export const ORIGEM_RODADA = "rodada_anterior";
