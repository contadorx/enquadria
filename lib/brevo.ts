/**
 * BREVO — envio transacional do código de assinatura (OTP) e avisos do termo.
 *
 * Degrada como o resto: sem BREVO_API_KEY o envio não acontece e o chamador
 * decide o que fazer — no fluxo de assinatura, cai para o método SIMPLES (o
 * aceite sem código, ainda válido). O produto nunca trava por falta da chave.
 */

export interface ResultadoEmail {
  enviado: boolean;
  motivo?: string;
}

export async function enviarEmail(params: {
  para: string;
  nome?: string;
  assunto: string;
  html: string;
}): Promise<ResultadoEmail> {
  const key = process.env.BREVO_API_KEY;
  if (!key) return { enviado: false, motivo: "BREVO_API_KEY ausente" };

  const remetenteEmail = process.env.BREVO_REMETENTE_EMAIL || "no-reply@enquadria.com.br";
  const remetenteNome = process.env.BREVO_REMETENTE_NOME || "Enquadria";

  try {
    const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accept: "application/json",
        "api-key": key,
      },
      body: JSON.stringify({
        sender: { name: remetenteNome, email: remetenteEmail },
        to: [{ email: params.para, name: params.nome || params.para }],
        subject: params.assunto,
        htmlContent: params.html,
      }),
      cache: "no-store",
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      return { enviado: false, motivo: `brevo ${resp.status} ${txt.slice(0, 120)}` };
    }
    return { enviado: true };
  } catch (e) {
    return { enviado: false, motivo: e instanceof Error ? e.message : "falha de rede" };
  }
}

/** HTML simples do e-mail do código de assinatura */
export function htmlCodigoOtp(codigo: string, empresa?: string): string {
  return `
  <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#334155">
    <div style="border-bottom:2px solid #0B1220;padding-bottom:12px;margin-bottom:20px">
      <strong style="font-size:18px;color:#0B1220">Enquadria</strong>
    </div>
    <p>Use o código abaixo para assinar o termo de ciência${empresa ? ` de <strong>${empresa}</strong>` : ""}:</p>
    <div style="font-family:monospace;font-size:32px;letter-spacing:8px;font-weight:bold;color:#0E7490;background:#ECFEFF;border:1px solid #A5F3FC;border-radius:10px;padding:16px;text-align:center;margin:18px 0">${codigo}</div>
    <p style="font-size:13px;color:#64748B">O código expira em 10 minutos. Se você não solicitou, ignore este e-mail.</p>
  </div>`;
}
