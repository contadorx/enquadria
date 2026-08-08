import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

/**
 * O ROBOTS — e ele existe por LGPD antes de existir por SEO.
 *
 * Até 08/08/2026 este arquivo não existia. Sem ele, nada impedia o Google de
 * indexar `/laudo/[token]`, `/termo/[token]`, `/assinar/[token]` e
 * `/coleta/[token]` — páginas públicas por design, porque o cliente precisa
 * abrir sem login, mas que trazem razão social, CNPJ, RBT12 e a decisão
 * tributária de uma empresa. Um token que vaze num sitemap ou num referer vira
 * página indexada, e aí o dado de um cliente do contador está no buscador.
 *
 * A regra é simples e vale para os dois motivos: só entra no índice o que foi
 * escrito PARA o índice.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/painel/", // a carteira inteira do contador
          "/doc/", // as vias internas dos documentos
          "/laudo/", // via pública do laudo — dado de cliente
          "/termo/",
          "/assinar/",
          "/coleta/",
          "/comparativo/",
          "/abertura/",
          "/certificado/",
          "/api/",
          "/login",
          "/redefinir",
          "/descadastro",
        ],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
