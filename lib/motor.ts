/**
 * MOTOR DE DECISÃO — IBS/CBS · regime híbrido do Simples Nacional
 *
 * Portado sem alteração da calculadora de validação (22/07/2026).
 * Toda regra fica aqui e é pura: sem I/O, sem Supabase, sem React.
 * Assim a mesma função roda no servidor, no cliente e no teste.
 *
 * PREMISSA CENTRAL, EM 2027-2028:
 *   CBS = alíquota de referência reduzida em 0,1 p.p. · IBS = 0,1% simbólico
 *   → total efetivo ~8,8%, NÃO os 26,5% do regime pleno.
 *
 * PARÂMETRO A CONFIRMAR NA NORMA (art. 516 LC 214/2025 + Res. CGSN 186/2026):
 *   quanto efetivamente sai do DAS no híbrido durante 2027-2028. A hipótese de
 *   trabalho é que sai só a fatia federal que virou CBS, permanecendo ICMS/ISS
 *   dentro do DAS até 2029. Se estiver errado, todo o resultado se desloca —
 *   por isso o valor vive em `parametros_exercicio`, nunca no código.
 */

export type Saida = "S1" | "S2" | "S3" | "S4";

export interface Respostas {
  /** Q1 · fração da receita vendida a PJ */
  b2b: number;
  /** Q2 · fração desses PJ que aproveitam crédito integral */
  qual: number;
  /** Q3 · fração da receita em compras que geram crédito */
  cred: number;
  /** Q4 · fração da receita em folha (conferência de consistência) */
  folha: number;
  /** Q5 · poder de renegociação: 3 forte · 2 com esforço · 1 travado · 0 nenhum */
  preco: number;
  /** Q6 · concorrentes majoritariamente fora do Simples: 1 sim · 0 não */
  conc: number;
  /** Q7 · faixa de faturamento (não entra na conta, dimensiona o honorário) */
  faturamento?: string;
  /** Q8 · cliente já exigiu crédito integral: 1 sim · 0 não */
  exig: number;
}

export interface Parametros {
  /** alíquota IBS+CBS do exercício, em fração (0.088) */
  aliquota: number;
  /** parcela de PIS/Cofins embutida no DAS, em fração (0.012) */
  das: number;
  /** múltiplo de corte para "não optar sem dúvida" */
  corteS1?: number;
  /** largura da zona de fronteira, em torno de FC */
  fronteiraMin?: number;
  fronteiraMax?: number;
}

export interface Resultado {
  /** receita qualificada = b2b × qual */
  rq: number;
  /** custo do híbrido sobre a base */
  ch: number;
  /** custo líquido da empresa */
  cl: number;
  /** REPASSE DE EQUILÍBRIO — o número */
  re: number;
  /** folga do comprador */
  fc: number;
  /** folga da negociação, em pontos */
  folga: number;
  saida: Saida;
  prioridade: boolean;
}

export const PARAMETROS_2027: Parametros = {
  aliquota: 0.088,
  das: 0.01473,
  corteS1: 1.5,
  fronteiraMin: 0.8,
  fronteiraMax: 1.2,
};

/**
 * dDAS por anexo E faixa — parcela de PIS/Cofins dentro do DAS, como fração
 * da receita. Derivado da partilha oficial do Simples (LC 123). No banco, a
 * fonte é `parametros_exercicio.das_por_anexo`; esta constante é o espelho
 * usado quando o app roda sem carregar o parâmetro (ex.: modo demonstração).
 */
export const DAS_POR_ANEXO_FAIXA: Record<number, Record<number, number>> = {
  1: { 1: 0.0062, 2: 0.01131, 3: 0.01473, 4: 0.01658, 5: 0.02216, 6: 0.02945 },
  2: { 1: 0.0063, 2: 0.01092, 3: 0.014, 4: 0.01568, 5: 0.02058, 6: 0.042 },
  3: { 1: 0.00936, 2: 0.01747, 3: 0.02106, 4: 0.02496, 5: 0.03276, 6: 0.05148 },
  4: { 1: 0.00675, 2: 0.0135, 3: 0.0153, 4: 0.021, 5: 0.033, 6: 0.0495 },
  5: { 1: 0.02658, 2: 0.03087, 3: 0.03344, 4: 0.03516, 5: 0.03945, 6: 0.05231 },
};

/** resolve o dDAS de uma empresa; cai no anexo I faixa 3 se faltar dado */
export function dasDe(anexo?: number | null, faixa?: number | null): number {
  const a = anexo && DAS_POR_ANEXO_FAIXA[anexo] ? anexo : 1;
  const tabela = DAS_POR_ANEXO_FAIXA[a];
  const f = faixa && tabela[faixa] ? faixa : 3;
  return tabela[f];
}

export function decidir(r: Respostas, p: Parametros = PARAMETROS_2027): Resultado {
  const corteS1 = p.corteS1 ?? 1.5;
  const fMin = p.fronteiraMin ?? 0.8;
  const fMax = p.fronteiraMax ?? 1.2;

  const rq = r.b2b * r.qual;
  const ch = p.aliquota * (1 - r.cred);
  const cl = ch - p.das;
  const re = rq > 0 ? cl / rq : Number.POSITIVE_INFINITY;
  const fc = p.aliquota - p.das;

  let saida: Saida;
  if (cl <= 0) saida = "S4";
  else if (rq < 0.3) saida = "S1";
  else if (re > fc * corteS1) saida = "S1";
  else if (re >= fc * fMin && re <= fc * fMax) saida = "S3";
  else if (re > fc) saida = "S1";
  else if (r.preco <= 1) saida = "S2";
  else saida = "S4";

  // Prioridade é um SELO, não uma saída: uma empresa pode ser prioridade
  // e ainda assim receber "não optar". Descoberta da validação de 22/07.
  const prioridade = r.exig === 1 || (r.conc === 1 && rq > 0.7);

  return { rq, ch, cl, re, fc, folga: fc - re, saida, prioridade };
}

export const SAIDAS: Record<Saida, { titulo: string; descricao: string; cor: string }> = {
  S1: {
    titulo: "Não optar",
    descricao:
      "Perfil sem contrapartida comercial que justifique o custo. O híbrido aumentaria a carga sem retorno.",
    cor: "vermelho",
  },
  S2: {
    titulo: "Não optar nesta janela — preparar março",
    descricao:
      "A conta fecha, a negociação não. Plano de renegociação nos próximos meses e decisão na janela seguinte.",
    cor: "amarelo",
  },
  S3: {
    titulo: "Zona de fronteira — decisão do empresário",
    descricao:
      "O motor não decide. Apresente os dois cenários em reunião e registre a escolha com termo assinado.",
    cor: "neutro",
  },
  S4: {
    titulo: "Optar, condicionado a repasse",
    descricao:
      "Optar é vantajoso para os dois lados desde que o preço seja renegociado antes do fim da janela.",
    cor: "verde",
  },
};

export const pct = (x: number, casas = 1) =>
  !isFinite(x) ? "—" : `${(x * 100).toFixed(casas).replace(".", ",")}%`;
