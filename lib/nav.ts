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
      /**
       * ESTUDOS — os dois serviços que não pertencem a uma empresa da carteira.
       *
       * O comparativo de regimes existia só DENTRO do dossiê de uma empresa, e
       * por isso ninguém achava: para simular o regime de um prospecto era
       * preciso primeiro cadastrar uma empresa que não é cliente. O estudo de
       * abertura tem a mesma natureza — atende quem ainda não é cliente.
       *
       * Os dois no primeiro nível, juntos: são o que mantém o produto vendendo
       * depois que a janela de setembro fecha.
       */
      { href: "/painel/estudos", label: "Estudos", curto: "Estudos" },
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

/**
 * PLATAFORMA — UM item de menu, e todo o resto dentro da página.
 *
 * Eram seis links no menu lateral para telas que só o superadmin abre. Isso
 * dobrava o tamanho do menu de quem trabalha na carteira todo dia — o menu de
 * administração competindo por espaço com o de trabalho.
 *
 * Agora o menu leva a um lugar só e a navegação interna vive nas abas da
 * própria área (components/NegocioAbas).
 */
export const NAV_PLATAFORMA: GrupoNav = {
  grupo: "Plataforma",
  itens: [{ href: "/painel/negocio", label: "Negócio", curto: "Negócio" }],
};

/** As abas de Escritório — um assunto, não um grupo de menu. */
export const ABAS_ESCRITORIO: ItemNav[] = [
  { href: "/painel/config", label: "Configurações" },
  { href: "/painel/equipe", label: "Equipe" },
  /* administração de carteira, não trabalho da janela: quem entra aqui está
     corrigindo cadastro. Sem esta aba, arquivar seria sumiço sem volta. */
  { href: "/painel/arquivadas", label: "Arquivadas" },
  { href: "/painel/indique", label: "Indique um colega" },
];

/**
 * DUAS DUPLAS, e a divisão é pela PERGUNTA que a pessoa está fazendo.
 *
 * APRENDER (Reforma + Curso): "o que mudou e como se faz". Conteúdo que é
 * EMPURRADO — ninguém acorda com vontade de estudar reforma tributária, e por
 * isso os dois andam juntos: quem abre a Reforma para ler a novidade é
 * exatamente quem pode querer a aula sobre ela.
 *
 * RESOLVER (Central de ajuda + Meus chamados): "estou travado agora". É o
 * outro estado mental, e misturar os dois fazia a Reforma competir com um
 * problema em aberto — que sempre ganha.
 *
 * O curso continua PÚBLICO lá fora: `/curso` é o ativo de aquisição do tráfego
 * frio, e exigir cadastro para assistir mataria o público que ele serve. Aqui
 * é só o caminho de volta, para quem já é usuário. Mesma rota, duas portas.
 */
export const ABAS_APRENDER: ItemNav[] = [
  { href: "/painel/reforma", label: "Reforma" },
  { href: "/curso", label: "Curso" },
];

export const ABAS_AJUDA: ItemNav[] = [
  { href: "/painel/ajuda", label: "Central de ajuda" },
  { href: "/painel/chamados", label: "Meus chamados" },
];

/** os dois serviços que atendem quem ainda não está na carteira */
export const ABAS_ESTUDOS: ItemNav[] = [
  { href: "/painel/estudos", label: "Comparativo de regimes" },
  { href: "/painel/abertura", label: "Abertura de empresa" },
];

/**
 * TODA a navegação da plataforma, numa lista só.
 *
 * Eram duas listas (`ABAS_PLATAFORMA` e `ABAS_SUPORTE`) mais uma terceira,
 * escrita à mão dentro de `NegocioAbas` — três lugares para a mesma coisa, e a
 * faixa da tela já não batia com o que o menu dizia existir.
 *
 * A ordem é a do uso: dinheiro primeiro, depois relacionamento, e por último
 * conteúdo — que se mexe uma vez por mês, não por dia.
 */
export const ABAS_NEGOCIO: ItemNav[] = [
  { href: "/painel/negocio", label: "Visão" },
  { href: "/painel/negocio/contas", label: "Contas" },
  { href: "/painel/negocio/registros", label: "Registros" },
  /* a tabela de escritórios saiu daqui e foi para Contas em 05/08/2026: as duas
     liam fontes diferentes do mesmo escritório. Aqui ficou o que é só cobrança —
     a régua e o extrato de faturas. */
  { href: "/painel/negocio/cobrancas", label: "Faturas & régua" },
  { href: "/painel/negocio/planos", label: "Planos & Asaas" },
  { href: "/painel/negocio/emails", label: "E-mails proativos" },
  { href: "/painel/negocio/chamados", label: "Suporte" },
  { href: "/painel/negocio/assistente", label: "Assistente e NPS" },
  { href: "/painel/negocio/ajuda", label: "Conteúdo" },
  /* onde se publica aula: o link do vídeo saiu do código na 0038 */
  { href: "/painel/negocio/curso", label: "Curso" },
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
    .concat(ABAS_ESCRITORIO, ABAS_APRENDER, ABAS_AJUDA, ABAS_ESTUDOS, ABAS_NEGOCIO);
  // a rota mais específica que casa com o caminho vence
  const achado = todos
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (achado) return achado.label;
  return "Cockpit";
}
