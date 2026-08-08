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

/* ==========================================================================
 * A LINHA ACHATADA — o que a tela realmente manipula.
 *
 * `EntradaFeed` é uma união com o objeto original dentro. Ótimo para ordenar,
 * ruim para filtrar e para atravessar a fronteira servidor→cliente: cada
 * `if (e.tipo === "artigo")` no meio de um filtro é uma chance de esquecer um
 * dos dois lados. `LinhaFeed` resolve de uma vez: um formato só, com nulo onde
 * aquela natureza não tem o campo.
 *
 * Regra que vale para todo filtro daqui para baixo: FILTRO DE CAMPO QUE A
 * NOTÍCIA NÃO TEM EXCLUI A NOTÍCIA. Filtrar por severidade "alta" e receber de
 * volta matérias sem severidade nenhuma seria mentira silenciosa — o controle
 * diria uma coisa e a lista mostraria outra.
 * ========================================================================== */
export interface LinhaFeed {
  tipo: "artigo" | "radar";
  id: string;
  titulo: string;
  resumo: string | null;
  /** quando NÓS publicamos */
  publicado_em: string | null;
  /** A DATA DO EFEITO: quando a norma passa (ou passou) a valer. Só radar. */
  vigencia_em: string | null;
  severidade: string | null;
  o_que_fazer: string | null;
  fonte: string | null;
  /** só artigo: a matéria inteira vive em /painel/ajuda/[slug] */
  slug: string | null;
  /** só radar: quantas empresas da carteira de quem está lendo */
  alcance: number | null;
  novo: boolean;
}

export function achatar(feed: EntradaFeed[]): LinhaFeed[] {
  return feed.map((e) =>
    e.tipo === "artigo"
      ? {
          tipo: "artigo" as const,
          id: e.id,
          titulo: e.artigo.titulo,
          resumo: e.artigo.resumo ?? null,
          publicado_em: e.data,
          vigencia_em: null,
          severidade: null,
          o_que_fazer: null,
          fonte: null,
          slug: e.artigo.slug,
          alcance: null,
          novo: e.novo,
        }
      : {
          tipo: "radar" as const,
          id: e.id,
          titulo: e.radar.titulo,
          resumo: e.radar.resumo ?? null,
          publicado_em: e.data,
          vigencia_em: e.radar.vigencia_em ?? null,
          severidade: e.radar.severidade ?? null,
          o_que_fazer: e.radar.o_que_fazer ?? null,
          fonte: e.radar.fonte ?? null,
          slug: null,
          alcance: e.alcance,
          novo: e.novo,
        }
  );
}

export interface FiltroFeed {
  busca: string;
  /** só o que ainda não foi lido */
  naoLidas: boolean;
  /** só o que alcança pelo menos uma empresa da carteira */
  minhaCarteira: boolean;
  severidade: "todas" | "alta" | "media" | "baixa";
  /** pela DATA DO EFEITO, não pela de publicação */
  efeito: "todos" | "em_vigor" | "a_vigorar";
}

export const FILTRO_VAZIO: FiltroFeed = {
  busca: "",
  naoLidas: false,
  minhaCarteira: false,
  severidade: "todas",
  efeito: "todos",
};

/* sem `\p{Diacritic}`: a flag `u` exige target es6+ e o tsconfig do projeto é
   mais conservador. O intervalo abaixo é o bloco de combinantes do Unicode e
   faz exatamente o mesmo trabalho. */
const semAcento = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function filtrarFeed(linhas: LinhaFeed[], f: FiltroFeed, hojeISO: string): LinhaFeed[] {
  const termo = semAcento(f.busca.trim());

  return linhas.filter((l) => {
    if (f.naoLidas && !l.novo) return false;

    /* alcance nulo é a notícia, que não tem carteira para alcançar */
    if (f.minhaCarteira && !(l.alcance && l.alcance > 0)) return false;

    if (f.severidade !== "todas" && l.severidade !== f.severidade) return false;

    if (f.efeito !== "todos") {
      if (!l.vigencia_em) return false; // sem data de efeito não entra em nenhum dos recortes
      const jaVale = l.vigencia_em.slice(0, 10) <= hojeISO;
      if (f.efeito === "em_vigor" && !jaVale) return false;
      if (f.efeito === "a_vigorar" && jaVale) return false;
    }

    if (termo) {
      const feno = semAcento([l.titulo, l.resumo, l.o_que_fazer, l.fonte].filter(Boolean).join(" "));
      if (!feno.includes(termo)) return false;
    }

    return true;
  });
}

export interface Pagina<T> {
  itens: T[];
  pagina: number;
  paginas: number;
  total: number;
  primeiro: number;
  ultimo: number;
}

/**
 * PAGINAÇÃO com a página SEMPRE presa ao intervalo válido.
 *
 * Quem está na página 3 e filtra até sobrar 4 resultados ficaria com uma
 * página vazia — que parece "não achei nada" e não é. Aqui a página é presa ao
 * último intervalo existente: erro de navegação não vira tela em branco.
 */
export function paginar<T>(itens: T[], pagina: number, porPagina: number): Pagina<T> {
  const total = itens.length;
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const p = Math.min(Math.max(1, Math.floor(pagina) || 1), paginas);
  const inicio = (p - 1) * porPagina;
  return {
    itens: itens.slice(inicio, inicio + porPagina),
    pagina: p,
    paginas,
    total,
    primeiro: total === 0 ? 0 : inicio + 1,
    ultimo: Math.min(inicio + porPagina, total),
  };
}

/** os três números do cabeçalho — contados sobre o feed INTEIRO, não o filtrado */
export function resumoFeed(linhas: LinhaFeed[]): { total: number; naoLidas: number; atingem: number } {
  return {
    total: linhas.length,
    naoLidas: linhas.filter((l) => l.novo).length,
    atingem: linhas.filter((l) => (l.alcance ?? 0) > 0).length,
  };
}

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
