/**
 * API pública do mailer do Enquadria.
 *
 * Princípio: e-mail transacional NUNCA pode derrubar a operação. Se o envio falhar,
 * a função registra e devolve `false` — quem chama decide. Cadastro não pode dar 500
 * porque o servidor de e-mail piscou.
 */

import { postalEnviar, postalConfigurado, type PostalResultado } from "./postal";
import {
  tplConfirmarConta,
  tplRecuperarSenha,
  tplTriagemPronta,
  tplLaudoPronto,
  tplJanelaProxima,
  type Template,
} from "./templates";

export { postalConfigurado };

type Destinatario = { email: string; nome?: string };

async function enviar(para: Destinatario, tpl: Template): Promise<boolean> {
  if (!postalConfigurado()) {
    console.warn("[mailer] Postal não configurado — e-mail não enviado:", tpl.tag);
    return false;
  }

  const destino = para.nome ? `${limpar(para.nome)} <${para.email}>` : para.email;

  const r: PostalResultado = await postalEnviar({
    to: [destino],
    subject: tpl.subject,
    html_body: tpl.html,
    tag: tpl.tag,
    // Sinaliza ao destino que é transacional automático. Reduz chance de
    // resposta automática de férias virar ruído e ajuda na classificação.
    headers: { "Auto-Submitted": "auto-generated" },
  });

  if (!r.ok) {
    console.error(`[mailer] falhou (${tpl.tag}) para ${para.email}: ${r.erro}`);
    return false;
  }

  console.info(`[mailer] aceito (${tpl.tag}) para ${para.email} · id ${r.messageId}`);
  return true;
}

function limpar(s: string): string {
  return s.replace(/["<>\r\n]/g, "").trim();
}

/* ─────────────────────────── as chamadas do app ─────────────────────────── */

export function enviarConfirmacaoConta(para: Destinatario, link: string) {
  return enviar(para, tplConfirmarConta(para.nome ?? "", link));
}

export function enviarRecuperacaoSenha(para: Destinatario, link: string) {
  return enviar(para, tplRecuperarSenha(para.nome ?? "", link));
}

export function enviarTriagemPronta(
  para: Destinatario,
  dados: { total: number; urgentes: number; link: string }
) {
  return enviar(para, tplTriagemPronta(para.nome ?? "", dados.total, dados.urgentes, dados.link));
}

export function enviarLaudoPronto(
  para: Destinatario,
  dados: { empresa: string; link: string }
) {
  return enviar(para, tplLaudoPronto(para.nome ?? "", dados.empresa, dados.link));
}

export function enviarJanelaProxima(
  para: Destinatario,
  dados: { dias: number; pendentes: number; link: string }
) {
  return enviar(para, tplJanelaProxima(para.nome ?? "", dados.dias, dados.pendentes, dados.link));
}

/** Envio livre, para casos que ainda não viraram template. */
export async function enviarBruto(
  para: Destinatario,
  assunto: string,
  html: string,
  tag = "avulso"
): Promise<boolean> {
  return enviar(para, { subject: assunto, html, tag });
}
