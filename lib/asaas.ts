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
