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

  /* ── O PAGAMENTO REAL (0047) ────────────────────────────────────────────
   *
   * Vem de `faturas.status = 'pago'`, que é escrito pelo webhook do Asaas.
   * Os quatro campos acima são cópias DIGITADAS do que a fatura já sabe — e
   * enquanto foram a única fonte, o MRR era o que alguém lembrou de anotar.
   *
   * Opcionais porque `calcularMetricas` também é chamado com dados antigos, de
   * antes de a fatura existir. Ausente = "não há fatura", não "não pagou". */
  pago_em?: string | null;
  pago_valor_centavos?: number | null;
  /** valor do CONTRATO (assinaturas.valor_centavos) — o que foi acordado */
  contrato_centavos?: number | null;
}

/**
 * O VALOR REAL DE UMA CONTA.
 *
 * Cascata, do mais verdadeiro para o menos:
 *
 *   1. a FATURA PAGA — escrita pelo webhook, ninguém digita;
 *   2. o valor do CONTRATO — o que foi acordado em `assinaturas`;
 *   3. o `ultimo_pagamento_valor` digitado à mão em `tenants`;
 *   4. o `valor_mensal` digitado à mão.
 *
 * A ordem mudou em 05/08/2026. Antes começava no item 3, e o MRR era o que
 * alguém lembrou de anotar na tela — um escritório que pagava R$ 190 pelo
 * Asaas entrava como R$ 297 porque foi esse o número digitado no dia da
 * negociação. Os campos digitados continuam valendo, no fim da fila, porque
 * existe pagamento que a fatura não registra: PIX combinado, cobrança anterior
 * ao webhook, acerto por fora.
 *
 * Anual vira mensal. Preço de tabela nunca entra: conta com desconto que paga
 * R$ 190 não vale R$ 297 no MRR só porque o plano custa isso.
 */
export function valorReal(c: ContaMetrica): number {
  const daFatura = c.pago_valor_centavos != null ? c.pago_valor_centavos / 100 : null;
  const doContrato = c.contrato_centavos != null ? c.contrato_centavos / 100 : null;
  const bruto = daFatura ?? doContrato ?? c.ultimo_pagamento_valor ?? c.valor_mensal ?? 0;
  return c.ciclo_cobranca === "anual" ? bruto / 12 : bruto;
}

/** de onde saiu o número que `valorReal` devolveu — vai para a tela */
export function origemDoValor(c: ContaMetrica): "fatura" | "contrato" | "digitado" | "nenhum" {
  if (c.pago_valor_centavos != null) return "fatura";
  if (c.contrato_centavos != null) return "contrato";
  if (c.ultimo_pagamento_valor != null || c.valor_mensal != null) return "digitado";
  return "nenhum";
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
  /* fatura paga é prova; o campo digitado continua servindo para o pagamento
     que entrou por fora do gateway */
  return !!c.pago_em || !!c.ultimo_pagamento;
}

/* ══════════════════════════════════════════════════════════════════════════
 * AS DIVERGÊNCIAS — o que duas telas com fontes diferentes escondiam.
 *
 * Enquanto Contas escrevia em `tenants` e Cobranças em `assinaturas`, o mesmo
 * escritório tinha status em dois lugares e valor em dois, e ninguém via.
 * Agora a tela é uma só, lendo os dois lados — e quando eles discordam ela
 * diz, em vez de escolher em silêncio.
 *
 * Isto NÃO é erro: divergência é normal quando o pagamento entrou por fora ou
 * quando a negociação mudou e o contrato ainda não. O que não pode é ser
 * invisível.
 * ══════════════════════════════════════════════════════════════════════════ */

export interface Divergencia {
  campo: string;
  digitado: string;
  real: string;
  /** o que fazer — sempre uma ação, nunca só o diagnóstico */
  saida: string;
}

const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dia = (d: string) => d.slice(0, 10).split("-").reverse().join("/");

export function divergencias(c: ContaMetrica): Divergencia[] {
  const fora: Divergencia[] = [];

  /* valor: só compara quando existem os dois, e com tolerância de 1 centavo
     para não acusar arredondamento como conflito */
  const digitadoValor = c.ultimo_pagamento_valor ?? c.valor_mensal;
  const realValor =
    c.pago_valor_centavos != null ? c.pago_valor_centavos / 100
      : c.contrato_centavos != null ? c.contrato_centavos / 100 : null;
  if (digitadoValor != null && realValor != null && Math.abs(digitadoValor - realValor) > 0.01) {
    fora.push({
      campo: "valor",
      digitado: reais(digitadoValor),
      real: reais(realValor),
      saida: c.pago_valor_centavos != null
        ? "A fatura paga vale mais que o campo. Corrija o campo ou apague-o."
        : "O contrato vale mais que o campo. Corrija o campo ou ajuste a assinatura.",
    });
  }

  /* data do último pagamento */
  if (c.ultimo_pagamento && c.pago_em && c.ultimo_pagamento.slice(0, 10) !== c.pago_em.slice(0, 10)) {
    fora.push({
      campo: "último pagamento",
      digitado: dia(c.ultimo_pagamento),
      real: dia(c.pago_em),
      saida: "A fatura registra outra data. Apague o campo digitado e deixe a fatura mandar.",
    });
  }

  /* pagante pela mão, sem nenhuma fatura para sustentar */
  if (c.ultimo_pagamento && !c.pago_em) {
    fora.push({
      campo: "sem fatura",
      digitado: dia(c.ultimo_pagamento),
      real: "nenhuma fatura paga",
      saida: "Pagamento fora do gateway, ou o webhook não entregou. Confira em Cobranças antes de contar no MRR.",
    });
  }

  return fora;
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
