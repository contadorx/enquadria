/**
 * ASAAS — criação de cobrança para os pacotes da janela.
 *
 * Degrada como os demais: sem ASAAS_API_KEY, devolve um checkout "manual"
 * (a assinatura fica pendente e o contador é orientado a combinar o pagamento).
 * Com a chave, cria a cobrança e devolve a URL de pagamento (invoiceUrl).
 *
 * Ambiente: ASAAS_ENV = 'sandbox' | 'production' (default sandbox).
 */

import { statusDoAsaas } from "./faturas";

const BASE = {
  sandbox: "https://sandbox.asaas.com/api/v3",
  production: "https://api.asaas.com/v3",
};

/**
 * OS CABEÇALHOS — e por que o `User-Agent` está aqui.
 *
 * O Asaas RECUSA requisição sem `User-Agent` identificando a aplicação. Como
 * o `fetch` do Node não manda um por conta própria, a chamada volta 401 —
 * "não autorizado" — com a chave perfeitamente correta. É o pior tipo de
 * erro: a mensagem aponta para o lugar errado, e quem recebe passa a tarde
 * conferindo a chave e o ambiente.
 */
function cabecalhos(key: string, json = false): Record<string, string> {
  const h: Record<string, string> = { access_token: key, "User-Agent": "Enquadria" };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

export interface Cobranca {
  ativo: boolean;
  asaas_id?: string;
  checkout_url?: string;
  /** AAAA-MM-DD — vai para a central de faturas */
  vencimento?: string;
  /** link do boleto, quando o Asaas gera um */
  boleto_url?: string;
  /** o que deu errado, na língua do Asaas — nunca mais engolido */
  erro?: string;
}

/**
 * ACHA OU CRIA O CLIENTE NO ASAAS.
 *
 * O `cpfCnpj` é OBRIGATÓRIO para criar cliente — era o que faltava, e a falta
 * derrubava a contratação inteira em silêncio: o Asaas recusava, o `catch`
 * devolvia null, a cobrança voltava sem link e a tela não mostrava nada.
 *
 * Agora o erro do Asaas sobe com a mensagem dele. Um "cpfCnpj inválido" na
 * tela resolve em dez segundos o que um silêncio custa uma tarde.
 */
async function acharOuCriarCliente(
  base: string,
  key: string,
  nome: string,
  email: string,
  cpfCnpj: string
): Promise<{ id?: string; erro?: string }> {
  try {
    const busca = await fetch(`${base}/customers?email=${encodeURIComponent(email)}`, {
      headers: cabecalhos(key),
      cache: "no-store",
    });
    if (busca.status === 401) {
      return { erro: "O Asaas recusou a chave (401). Confira ASAAS_API_KEY e se ela é do ambiente declarado em ASAAS_ENV." };
    }
    const jb = (await busca.json().catch(() => ({}))) as { data?: { id: string }[] };
    if (jb.data && jb.data.length > 0) return { id: jb.data[0].id };

    const cria = await fetch(`${base}/customers`, {
      method: "POST",
      headers: cabecalhos(key, true),
      body: JSON.stringify({ name: nome, email, cpfCnpj }),
      cache: "no-store",
    });
    const jc = (await cria.json().catch(() => ({}))) as {
      id?: string;
      errors?: { code?: string; description?: string }[];
    };
    if (jc.id) return { id: jc.id };

    const desc = jc.errors?.map((e) => e.description).filter(Boolean).join(" · ");
    return { erro: desc || `O Asaas recusou o cadastro do pagador (HTTP ${cria.status}).` };
  } catch (e) {
    return { erro: `Não consegui falar com o Asaas: ${e instanceof Error ? e.message : "rede"}` };
  }
}

export async function criarCobranca(params: {
  nome: string;
  email: string;
  /** CPF ou CNPJ de quem paga — obrigatório no Asaas */
  cpf_cnpj: string;
  valor_centavos: number;
  descricao: string;
  externo: string;
}): Promise<Cobranca> {
  const key = process.env.ASAAS_API_KEY;
  if (!key) return { ativo: false };

  const env = (process.env.ASAAS_ENV as "sandbox" | "production") ?? "sandbox";
  const base = BASE[env];

  const cliente = await acharOuCriarCliente(base, key, params.nome, params.email, params.cpf_cnpj);
  if (!cliente.id) return { ativo: true, erro: cliente.erro };

  const vencimento = new Date();
  vencimento.setDate(vencimento.getDate() + 3);

  try {
    const resp = await fetch(`${base}/payments`, {
      method: "POST",
      headers: cabecalhos(key, true),
      body: JSON.stringify({
        customer: cliente.id,
        billingType: "UNDEFINED", // deixa o pagador escolher pix/boleto/cartão
        value: params.valor_centavos / 100,
        dueDate: vencimento.toISOString().slice(0, 10),
        description: params.descricao,
        externalReference: params.externo,
      }),
      cache: "no-store",
    });
    if (!resp.ok) {
      const j = (await resp.json().catch(() => ({}))) as { errors?: { description?: string }[] };
      const desc = j.errors?.map((e) => e.description).filter(Boolean).join(" · ");
      return { ativo: true, erro: desc || `O Asaas recusou a cobrança (HTTP ${resp.status}).` };
    }
    const json = (await resp.json()) as {
      id?: string;
      invoiceUrl?: string;
      bankSlipUrl?: string;
      dueDate?: string;
    };
    return {
      ativo: true,
      asaas_id: json.id,
      checkout_url: json.invoiceUrl,
      boleto_url: json.bankSlipUrl,
      vencimento: json.dueDate,
    };
  } catch (e) {
    return { ativo: true, erro: `Falha ao criar a cobrança: ${e instanceof Error ? e.message : "rede"}` };
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
  /** caminho alternativo, aceito pelo mesmo handler */
  url_webhook_alt: string;
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
    /* o mesmo webhook responde nos dois caminhos: o segundo é o que a gente
       digitou no painel do Asaas por engano em 04/08 e levou 404 + penalização.
       Manter os dois é mais barato que um dia de eventos perdidos. */
    url_webhook_alt: `${app.replace(/\/$/, "")}/api/webhooks/asaas`,
    webhook_protegido: !!process.env.ASAAS_WEBHOOK_TOKEN,
  };
  if (!key) return { ...base_, erro: "ASAAS_API_KEY não está no ambiente." };

  try {
    const resp = await fetch(`${baseUrl()}/myAccount`, {
      headers: cabecalhos(key),
      cache: "no-store",
    });
    if (!resp.ok) {
      return {
        ...base_,
        erro:
          resp.status === 401
            ? `O Asaas respondeu 401 (não autorizado). Duas causas, nesta ordem: a chave não é do ambiente declarado (${ambiente}), ou foi colada com espaço/quebra de linha. Requisição sem User-Agent também dava 401 — isso já está corrigido no código.`
            : `Asaas respondeu ${resp.status}. A chave é do ambiente certo (${ambiente})?`,
      };
    }
    const j = (await resp.json()) as { name?: string; email?: string; cpfCnpj?: string };

    let saldo: number | undefined;
    try {
      const b = await fetch(`${baseUrl()}/finance/balance`, { headers: cabecalhos(key), cache: "no-store" });
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
      headers: cabecalhos(key),
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


/**
 * IMPORTA AS FATURAS QUE JÁ EXISTEM NO ASAAS.
 *
 * POR QUE ISTO PRECISOU EXISTIR: o webhook ficou apontando para um endereço
 * errado e o Asaas devolveu 404 em cada evento até suspender a fila. As
 * cobranças foram criadas normalmente lá — e aqui não havia nada. Reativar o
 * webhook resolve o futuro; o passado só volta perguntando.
 *
 * É a mesma ideia do botão "sincronizar" de uma assinatura, no atacado:
 * webhook é entrega best-effort, e todo sistema que depende de webhook precisa
 * de um caminho para reconstruir o estado sem ele.
 *
 * O VÍNCULO É O `externalReference` — o id da assinatura que nós mesmos
 * mandamos ao criar a cobrança. Pagamento sem ele não é nosso (pode ser de
 * outra origem na mesma conta Asaas) e é ignorado: pendurar uma cobrança
 * alheia no escritório errado seria pior que não ter a linha.
 */
export async function importarFaturas(
  db: DbSimples,
  limite = 100
): Promise<{ lidas: number; gravadas: number; ignoradas: number; falhas?: number; erro?: string }> {
  const key = process.env.ASAAS_API_KEY;
  if (!key) return { lidas: 0, gravadas: 0, ignoradas: 0, erro: "ASAAS_API_KEY não está no ambiente." };

  let pagamentos: Array<{
    id?: string;
    value?: number;
    description?: string;
    status?: string;
    dueDate?: string;
    invoiceUrl?: string;
    bankSlipUrl?: string;
    externalReference?: string;
    confirmedDate?: string;
    paymentDate?: string;
  }> = [];

  try {
    const resp = await fetch(`${baseUrl()}/payments?limit=${limite}&order=desc`, {
      headers: cabecalhos(key),
      cache: "no-store",
    });
    if (!resp.ok) {
      return {
        lidas: 0,
        gravadas: 0,
        ignoradas: 0,
        erro: resp.status === 401 ? "O Asaas recusou a chave (401)." : `Asaas respondeu ${resp.status}.`,
      };
    }
    const j = (await resp.json()) as { data?: typeof pagamentos };
    pagamentos = j.data ?? [];
  } catch (e) {
    return { lidas: 0, gravadas: 0, ignoradas: 0, erro: e instanceof Error ? e.message : "falha de rede" };
  }

  let gravadas = 0;
  let ignoradas = 0;
  /**
   * FALHA NÃO É GRAVAÇÃO.
   *
   * Este laço contava `gravadas++` logo depois do upsert, sem olhar o `error`.
   * Com o índice parcial da 0039 recusando TODO upsert (ver 0040), a
   * importação dizia "40 faturas gravadas" com a tabela vazia — a ferramenta
   * de recuperação mentindo exatamente na hora em que era chamada para
   * consertar o problema.
   */
  let falhas = 0;
  let primeiroErro: string | null = null;

  for (const p of pagamentos) {
    if (!p.id || !p.externalReference) {
      ignoradas++;
      continue;
    }
    const { data: assin } = await db
      .from("assinaturas")
      .select("id, tenant_id, plano_id")
      .eq("id", p.externalReference)
      .maybeSingle();
    const a = assin as { id?: string; tenant_id?: string; plano_id?: string } | null;
    if (!a?.tenant_id) {
      ignoradas++;
      continue;
    }

    const status = statusDoAsaas(p.status);
    const pagoEm = status === "pago" ? p.confirmedDate || p.paymentDate || null : null;

    const { error } = await db.from("faturas").upsert(
      {
        tenant_id: a.tenant_id,
        assinatura_id: a.id ?? null,
        asaas_id: p.id,
        valor_centavos: Math.round(Number(p.value || 0) * 100),
        status,
        vencimento: p.dueDate ?? null,
        pago_em: pagoEm ? new Date(pagoEm).toISOString() : null,
        link_pagamento: p.invoiceUrl ?? null,
        link_boleto: p.bankSlipUrl ?? null,
        descricao: p.description ?? null,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "asaas_id" }
    );

    if (error) {
      falhas++;
      primeiroErro = primeiroErro ?? error.message;
    } else {
      gravadas++;
    }
  }

  return {
    lidas: pagamentos.length,
    gravadas,
    ignoradas,
    falhas,
    erro: falhas ? `${falhas} de ${pagamentos.length} recusadas pelo banco: ${primeiroErro}` : undefined,
  };
}
