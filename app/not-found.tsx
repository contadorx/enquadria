/**
 * O CSS DO SITE, IMPORTADO NA PRÓPRIA PÁGINA.
 *
 * Ele morava num layout de route group (`app/(site)/layout.tsx`) — e o route
 * group foi desfeito porque quebrava o build na Vercel: o empacotador não
 * emitia o `page_client-reference-manifest.js` do grupo e o deploy morria
 * DEPOIS de compilar com sucesso (ENOENT no rastreamento dos arquivos).
 *
 * Importar aqui dá o mesmo resultado prático: o Next carrega este CSS só nas
 * rotas que o importam, então o painel continua sem pagar 35 KB de estilo
 * institucional. E como o import acontece depois do `globals.css` do layout
 * raiz, as regras do site continuam vencendo as do Tailwind onde as duas
 * falarem da mesma coisa.
 */
import "./site.css";
import { FolhaDoSite } from "@/components/FolhaDoSite";

/**
 * A PÁGINA QUE O CLIENTE DO SEU CLIENTE VÊ.
 *
 * Sem este arquivo, todo `notFound()` das seis páginas públicas — laudo, termo,
 * assinar, coleta, comparativo, abertura — caía na tela padrão do Next: fundo
 * branco, "404 | This page could not be found", em inglês, sem marca e sem
 * saída. Quem vê isso é o empresário que recebeu um link vencido, e a conclusão
 * dele é que o contador mandou link quebrado.
 */
export default function NaoEncontrada() {
  return <FolhaDoSite html={"<section class=\"page-hero\">\n  <div class=\"container\">\n    <span class=\"kicker kicker--ghost\"><span class=\"dot\"></span> Erro 404</span>\n    <h1 style=\"margin-top:14px\">Esta p\u00e1gina n\u00e3o existe.</h1>\n    <p class=\"lead\">Talvez o endere\u00e7o tenha mudado. O que provavelmente voc\u00ea procura est\u00e1 aqui embaixo.</p>\n    <div class=\"cta-row\" style=\"margin-top:24px\">\n      <a href=\"/\" class=\"btn btn-primary\">Ir para o in\u00edcio</a>\n      <a href=\"/guia/\" class=\"btn btn-ghost-light\">Guia</a>\n      <a href=\"/curso/\" class=\"btn btn-ghost-light\">Curso gratuito</a>\n      <a href=\"https://app.enquadria.com.br\" class=\"btn btn-ghost-light\">Entrar no app</a>\n    </div>\n  </div>\n</section>"} scripts={[]} />;
}
