/**
 * MOTOR COMPARATIVO DE REGIMES — Simples × Presumido × Real no mundo IBS/CBS.
 *
 * É o que torna o Enquadria perene: depois que a janela de setembro fecha, a
 * pergunta do contador deixa de ser "opto pelo híbrido?" e passa a ser "em que
 * regime este cliente deveria estar?". Essa pergunta não tem prazo de validade.
 *
 * NATUREZA DESTE MOTOR — leia antes de confiar no número:
 * Isto é um COMPARATIVO DE CENÁRIOS, não uma apuração. Cada alíquota é uma
 * PREMISSA explícita, editável pelo contador e impressa no laudo. A alíquota da
 * CBS para 2027 sequer está publicada — trabalhamos com estimativa declarada.
 * O objetivo é ordenar grandezas e revelar o sentido da diferença entre regimes,
 * não substituir a apuração com dados fiscais efetivos.
 *
 * O QUE O PERÍODO 2027-2028 TEM DE PARTICULAR (e o motor respeita):
 *   • PIS/Cofins são extintos e a CBS entra integral.
 *   • O IBS fica simbólico (0,1%) até 2028.
 *   • ICMS e ISS seguem CHEIOS até 2029 — só então começam a cair 10% ao ano.
 *   • O Simples segue unificado no DAS; no híbrido, só a fatia que virou CBS sai.
 *   • CPP: dentro do DAS nos Anexos I, II, III e V; FORA no Anexo IV.
 *
 * Todos os valores são ANUAIS e em reais.
 */

import { ANEXOS_SIMPLES, aliquotaEfetivaSimples, dDASefetivo } from "./motor";

export type Setor = "comercio" | "industria" | "servicos" | "transporte_carga" | "construcao";

export type Regime = "simples_puro" | "simples_hibrido" | "presumido" | "real";

export interface EntradaComparativo {
  /** receita bruta anual (RBT12) */
  receita: number;
  /** anexo do Simples (1..5) — define a alíquota efetiva e se o CPP está no DAS */
  anexo: number;
  setor: Setor;
  /** folha anual bruta (com pró-labore) — base do CPP fora do Simples */
  folha: number;
  /** fração da receita em compras que geram crédito de IBS/CBS */
  compras_credito: number;
  /** lucro contábil como fração da receita — base do Lucro Real */
  margem_lucro: number;
}

export interface Premissas {
  /** alíquota da CBS (fração) — 2027: estimativa, ainda não publicada */
  cbs: number;
  /** alíquota do IBS (fração) — simbólica até 2028 */
  ibs: number;
  /** ICMS efetivo médio sobre a receita (comércio/indústria, fora do Simples) */
  icms: number;
  /** ISS do município (serviços, fora do Simples) */
  iss: number;
  /** presunção de IRPJ (0,08 comércio/indústria/transporte · 0,32 serviços) */
  presuncao_irpj: number;
  /** presunção de CSLL (0,12 comércio/indústria/transporte · 0,32 serviços) */
  presuncao_csll: number;
  irpj: number;
  /** adicional de IRPJ sobre o que exceder o limite */
  adicional_irpj: number;
  /** limite anual do adicional (R$ 60.000 por trimestre) */
  limite_adicional: number;
  csll: number;
  /** encargo patronal total sobre a folha (INSS 20% + RAT + terceiros) */
  cpp: number;
}

export const PREMISSAS_PADRAO: Premissas = {
  cbs: 0.087,
  ibs: 0.001,
  icms: 0.12,
  iss: 0.05,
  presuncao_irpj: 0.08,
  presuncao_csll: 0.12,
  irpj: 0.15,
  adicional_irpj: 0.1,
  limite_adicional: 240000,
  csll: 0.09,
  cpp: 0.268,
};

/** presunções oficiais por setor (IRPJ / CSLL) */
export const PRESUNCAO_POR_SETOR: Record<Setor, { irpj: number; csll: number }> = {
  comercio: { irpj: 0.08, csll: 0.12 },
  industria: { irpj: 0.08, csll: 0.12 },
  transporte_carga: { irpj: 0.08, csll: 0.12 },
  servicos: { irpj: 0.32, csll: 0.32 },
  construcao: { irpj: 0.32, csll: 0.32 },
};

/** o setor recolhe ICMS (mercadoria) ou ISS (serviço)? */
export function tributoEstadualMunicipal(setor: Setor): "icms" | "iss" {
  return setor === "servicos" || setor === "construcao" ? "iss" : "icms";
}

/** CPP está dentro do DAS? (Anexo IV recolhe a parte patronal por fora) */
export function cppNoDas(anexo: number): boolean {
  return anexo !== 4;
}

export interface LinhaCarga {
  rotulo: string;
  valor: number;
  /** de onde veio o número — o que torna o laudo auditável */
  origem: string;
}

export interface ResultadoRegime {
  regime: Regime;
  nome: string;
  /** carga total anual em R$ */
  total: number;
  /** carga como fração da receita */
  sobre_receita: number;
  composicao: LinhaCarga[];
  /** crédito de IBS/CBS que a empresa transfere ao cliente PJ */
  credito_ao_cliente: number;
  /** impedimentos/limites (ex.: acima do teto do Simples) */
  impedimento?: string;
  observacoes: string[];
}

export interface ResultadoComparativo {
  regimes: ResultadoRegime[];
  /** o de menor carga entre os elegíveis */
  menor?: ResultadoRegime;
  /** diferença anual entre o melhor e o atual, quando aplicável */
  premissas: Premissas;
  entrada: EntradaComparativo;
}

const TETO_SIMPLES = 4800000;
const TETO_PRESUMIDO = 78000000;

/** IRPJ + adicional sobre uma base anual */
function irpjComAdicional(base: number, p: Premissas): { irpj: number; adicional: number } {
  const irpj = base * p.irpj;
  const excedente = Math.max(base - p.limite_adicional, 0);
  return { irpj, adicional: excedente * p.adicional_irpj };
}

/** IBS + CBS líquidos de crédito, sobre a receita */
function ibsCbsLiquido(e: EntradaComparativo, p: Premissas) {
  const aliq = p.cbs + p.ibs;
  const debito = e.receita * aliq;
  const credito = e.receita * e.compras_credito * aliq;
  return { aliq, debito, credito, liquido: Math.max(debito - credito, 0) };
}

/* ------------------------------------------------------------ SIMPLES ----- */

function simplesPuro(e: EntradaComparativo, p: Premissas): ResultadoRegime {
  const efetiva = aliquotaEfetivaSimples(e.anexo, e.receita) ?? 0;
  const das = e.receita * efetiva;
  const composicao: LinhaCarga[] = [
    {
      rotulo: "DAS (unificado)",
      valor: das,
      origem: `alíquota efetiva de ${(efetiva * 100).toFixed(2).replace(".", ",")}% sobre a RBT12, Anexo ${e.anexo}`,
    },
  ];

  let total = das;
  if (!cppNoDas(e.anexo)) {
    const cpp = e.folha * p.cpp;
    composicao.push({
      rotulo: "CPP patronal (fora do DAS)",
      valor: cpp,
      origem: `Anexo IV não inclui a contribuição patronal — ${(p.cpp * 100).toFixed(1).replace(".", ",")}% sobre a folha`,
    });
    total += cpp;
  }

  return {
    regime: "simples_puro",
    nome: "Simples Nacional (unificado)",
    total,
    sobre_receita: e.receita ? total / e.receita : 0,
    composicao,
    credito_ao_cliente: 0,
    impedimento: e.receita > TETO_SIMPLES ? "Receita acima do teto do Simples (R$ 4,8 milhões)." : undefined,
    observacoes: [
      "O cliente PJ não aproveita crédito integral de IBS/CBS — é a fraqueza comercial deste regime a partir de 2027.",
    ],
  };
}

function simplesHibrido(e: EntradaComparativo, p: Premissas): ResultadoRegime {
  const efetiva = aliquotaEfetivaSimples(e.anexo, e.receita) ?? 0;
  const ddas = dDASefetivo(e.anexo, e.receita);
  const dasCheio = e.receita * efetiva;
  const saiDoDas = e.receita * ddas.das;
  const dasReduzido = Math.max(dasCheio - saiDoDas, 0);
  const { aliq, debito, credito, liquido } = ibsCbsLiquido(e, p);

  const composicao: LinhaCarga[] = [
    {
      rotulo: "DAS reduzido",
      valor: dasReduzido,
      origem: `DAS de ${(efetiva * 100).toFixed(2).replace(".", ",")}% menos a fatia que virou CBS (${(ddas.das * 100).toFixed(2).replace(".", ",")}%)`,
    },
    {
      rotulo: "IBS + CBS (débito)",
      valor: debito,
      origem: `${(aliq * 100).toFixed(2).replace(".", ",")}% sobre a receita`,
    },
    {
      rotulo: "Crédito de compras",
      valor: -credito,
      origem: `${(e.compras_credito * 100).toFixed(0)}% da receita em compras com crédito`,
    },
  ];

  let total = dasReduzido + liquido;
  if (!cppNoDas(e.anexo)) {
    const cpp = e.folha * p.cpp;
    composicao.push({ rotulo: "CPP patronal (fora do DAS)", valor: cpp, origem: "Anexo IV" });
    total += cpp;
  }

  return {
    regime: "simples_hibrido",
    nome: "Simples com IBS/CBS por fora (híbrido)",
    total,
    sobre_receita: e.receita ? total / e.receita : 0,
    composicao,
    credito_ao_cliente: debito,
    impedimento: e.receita > TETO_SIMPLES ? "Receita acima do teto do Simples (R$ 4,8 milhões)." : undefined,
    observacoes: [
      "O cliente PJ passa a aproveitar crédito integral — é a contrapartida comercial que justifica o custo.",
      "A opção é exercida em janela e vale por semestre.",
    ],
  };
}

/* ---------------------------------------------------------- PRESUMIDO ----- */

function presumido(e: EntradaComparativo, p: Premissas): ResultadoRegime {
  const baseIrpj = e.receita * p.presuncao_irpj;
  const baseCsll = e.receita * p.presuncao_csll;
  const { irpj, adicional } = irpjComAdicional(baseIrpj, p);
  const csll = baseCsll * p.csll;
  const { aliq, debito, credito, liquido } = ibsCbsLiquido(e, p);
  const cpp = e.folha * p.cpp;
  const qual = tributoEstadualMunicipal(e.setor);
  const aliqEst = qual === "icms" ? p.icms : p.iss;
  const estadual = e.receita * aliqEst;

  const composicao: LinhaCarga[] = [
    { rotulo: "IRPJ", valor: irpj, origem: `${(p.irpj * 100).toFixed(0)}% sobre presunção de ${(p.presuncao_irpj * 100).toFixed(0)}% da receita` },
    { rotulo: "Adicional de IRPJ", valor: adicional, origem: `${(p.adicional_irpj * 100).toFixed(0)}% sobre o que excede R$ ${p.limite_adicional.toLocaleString("pt-BR")} de base no ano` },
    { rotulo: "CSLL", valor: csll, origem: `${(p.csll * 100).toFixed(0)}% sobre presunção de ${(p.presuncao_csll * 100).toFixed(0)}% da receita` },
    { rotulo: "IBS + CBS (débito)", valor: debito, origem: `${(aliq * 100).toFixed(2).replace(".", ",")}% sobre a receita` },
    { rotulo: "Crédito de compras", valor: -credito, origem: `${(e.compras_credito * 100).toFixed(0)}% da receita em compras com crédito` },
    { rotulo: qual === "icms" ? "ICMS" : "ISS", valor: estadual, origem: `${(aliqEst * 100).toFixed(1).replace(".", ",")}% — segue cheio até 2029` },
    { rotulo: "CPP patronal", valor: cpp, origem: `${(p.cpp * 100).toFixed(1).replace(".", ",")}% sobre a folha` },
  ];

  const total = irpj + adicional + csll + liquido + estadual + cpp;

  return {
    regime: "presumido",
    nome: "Lucro Presumido",
    total,
    sobre_receita: e.receita ? total / e.receita : 0,
    composicao,
    credito_ao_cliente: debito,
    impedimento: e.receita > TETO_PRESUMIDO ? "Receita acima do limite do Lucro Presumido (R$ 78 milhões)." : undefined,
    observacoes: [
      "A partir de 2027 a CBS substitui PIS/Cofins: quem tinha 3,65% cumulativo e compra pouco tende a sentir aumento.",
      "IRPJ e CSLL seguem pela presunção, em paralelo ao IBS/CBS — são dois sistemas convivendo.",
    ],
  };
}

/* --------------------------------------------------------------- REAL ----- */

function real(e: EntradaComparativo, p: Premissas): ResultadoRegime {
  const lucro = Math.max(e.receita * e.margem_lucro, 0);
  const { irpj, adicional } = irpjComAdicional(lucro, p);
  const csll = lucro * p.csll;
  const { aliq, debito, credito, liquido } = ibsCbsLiquido(e, p);
  const cpp = e.folha * p.cpp;
  const qual = tributoEstadualMunicipal(e.setor);
  const aliqEst = qual === "icms" ? p.icms : p.iss;
  const estadual = e.receita * aliqEst;

  const composicao: LinhaCarga[] = [
    { rotulo: "IRPJ", valor: irpj, origem: `${(p.irpj * 100).toFixed(0)}% sobre lucro de ${(e.margem_lucro * 100).toFixed(0)}% da receita` },
    { rotulo: "Adicional de IRPJ", valor: adicional, origem: `${(p.adicional_irpj * 100).toFixed(0)}% sobre o lucro que excede R$ ${p.limite_adicional.toLocaleString("pt-BR")} no ano` },
    { rotulo: "CSLL", valor: csll, origem: `${(p.csll * 100).toFixed(0)}% sobre o lucro` },
    { rotulo: "IBS + CBS (débito)", valor: debito, origem: `${(aliq * 100).toFixed(2).replace(".", ",")}% sobre a receita` },
    { rotulo: "Crédito de compras", valor: -credito, origem: `${(e.compras_credito * 100).toFixed(0)}% da receita em compras com crédito` },
    { rotulo: qual === "icms" ? "ICMS" : "ISS", valor: estadual, origem: `${(aliqEst * 100).toFixed(1).replace(".", ",")}% — segue cheio até 2029` },
    { rotulo: "CPP patronal", valor: cpp, origem: `${(p.cpp * 100).toFixed(1).replace(".", ",")}% sobre a folha` },
  ];

  const total = irpj + adicional + csll + liquido + estadual + cpp;

  return {
    regime: "real",
    nome: "Lucro Real",
    total,
    sobre_receita: e.receita ? total / e.receita : 0,
    composicao,
    credito_ao_cliente: debito,
    observacoes: [
      "Faz sentido quando a margem é baixa: tributa lucro efetivo, não presumido.",
      "Exige escrituração completa — o custo de conformidade não entra nesta conta.",
    ],
  };
}

/* ---------------------------------------------------------- comparar ----- */

export function compararRegimes(
  entrada: EntradaComparativo,
  premissas: Premissas = PREMISSAS_PADRAO
): ResultadoComparativo {
  const regimes = [
    simplesPuro(entrada, premissas),
    simplesHibrido(entrada, premissas),
    presumido(entrada, premissas),
    real(entrada, premissas),
  ];

  const elegiveis = regimes.filter((r) => !r.impedimento);
  const menor = elegiveis.length
    ? elegiveis.reduce((a, b) => (b.total < a.total ? b : a))
    : undefined;

  return { regimes, menor, premissas, entrada };
}

/** premissas ajustadas ao setor (presunções corretas) */
export function premissasDoSetor(setor: Setor, base: Premissas = PREMISSAS_PADRAO): Premissas {
  const pr = PRESUNCAO_POR_SETOR[setor];
  return { ...base, presuncao_irpj: pr.irpj, presuncao_csll: pr.csll };
}

export const ROTULO_SETOR: Record<Setor, string> = {
  comercio: "Comércio",
  industria: "Indústria",
  servicos: "Serviços",
  transporte_carga: "Transporte de carga",
  construcao: "Construção civil",
};

/** anexo provável do Simples a partir do setor (ponto de partida) */
export function anexoDoSetor(setor: Setor): number {
  switch (setor) {
    case "comercio":
      return 1;
    case "industria":
      return 2;
    case "construcao":
      return 4;
    case "transporte_carga":
      return 3;
    default:
      return 3;
  }
}

/** fator R: folha ≥ 28% da receita mantém o serviço no Anexo III */
export function fatorR(receita: number, folha: number): number {
  return receita > 0 ? folha / receita : 0;
}

export const TETOS = { simples: TETO_SIMPLES, presumido: TETO_PRESUMIDO };
