import { paraSlug } from "./slug";
import type { ItemRadar } from "./radar";

/**
 * O RADAR PÚBLICO — índice paginado e endereço de cada matéria.
 *
 * ---------------------------------------------------------------------------
 * POR QUE PAGINAR, num site com onze matérias.
 *
 * Não é por volume. A /reforma antiga mostrava as onze INTEIRAS, empilhadas —
 * título, resumo, "o que fazer", fonte, datas. Onze blocos densos numa rolagem
 * só: quem chegava pela busca procurando UMA norma tinha de varrer a página
 * inteira para achá-la, e quem chegava sem procurar nada desistia na terceira.
 *
 * O índice curto responde à primeira pergunta ("tem alguma coisa aqui sobre o
 * que eu preciso?") em segundos, e o texto completo espera do outro lado de um
 * clique — onde ele tem endereço próprio, título próprio e chance própria de
 * ser achado. Uma página com onze assuntos não ranqueia para nenhum deles.
 *
 * A paginação também é o que mantém isso verdadeiro quando forem cinquenta: o
 * monitor publica todo dia, e uma página que só cresce vira arquivo morto.
 */

/** quantas matérias por página do índice */
export const POR_PAGINA = 8;

export interface Pagina<T> {
  itens: T[];
  pagina: number;
  paginas: number;
  total: number;
  primeiro: number;
  ultimo: number;
}

/**
 * Recorta a página pedida. Página fora do intervalo é PUXADA para dentro, não
 * devolvida vazia: `?p=99` num índice de 2 páginas mostra a 2, e `?p=abacaxi`
 * mostra a 1. Página em branco por parâmetro errado é a forma mais boba de
 * perder uma visita — e a URL vem de fora, sempre.
 */
export function paginar<T>(itens: T[], pagina: unknown, porPagina = POR_PAGINA): Pagina<T> {
  const total = itens.length;
  const paginas = Math.max(1, Math.ceil(total / porPagina));

  const pedida = Number.parseInt(String(pagina ?? "1"), 10);
  const p = Number.isFinite(pedida) ? Math.min(Math.max(pedida, 1), paginas) : 1;

  const de = (p - 1) * porPagina;
  return {
    itens: itens.slice(de, de + porPagina),
    pagina: p,
    paginas,
    total,
    primeiro: total === 0 ? 0 : de + 1,
    ultimo: Math.min(de + porPagina, total),
  };
}

/** a URL da página n do índice — a 1 é a raiz, sem `?p=1` pendurado */
export function enderecoPagina(n: number): string {
  return n <= 1 ? "/reforma" : `/reforma?p=${n}`;
}

/**
 * O ENDEREÇO DE UMA MATÉRIA, com uma ponte deliberada.
 *
 * A coluna `slug` é a fonte de verdade — decidida na publicação, estável para
 * sempre (ver migration 0064). Mas a coluna pode estar vazia no intervalo
 * entre subir o código e rodar a migration, e nesse intervalo a alternativa
 * seria a matéria sumir da lista ou virar um título sem link.
 *
 * Então, e só nesse caso, o endereço é derivado do título na hora. É a mesma
 * função que a publicação usa, então o endereço derivado é IGUAL ao que a
 * migration vai gravar — a ponte não muda a URL de ninguém quando cair.
 */
export function enderecoDaMateria(item: { slug?: string | null; titulo: string }): string {
  const gravado = (item.slug ?? "").trim();
  return gravado || paraSlug(item.titulo);
}

/** acha a matéria pelo endereço da URL, aceitando as duas formas acima */
export function acharPorEndereco<T extends { slug?: string | null; titulo: string }>(
  itens: T[],
  endereco: string
): T | null {
  const alvo = (endereco || "").trim().toLowerCase();
  if (!alvo) return null;
  return itens.find((i) => enderecoDaMateria(i) === alvo) ?? null;
}

/** a anterior e a próxima na MESMA ordem em que a lista é mostrada */
export function vizinhas<T>(itens: T[], indice: number): { anterior: T | null; proxima: T | null } {
  return {
    anterior: indice > 0 ? itens[indice - 1] : null,
    proxima: indice >= 0 && indice < itens.length - 1 ? itens[indice + 1] : null,
  };
}

/** em que página do índice a matéria está — para o link "voltar" não mentir */
export function paginaDe(indice: number, porPagina = POR_PAGINA): number {
  return indice < 0 ? 1 : Math.floor(indice / porPagina) + 1;
}

export type MateriaPublica = Pick<
  ItemRadar,
  "id" | "titulo" | "resumo" | "o_que_fazer" | "fonte" | "publicado_em" | "vigencia_em" | "severidade"
> & { slug?: string | null };

/** a data como o contador escreve — UTC porque a coluna é `date`, sem hora:
 *  sem fixar o fuso, 2026-09-01 vira 31/08 para quem está a oeste de Greenwich */
export function dataBR(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "";
}

export const CLASSE_SEVERIDADE: Record<string, string> = {
  alta: "casca-sev casca-sev--alta",
  media: "casca-sev casca-sev--media",
  baixa: "casca-sev casca-sev--baixa",
};
