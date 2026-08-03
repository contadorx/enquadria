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
  /** chave do contador de novidades exibido ao lado do item */
  marcador?: "reforma";
}

export interface GrupoNav {
  grupo: string;
  itens: ItemNav[];
}

/**
 * O MENU — três destinos no dia a dia, e não sete.
 *
 * A lista tinha crescido para sete itens de trabalho e oito de plataforma. Um
 * menu de quinze linhas não é navegação: é um índice que a pessoa lê toda vez
 * porque nenhuma opção fica na memória.
 *
 * O critério do reagrupamento foi a PERGUNTA que leva a pessoa até ali:
 *
 *   "o que eu faço agora?"      → Cockpit
 *   "como isso funciona?"       → Ajuda (com Reforma e chamados dentro)
 *   "e a minha conta?"          → Escritório (config, equipe, planos, indique)
 *
 * Reforma e Ajuda continuam SEPARADAS como telas — uma é cronológica, a outra
 * é por tema —, mas entram pelo mesmo lugar. Quem tem dúvida não sabe de
 * antemão se ela é "de ajuda" ou "da Reforma"; obrigar essa escolha no menu é
 * transferir para o usuário uma classificação que é nossa.
 */
export const NAV: GrupoNav[] = [
  {
    grupo: "Trabalho",
    itens: [
      { href: "/painel", label: "Cockpit", curto: "Cockpit" },
      /**
       * REFORMA FORA DA AJUDA — correção de 03/08.
       *
       * Eu tinha juntado as duas sob "Ajuda" argumentando que quem tem dúvida
       * não sabe classificá-la. O argumento vale para a ajuda e é FALSO para a
       * Reforma: ela não é procurada, é EMPURRADA. Quem não sabe que saiu uma
       * regulamentação nova não vai clicar em "Ajuda" para descobrir.
       *
       * Escondê-la dentro de outro item contradizia o desenho que eu mesmo
       * tinha escrito duas rodadas antes — e mata o único motivo recorrente que
       * o contador tem para voltar ao app fora da janela.
       *
       * O marcador de não lidos existe pela mesma razão: conteúdo empurrado sem
       * aviso é conteúdo não lido.
       */
      { href: "/painel/reforma", label: "Reforma", curto: "Reforma", marcador: "reforma" },
      { href: "/painel/ajuda", label: "Ajuda", curto: "Ajuda" },
      /* Planos volta a ser item próprio. Eu tinha feito isso a seu pedido e
         desfiz sem querer na reorganização: contratar é a ação que o produto
         mais precisa que aconteça e não pode ficar dentro de "Configurações". */
      { href: "/painel/planos", label: "Planos", curto: "Planos" },
      /* "Configurações" e não "Escritório": nome de administração deve ser
         discreto. O destaque é do Cockpit e da Reforma. */
      { href: "/painel/config", label: "Configurações", curto: "Config" },
    ],
  },
];

export const NAV_PLATAFORMA: GrupoNav = {
  grupo: "Plataforma",
  itens: [
    { href: "/painel/negocio", label: "Visão geral", curto: "Negócio" },
    { href: "/painel/negocio/contas", label: "Contas e receita" },
    { href: "/painel/negocio/emails", label: "Comunicação" },
    { href: "/painel/negocio/chamados", label: "Suporte" },
    { href: "/painel/negocio/ajuda", label: "Conteúdo" },
  ],
};

/** As abas de Escritório — um assunto, não um grupo de menu. */
export const ABAS_ESCRITORIO: ItemNav[] = [
  { href: "/painel/config", label: "Configurações" },
  { href: "/painel/equipe", label: "Equipe" },
  { href: "/painel/indique", label: "Indique um colega" },
];

/**
 * Ajuda e chamados: um assunto só. A Reforma saiu daqui — ela é empurrada, e
 * conteúdo empurrado escondido atrás de um menu de dúvidas não chega em
 * ninguém.
 */
export const ABAS_AJUDA: ItemNav[] = [
  { href: "/painel/ajuda", label: "Central de ajuda" },
  /**
   * O CURSO ENTRA AQUI — e continua público lá fora.
   *
   * `/curso` já existe, fora da área logada, e precisa continuar assim: ele é
   * o ativo de aquisição do tráfego frio, e exigir cadastro para assistir
   * mataria justamente o público que ele serve.
   *
   * O que faltava era o caminho de VOLTA: quem já é usuário não tem como achar
   * as aulas por dentro do produto. Mesma rota, duas portas.
   */
  { href: "/curso", label: "Curso" },
  { href: "/painel/chamados", label: "Meus chamados" },
];

/** As telas de gestão que saíram do menu da plataforma. */
export const ABAS_PLATAFORMA: ItemNav[] = [
  { href: "/painel/negocio/contas", label: "Contas" },
  { href: "/painel/negocio/cobrancas", label: "Cobranças" },
  { href: "/painel/negocio/planos", label: "Planos & Asaas" },
];

export const ABAS_SUPORTE: ItemNav[] = [
  { href: "/painel/negocio/chamados", label: "Chamados" },
  { href: "/painel/negocio/assistente", label: "Assistente e NPS" },
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
  ];
  return ehSuperadmin ? [...base, { href: "/painel/negocio", label: "Negócio", curto: "Negócio" }] : base;
}

/** Nome da tela atual, para o cabeçalho do celular saber onde a pessoa está. */
export function tituloDaRota(pathname: string): string {
  if (pathname.startsWith("/painel/empresa")) return "Empresa";
  if (pathname.startsWith("/painel/importar")) return "Importar carteira";
  if (pathname.startsWith("/painel/ajuda/")) return "Ajuda";
  const todos = [...NAV, NAV_PLATAFORMA]
    .flatMap((g) => g.itens)
    .concat(ABAS_ESCRITORIO, ABAS_AJUDA, ABAS_PLATAFORMA, ABAS_SUPORTE);
  // a rota mais específica que casa com o caminho vence
  const achado = todos
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (achado) return achado.label;
  return "Cockpit";
}
