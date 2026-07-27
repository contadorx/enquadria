/**
 * O mapa de navegação do painel, num lugar só.
 *
 * Antes ele vivia dentro do layout, que é um componente de servidor — e por
 * isso o menu do celular (que precisa de estado) não tinha como reaproveitá-lo.
 * Duas listas separadas divergiriam na primeira tela nova.
 */

export interface ItemNav {
  href: string;
  label: string;
  /** rótulo curto para a barra inferior do celular */
  curto?: string;
}

export interface GrupoNav {
  grupo: string;
  itens: ItemNav[];
}

export const NAV: GrupoNav[] = [
  {
    grupo: "Janela atual",
    itens: [
      { href: "/painel", label: "Painel", curto: "Painel" },
      { href: "/painel/importar", label: "Importar", curto: "Importar" },
      { href: "/painel/carteira", label: "Carteira", curto: "Carteira" },
      { href: "/painel/fila", label: "Fila de análise", curto: "Fila" },
      { href: "/painel/lote", label: "Análise em lote", curto: "Lote" },
      { href: "/painel/entrega", label: "Entrega", curto: "Entrega" },
      { href: "/painel/janela", label: "Painel da janela", curto: "Janela" },
    ],
  },
  {
    grupo: "Acompanhamento",
    itens: [
      { href: "/painel/radar", label: "Radar da transição" },
      { href: "/painel/revisao", label: "Revisão da carteira" },
      { href: "/painel/comparativo", label: "Comparativo de regimes" },
    ],
  },
  {
    grupo: "Escritório",
    itens: [
      { href: "/painel/equipe", label: "Equipe" },
      { href: "/painel/planos", label: "Planos" },
      { href: "/painel/config", label: "Configurações" },
    ],
  },
];

/** Os quatro destinos da barra inferior do celular — o caminho do trabalho. */
export const ATALHOS: ItemNav[] = [
  { href: "/painel", label: "Painel", curto: "Painel" },
  { href: "/painel/carteira", label: "Carteira", curto: "Carteira" },
  { href: "/painel/fila", label: "Fila de análise", curto: "Fila" },
  { href: "/painel/entrega", label: "Entrega", curto: "Entrega" },
];

/** Nome da tela atual, para o cabeçalho do celular saber onde a pessoa está. */
export function tituloDaRota(pathname: string): string {
  const todos = NAV.flatMap((g) => g.itens);
  // a rota mais específica que casa com o caminho vence
  const achado = todos
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (achado) return achado.label;
  if (pathname.startsWith("/painel/empresa")) return "Empresa";
  return "Painel";
}
