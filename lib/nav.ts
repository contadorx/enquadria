/**
 * O MENU, num lugar só — e agora com três itens.
 *
 * Eram treze rotas em três grupos, e sete delas eram a mesma carteira vista de
 * ângulos diferentes. O contador não tem treze trabalhos: ele tem um (decidir a
 * carteira) e uma administração (o escritório). O menu passou a dizer isso.
 *
 * Configurações, equipe e planos continuam existindo como rotas próprias, mas
 * entram por Escritório — são abas de um assunto, não itens de navegação.
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
    grupo: "Trabalho",
    itens: [
      { href: "/painel", label: "Cockpit", curto: "Cockpit" },
      /* Duas entradas, não uma: ajuda é consultada sob demanda, a Reforma é
         empurrada. Um menu só faria a notícia depender de a pessoa lembrar de
         procurar — que é justamente o que ela não sabe que precisa fazer. */
      { href: "/painel/reforma", label: "Reforma", curto: "Reforma" },
      { href: "/painel/ajuda", label: "Ajuda", curto: "Ajuda" },
      { href: "/painel/chamados", label: "Meus chamados", curto: "Chamados" },
      { href: "/painel/config", label: "Configurações", curto: "Config" },
      /* Planos saiu de dentro de Escritório e virou item próprio.
         Contratar é a ação que o produto mais precisa que aconteça, e ela
         estava dois cliques abaixo de "Configurações" — atrás de um nome que
         ninguém associa a comprar. */
      { href: "/painel/planos", label: "Planos", curto: "Planos" },
      { href: "/painel/indique", label: "Indique", curto: "Indique" },
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
    { href: "/painel/negocio/contas", label: "Contas" },
    { href: "/painel/negocio/cobrancas", label: "Cobranças" },
    { href: "/painel/negocio/emails", label: "E-mails proativos" },
    { href: "/painel/negocio/planos", label: "Planos & Asaas" },
    { href: "/painel/negocio/ajuda", label: "Central de ajuda" },
    { href: "/painel/negocio/chamados", label: "Chamados" },
    { href: "/painel/negocio/assistente", label: "Assistente e NPS" },
  ],
};

/** As abas de Escritório — um assunto, não um grupo de menu. */
export const ABAS_ESCRITORIO: ItemNav[] = [
  { href: "/painel/config", label: "Configurações" },
  { href: "/painel/equipe", label: "Equipe" },
];

/** O menu que a pessoa realmente vê. */
export function navDe(ehSuperadmin: boolean): GrupoNav[] {
  return ehSuperadmin ? [...NAV, NAV_PLATAFORMA] : NAV;
}

/** A barra inferior do celular: os mesmos destinos do menu, ao alcance do polegar. */
export function atalhosDe(ehSuperadmin: boolean): ItemNav[] {
  const base: ItemNav[] = [
    { href: "/painel", label: "Cockpit", curto: "Cockpit" },
    { href: "/painel/reforma", label: "Reforma", curto: "Reforma" },
    { href: "/painel/planos", label: "Planos", curto: "Planos" },
    { href: "/painel/config", label: "Configurações", curto: "Config" },
  ];
  return ehSuperadmin ? [...base, { href: "/painel/negocio", label: "Negócio", curto: "Negócio" }] : base;
}

/** Nome da tela atual, para o cabeçalho do celular saber onde a pessoa está. */
export function tituloDaRota(pathname: string): string {
  if (pathname.startsWith("/painel/empresa")) return "Empresa";
  if (pathname.startsWith("/painel/importar")) return "Importar carteira";
  if (pathname.startsWith("/painel/ajuda/")) return "Ajuda";
  const todos = [...NAV, NAV_PLATAFORMA].flatMap((g) => g.itens).concat(ABAS_ESCRITORIO);
  // a rota mais específica que casa com o caminho vence
  const achado = todos
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (achado) return achado.label;
  return "Cockpit";
}
