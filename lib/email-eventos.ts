/**
 * A TRADUÇÃO DOS WEBHOOKS DE E-MAIL — Postal e Brevo dizendo a mesma coisa
 * com nomes diferentes.
 *
 * Fica fora da rota, sem banco, porque é a parte que erra: nome de campo,
 * formato de data, nome do evento. Uma tradução errada não derruba nada — ela
 * simplesmente faz a campanha aparecer com zero abertura, o que se parece com
 * campanha ruim. É o tipo de defeito que se descobre tarde e pela conclusão
 * errada.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * O QUE A ABERTURA NÃO É — e vale repetir aqui, onde o dado nasce:
 *
 * O pixel é bloqueado por padrão em boa parte dos clientes de e-mail, e o
 * Apple Mail Privacy Protection carrega TODAS as imagens, o que produz o erro
 * contrário — abertura fantasma. Ou seja, abertura é PISO e comparação, nunca
 * medida absoluta. O CLIQUE exige ação e é o número em que se decide.
 */

export type TipoEvento = "entregue" | "aberto" | "clique" | "bounce" | "spam" | "recusado";

export interface EventoEmail {
  para: string;
  evento: TipoEvento;
  url?: string | null;
  regra?: string | null;
  provedor: "postal" | "brevo" | "desconhecido";
  mensagem_id?: string | null;
  ocorreu_em: string;
}

/* Brevo e Postal, lado a lado. O que não está aqui é ignorado de propósito —
   ver o 200 na rota: evento desconhecido não pode derrubar o webhook. */
const MAPA: Record<string, TipoEvento> = {
  // Brevo (transactional webhooks)
  delivered: "entregue",
  opened: "aberto",
  unique_opened: "aberto",
  click: "clique",
  hard_bounce: "bounce",
  soft_bounce: "bounce",
  blocked: "recusado",
  spam: "spam",
  invalid_email: "recusado",
  // Postal
  messagedeliveryfailed: "bounce",
  messagebounced: "bounce",
  messagelinkclicked: "clique",
  messageloaded: "aberto",
  messagesent: "entregue",
};

const texto = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

/** aceita segundos, milissegundos e ISO; devolve sempre ISO */
function quando(v: unknown): string {
  if (typeof v === "number" && isFinite(v)) {
    /* Postal manda epoch em SEGUNDOS. Tratar como milissegundos jogaria tudo
       para 1970 — e o painel mostraria "nenhum evento nos últimos 30 dias",
       que é indistinguível de "a campanha não teve abertura". */
    const ms = v < 1e12 ? v * 1000 : v;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  const s = texto(v);
  if (s) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

/**
 * Devolve `null` quando o payload não é um evento que interessa. `null` não é
 * erro: é "não é para mim" — e quem chama responde 200 assim mesmo, porque
 * provedor que recebe 4xx desativa o webhook depois de algumas falhas.
 */
export function normalizarEvento(bruto: Record<string, unknown>): EventoEmail | null {
  if (!bruto || typeof bruto !== "object") return null;

  /* Postal embrulha o evento em `payload`; Brevo manda plano */
  const p = (bruto.payload && typeof bruto.payload === "object"
    ? (bruto.payload as Record<string, unknown>)
    : bruto) as Record<string, unknown>;

  const cru =
    texto(bruto.event) ?? texto(bruto.type) ?? texto(p.event) ?? texto(p.status) ?? "";
  const evento = MAPA[cru.toLowerCase().replace(/[^a-z_]/g, "")];
  if (!evento) return null;

  const msg = (p.message && typeof p.message === "object"
    ? (p.message as Record<string, unknown>)
    : {}) as Record<string, unknown>;

  const para =
    texto(bruto.email) ?? texto(p.email) ?? texto(p.to) ?? texto(msg.to) ?? null;
  if (!para) return null;   // evento sem destinatário não serve para nada

  const provedor: EventoEmail["provedor"] =
    bruto.payload !== undefined || msg.token !== undefined
      ? "postal"
      : bruto.email !== undefined || bruto.event !== undefined
        ? "brevo"
        : "desconhecido";

  return {
    para: para.toLowerCase(),
    evento,
    url: texto(bruto.link) ?? texto(p.url) ?? texto(bruto.URL) ?? null,
    /* a Brevo devolve as tags que mandamos no envio; é por elas que o evento
       encontra a campanha sem depender de join por e-mail */
    regra: Array.isArray(bruto.tags) ? texto(bruto.tags[0]) : texto(bruto.tag) ?? texto(p.tag),
    provedor,
    mensagem_id:
      texto(bruto["message-id"]) ?? texto(bruto.messageId) ?? texto(msg.token) ?? texto(p.id),
    ocorreu_em: quando(bruto.ts ?? bruto.date ?? p.timestamp ?? p.time),
  };
}

/**
 * AS TAXAS, ditas com o denominador certo.
 *
 * Sobre ENTREGUES, não sobre enviados: e-mail que bateu nunca teve chance de
 * ser aberto, e contá-lo faz uma lista suja parecer campanha ruim — problemas
 * diferentes, soluções diferentes.
 */
export interface DesempenhoLinha {
  regra: string;
  enviados: number;
  entregues: number;
  abriram: number;
  clicaram: number;
  bounces: number;
  spam: number;
}

export function taxas(l: DesempenhoLinha): {
  entrega: number | null;
  abertura: number | null;
  clique: number | null;
  clique_sobre_abertura: number | null;
} {
  const pctSeguro = (a: number, b: number) => (b > 0 ? a / b : null);
  return {
    entrega: pctSeguro(l.entregues, l.enviados),
    abertura: pctSeguro(l.abriram, l.entregues),
    clique: pctSeguro(l.clicaram, l.entregues),
    /* de quem abriu, quantos agiram. É o número que separa "assunto bom, corpo
       fraco" de "ninguém viu" — e os dois se corrigem de formas opostas. */
    clique_sobre_abertura: pctSeguro(l.clicaram, l.abriram),
  };
}

/** o alerta que a tela mostra — e o que ele NÃO afirma */
export function leituraDaCampanha(l: DesempenhoLinha): string {
  const t = taxas(l);
  if (l.enviados === 0) return "Nada enviado nesta janela.";
  if (l.entregues === 0) return "Nenhum e-mail entregue: a lista ou o remetente estão com problema.";
  if (t.entrega != null && t.entrega < 0.9) {
    return `Só ${Math.round(t.entrega * 100)}% foram entregues — isto é problema de LISTA ou de reputação do remetente, não de conteúdo.`;
  }
  if (l.abriram === 0 && l.clicaram === 0) {
    return "Nenhuma abertura e nenhum clique registrados. Confira se o webhook do provedor está apontando para cá antes de concluir que a campanha é ruim.";
  }
  if (t.clique != null && t.clique >= 0.05) {
    return `${Math.round(t.clique * 100)}% clicaram — o clique é o número confiável, e este está bom.`;
  }
  if (t.abertura != null && t.abertura >= 0.3 && (t.clique ?? 0) < 0.02) {
    return "Abrem e não clicam: o assunto está funcionando e o corpo não. Mexa no CTA, não no título.";
  }
  return "Abertura é piso, não medida — o pixel é bloqueado em boa parte dos clientes de e-mail. Decida pelo clique.";
}
