/**
 * ABERTURA E CLIQUE — a tradução dos webhooks, e o que o número NÃO diz.
 *
 * O defeito que esta suíte existe para impedir não derruba nada: uma tradução
 * errada faz a campanha aparecer com ZERO abertura, o que se parece com
 * campanha ruim. Descobre-se tarde, e pela conclusão errada.
 *
 * Três coisas guardadas aqui:
 *  1. Postal e Brevo caem no mesmo formato — os dois provedores, porque o app
 *     troca de um para o outro sozinho quando o Postal recusa;
 *  2. epoch em SEGUNDOS não vira 1970 — que apareceria como "nenhum evento nos
 *     últimos 30 dias", indistinguível de "não teve abertura";
 *  3. as taxas usam ENTREGUES no denominador, e a leitura diz que abertura é
 *     piso, não medida.
 */
import { normalizarEvento, taxas, leituraDaCampanha } from "./email-eventos.js";

let f = 0;
const ok = (c, m, e) => {
  if (!c) { f++; console.log("FALHOU:", m, e === undefined ? "" : JSON.stringify(e)); }
  else console.log("ok:", m);
};

/* ═══════════ 1 · Brevo ═════════════════════════════════════════════════ */
{
  const e = normalizarEvento({ event: "opened", email: "A@X.com", ts: 1786000000, tag: "regua_d5" });
  ok(e?.evento === "aberto", "Brevo: opened → aberto");
  ok(e.para === "a@x.com", "e o e-mail é normalizado para minúsculas — senão o join por e-mail falha", e.para);
  ok(e.provedor === "brevo", "provedor identificado");
  ok(e.regra === "regua_d5", "a tag vira a regra: é assim que o evento acha a campanha sem join");
}
ok(normalizarEvento({ event: "click", email: "a@x.com", link: "https://app/x" })?.url === "https://app/x",
   "Brevo: o clique traz o destino — separa CTA de descadastro, que é a diferença entre boa e ruim");
ok(normalizarEvento({ event: "hard_bounce", email: "a@x.com" })?.evento === "bounce", "hard_bounce → bounce");
ok(normalizarEvento({ event: "soft_bounce", email: "a@x.com" })?.evento === "bounce", "soft_bounce também");
ok(normalizarEvento({ event: "blocked", email: "a@x.com" })?.evento === "recusado", "blocked → recusado");
ok(normalizarEvento({ event: "spam", email: "a@x.com" })?.evento === "spam", "spam mantém identidade própria");
{
  const e = normalizarEvento({ event: "opened", email: "a@x.com", tags: ["boas_vindas", "outra"] });
  ok(e?.regra === "boas_vindas", "quando vêm várias tags, a primeira é a campanha", e?.regra);
}

/* ═══════════ 2 · Postal ════════════════════════════════════════════════ */
{
  const e = normalizarEvento({
    event: "MessageLinkClicked",
    payload: { url: "https://app/laudo", message: { to: "b@x.com", token: "tok9" }, timestamp: 1786000000 },
  });
  ok(e?.evento === "clique", "Postal: MessageLinkClicked → clique");
  ok(e.para === "b@x.com", "o destinatário vem de payload.message.to");
  ok(e.mensagem_id === "tok9", "e o token é o id da mensagem — reconcilia sem depender do e-mail");
  ok(e.provedor === "postal", "provedor identificado pelo envelope");
}
ok(normalizarEvento({ event: "MessageLoaded", payload: { message: { to: "b@x.com" } } })?.evento === "aberto",
   "Postal: MessageLoaded → aberto");
ok(normalizarEvento({ event: "MessageBounced", payload: { message: { to: "b@x.com" } } })?.evento === "bounce",
   "Postal: MessageBounced → bounce");

/* ═══════════ 3 · o que NÃO é evento ════════════════════════════════════ */
ok(normalizarEvento({ event: "coisa_nova", email: "a@x.com" }) === null,
   "evento desconhecido devolve null — e a rota responde 200: 4xx faria o provedor DESLIGAR o webhook");
ok(normalizarEvento({ event: "opened" }) === null, "evento sem destinatário não serve para nada");
ok(normalizarEvento({}) === null && normalizarEvento(null) === null, "corpo vazio não vira evento");

/* ═══════════ 4 · a data, e o 1970 ══════════════════════════════════════
 * Postal manda epoch em SEGUNDOS. Tratar como milissegundos joga tudo para
 * 1970, e o painel passa a dizer "nenhum evento nos últimos 30 dias" — que é
 * indistinguível de "a campanha não teve abertura nenhuma".
 * ══════════════════════════════════════════════════════════════════════════ */
{
  const e = normalizarEvento({ event: "opened", email: "a@x.com", ts: 1786000000 });
  ok(e.ocorreu_em.startsWith("2026-"), "epoch em segundos vira 2026, não 1970", e.ocorreu_em);
  const ms = normalizarEvento({ event: "opened", email: "a@x.com", ts: 1786000000000 });
  ok(ms.ocorreu_em === e.ocorreu_em, "e epoch em MILISSEGUNDOS dá exatamente a mesma data");
  const iso = normalizarEvento({ event: "opened", email: "a@x.com", date: "2026-08-05T10:00:00Z" });
  ok(iso.ocorreu_em === "2026-08-05T10:00:00.000Z", "ISO passa direto");
  const nada = normalizarEvento({ event: "opened", email: "a@x.com" });
  ok(nada.ocorreu_em > "2026-01-01", "sem data, usa agora — nunca 1970");
  const lixo = normalizarEvento({ event: "opened", email: "a@x.com", ts: "não é data" });
  ok(lixo.ocorreu_em > "2026-01-01", "e data ilegível também cai em agora, não em Invalid Date");
}

/* ═══════════ 5 · as taxas, com o denominador certo ═════════════════════ */
{
  const l = { regra: "r", enviados: 100, entregues: 90, abriram: 45, clicaram: 9, bounces: 10, spam: 0 };
  const t = taxas(l);
  ok(Math.abs(t.entrega - 0.9) < 1e-9, "entrega é sobre ENVIADOS");
  ok(Math.abs(t.abertura - 0.5) < 1e-9, "abertura é sobre ENTREGUES (45/90), não sobre enviados", t.abertura);
  ok(Math.abs(t.clique - 0.1) < 1e-9, "clique idem");
  ok(Math.abs(t.clique_sobre_abertura - 0.2) < 1e-9,
     "e de quem abriu, quantos agiram — separa 'assunto bom, corpo fraco' de 'ninguém viu'");
}
{
  const zero = taxas({ regra: "r", enviados: 0, entregues: 0, abriram: 0, clicaram: 0, bounces: 0, spam: 0 });
  ok(zero.entrega === null && zero.abertura === null,
     "sem base, a taxa é null e NÃO zero — 0% afirma algo que não se sabe");
}

/* ═══════════ 6 · a leitura diz o que fazer, e o que não afirmar ════════ */
ok(/Nada enviado/.test(leituraDaCampanha({ regra: "r", enviados: 0, entregues: 0, abriram: 0, clicaram: 0, bounces: 0, spam: 0 })),
   "sem envio, diz isso");
ok(/LISTA ou de reputação/.test(leituraDaCampanha({ regra: "r", enviados: 100, entregues: 50, abriram: 25, clicaram: 5, bounces: 50, spam: 0 })),
   "entrega baixa aponta para lista/remetente — não para o conteúdo, que é o palpite errado óbvio");
ok(/webhook do provedor/.test(leituraDaCampanha({ regra: "r", enviados: 100, entregues: 100, abriram: 0, clicaram: 0, bounces: 0, spam: 0 })),
   "zero abertura E zero clique sugere webhook desligado ANTES de sugerir campanha ruim");
ok(/mexa no CTA|Mexa no CTA/.test(leituraDaCampanha({ regra: "r", enviados: 100, entregues: 100, abriram: 40, clicaram: 1, bounces: 0, spam: 0 })),
   "abrem e não clicam: o problema é o corpo, e a leitura diz onde mexer");
ok(/clique é o número confiável/.test(leituraDaCampanha({ regra: "r", enviados: 100, entregues: 100, abriram: 50, clicaram: 8, bounces: 0, spam: 0 })),
   "com clique bom, celebra o clique — não a abertura");
ok(/piso, não medida/.test(leituraDaCampanha({ regra: "r", enviados: 100, entregues: 100, abriram: 10, clicaram: 2, bounces: 0, spam: 0 })),
   "e no caso morno, a frase lembra que abertura é piso — é a única defesa contra decidir pelo número errado");

console.log(f === 0 ? "\nOK" : `\n${f} FALHA(S)`);
process.exit(f === 0 ? 0 : 1);
