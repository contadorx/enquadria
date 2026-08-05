/**
 * A DECISÃO DE SETEMBRO — o curso, num lugar só.
 *
 * A grade vive aqui e não no JSX porque três telas leem a mesma coisa (a página
 * do currículo, a página da aula e o e-mail da sequência). Duas listas separadas
 * divergiriam na primeira aula publicada.
 *
 * REGRA DO CURSO: assistir NUNCA pede cadastro. O e-mail é pedido uma única vez,
 * e só para baixar material. Quem baixa a planilha está declarando intenção —
 * esse é o lead. Quem só assiste é público, e público também vale.
 */

export interface Aula {
  slug: string;
  numero: number;
  titulo: string;
  minutos: number;
  /** o que a pessoa sai sabendo — aparece na grade e no topo da aula */
  resumo: string;
  /** os pontos da aula, na ordem em que são ditos */
  topicos: string[];
  /** onda de publicação (1, 2 ou 3) */
  onda: number;
  /**
   * URL do vídeo; enquanto for null a aula aparece como "em breve".
   *
   * Pode ser o link NORMAL do YouTube — o do botão compartilhar
   * (`https://youtu.be/ID`), o da barra de endereço (`.../watch?v=ID`), o de
   * live ou o de embed. A página da aula converte para a forma de player antes
   * de montar o iframe (ver `urlDeEmbed`). Vimeo idem. Não é preciso lembrar
   * de nenhum formato específico na hora de colar.
   */
  video?: string | null;
  /** materiais liberados nesta aula */
  materiais?: string[];
}

export interface Modulo {
  numero: number;
  titulo: string;
  subtitulo: string;
  aulas: Aula[];
}

export interface Material {
  id: string;
  nome: string;
  descricao: string;
  arquivo: string;
  formato: string;
  aula: number;
  disponivel: boolean;
}

export const CURSO = {
  nome: "A decisão de setembro",
  subtitulo:
    "Como saber quais clientes da sua carteira precisam optar pelo IBS/CBS fora do DAS — e como cobrar por isso.",
  promessa:
    "Em pouco mais de uma hora você sai sabendo quais dos seus clientes precisam decidir até 30 de setembro, como calcular a decisão de cada um e quanto cobrar pelo trabalho. Nove aulas curtas, com a planilha e os modelos que você usa no dia seguinte.",
  selo: "Curso gratuito · sem cadastro para assistir",
  autor: "Leandro Oliveira",
};

export const MODULOS: Modulo[] = [
  {
    numero: 1,
    titulo: "O que está em jogo",
    subtitulo: "A decisão, o prazo e quem ela alcança.",
    aulas: [
      {
        slug: "a-decisao-que-sua-carteira-tem-que-tomar",
        numero: 1,
        titulo: "A decisão que a sua carteira tem que tomar em 30 dias",
        minutos: 7,
        onda: 1,
        // cole aqui o link do YouTube desta aula (o do botão compartilhar serve)
        video: null,
        resumo:
          "O que a Resolução CGSN nº 186/2026 abriu, para quem vale, o que muda em janeiro de 2027 e por que isto não é planejamento de 2033.",
        topicos: [
          "A janela: 1º a 30 de setembro de 2026, efeito de janeiro a junho de 2027",
          "A cadeia legal em uma tela, do texto constitucional à Resolução",
          "O erro de leitura mais comum: achar que o Simples ficou fora da reforma",
          "Por que a opção é semestral — e por que isso muda o seu negócio, não só o do cliente",
        ],
      },
      {
        slug: "quem-ganha-quem-perde-quem-nao-muda",
        numero: 2,
        titulo: "Quem ganha, quem perde e quem não muda nada",
        minutos: 7,
        onda: 1,
        // cole aqui o link do YouTube desta aula (o do botão compartilhar serve)
        video: null,
        resumo:
          "Os três perfis de cliente e o único fator que separa os dois lados: quem aproveita o crédito na outra ponta.",
        topicos: [
          "Vender para consumidor final: por que não há decisão a tomar",
          "Vender para empresa: onde o crédito nasce e por que ele pressiona o preço",
          "Simples vendendo para Simples gera crédito zero — o erro que derruba a análise",
          "A pergunta de dez segundos que resolve a maior parte da carteira",
        ],
      },
      {
        slug: "abra-a-sua-carteira-agora",
        numero: 3,
        titulo: "Abra a sua carteira agora",
        minutos: 7,
        onda: 1,
        // cole aqui o link do YouTube desta aula (o do botão compartilhar serve)
        video: null,
        resumo:
          "Aula de fazer, não de ouvir. Ao final você tem, na sua tela, o número de clientes que precisam decidir.",
        topicos: [
          "Exportar a lista de clientes do seu sistema: as quatro colunas que bastam",
          "Como o CNAE classifica em urgente, avaliar, baixo risco e permanência",
          "As quatro exceções que a triagem não pega — e como tratar cada uma",
          "O número que você tem agora e o que fazer com ele ainda hoje",
        ],
        materiais: ["triagem"],
      },
    ],
  },
  {
    numero: 2,
    titulo: "A conta",
    subtitulo: "Como a decisão se calcula, no papel.",
    aulas: [
      {
        slug: "a-aliquota-que-ninguem-calcula-direito",
        numero: 4,
        titulo: "A alíquota que ninguém calcula direito",
        minutos: 9,
        onda: 2,
        // cole aqui o link do YouTube desta aula (o do botão compartilhar serve)
        video: null,
        resumo:
          "Dois erros que empurram a decisão para o lado errado: usar a nominal do topo da faixa, e calcular por um anexo só a empresa que segrega receita.",
        topicos: [
          "(RBT12 × nominal − parcela a deduzir) ÷ RBT12, feito no papel",
          "Onde encontrar a partilha de PIS/Cofins da faixa — e por que ela muda de anexo para anexo",
          "Receita segregada: o dDAS é a soma ponderada, não o de um anexo",
          "O caso em que a segregação troca a resposta do laudo, com a conta na tela",
          "Fator R: onde a receita de serviço cai, entre o Anexo III e o V",
        ],
        materiais: ["conta"],
      },
      {
        slug: "as-seis-contas-da-decisao",
        numero: 5,
        titulo: "As seis contas da decisão",
        minutos: 9,
        onda: 2,
        // cole aqui o link do YouTube desta aula (o do botão compartilhar serve)
        video: null,
        resumo:
          "Receita qualificada, carga híbrida, custo líquido, repasse de equilíbrio, folga do adquirente e folga da negociação.",
        topicos: [
          "As seis fórmulas encadeadas, com substituição numérica",
          "De onde vem o dDAS quando a empresa tem receita em mais de um anexo",
          "A regra de bolso: se o repasse estoura o ganho do comprador, não fecha",
          "As cinco saídas possíveis e o que cada uma exige do empresário",
          "A banda do sublimite de R$ 3,6 milhões e por que ela devolve a decisão ao dono",
        ],
      },
      {
        slug: "o-numero-que-voce-ainda-nao-tem",
        numero: 6,
        titulo: "O número que você ainda não tem",
        minutos: 8,
        onda: 2,
        // cole aqui o link do YouTube desta aula (o do botão compartilhar serve)
        video: null,
        resumo:
          "A alíquota de referência só é fixada até 31/10/2026 — depois de a janela fechar. Como decidir com esse buraco.",
        topicos: [
          "Por que a decisão é tomada antes de a alíquota existir",
          "Dois cenários no mesmo papel, e como apresentá-los sem assustar",
          "Sensibilidade em três linhas: o que muda se a premissa ceder",
          "A frase que protege você na reunião — e por que ela precisa estar escrita",
        ],
      },
    ],
  },
  {
    numero: 3,
    titulo: "O serviço",
    subtitulo: "Como isso vira honorário.",
    aulas: [
      {
        slug: "quanto-cobrar",
        numero: 7,
        titulo: "Quanto cobrar (e como apresentar)",
        minutos: 9,
        onda: 3,
        // cole aqui o link do YouTube desta aula (o do botão compartilhar serve)
        video: null,
        resumo:
          "Por empresa analisada, não por hora. A conta que o empresário entende e o erro de dar o diagnóstico de graça.",
        topicos: [
          "Por que cobrar por hora destrói o preço deste serviço",
          "A faixa que o mercado aceita e como ancorar",
          "O que o cliente arrisca em 2027 contra o que ele paga agora",
          "O diagnóstico cobrado como porta de entrada",
        ],
        materiais: ["proposta"],
      },
      {
        slug: "o-papel-que-sustenta-o-preco",
        numero: 8,
        titulo: "O papel que sustenta o preço",
        minutos: 8,
        onda: 3,
        // cole aqui o link do YouTube desta aula (o do botão compartilhar serve)
        video: null,
        resumo:
          "Por que “analisei e recomendo permanecer” não é entregável, e o que um laudo precisa ter para sobreviver a uma pergunta do Fisco.",
        topicos: [
          "As dez seções, com a memória de cálculo no centro",
          "Premissa com origem marcada: informada, estimada ou padrão",
          "O termo de ciência e por que ele protege os dois lados",
          "Como fazer isso em escala — e a única vez que eu falo do meu sistema",
        ],
        materiais: ["roteiro"],
      },
      {
        slug: "trinta-dias-na-ordem-certa",
        numero: 9,
        titulo: "30 dias, na ordem certa",
        minutos: 8,
        onda: 3,
        // cole aqui o link do YouTube desta aula (o do botão compartilhar serve)
        video: null,
        resumo:
          "O calendário operacional semana a semana, o que fica para novembro e o que volta em março.",
        topicos: [
          "Semana 1 a 4: o que precisa estar pronto ao fim de cada uma",
          "As datas que não se movem",
          "O cancelamento até o último dia de novembro como segunda onda cobrável",
          "Março de 2027: a mesma carteira, a mesma pergunta",
        ],
        materiais: ["calendario"],
      },
    ],
  },
];

export const MATERIAIS: Material[] = [
  {
    id: "triagem",
    nome: "Planilha de triagem da carteira",
    descricao:
      "Cole CNPJ, razão social e CNAE. A planilha classifica em urgente, avaliar, baixo risco e permanência, e conta quantos clientes precisam decidir.",
    arquivo: "/curso/Enquadria_Planilha_Triagem_Carteira.xlsx",
    formato: "XLSX",
    aula: 3,
    disponivel: true,
  },
  {
    id: "conta",
    nome: "Planilha da conta",
    descricao:
      "As seis fórmulas encadeadas com a tabela dos cinco anexos embutida. Digite a RBT12 e as premissas; sai o repasse de equilíbrio nos dois cenários.",
    arquivo: "/curso/Enquadria_Planilha_Da_Conta.xlsx",
    formato: "XLSX",
    aula: 4,
    disponivel: true,
  },
  {
    id: "proposta",
    nome: "Modelo de proposta",
    descricao:
      "Uma página: o que é o serviço, o que o cliente recebe, prazo e preço. Editável, com o seu nome e o seu CRC.",
    arquivo: "/curso/Enquadria_Modelo_Proposta.docx",
    formato: "DOCX",
    aula: 7,
    disponivel: true,
  },
  {
    id: "roteiro",
    nome: "Roteiro da reunião de decisão",
    descricao:
      "Os seis blocos da reunião, com o que dizer, o que perguntar e o que anotar. Mais as oito objeções mais comuns e a resposta de cada uma.",
    arquivo: "/curso/Enquadria_Roteiro_Reuniao_Decisao.docx",
    formato: "DOCX",
    aula: 8,
    disponivel: true,
  },
  {
    id: "calendario",
    nome: "Calendário dos 30 dias",
    descricao:
      "Semana a semana, o que fazer até 30 de setembro — e o que fica para outubro e novembro.",
    arquivo: "/curso/Enquadria_Calendario_30_Dias.docx",
    formato: "DOCX",
    aula: 9,
    disponivel: true,
  },
];

export const TODAS_AULAS: Aula[] = MODULOS.flatMap((m) => m.aulas);

export function aulaPorSlug(slug: string): { aula: Aula; modulo: Modulo } | null {
  for (const m of MODULOS) {
    const a = m.aulas.find((x) => x.slug === slug);
    if (a) return { aula: a, modulo: m };
  }
  return null;
}

export function materiaisDe(ids?: string[]): Material[] {
  if (!ids?.length) return [];
  return MATERIAIS.filter((m) => ids.includes(m.id));
}

export const TOTAL_MINUTOS = TODAS_AULAS.reduce((s, a) => s + a.minutos, 0);
export const TOTAL_AULAS = TODAS_AULAS.length;
export const AULAS_NO_AR = TODAS_AULAS.filter((a) => !!a.video).length;

/** o aviso que acompanha qualquer número dito no curso */
export const RESSALVA =
  "A alíquota de referência de IBS/CBS só é fixada por Resolução do Senado até 31/10/2026 — depois do fechamento da janela. Todo número do curso é estimativa de cenário, e a responsabilidade técnica é do contador que assina.";

/* ══════════════════════════════════════════════════════════════════════════
 * O VÍDEO VEM DO BANCO — o código é só o texto da aula.
 *
 * O link do vídeo saiu de `lib/curso.ts` e foi para a tabela `curso_videos`
 * (migration 0038), editável em Negócio → Curso. Publicar aula deixou de
 * exigir commit e deploy.
 *
 * O campo `video` continua existindo aqui como PADRÃO: se um dia a tabela
 * estiver vazia ou o banco fora do ar, a página cai no que está no código em
 * vez de esconder um vídeo que já foi publicado. O banco tem precedência
 * porque é onde está a última decisão de quem publica.
 * ══════════════════════════════════════════════════════════════════════════ */

/** { slug da aula → url do vídeo }, como vem da tabela */
export type MapaVideos = Record<string, string | null | undefined>;

/**
 * { slug → duração REAL medida depois de gravar }.
 *
 * O `minutos` que está lá em cima, em cada aula, é ESTIMATIVA de planejamento —
 * e as estimativas deste curso estão erradas: a ementa publica 9, 9 e 8 minutos
 * para as aulas 4, 5 e 6, e o roteiro delas, a 155 palavras por minuto, mede
 * cerca de 16 cada. Ninguém acerta a duração antes de gravar, e insistir nisso
 * só produz um número que o aluno confere no player e desmente.
 *
 * O banco tem precedência porque é onde está o número medido.
 */
export type MapaMinutos = Record<string, number | null | undefined>;

/** aceita só duração plausível — o mesmo limite da trava do banco (0046) */
function minutosValidos(m: unknown): number | null {
  return typeof m === "number" && Number.isFinite(m) && m > 0 && m <= 600 ? Math.round(m) : null;
}

/**
 * Devolve os módulos com o vídeo e a duração do banco aplicados.
 *
 * Função pura: recebe os mapas já lidos, não consulta nada. É isso que a torna
 * testável e que impede a página do curso de virar um lugar onde regra de
 * negócio se esconde atrás de uma consulta.
 *
 * Vazio ou em branco no banco NÃO apaga o do código — string vazia é o estado
 * "cadastrei e depois limpei o campo", que não deve derrubar uma aula no ar
 * por acidente. Para tirar do ar, apaga-se a linha.
 */
export function comVideos(
  modulos: Modulo[],
  mapa: MapaVideos | null | undefined,
  minutos?: MapaMinutos | null
): Modulo[] {
  if (!mapa && !minutos) return modulos;
  return modulos.map((m) => ({
    ...m,
    aulas: m.aulas.map((a) => {
      const doBanco = mapa?.[a.slug];
      const url = typeof doBanco === "string" ? doBanco.trim() : "";
      const min = minutosValidos(minutos?.[a.slug]);
      if (!url && min == null) return a;
      return { ...a, ...(url ? { video: url } : {}), ...(min != null ? { minutos: min } : {}) };
    }),
  }));
}

/** o mesmo, para uma aula só */
export function videoDaAula(aula: Aula, mapa: MapaVideos | null | undefined): string | null {
  const doBanco = mapa?.[aula.slug];
  const url = typeof doBanco === "string" ? doBanco.trim() : "";
  return url || aula.video || null;
}

/** a duração que vale: a medida, se houver; senão a estimativa do código */
export function minutosDaAula(aula: Aula, minutos: MapaMinutos | null | undefined): number {
  return minutosValidos(minutos?.[aula.slug]) ?? aula.minutos;
}

/**
 * O TOTAL DO CURSO com as durações medidas — usado na grade e no certificado.
 *
 * `TOTAL_MINUTOS` (a constante lá em cima) continua existindo como padrão para
 * quem não tem o mapa em mãos, mas quem imprime número para o aluno deve usar
 * esta função: um certificado que diz "3h20" quando o curso tem 5h é um
 * documento que o próprio aluno desmente somando os players.
 */
export function totalMinutos(minutos: MapaMinutos | null | undefined): number {
  return TODAS_AULAS.reduce((s, a) => s + minutosDaAula(a, minutos), 0);
}
