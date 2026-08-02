/**
 * Cliente da API HTTP do Postal.
 *
 * Duas coisas que a documentação não deixa óbvias e estão tratadas aqui:
 *  1. O Postal responde HTTP 200 MESMO EM ERRO — o resultado real vem no campo
 *     `status` do JSON. Quem confia no código HTTP acha que enviou e não enviou.
 *  2. "success" significa que o Postal ACEITOU a mensagem na fila dele, não que
 *     o destino recebeu. A entrega real chega depois, por webhook.
 */

export type PostalAnexo = {
  name: string;
  content_type: string;
  /** conteúdo em base64 */
  data: string;
};

export type PostalMensagem = {
  to: string[];
  from?: string;
  sender?: string;
  subject: string;
  plain_body?: string;
  html_body?: string;
  cc?: string[];
  bcc?: string[];
  reply_to?: string;
  tag?: string;
  headers?: Record<string, string>;
  attachments?: PostalAnexo[];
};

export type PostalResultado =
  | { ok: true; messageId: string; detalhes: unknown }
  | { ok: false; erro: string; codigo?: string };

type PostalResposta = {
  status?: string;
  time?: number;
  flags?: unknown;
  data?: {
    message_id?: string;
    messages?: unknown;
    code?: string;
    message?: string;
  };
};

const TIMEOUT_MS = 15_000;

function config() {
  const url = process.env.POSTAL_URL?.replace(/\/+$/, "");
  const key = process.env.POSTAL_API_KEY;
  return { url, key, ok: Boolean(url && key) };
}

export function postalConfigurado(): boolean {
  return config().ok;
}

export async function postalEnviar(msg: PostalMensagem): Promise<PostalResultado> {
  const { url, key, ok } = config();
  if (!ok) {
    return { ok: false, erro: "POSTAL_URL ou POSTAL_API_KEY ausentes" };
  }

  const corpo: PostalMensagem = {
    ...msg,
    from: msg.from ?? process.env.POSTAL_FROM ?? "Enquadria <nao-responda@enquadria.com.br>",
  };

  // Mensagem só-HTML pontua pior em filtro de spam. Deriva o texto puro.
  if (corpo.html_body && !corpo.plain_body) {
    corpo.plain_body = htmlParaTexto(corpo.html_body);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch(`${url}/api/v1/send/message`, {
      method: "POST",
      headers: {
        "X-Server-API-Key": key!,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(corpo),
      signal: controller.signal,
      cache: "no-store",
    });

    const bruto = await resp.text();

    let json: PostalResposta;
    try {
      json = JSON.parse(bruto) as PostalResposta;
    } catch {
      return { ok: false, erro: `resposta não-JSON (HTTP ${resp.status}): ${bruto.slice(0, 200)}` };
    }

    // O status HTTP não decide nada aqui — o campo `status` decide.
    if (json.status !== "success") {
      return {
        ok: false,
        codigo: json.data?.code ?? json.status ?? "desconhecido",
        erro: json.data?.message ?? JSON.stringify(json).slice(0, 300),
      };
    }

    return {
      ok: true,
      messageId: json.data?.message_id ?? "",
      detalhes: json.data?.messages,
    };
  } catch (e) {
    const err = e as Error;
    const motivo = err.name === "AbortError" ? `timeout de ${TIMEOUT_MS}ms` : err.message;
    return { ok: false, erro: motivo };
  } finally {
    clearTimeout(timer);
  }
}

function htmlParaTexto(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<li>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
