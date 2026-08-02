/**
 * BREVO — o DRIVER, não a porta de entrada.
 *
 * Desde que o servidor próprio (Postal) entrou, ninguém deve importar daqui
 * para mandar e-mail: a porta é `lib/email`, que escolhe o caminho. Este
 * arquivo ficou sendo só o "como falar com a Brevo", e continua existindo
 * porque enquanto o IP novo aquece é bom ter para onde cair.
 *
 * Degrada como o resto: sem BREVO_API_KEY o envio não acontece e o chamador
 * decide o que fazer — no fluxo de assinatura, cai para o método SIMPLES (o
 * aceite sem código, ainda válido). O produto nunca trava por falta da chave.
 *
 * O nome mudou de `enviarEmail` para `enviarPelaBrevo` de propósito: numa
 * lista de imports, `enviarEmail` de um arquivo chamado brevo.ts faz qualquer
 * pessoa concluir que o e-mail sai pela Brevo — e hoje não sai.
 */

export interface ResultadoEmail {
  enviado: boolean;
  motivo?: string;
}

export async function enviarPelaBrevo(params: {
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

/** convite para assinar o termo — enviado ao cliente do contador */
export function htmlConviteAssinatura(params: {
  empresa: string;
  escritorio: string;
  link: string;
  decisao: "optar" | "permanecer";
}): string {
  const decisao =
    params.decisao === "optar"
      ? "optar pelo recolhimento de IBS/CBS por fora do DAS a partir de 2027"
      : "permanecer no regime tradicional do Simples Nacional";
  return `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#334155">
    <div style="border-bottom:2px solid #0B1220;padding-bottom:12px;margin-bottom:20px">
      <strong style="font-size:18px;color:#0B1220">${params.escritorio}</strong>
    </div>
    <p style="font-size:15px">Sobre a <strong>${params.empresa}</strong>:</p>
    <p>A reforma tributária abriu uma janela que se encerra em <strong>30 de setembro</strong>.
    Analisamos a situação da sua empresa e a recomendação é <strong>${decisao}</strong>.</p>
    <p>Para formalizar, precisamos da sua ciência. Leva menos de um minuto:</p>
    <p style="text-align:center;margin:26px 0">
      <a href="${params.link}" style="background:#06B6D4;color:#04212B;font-weight:bold;text-decoration:none;padding:14px 26px;border-radius:999px;display:inline-block">Ler e assinar o termo</a>
    </p>
    <p style="font-size:13px;color:#64748B">A decisão vale pelo semestre e não pode ser alterada dentro do período.
    Se preferir conversar antes de assinar, é só responder a este e-mail.</p>
    <p style="font-size:11px;color:#94A3B8;margin-top:22px">Documento com assinatura eletrônica (Lei nº 14.063/2020). Se você não reconhece este envio, ignore esta mensagem.</p>
  </div>`;
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
