/**
 * O ENVIO TRANSACIONAL DO APP — uma porta só, e agora com garantia de entrega.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * O QUE MUDOU EM 07/08/2026, e por quê.
 *
 * A versão anterior caía para a Brevo quando o Postal RECUSAVA a mensagem. Isso
 * cobre o Postal estar fora do ar — e NÃO cobre o caso que aconteceu: o
 * provedor da VPS avisou que vai bloquear a porta 25 por volume. Nesse cenário
 * o Postal aceita a mensagem normalmente (a API dele responde "success", que
 * significa "entrou na minha fila"), o app registra sucesso, e a mensagem
 * apodrece sem sair. O termo de ciência não chega ao cliente do contador e
 * ninguém fica sabendo.
 *
 * A correção tem três partes, e só a primeira mora aqui:
 *
 *   1. AQUI: toda saída é registrada em `emails_saida`, e o caminho é decidido
 *      pelo DISJUNTOR — não só pela configuração. Se o envio próprio parou de
 *      confirmar entregas, tudo sai pela Brevo antes de tentar.
 *   2. NO WEBHOOK: o evento de entrega confirma a linha.
 *   3. NO CRON: o que ficou aceito sem confirmação vira reenvio pela Brevo, e
 *      a taxa de perda abre ou fecha o disjuntor.
 *
 * A decisão pura está em `lib/entrega-garantida.ts`, testada; o banco em
 * `lib/entrega-server.ts`.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * O QUE NÃO MUDOU: a assinatura. As dezesseis rotas que chamam `enviarEmail`
 * continuam iguais. Os dois campos novos (`referencia` e `tag`) são opcionais
 * — quem passar `referencia` ganha idempotência de verdade; quem não passar
 * continua funcionando como antes.
 *
 * E a regra que atravessa tudo: **o registro nunca impede o envio.** Banco
 * fora, migration não rodada, chave de serviço ausente — a mensagem sai do
 * mesmo jeito e a auditoria se perde. Auditoria que derruba o que audita é
 * pior que auditoria nenhuma.
 */

import { enviarPelaBrevo, type ResultadoEmail } from "./brevo";
import { postalEnviar, postalConfigurado } from "./mailer/postal";
import { chaveSaida, caminhoDeSaida, type Caminho } from "./entrega-garantida";
import { lerDisjuntor, registrarSaida } from "./entrega-server";

export type { ResultadoEmail };
export { htmlConviteAssinatura, htmlCodigoOtp } from "./brevo";
export type { Caminho };

export interface ResultadoEnvio extends ResultadoEmail {
  /** por onde saiu — vai para o log e para a rota de diagnóstico */
  caminho: Caminho;
  /** true quando o disjuntor desviou antes mesmo de tentar o Postal */
  desviado?: boolean;
}

function limpar(s: string): string {
  return s.replace(/["<>\r\n]/g, "").trim();
}

/**
 * PARA ONDE VAI A RESPOSTA — e por que isto não é detalhe.
 *
 * O remetente padrão do Postal é `nao-responda@enquadria.com.br`. Os e-mails
 * que vão ao CLIENTE do contador terminam com "é só responder a este e-mail" —
 * e sem `responderPara` essa frase era mentira: a resposta caía numa caixa que
 * ninguém lê. Pior que não convidar a responder é convidar e sumir.
 */
export async function enviarEmail(params: {
  para: string;
  nome?: string;
  assunto: string;
  html: string;
  /** rótulo do Postal, para separar no painel o que é o quê */
  tag?: string;
  /** o cliente responde e cai aqui — quase sempre o contador */
  responderPara?: { email: string; nome?: string };
  /**
   * O QUE ESTA MENSAGEM É, para a idempotência: id do laudo, do termo, da
   * proposta. Sem ela, dois envios do mesmo tipo para a mesma pessoa contam
   * como a mesma mensagem no registro — o que é conservador e não quebra nada,
   * mas confunde a auditoria. Passar sempre que houver documento.
   */
  referencia?: string | null;
}): Promise<ResultadoEnvio> {
  const tag = params.tag ?? "app";
  const chave = chaveSaida(tag, params.para, params.referencia);

  const disjuntor = await lerDisjuntor();
  const caminho = caminhoDeSaida(postalConfigurado(), !!process.env.BREVO_API_KEY, disjuntor);

  if (caminho === "nenhum") {
    console.error(`[email] sem caminho de saída (${tag}) para ${params.para}`);
    return { enviado: false, caminho: "nenhum", motivo: "nenhum provedor configurado" };
  }

  /* ─────────────────────────────────────────────── o desvio do disjuntor ──
   * Quando o disjuntor está aberto, nem se tenta o Postal: já se sabe que ele
   * não está entregando, e cada tentativa vira mais uma mensagem represada
   * para a varredura descobrir 20 minutos depois. */
  if (caminho === "brevo") {
    const b = await enviarPelaBrevo(params);
    const desviado = postalConfigurado() && disjuntor.estado === "aberto";
    if (desviado) {
      console.warn(`[email] disjuntor aberto — ${tag} para ${params.para} saiu pela Brevo`);
    }
    await registrarSaida({
      chave,
      para: params.para,
      tag,
      assunto: params.assunto,
      caminho: "brevo",
      /* a Brevo responde síncrono: aceitou é o mais perto de "entregue" que se
         tem no momento do envio, e o webhook dela confirma depois */
      status: b.enviado ? "aceito" : "falhou",
      erro: b.enviado ? null : b.motivo ?? null,
      referencia: params.referencia ?? null,
    });
    return { ...b, caminho: b.enviado ? "brevo" : "nenhum", desviado };
  }

  /* ──────────────────────────────────────────────────── o caminho normal ── */
  const destino = params.nome ? `${limpar(params.nome)} <${params.para}>` : params.para;
  const r = await postalEnviar({
    to: [destino],
    subject: params.assunto,
    html_body: params.html,
    tag,
    ...(params.responderPara ? { reply_to: params.responderPara.email } : {}),
    headers: { "Auto-Submitted": "auto-generated" },
  });

  if (r.ok) {
    console.info(`[email] postal aceitou (${tag}) para ${params.para} · id ${r.messageId}`);
    /* ACEITO, NÃO ENTREGUE — a distinção é o motivo deste arquivo existir.
       A confirmação vem pelo webhook; o que não confirmar vira reenvio. */
    await registrarSaida({
      chave,
      para: params.para,
      tag,
      assunto: params.assunto,
      caminho: "postal",
      mensagem_id: r.messageId || null,
      status: "aceito",
      referencia: params.referencia ?? null,
    });
    return { enviado: true, caminho: "postal" };
  }

  // recusa síncrona: cai para a Brevo na hora, como sempre fez
  console.error(`[email] postal recusou (${tag}) para ${params.para}: ${r.erro}`);
  const b = await enviarPelaBrevo(params);
  await registrarSaida({
    chave,
    para: params.para,
    tag,
    assunto: params.assunto,
    caminho: "brevo",
    status: b.enviado ? "aceito" : "falhou",
    tentativas: 1,
    erro: b.enviado ? `postal recusou: ${r.erro}` : b.motivo ?? null,
    referencia: params.referencia ?? null,
  });
  return {
    ...b,
    caminho: b.enviado ? "brevo" : "nenhum",
    motivo: b.enviado ? `postal recusou (${r.erro}); saiu pela Brevo` : b.motivo,
  };
}

/** para a tela de diagnóstico dizer por onde o e-mail vai sair AGORA */
export async function caminhoAtual(): Promise<Caminho> {
  const d = await lerDisjuntor();
  return caminhoDeSaida(postalConfigurado(), !!process.env.BREVO_API_KEY, d);
}
