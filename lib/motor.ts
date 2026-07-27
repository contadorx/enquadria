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

export type Saida = "S1" | "S2" | "S3" | "S4" | "S5";

/** S4 e S5 são recomendações de OPTAR; diferem no motivo, não no destino. */
export function ehOptar(s?: Saida | string | null): boolean {
  return s === "S4" || s === "S5";
}

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
  /**
   * OBSOLETO. Ficou inerte quando a árvore foi reordenada (26/07/2026): o corte
   * superior agora é o próprio `fronteiraMax`. Mantido só para não quebrar
   * registros antigos que gravaram o parâmetro.
   */
  corteS1?: number;
  /** receita qualificada mínima para a decisão depender de repasse */
  rqMin?: number;
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
  fronteiraMin: 0.8,
  fronteiraMax: 1.2,
  rqMin: 0.3,
};

/**
 * TABELA LEGAL DO SIMPLES NACIONAL — LC 123, Anexos I a V.
 * Conferida contra as tabelas oficiais da Receita Federal (jul/2026).
 *
 * Cada faixa carrega o que a alíquota EFETIVA precisa:
 *   teto      · teto de RBT12 da faixa, em R$
 *   nominal   · alíquota nominal da faixa (fração)
 *   deduzir   · parcela a deduzir da faixa, em R$
 *   sharePC   · (Cofins% + PIS/Pasep%) da partilha OFICIAL daquela faixa —
 *               a fatia da carga que vira CBS e SAI do DAS no regime híbrido.
 *
 * A alíquota efetiva do Simples é (RBT12 × nominal − deduzir) / RBT12: sempre
 * ≤ nominal, e bem abaixo nas faixas baixas. Usar a nominal superestima o
 * custo — por isso o laudo de produção calcula a efetiva a partir da RBT12.
 */
export interface FaixaSimples {
  teto: number;
  nominal: number;
  deduzir: number;
  sharePC: number;
}

export const ANEXOS_SIMPLES: Record<number, FaixaSimples[]> = {
  // Anexo I — Comércio
  1: [
    { teto: 180000, nominal: 0.04, deduzir: 0, sharePC: 0.155 },
    { teto: 360000, nominal: 0.073, deduzir: 5940, sharePC: 0.155 },
    { teto: 720000, nominal: 0.095, deduzir: 13860, sharePC: 0.155 },
    { teto: 1800000, nominal: 0.107, deduzir: 22500, sharePC: 0.155 },
    { teto: 3600000, nominal: 0.143, deduzir: 87300, sharePC: 0.155 },
    { teto: 4800000, nominal: 0.19, deduzir: 378000, sharePC: 0.344 },
  ],
  // Anexo II — Indústria
  2: [
    { teto: 180000, nominal: 0.045, deduzir: 0, sharePC: 0.14 },
    { teto: 360000, nominal: 0.078, deduzir: 5940, sharePC: 0.14 },
    { teto: 720000, nominal: 0.1, deduzir: 13860, sharePC: 0.14 },
    { teto: 1800000, nominal: 0.112, deduzir: 22500, sharePC: 0.14 },
    { teto: 3600000, nominal: 0.147, deduzir: 85500, sharePC: 0.14 },
    { teto: 4800000, nominal: 0.3, deduzir: 720000, sharePC: 0.255 },
  ],
  // Anexo III — Serviços (fator R ≥ 28% e serviços do §5º-B)
  3: [
    { teto: 180000, nominal: 0.06, deduzir: 0, sharePC: 0.156 },
    { teto: 360000, nominal: 0.112, deduzir: 9360, sharePC: 0.171 },
    { teto: 720000, nominal: 0.135, deduzir: 17640, sharePC: 0.166 },
    { teto: 1800000, nominal: 0.16, deduzir: 35640, sharePC: 0.166 },
    { teto: 3600000, nominal: 0.21, deduzir: 125640, sharePC: 0.156 },
    { teto: 4800000, nominal: 0.33, deduzir: 648000, sharePC: 0.195 },
  ],
  // Anexo IV — Serviços (construção, limpeza, advocacia; sem CPP no DAS)
  4: [
    { teto: 180000, nominal: 0.045, deduzir: 0, sharePC: 0.215 },
    { teto: 360000, nominal: 0.09, deduzir: 8100, sharePC: 0.25 },
    { teto: 720000, nominal: 0.102, deduzir: 12420, sharePC: 0.24 },
    { teto: 1800000, nominal: 0.14, deduzir: 39780, sharePC: 0.23 },
    { teto: 3600000, nominal: 0.22, deduzir: 183780, sharePC: 0.22 },
    { teto: 4800000, nominal: 0.33, deduzir: 828000, sharePC: 0.25 },
  ],
  // Anexo V — Serviços intensivos em conhecimento (fator R < 28%)
  5: [
    { teto: 180000, nominal: 0.155, deduzir: 0, sharePC: 0.1715 },
    { teto: 360000, nominal: 0.18, deduzir: 4500, sharePC: 0.1715 },
    { teto: 720000, nominal: 0.195, deduzir: 9900, sharePC: 0.1815 },
    { teto: 1800000, nominal: 0.205, deduzir: 17100, sharePC: 0.1915 },
    { teto: 3600000, nominal: 0.23, deduzir: 62100, sharePC: 0.1715 },
    { teto: 4800000, nominal: 0.305, deduzir: 540000, sharePC: 0.2 },
  ],
};

/** normaliza o índice do anexo; cai no Anexo I quando ausente ou inválido */
function anexoValido(anexo?: number | null): number {
  return anexo && ANEXOS_SIMPLES[anexo] ? anexo : 1;
}

/** faixa (1–6) de uma empresa a partir da RBT12; null quando a RBT12 é inválida */
export function faixaDe(anexo: number | null | undefined, rbt12: number): number | null {
  if (!(rbt12 > 0)) return null;
  const tabela = ANEXOS_SIMPLES[anexoValido(anexo)];
  for (let i = 0; i < tabela.length; i++) {
    if (rbt12 <= tabela[i].teto) return i + 1;
  }
  return tabela.length; // acima do teto do Simples: última faixa (sublimite tratado à parte)
}

/**
 * Alíquota EFETIVA do Simples a partir da RBT12 real: (RBT12 × nominal − PD) / RBT12.
 * Retorna null se a RBT12 for inválida (sem valor não há efetiva — usa-se o fallback).
 */
export function aliquotaEfetivaSimples(anexo: number | null | undefined, rbt12: number): number | null {
  const f = faixaDe(anexo, rbt12);
  if (f == null) return null;
  const faixa = ANEXOS_SIMPLES[anexoValido(anexo)][f - 1];
  return Math.max((rbt12 * faixa.nominal - faixa.deduzir) / rbt12, 0);
}

export interface DDAS {
  /** parcela PIS/Cofins que sai do DAS, como fração da receita — é o `das` do motor */
  das: number;
  /** faixa usada (1–6) */
  faixa: number;
  /** anexo usado (1–5) */
  anexo: number;
  /** alíquota do Simples aplicada (efetiva quando há RBT12; nominal no fallback) */
  aliquota: number;
  /** fração PIS/Cofins da partilha da faixa */
  sharePC: number;
  /** RBT12 usada, quando informada */
  rbt12: number | null;
  /** "efetiva" = calculada da RBT12 real · "conservador" = topo da faixa (nominal) */
  fonte: "efetiva" | "conservador";
  /**
   * RBT12 acima do teto do Simples (R$ 4,8 mi). Antes isso virava faixa 6 em
   * silêncio; a empresa está EXCLUÍDA do Simples e não tem decisão de setembro.
   * Quem consome precisa avisar em vez de calcular.
   */
  acimaDoTeto?: boolean;
}

/**
 * dDAS EFETIVO por empresa — o número que entra no motor como `das`.
 *
 * Com RBT12 real → alíquota efetiva daquela RBT12 × sharePC da faixa.
 * Sem RBT12     → FALLBACK CONSERVADOR: alíquota nominal (topo da faixa) ×
 *                 sharePC, na faixa informada (ou faixa 3 se nada vier). Nunca
 *                 subestima o custo, e o laudo marca a premissa como estimada.
 */
export function dDASefetivo(
  anexo?: number | null,
  rbt12?: number | null,
  faixaFallback?: number | null
): DDAS {
  const a = anexoValido(anexo);
  const tabela = ANEXOS_SIMPLES[a];

  if (rbt12 && rbt12 > 0) {
    const f = faixaDe(a, rbt12) as number;
    const faixa = tabela[f - 1];
    const efetiva = Math.max((rbt12 * faixa.nominal - faixa.deduzir) / rbt12, 0);
    const acimaDoTeto = rbt12 > tabela[tabela.length - 1].teto;
    return { das: efetiva * faixa.sharePC, faixa: f, anexo: a, aliquota: efetiva, sharePC: faixa.sharePC, rbt12, fonte: "efetiva", acimaDoTeto };
  }

  // FALLBACK — mudou em 26/07/2026, depois da validação externa.
  // Antes caía na faixa 3, e isso NÃO era conservador: um comércio realmente na
  // faixa 1 recebia `das` de 1,4725% em vez de 0,6200% — 2,4× o valor real. E
  // `das` maior significa `cl` menor, ou seja, o erro empurrava para OPTAR, que
  // é a direção perigosa. A faixa 1 é o menor `das` possível do anexo, portanto
  // o maior `cl`, portanto o viés contra optar. Melhor ainda é exigir a RBT12.
  const f = faixaFallback && tabela[faixaFallback - 1] ? faixaFallback : 1;
  const faixa = tabela[f - 1];
  return { das: faixa.nominal * faixa.sharePC, faixa: f, anexo: a, aliquota: faixa.nominal, sharePC: faixa.sharePC, rbt12: null, fonte: "conservador" };
}

/**
 * dDAS por anexo E faixa — espelho conservador (nominal × sharePC), derivado da
 * tabela oficial acima, para o modo demonstração e o `parametros_exercicio`.
 * A fonte única é ANEXOS_SIMPLES; aqui é só a projeção topo-da-faixa.
 */
export const DAS_POR_ANEXO_FAIXA: Record<number, Record<number, number>> = Object.fromEntries(
  Object.entries(ANEXOS_SIMPLES).map(([a, faixas]) => [
    Number(a),
    Object.fromEntries(faixas.map((f, i) => [i + 1, Math.round(f.nominal * f.sharePC * 1e5) / 1e5])),
  ])
);

/** resolve o dDAS conservador de uma empresa; cai no anexo I faixa 1 se faltar dado */
export function dasDe(anexo?: number | null, faixa?: number | null): number {
  return dDASefetivo(anexo, null, faixa).das;
}

/**
 * ÁRVORE DE DECISÃO — reordenada em 26/07/2026 após validação externa.
 *
 * A ordem anterior tinha três defeitos medidos num grid de 16.800 combinações:
 *
 *  1. `cl <= 0` decidia ANTES da qualificação. 12,9% dos casos caíam nessa regra
 *     e 4,5% recebiam "optar, condicionado a repasse" com `rq < 0,3` — empresa
 *     sem a quem transferir crédito, com repasse infinito no laudo, e que a
 *     triagem da carteira teria descartado. Agora a qualificação vem primeiro, e
 *     quem paga menos imposto sem depender de negociação tem saída PRÓPRIA (S5).
 *
 *  2. `preco` só era consultado quando `re < 0,8·fc`, ou seja, exatamente onde
 *     menos importava. Uma empresa SEM poder de renegociar e com a conta
 *     apertada (re/fc 0,85) recebia S3 "leve os dois cenários ao empresário",
 *     enquanto a mesma empresa com a conta mais FOLGADA (0,76) recebia S2 "a
 *     negociação não fecha". Economia melhor, recomendação pior. Agora o teste
 *     de `preco` vem antes da banda de fronteira: quem não consegue renegociar
 *     não está em fronteira nenhuma.
 *
 *  3. `corteS1` era inerte: com a banda capturando [0,8·fc ; 1,2·fc], tudo acima
 *     de 1,2 virava S1 com ou sem ele. O corte superior agora é o próprio
 *     `fronteiraMax`, que é o mesmo número com significado.
 *
 * A ordem abaixo é significativa. Ler de cima para baixo.
 */
export function decidir(r: Respostas, p: Parametros = PARAMETROS_2027): Resultado {
  const fMin = p.fronteiraMin ?? 0.8;
  const fMax = p.fronteiraMax ?? 1.2;
  const rqMin = p.rqMin ?? 0.3;

  const rq = r.b2b * r.qual;
  const ch = p.aliquota * (1 - r.cred);
  const cl = ch - p.das;
  const re = rq > 0 ? cl / rq : Number.POSITIVE_INFINITY;
  const fc = p.aliquota - p.das;

  let saida: Saida;

  if (rq < rqMin) {
    // Sem receita qualificada não há a quem transferir crédito. Vale inclusive
    // quando o híbrido sairia mais barato: o ganho não compensa a apuração por
    // fora numa empresa que vende para consumidor final ou para o Simples.
    saida = "S1";
  } else if (cl <= 0) {
    // O híbrido custa MENOS em termos absolutos. Optar não depende de
    // renegociar preço nenhum — e por isso não é o mesmo conselho que o S4.
    saida = "S5";
  } else if (fc <= 0) {
    // Guarda para exercícios futuros: se o que sai do DAS alcançar a alíquota,
    // o comprador não ganha crédito extra e as bandas de fronteira se invertem.
    saida = "S1";
  } else if (re > fc * fMax) {
    // O repasse necessário estoura o ganho do comprador. Não fecha para ninguém.
    saida = "S1";
  } else if (r.preco <= 1) {
    // A conta fecha, a negociação não. Preparar a janela seguinte.
    saida = "S2";
  } else if (re >= fc * fMin) {
    // Cabe, mas por pouco: o motor não decide, o empresário decide.
    saida = "S3";
  } else {
    saida = "S4";
  }

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
  S5: {
    titulo: "Optar por vantagem direta",
    descricao:
      "No regime regular a empresa paga menos, pelos créditos das próprias compras — sem depender de renegociar preço com ninguém. Confirme se o custo de apurar por fora cabe no ganho.",
    cor: "verde",
  },
};

export const pct = (x: number, casas = 1) =>
  !isFinite(x) ? "—" : `${(x * 100).toFixed(casas).replace(".", ",")}%`;

export const moeda = (x?: number | null) =>
  x == null || !isFinite(x)
    ? "—"
    : x.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
