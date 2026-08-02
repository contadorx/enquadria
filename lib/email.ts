/**
 * O ENVIO TRANSACIONAL DO APP — uma porta só, dois caminhos atrás dela.
 *
 * POR QUE ESTE ARQUIVO EXISTE. O app tinha seis lugares chamando
 * `enviarEmail` de `lib/brevo`. Quando o servidor próprio (Postal, na VPS
 * Contabo) entrou, o mailer novo ficou ligado só numa rota de teste — ou seja,
 * a infraestrutura existia e o produto continuava mandando tudo por terceiro.
 * Em vez de trocar o import em seis arquivos e deixar dois caminhos vivos sem
 * ninguém saber qual está sendo usado, o desvio acontece AQUI.
 *
 * A ORDEM É DELIBERADA:
 *   1. Postal, quando POSTAL_URL e POSTAL_API_KEY existem. É o servidor da
 *      casa: log por mensagem, bounce, supressão, reputação nossa.
 *   2. Brevo, se o Postal não estiver configurado OU se ele recusar a
 *      mensagem. Enquanto o IP novo aquece, ter para onde cair não é luxo.
 *
 * A QUEDA É SILENCIOSA PARA O USUÁRIO, NÃO PARA O LOG. Toda troca de caminho
 * escreve no console com o motivo. E-mail transacional que "às vezes chega"
 * sem ninguém saber por onde é o pior defeito de infraestrutura que existe:
 * não quebra nada, e corrói a entrega por semanas.
 *
 * `enviarEmail` mantém a mesma assinatura de sempre — os seis chamadores não
 * mudaram de forma, só de destino.
 */

import { enviarPelaBrevo, type ResultadoEmail } from "./brevo";
import { postalEnviar, postalConfigurado } from "./mailer/postal";

export type { ResultadoEmail };
export { htmlConviteAssinatura, htmlCodigoOtp } from "./brevo";

export type Caminho = "postal" | "brevo" | "nenhum";

export interface ResultadoEnvio extends ResultadoEmail {
  /** por onde saiu — vai para o log e para a rota de diagnóstico */
  caminho: Caminho;
}

function limpar(s: string): string {
  return s.replace(/["<>\r\n]/g, "").trim();
}

export async function enviarEmail(params: {
  para: string;
  nome?: string;
  assunto: string;
  html: string;
  /** rótulo do Postal, para separar no painel o que é o quê */
  tag?: string;
}): Promise<ResultadoEnvio> {
  const tag = params.tag ?? "app";

  if (postalConfigurado()) {
    const destino = params.nome ? `${limpar(params.nome)} <${params.para}>` : params.para;
    const r = await postalEnviar({
      to: [destino],
      subject: params.assunto,
      html_body: params.html,
      tag,
      headers: { "Auto-Submitted": "auto-generated" },
    });

    if (r.ok) {
      console.info(`[email] postal aceitou (${tag}) para ${params.para} · id ${r.messageId}`);
      return { enviado: true, caminho: "postal" };
    }

    // recusa do Postal não pode virar e-mail não enviado enquanto houver
    // alternativa — mas TEM de aparecer no log, senão a queda vira permanente
    // sem ninguém perceber
    console.error(`[email] postal recusou (${tag}) para ${params.para}: ${r.erro}`);
    const b = await enviarPelaBrevo(params);
    return {
      ...b,
      caminho: b.enviado ? "brevo" : "nenhum",
      motivo: b.enviado ? `postal recusou (${r.erro}); saiu pela Brevo` : b.motivo,
    };
  }

  const b = await enviarPelaBrevo(params);
  return { ...b, caminho: b.enviado ? "brevo" : "nenhum" };
}

/** para a tela de diagnóstico dizer por onde o e-mail vai sair hoje */
export function caminhoAtual(): Caminho {
  if (postalConfigurado()) return "postal";
  return process.env.BREVO_API_KEY ? "brevo" : "nenhum";
}
