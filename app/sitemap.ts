import type { MetadataRoute } from "next";
import { SITE, PAGINAS_PUBLICAS } from "@/lib/site";
import { TODAS_AULAS } from "@/lib/curso";
import { materiasPublicas } from "@/lib/radar-publico";
import { enderecoDaMateria, enderecoPagina, paginar, POR_PAGINA } from "@/lib/reforma-publica";

/**
 * O SITEMAP.
 *
 * Só entra o que é público E indexável. As aulas do curso entram uma a uma
 * porque são o ativo de aquisição de tráfego frio — cada uma responde a uma
 * pergunta diferente, e é assim que o buscador as trata. As matérias do radar
 * entram pelo mesmo motivo, com um a mais: elas nascem toda semana, e sitemap
 * é o caminho mais rápido para uma página nova ser vista.
 *
 * O que NUNCA pode entrar aqui: qualquer rota com token. Sitemap é o convite
 * mais explícito que existe para indexar — pôr um `/laudo/[token]` aqui seria
 * entregar o documento de um cliente ao índice de propósito. O robots já
 * bloqueia; esta lista é a segunda tranca, e as duas são intencionais.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const agora = new Date();

  const paginas = PAGINAS_PUBLICAS.map((p) => ({
    url: `${SITE}${p.rota === "/" ? "" : p.rota}`,
    lastModified: agora,
    changeFrequency: p.frequencia,
    priority: p.prioridade,
  }));

  const aulas = TODAS_AULAS.map((a) => ({
    url: `${SITE}/curso/${a.slug}`,
    lastModified: agora,
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  /**
   * O RADAR — e o banco pode não responder.
   *
   * O sitemap é lido por robô, sem ninguém olhando. Se a consulta falhar, o
   * certo é entregar o sitemap MENOR e não um erro: sitemap com 500 faz o
   * buscador parar de pedir por um tempo, e aí some do índice o que já estava
   * lá. Por isso o catch devolve lista vazia em vez de estourar.
   */
  let materias: MetadataRoute.Sitemap = [];
  let indices: MetadataRoute.Sitemap = [];
  try {
    const todas = await materiasPublicas();

    materias = todas.map((m) => ({
      url: `${SITE}/reforma/${enderecoDaMateria(m)}`,
      /* a data da própria matéria, não "agora": dizer que tudo mudou hoje toda
         vez que o robô passa é o mesmo que não dizer nada */
      lastModified: m.publicado_em ? new Date(m.publicado_em) : agora,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    }));

    /* as páginas 2, 3… do índice. A 1 já está em PAGINAS_PUBLICAS; repeti-la
       aqui seria a mesma URL duas vezes no mesmo arquivo. */
    const paginado = paginar(todas, 1, POR_PAGINA);
    indices = Array.from({ length: Math.max(0, paginado.paginas - 1) }, (_, i) => ({
      url: `${SITE}${enderecoPagina(i + 2)}`,
      lastModified: agora,
      changeFrequency: "weekly" as const,
      priority: 0.4,
    }));
  } catch {
    materias = [];
    indices = [];
  }

  return [...paginas, ...aulas, ...materias, ...indices];
}
