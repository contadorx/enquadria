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
  /** URL do vídeo; enquanto for null a aula aparece como "em breve" */
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
        resumo:
          "Os três perfis de cliente e o único fator que separa os dois lados: quem aproveita o crédito na outra ponta.",
        topicos: [
          "Vender para consumidor final: por que não há decisão a tomar",
          "Vender para empresa: onde o crédito nasce e por que ele pressiona o preço",
          "Simples vendendo para Simples gera crédito zero — o erro que derruba a análise",
          "A pergunta de dez segundos que descarta a maior parte da carteira",
        ],
      },
      {
        slug: "abra-a-sua-carteira-agora",
        numero: 3,
        titulo: "Abra a sua carteira agora",
        minutos: 7,
        onda: 1,
        resumo:
          "Aula de fazer, não de ouvir. Ao final você tem, na sua tela, o número de clientes que precisam decidir.",
        topicos: [
          "Exportar a lista de clientes do seu sistema: as quatro colunas que bastam",
          "Como o CNAE classifica em urgente, avaliar, baixo risco e descarte",
          "As três exceções que a triagem não pega — e como tratar cada uma",
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
        resumo:
          "Por que a nominal do topo da faixa superestima o custo, e como sair da RBT12 para a alíquota efetiva.",
        topicos: [
          "(RBT12 × nominal − parcela a deduzir) ÷ RBT12, feito no papel",
          "Onde encontrar a partilha de PIS/Cofins da faixa",
          "Quanto a diferença entre nominal e efetiva desloca a decisão",
          "Fator R: quando o anexo declarado não bate com a folha",
        ],
        materiais: ["conta"],
      },
      {
        slug: "as-seis-contas-da-decisao",
        numero: 5,
        titulo: "As seis contas da decisão",
        minutos: 9,
        onda: 2,
        resumo:
          "Receita qualificada, carga híbrida, custo líquido, repasse de equilíbrio, folga do adquirente e folga da negociação.",
        topicos: [
          "As seis fórmulas encadeadas, com substituição numérica",
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
      "Cole CNPJ, razão social e CNAE. A planilha classifica em urgente, avaliar, baixo risco e descarte, e conta quantos clientes precisam decidir.",
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
