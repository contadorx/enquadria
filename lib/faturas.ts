/**
 * A CENTRAL DE FATURAS — o que o cliente vê depois de pagar.
 *
 * Até aqui, o dinheiro entrava e sumia da vista: a assinatura guardava um
 * `checkout_url` e uma data de validade, e mais nada. Quem pagou não tinha
 * onde conferir o que pagou, quando, nem como pegar a segunda via — e essas
 * três perguntas chegam por e-mail em todo SaaS, todo mês, sempre para uma
 * pessoa só (você).
 *
 * O QUE ESTE ARQUIVO DECIDE, e por que é função pura:
 *
 *  1. O DE-PARA DE STATUS. O Asaas fala numa língua (RECEIVED, CONFIRMED,
 *     OVERDUE, REFUNDED…) e a tela precisa falar outra. Se cada lugar
 *     traduzir do seu jeito, uma fatura estornada aparece como paga em uma
 *     tela e como pendente em outra — e aí ninguém confia em nenhuma.
 *
 *  2. O QUE É "EM ABERTO". Vencido é pendente com data no passado. Quem
 *     calcula isso na tela, com `new Date()` dentro do componente, produz um
 *     resultado que ninguém consegue testar. Aqui a data entra como argumento.
 *
 * NADA AQUI CONSULTA O ASAAS. A fonte da verdade continua sendo o webhook e a
 * reconciliação; este arquivo só interpreta o que já está gravado.
 */

export type StatusFatura = "pendente" | "pago" | "vencido" | "cancelado" | "estornado";

export interface Fatura {
  id: string;
  /** de quem é a fatura — o extrato do gestor filtra por contratante */
  tenant_id?: string | null;
  asaas_id?: string | null;
  descricao?: string | null;
  /** nome do plano no momento da cobrança — o extrato do gestor mostra este */
  plano_nome?: string | null;
  valor_centavos: number;
  status: StatusFatura | string;
  /** AAAA-MM-DD */
  vencimento?: string | null;
  pago_em?: string | null;
  link_pagamento?: string | null;
  link_boleto?: string | null;
  criado_em?: string | null;
}

/**
 * Status do Asaas → o nosso.
 *
 * Aceita tanto o `status` do pagamento (RECEIVED) quanto o nome do evento
 * (PAYMENT_RECEIVED), porque as duas formas chegam: a primeira quando a gente
 * pergunta, a segunda quando o Asaas avisa. Tratar as duas no mesmo lugar
 * evita a divergência clássica entre webhook e reconciliação.
 *
 * O DESCONHECIDO VIRA "pendente", nunca "pago". Errar para pendente gera uma
 * pergunta do cliente; errar para pago libera acesso que ninguém pagou.
 */
export function statusDoAsaas(bruto: string | null | undefined): StatusFatura {
  const s = (bruto ?? "").toUpperCase().replace(/^PAYMENT_/, "");
  if (["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(s)) return "pago";
  if (["OVERDUE"].includes(s)) return "vencido";
  if (["REFUNDED", "REFUND_REQUESTED", "CHARGEBACK_REQUESTED", "CHARGEBACK_DISPUTE"].includes(s))
    return "estornado";
  if (["DELETED", "CANCELED", "CANCELLED"].includes(s)) return "cancelado";
  return "pendente";
}

export const ROTULO_STATUS: Record<StatusFatura, string> = {
  pendente: "Em aberto",
  pago: "Pago",
  vencido: "Vencida",
  cancelado: "Cancelada",
  estornado: "Estornada",
};

/**
 * VENCIDA É PENDENTE COM DATA NO PASSADO.
 *
 * O Asaas manda `PAYMENT_OVERDUE`, mas o evento pode não chegar (webhook é
 * entrega best-effort). Se a tela dependesse só dele, uma fatura vencida há
 * duas semanas apareceria como "em aberto" — e o cliente que quer pagar não
 * entende por que perdeu o acesso.
 */
export function statusEfetivo(f: Fatura, hoje: Date): StatusFatura {
  const s = f.status as StatusFatura;
  if (s !== "pendente") return s;
  if (!f.vencimento) return "pendente";
  const venc = new Date(`${f.vencimento}T23:59:59`);
  return venc.getTime() < hoje.getTime() ? "vencido" : "pendente";
}

/** dá para pagar agora? só faz sentido oferecer o botão quando dá */
export function podePagar(f: Fatura, hoje: Date): boolean {
  const s = statusEfetivo(f, hoje);
  return (s === "pendente" || s === "vencido") && !!(f.link_pagamento || f.link_boleto);
}

export interface ResumoFaturas {
  /** quanto já foi pago, somando tudo */
  pago_centavos: number;
  /** quanto está em aberto (pendente + vencido) */
  aberto_centavos: number;
  /** a próxima a vencer, se houver */
  proxima: Fatura | null;
  /** a mais antiga vencida — é ela que explica um acesso bloqueado */
  atrasada: Fatura | null;
  total: number;
}

export function resumirFaturas(lista: Fatura[], hoje: Date): ResumoFaturas {
  let pago = 0;
  let aberto = 0;
  let proxima: Fatura | null = null;
  let atrasada: Fatura | null = null;

  for (const f of lista) {
    const s = statusEfetivo(f, hoje);
    if (s === "pago") pago += f.valor_centavos;
    if (s === "pendente" || s === "vencido") aberto += f.valor_centavos;

    if (s === "pendente" && f.vencimento) {
      if (!proxima || (proxima.vencimento ?? "") > f.vencimento) proxima = f;
    }
    if (s === "vencido" && f.vencimento) {
      if (!atrasada || (atrasada.vencimento ?? "") > f.vencimento) atrasada = f;
    }
  }

  return { pago_centavos: pago, aberto_centavos: aberto, proxima, atrasada, total: lista.length };
}

/**
 * A ORDEM DA LISTA: o que precisa de ação primeiro, depois o histórico.
 *
 * Vencida no topo, depois em aberto, e o histórico do mais recente para o mais
 * antigo. Ordenar tudo por data deixaria a fatura vencida no meio da lista —
 * exatamente a que a pessoa entrou aqui para resolver.
 */
const PESO: Record<StatusFatura, number> = {
  vencido: 0,
  pendente: 1,
  pago: 2,
  estornado: 3,
  cancelado: 4,
};

export function ordenarFaturas(lista: Fatura[], hoje: Date): Fatura[] {
  return [...lista].sort((a, b) => {
    const pa = PESO[statusEfetivo(a, hoje)];
    const pb = PESO[statusEfetivo(b, hoje)];
    if (pa !== pb) return pa - pb;
    const da = a.vencimento ?? a.criado_em ?? "";
    const db = b.vencimento ?? b.criado_em ?? "";
    return db.localeCompare(da);
  });
}

/** R$ a partir de centavos, no formato que o brasileiro lê */
export function moedaCentavos(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function dataBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}
