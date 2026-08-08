/**
 * ENTREGA E LEITURA — casar `email_eventos` com `plataforma_envios`.
 *
 * POR QUE ISTO TEM TESTE. Casamento errado entre evento e envio não quebra
 * nada: ele faz uma campanha boa aparecer com zero abertura, e a conclusão
 * seguinte é reescrever um texto que estava funcionando. É a família de defeito
 * mais cara que existe em métrica — a que leva a decidir na direção errada.
 */
import { casarEventos, resumir, resumirPorRegra, rotuloEntrega, taxa } from "./entrega.js";

let f = 0;
const ok = (c, m, e) => {
  if (!c) { f++; console.log("FALHOU:", m, e === undefined ? "" : JSON.stringify(e)); }
  else console.log("ok:", m);
};

const envio = (id, para, regra, criado_em) => ({ id, para, regra, criado_em });
const ev = (evento, para, ocorreu_em, envio_id = null) => ({ envio_id, para, regra: null, evento, ocorreu_em });

/* ═══════════ 1 · o caminho fácil: o webhook já trouxe o envio_id ════════ */
{
  const envios = [envio("e1", "a@x.com", "novidade", "2026-08-06T10:00:00Z")];
  const { estados, orfaos } = casarEventos(envios, [
    ev("entregue", "a@x.com", "2026-08-06T10:00:20Z", "e1"),
    ev("aberto", "a@x.com", "2026-08-06T11:00:00Z", "e1"),
  ]);
  const s = estados.get("e1");
  ok(s.entregue && s.aberto && !s.clique, "entregue e aberto pousam no envio certo", s);
  ok(orfaos === 0, "nenhum evento órfão");
}

/* ═══════════ 2 · sem envio_id, casa por destinatário e horário ══════════
 * O webhook procura o envio no instante em que o evento chega e muitas vezes
 * não acha — `envio_id` fica nulo. Sem esta via, metade dos eventos ficaria
 * órfã e o painel mostraria zero abertura. */
{
  const envios = [envio("e1", "A@X.com", "digest", "2026-08-06T10:00:00Z")];
  const { estados, orfaos } = casarEventos(envios, [ev("aberto", "a@x.com  ", "2026-08-06T12:00:00Z")]);
  ok(estados.get("e1").aberto === "2026-08-06T12:00:00Z",
     "casa mesmo com maiúscula e espaço no endereço — é a mesma caixa");
  ok(orfaos === 0, "e não conta como órfão");
}

/* ═══════════ 3 · evento ANTERIOR ao envio não casa ══════════════════════
 * Atribuir a leitura de um e-mail antigo à mensagem seguinte faz régua nova
 * nascer com métrica emprestada — e parecer ótima. */
{
  const envios = [envio("e2", "a@x.com", "novidade", "2026-08-06T10:00:00Z")];
  const { estados, orfaos } = casarEventos(envios, [ev("aberto", "a@x.com", "2026-08-05T09:00:00Z")]);
  ok(estados.get("e2").aberto === null, "abertura de ontem não vira abertura do envio de hoje");
  ok(orfaos === 1, "ela é contada como órfã, não some sem deixar rastro");
}

/* ═══════════ 4 · dois envios para a mesma pessoa: pega o mais recente ═══ */
{
  const envios = [
    envio("velho", "a@x.com", "ativacao", "2026-08-01T10:00:00Z"),
    envio("novo", "a@x.com", "novidade", "2026-08-06T10:00:00Z"),
  ];
  const { estados } = casarEventos(envios, [ev("clique", "a@x.com", "2026-08-06T10:30:00Z")]);
  ok(estados.get("novo").clique !== null && estados.get("velho").clique === null,
     "o clique é do envio mais recente anterior ao evento");
}

/* ═══════════ 5 · webhook repetido não vira fato novo ════════════════════ */
{
  const envios = [envio("e1", "a@x.com", "x", "2026-08-06T10:00:00Z")];
  const { estados } = casarEventos(envios, [
    ev("aberto", "a@x.com", "2026-08-06T14:00:00Z"),
    ev("aberto", "a@x.com", "2026-08-06T12:00:00Z"),
    ev("aberto", "a@x.com", "2026-08-06T16:00:00Z"),
  ]);
  ok(estados.get("e1").aberto === "2026-08-06T12:00:00Z",
     "guarda a PRIMEIRA abertura, não a última que chegou pelo webhook");
}

/* ═══════════ 6 · falha manda ═══════════════════════════════════════════
 * Entregue e depois marcado como spam não é sucesso com ressalva: é endereço
 * que não pode receber de novo. */
{
  const envios = [envio("e1", "a@x.com", "x", "2026-08-06T10:00:00Z")];
  const { estados } = casarEventos(envios, [
    ev("entregue", "a@x.com", "2026-08-06T10:01:00Z"),
    ev("spam", "a@x.com", "2026-08-06T15:00:00Z"),
  ]);
  ok(rotuloEntrega(estados.get("e1")).nivel === "falha", "o rótulo mostra a falha, não a entrega");
  ok(rotuloEntrega(estados.get("e1")).texto === "spam", "e diz qual foi");
}

/* ═══════════ 7 · o rótulo é o estágio mais avançado ════════════════════ */
{
  ok(rotuloEntrega(undefined).texto === "enviado", "sem estado nenhum, continua 'enviado'");
  ok(rotuloEntrega({ entregue: "a", aberto: "b", clique: "c", falha: null }).texto === "clicou",
     "quem clicou aparece como clicou, não como entregue");
  ok(rotuloEntrega({ entregue: "a", aberto: null, clique: null, falha: null }).texto === "entregue",
     "entregue sem abertura aparece como entregue");
}

/* ═══════════ 8 · o resumo, e a regra que evita o número ilegível ═══════
 * Quem abriu, recebeu — mesmo que o webhook de ENTREGA tenha se perdido.
 * Contar só o evento explícito faria a taxa de entrega ficar abaixo da de
 * abertura, número que ninguém consegue ler. */
{
  const envios = [
    envio("a", "a@x.com", "novidade", "2026-08-06T10:00:00Z"),
    envio("b", "b@x.com", "novidade", "2026-08-06T10:00:00Z"),
    envio("c", "c@x.com", "novidade", "2026-08-06T10:00:00Z"),
    envio("d", "d@x.com", "digest", "2026-08-06T10:00:00Z"),
  ];
  const { estados } = casarEventos(envios, [
    ev("aberto", "a@x.com", "2026-08-06T11:00:00Z"), // abriu, sem evento de entrega
    ev("entregue", "b@x.com", "2026-08-06T10:01:00Z"),
    ev("clique", "b@x.com", "2026-08-06T11:30:00Z"),
    ev("bounce", "c@x.com", "2026-08-06T10:02:00Z"),
    // d não tem evento nenhum
  ]);
  const r = resumir(envios, estados);
  ok(r.enviados === 4 && r.entregues === 2 && r.abertos === 2 && r.cliques === 1 && r.falhas === 1,
     "4 enviados, 2 entregues, 2 abertos, 1 clique, 1 falha", r);
  ok(r.entregues >= r.abertos, "a taxa de entrega nunca fica abaixo da de abertura");
  ok(r.sem_evento === 1, "quem não gerou evento nenhum é contado à parte — é o termômetro do webhook");

  const porRegra = resumirPorRegra(envios, estados);
  ok(porRegra[0].regra === "novidade" && porRegra[0].resumo.enviados === 3,
     "por regra, o maior volume vem primeiro", porRegra.map((x) => x.regra));
}

/* ═══════════ 9 · taxa sem base é null, não 0% ══════════════════════════
 * "0% de abertura" com zero envios é uma mentira que parece um diagnóstico. */
{
  ok(taxa(0, 0) === null, "sem envio nenhum, a taxa não existe — não é zero");
  ok(taxa(1, 3) === 33.3, "uma casa decimal", taxa(1, 3));
  ok(taxa(2, 4) === 50, "meio a meio");
}

console.log(f ? `\n${f} FALHA(S)` : "\ntudo ok");
process.exit(f ? 1 : 0);
