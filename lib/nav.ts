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

/**
 * Grupo do DONO da plataforma. Fora do NAV principal de propósito: só aparece
 * para quem tem is_superadmin, e o painel do contador não pode sequer saber
 * que ele existe.
 */
export const NAV_PLATAFORMA: GrupoNav = {
  grupo: "Plataforma",
  itens: [
    { href: "/painel/negocio", label: "Negócio", curto: "Negócio" },
    { href: "/painel/negocio/cobrancas", label: "Cobranças" },
    { href: "/painel/negocio/emails", label: "E-mails proativos" },
    { href: "/painel/negocio/planos", label: "Planos & Asaas" },
  ],
};

/** O menu que a pessoa realmente vê. */
export function navDe(ehSuperadmin: boolean): GrupoNav[] {
  return ehSuperadmin ? [...NAV, NAV_PLATAFORMA] : NAV;
}

/** Os quatro destinos da barra inferior do celular — o caminho do trabalho. */
export const ATALHOS: ItemNav[] = [
  { href: "/painel", label: "Painel", curto: "Painel" },
  { href: "/painel/carteira", label: "Carteira", curto: "Carteira" },
  { href: "/painel/fila", label: "Fila de análise", curto: "Fila" },
  { href: "/painel/entrega", label: "Entrega", curto: "Entrega" },
];

/** Nome da tela atual, para o cabeçalho do celular saber onde a pessoa está. */
export function tituloDaRota(pathname: string): string {
  const todos = [...NAV, NAV_PLATAFORMA].flatMap((g) => g.itens);
  // a rota mais específica que casa com o caminho vence
  const achado = todos
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (achado) return achado.label;
  if (pathname.startsWith("/painel/empresa")) return "Empresa";
  return "Painel";
}
