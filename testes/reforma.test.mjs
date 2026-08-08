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
import { unirFeed, achatar, filtrarFeed, paginar, resumoFeed, FILTRO_VAZIO } from "./reforma.js";

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


/* ══════════════════════════════════════════════════════════════════════════
 * O PAINEL — achatar, filtrar, paginar.
 *
 * Estas quatro funções nasceram em 06/08 junto com a tela em lista. Elas são
 * puras pelo mesmo motivo de `unirFeed`: filtro errado não quebra nada, só
 * esconde — e o que se esconde de um contador em agosto de 2026 pode ser a
 * única norma que atinge a carteira dele.
 * ══════════════════════════════════════════════════════════════════════════ */

const HOJE = "2026-08-06";

/** um radar achatado, direto, para os testes de filtro */
const lin = (over) => ({
  tipo: "radar", id: "x", titulo: "t", resumo: null, publicado_em: HOJE,
  vigencia_em: null, severidade: "media", o_que_fazer: null, fonte: null,
  slug: null, alcance: 0, novo: false, ...over,
});
const filtro = (over) => ({ ...FILTRO_VAZIO, ...over });

/* ═══════════ 7 · achatar preserva ordem e natureza ══════════════════════ */
{
  const feed = unirFeed([art("a1", "2026-08-01")], [rad("r1", "2026-08-05", 3, true)]);
  const linhas = achatar(feed);
  ok(linhas.length === 2 && linhas[0].tipo === "radar", "achatar mantém a ordem do feed");
  ok(linhas[0].alcance === 3 && linhas[0].novo === true, "o alcance e o não-lido sobrevivem");
  ok(linhas[1].slug === "s-a1", "o slug do artigo sobrevive — é o link da matéria");
  ok(linhas[1].severidade === null && linhas[1].vigencia_em === null,
     "matéria não ganha severidade nem data de efeito inventadas");
}

/* ═══════════ 8 · filtro de campo que a notícia não tem exclui a notícia ══
 * Filtrar por "severidade alta" e ver matérias sem severidade de volta seria o
 * controle dizendo uma coisa e a lista mostrando outra. */
{
  const linhas = [lin({ id: "r", severidade: "alta" }), lin({ id: "a", tipo: "artigo", severidade: null })];
  const so = filtrarFeed(linhas, filtro({ severidade: "alta" }), HOJE);
  ok(so.length === 1 && so[0].id === "r", "severidade alta não devolve matéria", so.map((l) => l.id));
}

/* ═══════════ 9 · o recorte é pela DATA DO EFEITO, não pela publicação ═══ */
{
  const linhas = [
    lin({ id: "futuro", vigencia_em: "2027-01-01" }),
    lin({ id: "vigente", vigencia_em: "2026-08-01" }),
    lin({ id: "hoje", vigencia_em: HOJE }),
    lin({ id: "sem_data", vigencia_em: null }),
  ];
  const aVigorar = filtrarFeed(linhas, filtro({ efeito: "a_vigorar" }), HOJE).map((l) => l.id);
  const emVigor = filtrarFeed(linhas, filtro({ efeito: "em_vigor" }), HOJE).map((l) => l.id);
  ok(aVigorar.join() === "futuro", "ainda vai valer: só o que tem efeito no futuro", aVigorar);
  ok(emVigor.join() === "vigente,hoje", "já está valendo inclui o que começa HOJE", emVigor);
  ok(!aVigorar.includes("sem_data") && !emVigor.includes("sem_data"),
     "sem data de efeito não entra em nenhum dos dois recortes");
}

/* ═══════════ 10 · busca sem acento e em qualquer campo ═════════════════ */
{
  const linhas = [
    lin({ id: "1", titulo: "Alíquota de referência" }),
    lin({ id: "2", titulo: "Outra coisa", fonte: "Resolução CGIBS nº 14" }),
    lin({ id: "3", titulo: "Nada a ver" }),
  ];
  ok(filtrarFeed(linhas, filtro({ busca: "aliquota" }), HOJE).map((l) => l.id).join() === "1",
     "busca ignora acento: 'aliquota' acha 'Alíquota'");
  ok(filtrarFeed(linhas, filtro({ busca: "CGIBS" }), HOJE).map((l) => l.id).join() === "2",
     "busca alcança a fonte, não só o título");
  ok(filtrarFeed(linhas, filtro({ busca: "  " }), HOJE).length === 3,
     "busca só com espaço não filtra nada");
}

/* ═══════════ 11 · minha carteira e não lidas ═══════════════════════════ */
{
  const linhas = [
    lin({ id: "atinge", alcance: 4, novo: true }),
    lin({ id: "zero", alcance: 0, novo: true }),
    lin({ id: "materia", tipo: "artigo", alcance: null, novo: false }),
  ];
  ok(filtrarFeed(linhas, filtro({ minhaCarteira: true }), HOJE).map((l) => l.id).join() === "atinge",
     "alcance zero e matéria (alcance nulo) ficam fora do recorte da carteira");
  ok(filtrarFeed(linhas, filtro({ naoLidas: true }), HOJE).length === 2,
     "não lidas devolve os dois novos");
}

/* ═══════════ 12 · paginação não devolve página vazia ══════════════════
 * Quem filtra estando na página 3 sobra com 4 resultados. Devolver a página 3
 * vazia parece "não achei nada", e não é. */
{
  const itens = Array.from({ length: 4 }, (_, i) => i);
  const p = paginar(itens, 3, 12);
  ok(p.pagina === 1 && p.itens.length === 4, "página fora do intervalo cai na última válida", p.pagina);

  const vinte = Array.from({ length: 20 }, (_, i) => i);
  const p2 = paginar(vinte, 2, 12);
  ok(p2.itens.length === 8 && p2.primeiro === 13 && p2.ultimo === 20 && p2.paginas === 2,
     "a contagem '13–20 de 20' bate com a fatia", [p2.primeiro, p2.ultimo, p2.total]);

  const p0 = paginar([], 1, 12);
  ok(p0.paginas === 1 && p0.primeiro === 0 && p0.total === 0,
     "lista vazia não vira 'página 1 de 0'");
}

/* ═══════════ 13 · o resumo do cabeçalho ═══════════════════════════════ */
{
  const linhas = [
    lin({ id: "1", novo: true, alcance: 3 }),
    lin({ id: "2", novo: false, alcance: 0 }),
    lin({ id: "3", tipo: "artigo", novo: true, alcance: null }),
  ];
  const r = resumoFeed(linhas);
  ok(r.total === 3 && r.naoLidas === 2 && r.atingem === 1,
     "3 publicações, 2 não lidas, 1 atinge a carteira", r);
}

console.log(f ? `\n${f} FALHA(S)` : "\ntudo ok");
process.exit(f ? 1 : 0);
