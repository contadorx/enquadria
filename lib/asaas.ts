/**
 * ASAAS — criação de cobrança para os pacotes da janela.
 *
 * Degrada como os demais: sem ASAAS_API_KEY, devolve um checkout "manual"
 * (a assinatura fica pendente e o contador é orientado a combinar o pagamento).
 * Com a chave, cria a cobrança e devolve a URL de pagamento (invoiceUrl).
 *
 * Ambiente: ASAAS_ENV = 'sandbox' | 'production' (default sandbox).
 */

const BASE = {
  sandbox: "https://sandbox.asaas.com/api/v3",
  production: "https://api.asaas.com/v3",
};

export interface Cobranca {
  ativo: boolean;
  asaas_id?: string;
  checkout_url?: string;
}

async function acharOuCriarCliente(
  base: string,
  key: string,
  nome: string,
  email: string
): Promise<string | null> {
  try {
    const busca = await fetch(`${base}/customers?email=${encodeURIComponent(email)}`, {
      headers: { access_token: key },
      cache: "no-store",
    });
    const jb = (await busca.json()) as { data?: { id: string }[] };
    if (jb.data && jb.data.length > 0) return jb.data[0].id;

    const cria = await fetch(`${base}/customers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", access_token: key },
      body: JSON.stringify({ name: nome, email }),
      cache: "no-store",
    });
    const jc = (await cria.json()) as { id?: string };
    return jc.id ?? null;
  } catch {
    return null;
  }
}

export async function criarCobranca(params: {
  nome: string;
  email: string;
  valor_centavos: number;
  descricao: string;
  externo: string;
}): Promise<Cobranca> {
  const key = process.env.ASAAS_API_KEY;
  if (!key) return { ativo: false };

  const env = (process.env.ASAAS_ENV as "sandbox" | "production") ?? "sandbox";
  const base = BASE[env];

  const clienteId = await acharOuCriarCliente(base, key, params.nome, params.email);
  if (!clienteId) return { ativo: true };

  const vencimento = new Date();
  vencimento.setDate(vencimento.getDate() + 3);

  try {
    const resp = await fetch(`${base}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", access_token: key },
      body: JSON.stringify({
        customer: clienteId,
        billingType: "UNDEFINED", // deixa o pagador escolher pix/boleto/cartão
        value: params.valor_centavos / 100,
        dueDate: vencimento.toISOString().slice(0, 10),
        description: params.descricao,
        externalReference: params.externo,
      }),
      cache: "no-store",
    });
    if (!resp.ok) return { ativo: true };
    const json = (await resp.json()) as { id?: string; invoiceUrl?: string };
    return { ativo: true, asaas_id: json.id, checkout_url: json.invoiceUrl };
  } catch {
    return { ativo: true };
  }
}

// ============================================================================
// DIAGNÓSTICO E RECONCILIAÇÃO — o que a aba Negócio → Planos usa.
//
// Princípio: nunca dizer "está integrado" sem ter perguntado ao Asaas.
// ============================================================================

function baseUrl(): string {
  const env = (process.env.ASAAS_ENV as "sandbox" | "production") ?? "sandbox";
  return BASE[env];
}

export interface StatusAsaas {
  conectado: boolean;
  ambiente: "sandbox" | "production";
  tem_chave: boolean;
  url_webhook: string;
  /**
   * O webhook exige token? Enquanto não exigir, qualquer POST forjado ativa
   * uma assinatura — e o painel precisa dizer isso em voz alta, porque é o
   * tipo de risco que não dá sinal nenhum até virar prejuízo.
   */
  webhook_protegido: boolean;
  conta?: { nome?: string; email?: string; cpfCnpj?: string };
  saldo_centavos?: number;
  erro?: string;
}

/** Bate na API do Asaas para confirmar que a chave funciona de verdade. */
export async function statusAsaas(): Promise<StatusAsaas> {
  const ambiente = ((process.env.ASAAS_ENV as "sandbox" | "production") ?? "sandbox");
  const key = process.env.ASAAS_API_KEY;
  const app =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://app.enquadria.com.br");

  const base_: StatusAsaas = {
    conectado: false,
    ambiente,
    tem_chave: !!key,
    url_webhook: `${app.replace(/\/$/, "")}/api/asaas`,
    webhook_protegido: !!process.env.ASAAS_WEBHOOK_TOKEN,
  };
  if (!key) return { ...base_, erro: "ASAAS_API_KEY não está no ambiente." };

  try {
    const resp = await fetch(`${baseUrl()}/myAccount`, {
      headers: { access_token: key },
      cache: "no-store",
    });
    if (!resp.ok) {
      return { ...base_, erro: `Asaas respondeu ${resp.status}. A chave é do ambiente certo (${ambiente})?` };
    }
    const j = (await resp.json()) as { name?: string; email?: string; cpfCnpj?: string };

    let saldo: number | undefined;
    try {
      const b = await fetch(`${baseUrl()}/finance/balance`, { headers: { access_token: key }, cache: "no-store" });
      if (b.ok) {
        const jb = (await b.json()) as { balance?: number };
        saldo = Math.round(Number(jb.balance || 0) * 100);
      }
    } catch { /* saldo é informativo */ }

    return {
      ...base_,
      conectado: true,
      saldo_centavos: saldo,
      conta: { nome: j.name, email: j.email, cpfCnpj: j.cpfCnpj },
    };
  } catch (e) {
    return { ...base_, erro: `não consegui falar com o Asaas: ${e instanceof Error ? e.message : "rede"}` };
  }
}

const PAGO = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);

/**
 * Puxa do Asaas o estado real de uma cobrança e alinha o banco.
 *
 * Existe porque webhook falha: cai a rede, o deploy está no ar, o token muda.
 * Sem isto, um pagamento perdido deixa um cliente pagante sem acesso — e é
 * exatamente o cliente que a gente menos pode perder.
 */
/**
 * Tipo mínimo do client. Tentar espelhar o tipo do supabase-js aqui faz o
 * TypeScript entrar em recursão profunda ("type instantiation is excessively
 * deep") — o cliente é genérico sobre o schema inteiro. Só precisamos de
 * from().select()/update(), então é isso que pedimos.
 */
type DbSimples = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (tabela: string) => any;
};

export async function reconciliarAssinatura(
  db: DbSimples,
  assinaturaId: string
): Promise<{ status?: string; pago?: boolean; valido_ate?: string; erro?: string }> {
  const key = process.env.ASAAS_API_KEY;
  if (!key) return { erro: "ASAAS_API_KEY não está no ambiente." };

  const { data: assin } = await db
    .from("assinaturas")
    .select("id, asaas_id, plano_id, status")
    .eq("id", assinaturaId)
    .maybeSingle();
  const a = assin as { asaas_id?: string; plano_id?: string } | null;
  if (!a?.asaas_id) return { erro: "esta assinatura não tem cobrança no Asaas." };

  let pagamento: { status?: string; paymentDate?: string; confirmedDate?: string; dueDate?: string };
  try {
    const resp = await fetch(`${baseUrl()}/payments/${a.asaas_id}`, {
      headers: { access_token: key },
      cache: "no-store",
    });
    if (!resp.ok) return { erro: resp.status === 404 ? "cobrança não existe mais no Asaas." : `Asaas ${resp.status}` };
    pagamento = (await resp.json()) as typeof pagamento;
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "falha de rede" };
  }

  const pago = PAGO.has(pagamento.status ?? "");
  if (!pago) {
    const novo = pagamento.status === "OVERDUE" ? "pendente" : "pendente";
    await db.from("assinaturas").update({ status: novo }).eq("id", assinaturaId);
    return { status: pagamento.status, pago: false };
  }

  // quantos dias o plano concede — o conserto do "365 dias para todo mundo"
  const { data: plano } = await db
    .from("planos")
      // schema-ok: planos.dias_acesso é editado em components/NegocioUI.tsx (painel de planos)
    .select("dias_acesso")
    .eq("id", a.plano_id ?? "")
    .maybeSingle();
  const diasAcesso = Number((plano as { dias_acesso?: number } | null)?.dias_acesso ?? 365);

  const base_ = pagamento.confirmedDate || pagamento.paymentDate || pagamento.dueDate;
  const inicio = base_ ? new Date(base_) : new Date();
  inicio.setDate(inicio.getDate() + diasAcesso);
  const validoAte = inicio.toISOString().slice(0, 10);

  await db
    .from("assinaturas")
    .update({
      status: "ativa",
      valido_ate: validoAte,
      vencimento: validoAte,
      pago_em: new Date(base_ || Date.now()).toISOString(),
    })
    .eq("id", assinaturaId);

  return { status: pagamento.status, pago: true, valido_ate: validoAte };
}
