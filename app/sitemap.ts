import type { MetadataRoute } from "next";
import { SITE, PAGINAS_PUBLICAS } from "@/lib/site";
import { TODAS_AULAS } from "@/lib/curso";
import { materiasPublicas } from "@/lib/radar-publico";
import { enderecoDaMateria } from "@/lib/reforma-publica";

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
   * AS PÁGINAS `?p=2`, `?p=3`… DO ÍNDICE NÃO ENTRAM AQUI — 08/08/2026.
   *
   * O DEFEITO: este arquivo publicava `/reforma?p=2`, `?p=3`… enquanto a
   * própria resposta dessas URLs trazia `canonical: "/reforma"` cravado, e o
   * JSON-LD delas declarava a URL paginada. Três documentos sobre a mesma
   * página dizendo três coisas: o sitemap pedia para indexar um endereço, o
   * canonical dizia que aquele endereço não existe como página própria, e o
   * dado estruturado descrevia justamente o endereço que o canonical negava.
   * Quando as declarações se contradizem, quem escolhe é o buscador — e o que
   * ele escolhe não é decisão nossa.
   *
   * A CORREÇÃO tem duas metades. A outra está em `app/reforma/page.tsx`: o
   * canonical passou a ser o da própria página pedida, então a resposta não se
   * desmente mais. Aqui, a escolha foi PARAR DE PEDIR indexação para elas: da
   * página 2 em diante, o que há de próprio são ~250 a 550 caracteres de
   * título e resumo contra 1038 de cabeçalho, rodapé e faixa de CTA repetidos.
   * Sitemap é o pedido de indexação mais explícito que existe, e gastá-lo em
   * página que é quase toda chassi ensina o buscador a esperar pouco do
   * domínio.
   *
   * O que NÃO se perde: as paginadas continuam alcançáveis e seguíveis pelos
   * links da paginação, e cada matéria tem entrada própria neste sitemap logo
   * abaixo — a descoberta do conteúdo nunca dependeu da página 2.
   */

  /**
   * O RADAR — e o banco pode não responder.
   *
   * O sitemap é lido por robô, sem ninguém olhando. Se a consulta falhar, o
   * certo é entregar o sitemap MENOR e não um erro: sitemap com 500 faz o
   * buscador parar de pedir por um tempo, e aí some do índice o que já estava
   * lá. Por isso o catch devolve lista vazia em vez de estourar.
   */
  let materias: MetadataRoute.Sitemap = [];
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
  } catch {
    materias = [];
  }

  return [...paginas, ...aulas, ...materias];
}
