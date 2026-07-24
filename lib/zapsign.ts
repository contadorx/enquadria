/**
 * ZAPSIGN — criação do envelope de assinatura do termo de ciência.
 *
 * ZapSign faz parte do stack aprovado. Este adaptador degrada como o da
 * Receita: sem ZAPSIGN_API_TOKEN, o termo é registrado no banco e a assinatura
 * é feita presencialmente (o contador imprime, colhe a assinatura, arquiva).
 * Com o token, cria o documento e devolve a URL de assinatura do signatário.
 *
 * A ideia é nunca travar o fluxo por causa de integração externa: o produto
 * funciona sem ZapSign, só ganha a assinatura eletrônica quando configurado.
 */

export interface EnvelopeAssinatura {
  ativo: boolean;
  assinatura_url?: string;
  assinatura_ref?: string;
}

export async function criarEnvelope(params: {
  titulo: string;
  signatario_nome: string;
  signatario_email: string;
  pdf_url?: string;
  html?: string;
}): Promise<EnvelopeAssinatura> {
  const token = process.env.ZAPSIGN_API_TOKEN;
  if (!token) return { ativo: false };

  try {
    const resp = await fetch("https://api.zapsign.com.br/api/v1/docs/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: params.titulo,
        ...(params.pdf_url ? { url_pdf: params.pdf_url } : {}),
        signers: [
          {
            name: params.signatario_nome,
            email: params.signatario_email,
            auth_mode: "assinaturaTela",
            send_automatic_email: true,
          },
        ],
      }),
      cache: "no-store",
    });

    if (!resp.ok) return { ativo: true };
    const json = (await resp.json()) as {
      token?: string;
      signers?: { sign_url?: string }[];
    };
    return {
      ativo: true,
      assinatura_url: json.signers?.[0]?.sign_url,
      assinatura_ref: json.token,
    };
  } catch {
    return { ativo: true };
  }
}
