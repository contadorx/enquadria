/**
 * O MOTOR DA RÉGUA DE COBRANÇA — puro, sem banco e sem relógio próprio.
 *
 * Recebe a data de hoje como argumento em vez de chamar `new Date()` por
 * dentro. Não é preciosismo: é o que torna possível testar "o que sai no dia
 * do vencimento" sem esperar o dia do vencimento chegar. Uma régua que só pode
 * ser verificada em produção é uma régua que ninguém verifica.
 *
 * TRÊS DECISÕES QUE VALEM MAIS QUE O CÓDIGO:
 *
 *  1. UM PASSO POR CONTA POR COMPETÊNCIA. A chave é (conta, passo, mês do
 *     vencimento). Reprocessar o dia não reenvia — cobrar duas vezes o mesmo
 *     mês é o e-mail mais caro do produto.
 *
 *  2. QUEM JÁ PAGOU SAI DA RÉGUA IMEDIATAMENTE. A verificação é por
 *     `ultimo_pagamento >= vencimento`, não por status do gateway: o gateway
 *     demora a refletir, e cobrar quem acabou de pagar destrói mais confiança
 *     do que a fatura vale.
 *
 *  3. CORTESIA, TESTE E CANCELADA NUNCA ENTRAM. Cada uma por um motivo
 *     diferente, e todas com o mesmo efeito de errar: cobrar quem não deve.
 */

export interface PassoCobranca {
  chave: string;
  momento: "emissao" | "vencimento";
  /** distância em dias do vencimento — negativo antes, positivo depois */
  dias: number;
  assunto: string;
  corpo: string;
  ativo: boolean;
}

export interface ContaCobravel {
  id: string;
  status: string;
  is_teste: boolean;
  acesso_cortesia: boolean;
  emails_optout: boolean;
  /** AAAA-MM-DD */
  proximo_vencimento: string | null;
  ultimo_pagamento: string | null;
  valor_mensal: number | null;
}

export interface EnvioDevido {
  tenant_id: string;
  passo_chave: string;
  competencia: string;
  vencimento: string;
}

/** dias inteiros entre duas datas AAAA-MM-DD, ignorando fuso e hora */
export function distanciaEmDias(de: string, ate: string): number {
  const a = Date.UTC(+de.slice(0, 4), +de.slice(5, 7) - 1, +de.slice(8, 10));
  const b = Date.UTC(+ate.slice(0, 4), +ate.slice(5, 7) - 1, +ate.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

/** 'AAAA-MM' do vencimento — a competência que identifica o ciclo */
export function competenciaDe(vencimento: string): string {
  return vencimento.slice(0, 7);
}

/**
 * ESTA CONTA PODE RECEBER COBRANÇA HOJE?
 *
 * Separada do resto para poder ser lida sozinha: é a função que decide se
 * alguém vai ser incomodado, e a lista de motivos para NÃO incomodar precisa
 * caber num olhar.
 */
export function elegivel(c: ContaCobravel): { pode: boolean; motivo?: string } {
  if (c.is_teste) return { pode: false, motivo: "conta de teste" };
  if (c.acesso_cortesia) return { pode: false, motivo: "acesso cortesia" };
  if (c.emails_optout) return { pode: false, motivo: "optou por não receber e-mails" };
  if (c.status === "cancelada" || c.status === "suspensa")
    return { pode: false, motivo: `conta ${c.status}` };
  if (c.status === "trial") return { pode: false, motivo: "ainda em trial" };
  if (!c.proximo_vencimento) return { pode: false, motivo: "sem vencimento definido" };
  if (!c.valor_mensal) return { pode: false, motivo: "sem valor definido" };
  return { pode: true };
}

/**
 * JÁ PAGOU ESTE CICLO?
 *
 * Pagamento na data do vencimento ou depois quita o ciclo. Comparação por
 * string funciona porque AAAA-MM-DD ordena lexicograficamente — e evita
 * fabricar Date, que traria fuso para dentro de uma decisão que é de calendário.
 */
export function jaPagou(c: ContaCobravel): boolean {
  if (!c.ultimo_pagamento || !c.proximo_vencimento) return false;
  return c.ultimo_pagamento >= c.proximo_vencimento;
}

/**
 * O QUE SAI HOJE para uma conta.
 *
 * `hoje` entra como argumento — ver o cabeçalho do arquivo.
 *
 * O passo de `emissao` é o único que não se mede pelo vencimento: ele dispara
 * quando a fatura nasce, e a fatura nasce quando o vencimento é conhecido.
 * Usamos a distância em dias a partir da emissão informada; sem ela, o passo
 * é ignorado em vez de sair na hora errada.
 */
export function devidosHoje(
  conta: ContaCobravel,
  passos: PassoCobranca[],
  hoje: string,
  jaEnviados: Set<string>,
  emissao?: string | null
): EnvioDevido[] {
  const apto = elegivel(conta);
  if (!apto.pode) return [];
  if (jaPagou(conta)) return [];

  const venc = conta.proximo_vencimento!;
  const competencia = competenciaDe(venc);
  const saida: EnvioDevido[] = [];

  for (const p of passos) {
    if (!p.ativo) continue;

    let bate = false;
    if (p.momento === "emissao") {
      if (!emissao) continue;
      bate = distanciaEmDias(emissao, hoje) === p.dias;
    } else {
      // dias negativos são ANTES do vencimento: distância de hoje até o
      // vencimento é o inverso do sinal do passo
      bate = distanciaEmDias(hoje, venc) === -p.dias;
    }
    if (!bate) continue;

    const marca = `${conta.id}|${p.chave}|${competencia}`;
    if (jaEnviados.has(marca)) continue;

    saida.push({
      tenant_id: conta.id,
      passo_chave: p.chave,
      competencia,
      vencimento: venc,
    });
  }
  return saida;
}

/**
 * Troca as marcações do texto. Deliberadamente burro: sem condicional, sem
 * laço, sem expressão. Template de cobrança que executa lógica é template que
 * um dia manda `{{valor}}` literal para trezentas pessoas.
 */
export function preencher(texto: string, valores: Record<string, string>): string {
  return texto.replace(/\{\{(\w+)\}\}/g, (_m, chave: string) => valores[chave] ?? "");
}

export function moedaBR(v: number | null | undefined): string {
  return (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function dataBR(iso: string | null | undefined): string {
  if (!iso) return "";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/* ═══════════════════════════════════════════════════════════════════════
 * MÉTRICAS DE RECEITA — a parte onde os números mentem se ninguém cuidar.
 * ═══════════════════════════════════════════════════════════════════════ */

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
