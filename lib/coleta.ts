/**
 * O QUE O CONTADOR NÃO TEM COMO SABER SOZINHO.
 *
 * Das oito perguntas da análise, três o contador responde olhando a
 * escrituração — folha, faturamento, anexo. As outras cinco não estão em lugar
 * nenhum da contabilidade:
 *
 *   · quanto das vendas vai para outra EMPRESA e quanto vai para o balcão;
 *   · se essas empresas são grandes (fora do Simples) ou pequenas;
 *   · se algum cliente já cobrou nota com crédito;
 *   · se dá para repassar preço quando o custo sobe;
 *   · se o concorrente direto é maior e está fora do Simples.
 *
 * A nota fiscal diz o CNPJ do cliente, mas não diz o regime dele; e nenhum
 * livro registra "o cliente ligou dizendo que em 2027 vai exigir crédito". Sem
 * esses cinco números, o contador chuta — e chute entra na conta com o mesmo
 * peso de um dado apurado, só que sem ninguém saber que é chute.
 *
 * Este arquivo é a ÚNICA definição do questionário que vai à empresa. A página
 * pública desenha a partir daqui e o painel lê a resposta a partir daqui. Duas
 * listas divergiriam no primeiro ajuste de texto, e aí a pergunta respondida
 * pela empresa deixaria de ser a pergunta usada na conta.
 *
 * REGRA DE LINGUAGEM: quem responde é o dono da empresa, não o contador.
 * Nenhuma pergunta usa "IBS", "CBS", "crédito presumido", "não cumulatividade"
 * ou "Anexo". Pergunta que precisa de glossário volta em branco ou volta errada.
 */

export type ChaveColeta = "b2b" | "fora_simples" | "exig" | "preco" | "conc" | "cred";

export interface OpcaoColeta {
  /** o que a empresa lê */
  rotulo: string;
  /** o que a conta recebe */
  valor: number;
}

export interface PerguntaColeta {
  chave: ChaveColeta;
  titulo: string;
  /** o exemplo concreto que faz a pessoa entender sem glossário */
  ajuda: string;
  opcoes: OpcaoColeta[];
}

export const PERGUNTAS: PerguntaColeta[] = [
  {
    chave: "b2b",
    titulo: "Das suas vendas, quanto vai para outras empresas?",
    ajuda:
      "Vale a nota no CNPJ do cliente. Venda para o consumidor final — a pessoa que leva para casa ou para o uso dela — não conta aqui.",
    opcoes: [
      { rotulo: "Quase tudo para empresas", valor: 0.9 },
      { rotulo: "A maior parte para empresas", valor: 0.7 },
      { rotulo: "Metade e metade", valor: 0.5 },
      { rotulo: "A maior parte para consumidor final", valor: 0.25 },
      { rotulo: "Quase tudo para consumidor final", valor: 0.05 },
    ],
  },
  {
    chave: "fora_simples",
    titulo: "Essas empresas que compram de você são grandes ou pequenas?",
    ajuda:
      "Grande aqui quer dizer indústria, rede, atacado, construtora, empresa com faturamento alto. Pequena quer dizer o comércio da esquina, o prestador, o MEI. Se não souber, responda pelo cliente que mais pesa no seu faturamento.",
    opcoes: [
      { rotulo: "Quase todas grandes", valor: 0.9 },
      { rotulo: "A maioria grandes", valor: 0.7 },
      { rotulo: "Tem de tudo", valor: 0.5 },
      { rotulo: "A maioria pequenas", valor: 0.25 },
      { rotulo: "Quase todas pequenas ou MEI", valor: 0.05 },
    ],
  },
  {
    chave: "exig",
    titulo: "Algum cliente já falou em crédito de imposto na nota?",
    ajuda:
      "Por exemplo: pediu a nota com o imposto destacado, perguntou como a sua empresa é tributada, avisou que a partir de 2027 vai precisar de crédito, ou disse que compraria de outro fornecedor por causa disso.",
    opcoes: [
      { rotulo: "Sim, já ouvi isso de algum cliente", valor: 1 },
      { rotulo: "Não, nunca ouvi", valor: 0 },
    ],
  },
  {
    chave: "preco",
    titulo: "Se o seu custo subir, você consegue repassar no preço?",
    ajuda: "Pense nos clientes empresa, que são os que mais pesam. Responda pelo que já aconteceu, não pelo que você gostaria.",
    opcoes: [
      { rotulo: "Sim, repasso sem perder cliente", valor: 3 },
      { rotulo: "Consigo, mas com negociação", valor: 2 },
      { rotulo: "Muito difícil — preço travado", valor: 1 },
      { rotulo: "Não consigo de jeito nenhum", valor: 0 },
    ],
  },
  {
    chave: "conc",
    titulo: "Seus concorrentes diretos são maiores que você?",
    ajuda:
      "A pergunta é se quem disputa o mesmo cliente é uma empresa de porte maior — daquelas que já saíram do enquadramento das pequenas.",
    opcoes: [
      { rotulo: "Sim, na maioria são maiores", valor: 1 },
      { rotulo: "Não, são do meu tamanho ou menores", valor: 0 },
    ],
  },
  {
    chave: "cred",
    titulo: "E quanto às suas compras: de quem você compra?",
    ajuda:
      "Some mercadoria, matéria-prima, serviço contratado de empresa, energia, aluguel pago a empresa e frete. A pergunta é quanto disso vem de fornecedor de porte maior — e não do pequeno fornecedor ou do MEI.",
    opcoes: [
      { rotulo: "Quase tudo de fornecedor grande", valor: 0.8 },
      { rotulo: "A maior parte", valor: 0.6 },
      { rotulo: "Mais ou menos metade", valor: 0.4 },
      { rotulo: "Pouco — compro de pequenos", valor: 0.2 },
      { rotulo: "Quase nada", valor: 0.05 },
    ],
  },
];

/** o que a empresa marcou, por chave */
export type RespostasColeta = Partial<Record<ChaveColeta, number>>;

export interface Derivadas {
  b2b: number;
  qual: number;
  cred: number;
  preco: number;
  conc: number;
  exig: number;
}

/**
 * DA LINGUAGEM DA EMPRESA PARA A CONTA.
 *
 * `qual` é a fração dos clientes PJ que aproveita crédito integral. A empresa
 * respondeu quantos são GRANDES — e "fora do Simples" é justamente o que faz o
 * crédito ser aproveitado. O desconto de "grandes que ainda assim não
 * aproveitam" (órgão público, imune, revenda a consumidor final) NÃO é
 * perguntado aqui: o dono da empresa não tem como saber, e o contador tem —
 * fica com ele, no formulário da análise.
 */
export function derivar(r: RespostasColeta): Derivadas | null {
  const faltando = PERGUNTAS.filter((p) => typeof r[p.chave] !== "number");
  if (faltando.length) return null;
  return {
    b2b: r.b2b as number,
    qual: r.fora_simples as number,
    cred: r.cred as number,
    preco: r.preco as number,
    conc: r.conc as number,
    exig: r.exig as number,
  };
}

/** quantas foram respondidas — usado no painel e na barra do formulário */
export function respondidas(r: RespostasColeta): number {
  return PERGUNTAS.filter((p) => typeof r[p.chave] === "number").length;
}

export const TOTAL_PERGUNTAS = PERGUNTAS.length;

/** rótulo escolhido, para o painel mostrar a resposta em texto, não em número */
export function rotuloDaResposta(chave: ChaveColeta, valor: number | undefined): string | null {
  if (typeof valor !== "number") return null;
  const p = PERGUNTAS.find((x) => x.chave === chave);
  const o = p?.opcoes.find((x) => Math.abs(x.valor - valor) < 1e-9);
  return o?.rotulo ?? null;
}

/**
 * O TOKEN DO LINK. Alfabeto sem I, O, 0 e 1 — o link é lido em voz alta no
 * telefone com mais frequência do que se imagina. 20 caracteres de um alfabeto
 * de 32 = 100 bits: não se adivinha, e é o que protege a resposta, já que a
 * página não pede login.
 */
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function novoToken(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < 20; i++) s += ALFABETO[bytes[i] % ALFABETO.length];
  return s;
}
