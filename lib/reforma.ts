/**
 * A LINHA DO TEMPO DA ABA REFORMA — duas fontes, uma ordem.
 *
 * Até 06/08/2026 havia duas features chamadas "Reforma": as notícias
 * (`ajuda_artigos`) e o radar (`radar_itens`). Elas nunca se encontravam, e
 * quem publicava no radar ia procurar o item na aba que leva o nome dele.
 *
 * Esta função é o encontro. Ela é PURA de propósito: a ordem de um feed é o
 * tipo de coisa que se conserta seis meses depois, e conserto de ordenação sem
 * teste é como se troca um bug por outro.
 *
 * A REGRA DE ORDEM, e por que ela não é só "data desc":
 *
 *   1. data de publicação, mais recente primeiro — é um feed;
 *   2. empatou no dia? o item que ATINGE a carteira vem antes. Dois avisos do
 *      mesmo dia não são equivalentes: um deles gera trabalho para quem lê;
 *   3. ainda empatado? o não lido primeiro;
 *   4. e por último o id, para a ordem ser estável entre dois carregamentos —
 *      lista que embaralha sozinha faz a pessoa achar que perdeu alguma coisa.
 */
import type { Artigo } from "./ajuda";
import type { ItemRadar } from "./radar";

export interface EntradaArtigo {
  tipo: "artigo";
  id: string;
  data: string | null;
  artigo: Artigo;
  novo: boolean;
}

export interface EntradaRadar {
  tipo: "radar";
  id: string;
  data: string | null;
  radar: ItemRadar;
  /** quantas empresas da carteira de quem está lendo o item alcança */
  alcance: number;
  novo: boolean;
}

export type EntradaFeed = EntradaArtigo | EntradaRadar;

const dia = (d: string | null) => (d ? d.slice(0, 10) : "");

export function unirFeed(artigos: EntradaArtigo[], radar: EntradaRadar[]): EntradaFeed[] {
  const tudo: EntradaFeed[] = [...artigos, ...radar];

  return tudo.sort((a, b) => {
    const da = dia(a.data);
    const db = dia(b.data);
    if (da !== db) return db.localeCompare(da); // mais recente primeiro

    /* mesmo dia: quem gera trabalho vem antes */
    const ga = a.tipo === "radar" && a.alcance > 0 ? 0 : 1;
    const gb = b.tipo === "radar" && b.alcance > 0 ? 0 : 1;
    if (ga !== gb) return ga - gb;

    /* depois o que ainda não foi lido */
    if (a.novo !== b.novo) return a.novo ? -1 : 1;

    /* e por fim o id, para a ordem não mudar sozinha entre dois carregamentos */
    return a.id.localeCompare(b.id);
  });
}
