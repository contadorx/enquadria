import "./site.css";

/**
 * O LAYOUT DO SITE — e o motivo de ele existir separado.
 *
 * O CSS do site é importado AQUI, e não no layout raiz, porque o Next só carrega
 * o CSS de um segmento nas rotas daquele segmento. O painel não paga o download
 * de 35 KB de estilo institucional, e o site não herda decisões visuais tomadas
 * para uma tela de trabalho.
 *
 * A ordem também importa: como este import acontece DEPOIS do `globals.css` do
 * layout raiz, as regras do site vencem as do Tailwind onde as duas falarem da
 * mesma coisa (fundo do body, tipografia dos títulos, listas). Era o risco real
 * desta migração — o preflight do Tailwind zera margem de título e marcador de
 * lista, e um site institucional depende dos dois.
 */
export default function LayoutDoSite({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
