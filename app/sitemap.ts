import type { MetadataRoute } from "next";
import { SITE, PAGINAS_PUBLICAS } from "@/lib/site";
import { TODAS_AULAS } from "@/lib/curso";

/**
 * O SITEMAP.
 *
 * Só entra o que é público E indexável. As aulas do curso entram uma a uma
 * porque são o ativo de aquisição de tráfego frio — cada uma responde a uma
 * pergunta diferente, e é assim que o buscador as trata.
 *
 * O que NUNCA pode entrar aqui: qualquer rota com token. Sitemap é o convite
 * mais explícito que existe para indexar — pôr um `/laudo/[token]` aqui seria
 * entregar o documento de um cliente ao índice de propósito. O robots já
 * bloqueia; esta lista é a segunda tranca, e as duas são intencionais.
 */
export default function sitemap(): MetadataRoute.Sitemap {
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

  return [...paginas, ...aulas];
}
