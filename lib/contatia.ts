import crypto from "crypto";

/**
 * AVISAR O CONTATIA — a costura que era manual.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * O QUE ISTO RESOLVE.
 *
 * Quando um contador cria conta aqui, o Contatia não fica sabendo. A tag
 * "Usuário Enquadria" — que tira o contato da cadência de PROSPECÇÃO e o põe
 * na cadência de novo usuário — era aplicada à mão, uma vez por semana,
 * colando e-mails.
 *
 * Enquanto ela não é aplicada, o contato continua no funil frio. Ou seja: a
 * pessoa cria conta na terça e na quarta recebe "você conhece o Enquadria?".
 * É o e-mail que mais destrói credibilidade de todos, porque prova que
 * ninguém do outro lado está olhando.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * FALHAR AQUI NUNCA PODE ATRAPALHAR O CADASTRO.
 *
 * Este aviso é acessório. O contador que acabou de confirmar o e-mail está
 * esperando entrar no painel — se o Contatia estiver fora do ar, lento ou mal
 * configurado, isso não pode virar erro na cara dele nem segundos de espera.
 *
 * Daí as três defesas: timeout curto, `try/catch` que engole, e retorno que
 * DIZ o que aconteceu para o chamador logar. Nenhuma exceção sai daqui.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ASSINATURA HMAC, não segredo no header.
 *
 * O segredo nunca trafega: trafega o HMAC dele sobre `timestamp.corpo`. E o
 * timestamp entra na assinatura, o que faz a requisição expirar em cinco
 * minutos — quem interceptar não consegue repetir amanhã.
 */

export type EventoContatia = "cadastro_ativo" | "assinatura_ativa" | "cadastro_cancelado";

export interface AvisoContatia {
  evento: EventoContatia;
  /**
   * A CHAVE DE IDEMPOTÊNCIA — o que impede o mesmo cadastro de entrar duas
   * vezes na cadência.
   *
   * Precisa ser estável para o MESMO fato: `cadastro_ativo:<tenant_id>` é o
   * mesmo em toda tentativa, então reenvio, retry e um segundo login pelo link
   * de confirmação convergem para uma linha só do outro lado.
   */
  chave: string;
  email: string;
  nome?: string | null;
  empresa?: string | null;
  telefone?: string | null;
  extra?: Record<string, unknown>;
}

export interface ResultadoAviso {
  enviado: boolean;
  /** por que não foi — para o log de quem chamou, nunca para a tela */
  motivo?: string;
  status?: number;
}

const TIMEOUT_MS = 4000;

/**
 * Assina e manda. Não lança nunca.
 *
 * Sem `CONTATIA_URL`/`CONTATIA_SEGREDO` no ambiente, devolve `enviado: false`
 * com o motivo e segue — é o mesmo princípio de todo o resto do sistema:
 * variável de ambiente que falta degrada o acessório, não derruba o essencial.
 */
export async function avisarContatia(aviso: AvisoContatia): Promise<ResultadoAviso> {
  const url = process.env.CONTATIA_URL;
  const segredo = process.env.CONTATIA_SEGREDO;
  if (!url || !segredo) {
    return { enviado: false, motivo: "CONTATIA_URL/CONTATIA_SEGREDO não configurados" };
  }

  const corpo = JSON.stringify({
    evento: aviso.evento,
    chave: aviso.chave,
    email: (aviso.email || "").trim().toLowerCase(),
    nome: aviso.nome ?? null,
    empresa: aviso.empresa ?? null,
    telefone: aviso.telefone ?? null,
    extra: aviso.extra ?? {},
  });

  const ts = String(Math.floor(Date.now() / 1000));
  /* o corpo assinado é EXATAMENTE a string enviada: serializar de novo do
     outro lado mudaria a ordem das chaves e quebraria a assinatura por um
     motivo que ninguém encontra olhando o payload */
  const assinatura = crypto.createHmac("sha256", segredo).update(`${ts}.${corpo}`).digest("hex");

  const corta = new AbortController();
  const relogio = setTimeout(() => corta.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-app": "enquadria",
        "x-timestamp": ts,
        "x-assinatura": assinatura,
      },
      body: corpo,
      signal: corta.signal,
      cache: "no-store",
    });

    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      return { enviado: false, status: resp.status, motivo: t.slice(0, 200) || `HTTP ${resp.status}` };
    }
    return { enviado: true, status: resp.status };
  } catch (e) {
    const erro = e instanceof Error ? e.message : "falha de rede";
    return { enviado: false, motivo: erro === "The operation was aborted." ? `sem resposta em ${TIMEOUT_MS}ms` : erro };
  } finally {
    clearTimeout(relogio);
  }
}

/**
 * A CHAVE DE UM CADASTRO — uma função para os dois lados usarem a mesma regra.
 *
 * Escrita à mão em dois lugares, ela diverge no dia em que alguém acrescenta um
 * prefixo — e o outro lado passa a ver dois eventos onde há um.
 */
export function chaveDe(evento: EventoContatia, id: string): string {
  return `${evento}:${id}`;
}
