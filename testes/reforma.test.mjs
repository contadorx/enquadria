/**
 * A ABA REFORMA — duas fontes, uma linha do tempo.
 *
 * O DEFEITO, 06/08/2026: existiam duas features chamadas "Reforma" — as
 * notícias (`ajuda_artigos`) e o radar (`radar_itens`) — em tabelas diferentes
 * e telas diferentes. Publicar no radar não punha nada na aba que leva o nome
 * dele, e a tela de publicação afirmava por escrito que punha.
 *
 * `unirFeed` é o encontro das duas. Ordenação de feed é o tipo de coisa que se
 * conserta seis meses depois, no escuro, sem ninguém lembrar da regra — por
 * isso ela é pura e vem com estas asserções.
 */
import { unirFeed } from "./reforma.js";

let f = 0;
const ok = (c, m, e) => {
  if (!c) { f++; console.log("FALHOU:", m, e === undefined ? "" : JSON.stringify(e)); }
  else console.log("ok:", m);
};

const art = (id, data, novo = false) => ({
  tipo: "artigo", id, data, novo,
  artigo: { id, slug: "s-" + id, titulo: "Artigo " + id, resumo: null, publicado_em: data },
});
const rad = (id, data, alcance = 0, novo = false) => ({
  tipo: "radar", id, data, alcance, novo,
  radar: { id, titulo: "Radar " + id, resumo: "r", o_que_fazer: null, fonte: null,
           publicado_em: data, vigencia_em: null, severidade: "media", criterio: null },
});

/* ═══════════ 1 · as duas fontes na mesma lista ══════════════════════════ */
{
  const feed = unirFeed([art("a1", "2026-08-01")], [rad("r1", "2026-08-05")]);
  ok(feed.length === 2, "artigo e item de radar entram na mesma lista", feed.length);
  ok(feed[0].tipo === "radar", "e a ordem é por data: 05/08 antes de 01/08", feed.map((x) => x.id));
}

/* ═══════════ 2 · empate no dia: quem gera trabalho vem antes ════════════
 * Dois avisos do mesmo dia não são equivalentes. Um deles diz "isto atinge 14
 * dos seus clientes" e vira trabalho; o outro é contexto.
 * ══════════════════════════════════════════════════════════════════════════ */
{
  const feed = unirFeed([art("a1", "2026-08-06")], [rad("r1", "2026-08-06", 14)]);
  ok(feed[0].id === "r1", "no mesmo dia, o item que atinge a carteira vem primeiro", feed.map((x) => x.id));

  const semAlcance = unirFeed([art("a1", "2026-08-06")], [rad("r1", "2026-08-06", 0)]);
  ok(semAlcance[0].id === "a1",
     "mas radar que não atinge ninguém NÃO passa na frente — alcance zero não é urgência",
     semAlcance.map((x) => x.id));
}

/* ═══════════ 3 · depois, o não lido ═════════════════════════════════════ */
{
  const feed = unirFeed(
    [art("a1", "2026-08-06", false), art("a2", "2026-08-06", true)], []
  );
  ok(feed[0].id === "a2", "no mesmo dia e sem alcance, o não lido vem antes", feed.map((x) => x.id));
}

/* ═══════════ 4 · a ordem é ESTÁVEL ══════════════════════════════════════
 * Lista que se embaralha entre dois carregamentos faz a pessoa achar que
 * perdeu alguma coisa — e ela volta a procurar o que já leu.
 * ══════════════════════════════════════════════════════════════════════════ */
{
  const a = [art("a1", "2026-08-06"), art("a2", "2026-08-06"), art("a3", "2026-08-06")];
  const r = [rad("r1", "2026-08-06"), rad("r2", "2026-08-06")];
  const um = unirFeed(a, r).map((x) => x.id).join(",");
  const dois = unirFeed([...a].reverse(), [...r].reverse()).map((x) => x.id).join(",");
  ok(um === dois, "mesma entrada em ordem diferente produz a mesma saída", [um, dois]);
}

/* ═══════════ 5 · data ausente não derruba a lista ═══════════════════════ */
{
  const feed = unirFeed([art("a1", null)], [rad("r1", "2026-08-06")]);
  ok(feed.length === 2 && feed[0].id === "r1",
     "publicação sem data vai para o fim, e nada quebra", feed.map((x) => x.id));
}

/* ═══════════ 6 · o horário não separa itens do mesmo dia ════════════════ */
{
  const feed = unirFeed(
    [art("a1", "2026-08-06T23:00:00Z")], [rad("r1", "2026-08-06T01:00:00Z", 5)]
  );
  ok(feed[0].id === "r1",
     "compara o DIA, não o timestamp — senão a hora do INSERT decidiria a ordem",
     feed.map((x) => x.id));
}

console.log(f ? `\n${f} FALHA(S)` : "\ntudo ok");
process.exit(f ? 1 : 0);
