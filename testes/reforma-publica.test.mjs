/**
 * O ÍNDICE PÚBLICO DA REFORMA — paginação e endereço.
 *
 * O que estes testes protegem é o par de defeitos que não aparece em tela
 * nenhuma no dia em que acontece:
 *
 *   · PÁGINA EM BRANCO POR PARÂMETRO. A URL vem de fora — de um link colado
 *     torto, de um robô, de alguém editando a barra. `?p=99` ou `?p=abacaxi`
 *     não pode devolver lista vazia com o rodapé embaixo: parece site quebrado
 *     e é só um número fora do intervalo.
 *
 *   · ENDEREÇO QUE MUDA. A ponte "sem slug gravado, deriva do título" só é
 *     aceitável se o derivado for IDÊNTICO ao que a migration grava. Se as
 *     duas formas divergirem, rodar a migration troca a URL de todo mundo.
 */
import {
  paginar, enderecoPagina, enderecoDaMateria, acharPorEndereco, vizinhas, paginaDe, POR_PAGINA,
} from "./reforma-publica.js";
import { paraSlug } from "./slug.js";

let f = 0;
const ok = (c, m, e) => {
  if (!c) { f++; console.log("FALHOU:", m, e === undefined ? "" : JSON.stringify(e)); }
  else console.log("ok:", m);
};
const igual = (achado, esperado, m) => ok(achado === esperado, m, { achado, esperado });

const lista = (n) => Array.from({ length: n }, (_, i) => ({ n: i + 1 }));

/* ═══════════ 1 · o recorte ══════════════════════════════════════════════ */
{
  const p = paginar(lista(20), 1, 8);
  igual(p.itens.length, 8, "a primeira página traz 8 de 20");
  igual(p.paginas, 3, "20 itens em páginas de 8 dão 3 páginas");
  igual(p.itens[0].n, 1, "começa no primeiro");
  igual(p.primeiro, 1, "o contador diz que começa no 1");
  igual(p.ultimo, 8, "e termina no 8");
}
{
  const p = paginar(lista(20), 3, 8);
  igual(p.itens.length, 4, "a última página traz o resto");
  igual(p.itens[0].n, 17, "e começa onde a anterior parou");
  igual(p.ultimo, 20, "o contador da última página não passa do total");
}

/* ═══════════ 2 · a URL vem de fora ══════════════════════════════════════ */
igual(paginar(lista(20), 99, 8).pagina, 3, "?p=99 mostra a última, não uma página em branco");
igual(paginar(lista(20), 0, 8).pagina, 1, "?p=0 mostra a primeira");
igual(paginar(lista(20), -5, 8).pagina, 1, "?p=-5 mostra a primeira");
igual(paginar(lista(20), "abacaxi", 8).pagina, 1, "?p=abacaxi mostra a primeira");
igual(paginar(lista(20), undefined, 8).pagina, 1, "sem ?p mostra a primeira");
igual(paginar(lista(20), "2", 8).pagina, 2, "?p=2 (texto, como vem da URL) é a página 2");
ok(paginar(lista(20), 99, 8).itens.length > 0, "página puxada para dentro nunca vem vazia");

{
  const p = paginar([], 1, 8);
  igual(p.paginas, 1, "lista vazia ainda é 1 página — não 0");
  igual(p.primeiro, 0, "e o contador não promete um primeiro item que não existe");
}

/* ═══════════ 3 · os endereços ═══════════════════════════════════════════ */
igual(enderecoPagina(1), "/reforma", "a página 1 não carrega ?p=1 — seria conteúdo igual em dois endereços");
igual(enderecoPagina(2), "/reforma?p=2", "a partir da 2 o parâmetro aparece");

{
  const gravado = { slug: "janela-de-opcao", titulo: "Janela de opção pelo regime regular de IBS/CBS" };
  igual(enderecoDaMateria(gravado), "janela-de-opcao", "o slug gravado manda, mesmo diferente do título");

  const vazio = { slug: "  ", titulo: "Janela de opção pelo regime regular de IBS/CBS" };
  igual(
    enderecoDaMateria(vazio),
    paraSlug(vazio.titulo),
    "slug em branco cai na derivação — e a derivação é a MESMA que a migration usa"
  );
  igual(enderecoDaMateria({ titulo: "CBS entra em vigor" }), "cbs-entra-em-vigor", "sem a coluna, deriva");
}

/* ═══════════ 4 · achar pelo endereço ════════════════════════════════════ */
{
  const itens = [
    { slug: "a-primeira", titulo: "A primeira" },
    { slug: null, titulo: "CBS entra em vigor" },
  ];
  ok(acharPorEndereco(itens, "a-primeira")?.titulo === "A primeira", "acha pelo slug gravado");
  ok(acharPorEndereco(itens, "cbs-entra-em-vigor")?.titulo === "CBS entra em vigor", "acha pelo derivado");
  ok(acharPorEndereco(itens, "nao-existe") === null, "endereço desconhecido devolve nulo — vira 404 de verdade");
  ok(acharPorEndereco(itens, "") === null, "endereço vazio não devolve o primeiro item por acidente");
  ok(acharPorEndereco(itens, "A-PRIMEIRA")?.titulo === "A primeira", "maiúscula na URL ainda acha");
}

/* ═══════════ 5 · vizinhas e a página de volta ═══════════════════════════ */
{
  const l = lista(5);
  ok(vizinhas(l, 0).anterior === null, "a primeira não tem anterior");
  igual(vizinhas(l, 0).proxima.n, 2, "a primeira aponta para a segunda");
  ok(vizinhas(l, 4).proxima === null, "a última não tem próxima");
  igual(vizinhas(l, 4).anterior.n, 4, "a última aponta para a penúltima");
  ok(vizinhas(l, -1).anterior === null && vizinhas(l, -1).proxima === null, "índice inválido não inventa vizinha");
}
igual(paginaDe(0), 1, "o primeiro item está na página 1");
igual(paginaDe(POR_PAGINA - 1), 1, "o último da página 1 ainda é página 1");
igual(paginaDe(POR_PAGINA), 2, "o seguinte já é página 2");
igual(paginaDe(-1), 1, "índice inválido volta para a 1");

console.log(f === 0 ? "\nTODOS OS TESTES PASSARAM" : `\n${f} FALHA(S)`);
process.exit(f === 0 ? 0 : 1);
