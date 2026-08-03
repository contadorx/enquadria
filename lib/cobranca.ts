/**
 * MÉTRICAS DE RECEITA — onde os números mentem se ninguém cuidar.
 *
 * Este arquivo já teve também um motor de régua de cobrança. Ele foi removido
 * em 03/08 na consolidação: `lib/reguas.ts` já fazia isso, com copy em tabela
 * e tela de edição, e os dois juntos mandariam a mesma cobrança duas vezes.
 *
 * O que sobrou é o que ninguém mais faz: o cálculo de MRR, churn e LTV usado
 * pela tela de Contas.
 */

/** Formatação usada pela tela de Contas. Mora aqui porque é onde os números
 *  desta família são produzidos — separá-la criaria um arquivo de uma linha. */
export function moedaBR(v: number | null | undefined): string {
  return (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export interface ContaMetrica {
  status: string;
  is_teste: boolean;
  acesso_cortesia: boolean;
  valor_mensal: number | null;
  ultimo_pagamento: string | null;
  ultimo_pagamento_valor: number | null;
  ciclo_cobranca: string;
  cancelado_em: string | null;
}

/**
 * O VALOR REAL DE UMA CONTA.
 *
 * Cascata: o que ela de fato pagou → o que foi negociado. Anual vira mensal.
 * Preço de tabela nunca entra: conta com desconto que paga R$ 190 não vale
 * R$ 297 no MRR só porque o plano custa isso.
 */
export function valorReal(c: ContaMetrica): number {
  const bruto = c.ultimo_pagamento_valor ?? c.valor_mensal ?? 0;
  return c.ciclo_cobranca === "anual" ? bruto / 12 : bruto;
}

/**
 * ESTA CONTA É PAGANTE?
 *
 * O critério decisivo é `ultimo_pagamento` PREENCHIDO — não o status do
 * gateway. O Asaas cria assinatura ACTIVE antes do primeiro pagamento; usar o
 * status infla o MRR com quem assinou e nunca pagou. Foi o erro documentado no
 * BPOx e é o mais fácil de repetir.
 */
export function ehPagante(c: ContaMetrica): boolean {
  if (c.is_teste || c.acesso_cortesia) return false;
  if (c.status !== "ativa") return false;
  return !!c.ultimo_pagamento;
}

export interface Metricas {
  mrr: number;
  arr: number;
  pagantes: number;
  ticket: number;
  /** trials e cortesias a valor cheio — o funil, SEM inflar o número oficial */
  mrrPotencial: number;
  churnPct: number | null;
  ltv: number | null;
  ignoradasTeste: number;
}

export function calcularMetricas(contas: ContaMetrica[], mesAtual: string): Metricas {
  const ignoradasTeste = contas.filter((c) => c.is_teste).length;
  const reais = contas.filter((c) => !c.is_teste);

  const pagantes = reais.filter(ehPagante);
  const mrr = pagantes.reduce((s, c) => s + valorReal(c), 0);

  const potenciais = reais.filter(
    (c) => !ehPagante(c) && (c.status === "trial" || c.acesso_cortesia)
  );
  const mrrPotencial = potenciais.reduce((s, c) => s + (c.valor_mensal ?? 0), 0);

  const canceladosMes = reais.filter(
    (c) => c.cancelado_em && c.cancelado_em.slice(0, 7) === mesAtual
  ).length;

  const base = pagantes.length + canceladosMes;
  const churnPct = base > 0 ? (canceladosMes / base) * 100 : null;
  const ticket = pagantes.length > 0 ? mrr / pagantes.length : 0;
  // LTV com churn zero é infinito, não um número grande. Devolver null é a
  // única resposta honesta — e evita "R$ 8.400.000 de LTV" num slide.
  const ltv = churnPct && churnPct > 0 ? ticket / (churnPct / 100) : null;

  return {
    mrr,
    arr: mrr * 12,
    pagantes: pagantes.length,
    ticket,
    mrrPotencial,
    churnPct,
    ltv,
    ignoradasTeste,
  };
}
