/**
 * Monta o conteúdo de apresentação do laudo e do termo a partir de uma
 * análise já persistida. Fica separado das páginas de impressão para que a
 * mesma lógica alimente laudo, termo e, no futuro, o PDF server-side.
 *
 * Nada aqui recalcula o motor — usa os valores congelados na análise, que são
 * a fonte da verdade daquele laudo naquela data.
 */

import {
  pct,
  moeda,
  SAIDAS,
  ANEXOS_SIMPLES,
  type Saida,
  type DDAS,
  type SegmentoCalculado as SegmentoImpresso,
  type CarimboAliquota,
  type Cenario,
  type Dinheiro,
  type LinhaSensibilidade,
  type AlertaFatorR,
  type DetalheQual,
  type DetalheCred,
} from "./motor";

export interface AnaliseGravada {
  id: string;
  rq: number | null;
  ch: number | null;
  cl: number | null;
  re: number | null;
  fc: number | null;
  saida: Saida | null;
  prioridade: boolean;
  respostas: Record<string, number> | null;
  calculado_em: string | null;
  /** parâmetros congelados na análise, incluindo o dDAS efetivo (rastreabilidade) */
  parametros?: {
    /** com receita segregada, `ddas.segmentos` traz a composição usada */
    ddas?: DDAS & { segmentos?: SegmentoImpresso[]; normalizado?: boolean; somaInformada?: number };
    segmentos?: { anexo: number; share: number }[] | null;
    segregado?: boolean;
    aliquota?: number;
    das?: number;
    /** "lote_cnae" quando as premissas foram estimadas pelo CNAE, não informadas */
    origem_premissas?: string;
    confianca_premissas?: string;
    /** tudo o que a fatia 5 congelou para o laudo poder imprimir sem recalcular */
    exercicio?: number;
    anexo?: number;
    rbt12?: number | null;
    sublimite?: number;
    bandaSublimite?: number;
    fronteiraMin?: number;
    fronteiraMax?: number;
    /** piso de receita qualificada congelado na análise (padrão 0,30) */
    rqMin?: number;
    /** teto de absorção congelado na análise (padrão 0,01 = 1 ponto da receita) */
    absorcaoMax?: number;
    /**
     * versão do motor que produziu esta análise. Lida pela tela de Registros;
     * NÃO impressa no laudo — ver o comentário de MOTOR_VERSAO em lib/motor.ts.
     */
    motor?: string;
    /**
     * C6 — a projeção da RBT12 até o fim do período de efeito, congelada.
     * Ausente quando o contador não informou a RBT12 dos doze meses anteriores:
     * sem medição não se projeta, e o laudo simplesmente não ganha a seção.
     */
    projecao?: {
      rbt12: number;
      rbt12_projetado: number;
      crescimento: number;
      origem: "medido" | "informado";
      meses: number;
      faixa: number | null;
      faixa_projetada: number | null;
      das: number;
      das_projetado: number;
      muda_faixa: boolean;
      cruza_sublimite: boolean;
      cruza_teto: boolean;
      acima_do_teto_hoje: boolean;
      divergem: boolean;
      saida_hoje: Saida;
      saida_projetada: Saida;
      linhas: string[];
    } | null;
    partilha?: { valor: number | null; motivo: string };
    carimbo?: CarimboAliquota;
    cenarios?: Cenario[];
    dinheiro?: Dinheiro;
    sensibilidade?: LinhaSensibilidade[];
    custo_apuracao_anual?: number | null;
    /**
     * RBT12 dos doze meses anteriores — o que sustenta a projeção até jun/2027.
     *
     * O formulário pergunta o CRESCIMENTO e reconstrói este valor; o campo
     * gravado continua sendo o de sempre, para que nenhuma análise antiga
     * precise ser relida de outro jeito. Estava sendo gravado desde sempre e
     * faltava no tipo — por isso reabrir a análise não conseguia recuperá-lo.
     */
    rbt12_anterior?: number | null;
    detalhes?: { qual?: DetalheQual; cred?: DetalheCred } | null;
    origens?: Record<string, string> | null;
    fator_r?: AlertaFatorR | null;
    anexo_confirmado?: boolean;
    motivo?: string;
    banda_sublimite?: boolean;
  } | null;
}

/**
 * true quando as premissas vieram da análise em lote e ainda não foram
 * confirmadas pelo contador. O laudo leva a assinatura dele — ele precisa saber.
 */
/**
 * OS DOIS NÚMEROS QUE NÃO PRECISARAM DE COLUNA NOVA.
 *
 * `re_liquido` e `re_unico` derivam do que a análise JÁ grava — `re`, `cl` e a
 * alíquota congelada em `parametros`. Guardá-los seria criar duas colunas que
 * podem divergir do resto da linha no dia em que alguém corrigir uma e esquecer
 * a outra. Derivando, as análises antigas também passam a imprimir os dois, com
 * o mesmo número que o motor produziria hoje.
 *
 * `re_liquido`: quando o preço sobe, o IBS/CBS incide sobre o preço maior e o
 * comprador credita esse valor maior — parte do reajuste volta para ele. É este
 * número que se compara com o ganho dele, não o `re` cheio.
 *
 * `re_unico`: o reajuste necessário se a empresa praticar UMA tabela de preço.
 * O custo se espalha por toda a receita, então é o próprio `cl` — sempre menor
 * que `re`, porque `rq < 1`.
 */
export function reLiquidoDe(a: AnaliseGravada): number | null {
  const aliq = a.parametros?.aliquota;
  if (a.re == null || aliq == null) return null;
  return Number(a.re) * (1 - Number(aliq));
}

export function reUnicoDe(a: AnaliseGravada): number | null {
  return a.cl == null ? null : Number(a.cl);
}

export function premissasEstimadas(a: AnaliseGravada): boolean {
  return a.parametros?.origem_premissas === "lote_cnae";
}

export interface EmpresaLaudo {
  razao_social: string;
  cnpj: string;
  anexo: number | null;
  regime: string | null;
}

export interface EscritorioLaudo {
  nome: string;
  crc: string | null;
  logo_url: string | null;
}

const FAIXA_LABEL: Record<string, string> = {
  "0.12": "até 20%",
  "0.3": "20 a 40%",
  "0.5": "40 a 60%",
  "0.7": "60 a 80%",
  "0.9": "mais de 80%",
  "0.1": "quase nenhum ou até 15%",
  "0.33": "menos da metade",
  "0.65": "mais da metade",
  "0.92": "quase todos",
  "0.22": "15 a 30%",
  "0.37": "30 a 45%",
  "0.52": "45 a 60%",
  "0.55": "mais de 45%",
};

export function premissasEmTexto(r: Record<string, number> | null): string[] {
  if (!r) return [];
  const linhas: string[] = [];
  if (r.b2b != null) linhas.push(`Vendas para pessoa jurídica: ${FAIXA_LABEL[String(r.b2b)] ?? pct(r.b2b)} da receita`);
  if (r.qual != null) linhas.push(`Clientes PJ que aproveitam crédito: ${FAIXA_LABEL[String(r.qual)] ?? pct(r.qual)}`);
  if (r.cred != null) linhas.push(`Compras que geram crédito: ${FAIXA_LABEL[String(r.cred)] ?? pct(r.cred)} da receita`);
  if (r.preco != null) {
    const p = ["não, o mercado define", "contratos travados", "com esforço", "tem poder de preço"][r.preco] ?? "—";
    linhas.push(`Poder de renegociação de preço: ${p}`);
  }
  if (r.exig === 1) linhas.push("Cliente PJ já sinalizou que exigirá crédito integral em 2027");
  return linhas;
}

export function resultadoEmTexto(a: AnaliseGravada): string[] {
  const linhas: string[] = [];
  if (a.fc != null) linhas.push(`Crédito transferido ao comprador: ${pct(Number(a.fc))} da operação`);
  if (a.re != null) linhas.push(`Repasse de preço necessário: ${pct(Number(a.re))}`);
  /**
   * A LINHA QUE FALTAVA, e sem ela a folga parecia não fechar.
   *
   * O reajuste faz o IBS/CBS incidir sobre um preço maior, e o comprador
   * credita esse valor maior — parte do aumento volta para ele. A folga é
   * medida sobre o que ele SENTE, não sobre o preço cheio; imprimir só o `re` e
   * depois uma folga que não sai dele é o tipo de conta que o leitor refaz e não
   * bate.
   */
  const liq = reLiquidoDe(a);
  if (liq != null) {
    linhas.push(`O comprador sente ${pct(liq)}: o restante volta a ele como crédito sobre o preço maior`);
  }
  if (a.fc != null && liq != null) {
    const folga = (Number(a.fc) - liq) * 100;
    linhas.push(`Folga na negociação: ${folga.toFixed(1).replace(".", ",")} pontos percentuais`);
  }
  /**
   * O CAMINHO QUE O MOTOR NÃO ESCOLHEU. A conta da decisão supõe preço
   * diferenciado — sobe para quem credita, mantém para quem não credita. Nem
   * toda empresa consegue. Com tabela única o reajuste é menor (o custo se
   * espalha por toda a receita), mas quem não credita paga sem receber nada.
   */
  const unico = reUnicoDe(a);
  if (unico != null && unico > 0) {
    linhas.push(
      `Com uma tabela de preço só: ${pct(unico)} em todos os preços — menor, ` +
        "porém cobrado também de quem não aproveita crédito"
    );
  }
  return linhas;
}

/* ══════════════════════════════════════════════════════════════════════════
 * A SEÇÃO DE PRESSÃO COMERCIAL — a separação entre a conta e a negociação.
 *
 * O laudo respondia "a conta fecha?" e parava. Quem lê conclui que o difícil
 * acabou — e o difícil começa ali. A opção transfere o crédito ao comprador no
 * ato de exercer; o preço se negocia depois, e nessa hora não há mais nada para
 * trocar.
 *
 * Esta seção existe para o documento dizer, com todas as letras, ONDE termina o
 * trabalho do contador e ONDE começa a decisão do empresário. Não é disclaimer:
 * é a informação que faltava para a decisão ser dele de verdade.
 *
 * Nada aqui muda a recomendação. É leitura da mesma conta, em unidade de
 * negociação.
 * ══════════════════════════════════════════════════════════════════════════ */

export interface BlocoPressao {
  faixa: string;
  excedente: string;
  posicao: string;
  nivel: "folgada" | "media" | "apertada";
  leitura: string;
  absorve: string;
  absorve_reais: string | null;
  /** as frases que vão em destaque, na ordem */
  avisos: string[];
}

export function pressaoDoLaudo(a: AnaliseGravada): BlocoPressao | null {
  const p = a.parametros ?? {};
  const aliq = p.aliquota;
  if (a.re == null || a.fc == null || a.cl == null || a.rq == null || aliq == null) return null;
  const re = Number(a.re), fc = Number(a.fc), cl = Number(a.cl), rq = Number(a.rq);
  if (!isFinite(re) || cl <= 0 || fc <= 0) return null;
  /* a MESMA regra do motor: sem receita qualificada suficiente ou sem faixa
     viável, a seção não sai. Duas regras iguais escritas em dois lugares foi o
     que produziu a divergência entre Contas e Cobranças — aqui elas são
     conferidas uma contra a outra em testes/pressao.test.mjs. */
  if (rq < (typeof p.rqMin === "number" ? p.rqMin : 0.3)) return null;

  const teto = fc / (1 - Number(aliq));
  const excedente = teto - re;
  if (!(excedente > 0)) return null;
  const parte = teto > 0 ? Math.min(re / teto, 1) : 1;
  const nivel: BlocoPressao["nivel"] = parte >= 0.75 ? "apertada" : parte >= 0.5 ? "media" : "folgada";

  /**
   * O DENOMINADOR DOS 42% — conserto de 10/08/2026.
   *
   * `parte` é `piso ÷ teto`, e a frase dizia "a empresa precisa de 42% DO QUE
   * ESTÁ EM DISPUTA". Só que a linha imediatamente acima define o que está em
   * disputa como `teto − piso` — outro número. Sobre ele a conta daria 72%, e
   * 72% cai na faixa que faz o laudo trocar "a posição é confortável" por "há
   * espaço, mas depende da conversa". O veredito comercial do documento ficava
   * dependendo de qual denominador o leitor supusesse.
   *
   * E a frase estava errada nos próprios termos: no piso a empresa fica exata,
   * então ela não precisa de NADA do que está em disputa para não perder — a
   * disputa inteira é ganho. O que os 42% dizem é outra coisa, e é a coisa útil:
   * de todo o espaço que o crédito do cliente comporta, essa fatia vai embora
   * antes de a empresa começar a ganhar.
   *
   * O número não mudou — os cortes de `nivel` foram calibrados sobre ele em
   * 22.400 combinações. Mudou o que a frase afirma sobre ele.
   */
  /**
   * AS TRÊS PONTAS TÊM DE SOMAR NA TELA.
   *
   * Arredondando cada uma por si, 3,28 vira 3,3 · 4,56 vira 4,6 · 7,84 vira
   * 7,8 — e a frase passa a afirmar que 3,3 + 4,6 = 7,8. É pequeno e é
   * exatamente o tipo de coisa que o leitor confere, porque a frase convida:
   * ela decompõe o teto em duas parcelas.
   *
   * O que está em disputa é, portanto, DERIVADO das duas pontas já
   * arredondadas. Custa 0,06 ponto de precisão numa grandeza de leitura, e
   * compra uma decomposição que fecha na conta de cabeça de quem lê.
   */
  const p1 = (x: number) => Math.round(x * 1000) / 10;
  const num = (x: number) => x.toFixed(1).replace(".", ",");
  const pisoP = p1(re);
  const tetoP = p1(teto);
  const disputaP = Math.round((tetoP - pisoP) * 10) / 10;
  const daFaixa =
    `De ${num(tetoP)} pontos de reajuste que o crédito do cliente comporta, ` +
    `${num(pisoP)} vão só para a empresa não sair perdendo — ${pct(parte, 0)} do total. ` +
    `Os ${num(disputaP)} pontos restantes são o que está em disputa.`;

  const veredito =
    nivel === "apertada"
      ? "A margem é estreita: qualquer resistência do cliente coloca a operação no vermelho."
      : nivel === "media"
        ? "Há espaço, mas ele depende de a conversa acontecer."
        : "A posição é confortável — o que não significa que o repasse aconteça sozinho.";

  /**
   * A RESSALVA DOS CONCORRENTES SOBE PARA O VEREDITO — 10/08/2026.
   *
   * Ela existia, e existia certa, mas como o SEGUNDO aviso da lista — ou seja,
   * depois de o documento já ter dito "a posição é confortável". O leitor
   * recebia o veredito, e três parágrafos abaixo a informação que o desmonta.
   *
   * E ela desmonta de verdade: `fc` mede o ganho do comprador supondo que a
   * alternativa dele seja continuar comprando de optante do Simples. Se os
   * concorrentes desta empresa já estão fora, a alternativa do comprador já
   * entrega crédito integral, e o poder de cobrar por ele é bem menor do que a
   * aritmética sozinha sugere. Um veredito de conforto sem essa ressalva ao lado
   * é o documento contradizendo a si mesmo entre duas seções.
   */
  const leitura =
    a.respostas?.conc === 1
      ? `${daFaixa} ${veredito} Só que a aritmética acima supõe que a alternativa do cliente seja outro fornecedor do Simples — e os concorrentes desta empresa já estão fora, portanto já entregam crédito integral. Na prática a opção reduz uma desvantagem em vez de criar vantagem, e o espaço de preço fecha mais rápido do que a faixa indica.`
      : `${daFaixa} ${veredito}`;

  const avisos: string[] = [
    "NEGOCIE O PREÇO ANTES DE EXERCER A OPÇÃO, e registre por escrito. Ao optar, o crédito integral " +
      "passa ao cliente automaticamente, independentemente de acordo de preço. Quem opta primeiro e " +
      "negocia depois negocia sem nada para trocar: o cliente já recebeu.",
  ];

  /**
   * O CENÁRIO DE TABELA ÚNICA — trazido para a superfície em 10/08/2026.
   *
   * O passo 10 da memória de cálculo já imprimia este número, e ele morria ali:
   * uma linha de tabela no meio de dez, sem nenhuma frase que dissesse para
   * quem serve. Para uma distribuidora — que é o caso comum deste laudo — a
   * pergunta seguinte à recomendação é sempre a mesma: "eu aumento o preço só
   * para os clientes PJ?". Quem tem tabela única não consegue, e para essa
   * empresa o número que decide não é o repasse de equilíbrio sobre a receita
   * qualificada, é o custo espalhado por toda a receita.
   *
   * Ele é MENOR que o repasse dirigido, e por isso é o argumento mais fácil de
   * levar ao cliente. Deixá-lo enterrado na memória de cálculo era esconder a
   * melhor notícia do documento dentro da seção que ninguém lê em voz alta.
   */
  const unico = Number(a.cl);
  if (isFinite(unico) && unico > 0 && unico < re) {
    avisos.push(
      `SE A EMPRESA TEM TABELA ÚNICA de preços, o reajuste equivalente é de ${pct(unico)} em TODOS ` +
        `os preços — e não de ${pct(re)} só nos clientes empresa. É menor porque o custo se espalha ` +
        "por toda a receita em vez de se concentrar na parte vendida a quem aproveita crédito. " +
        "Confira qual dos dois formatos a empresa consegue praticar antes de levar o número à mesa."
    );
  }

  if (a.respostas?.conc === 1) {
    /* o FATO da concorrência já foi para o veredito, acima; aqui fica só o que
       fazer com ele, para o parágrafo não repetir a leitura palavra por palavra */
    avisos.push(
      "Com os concorrentes já fora do Simples, o repasse deixa de ser argumento de vantagem e passa " +
        "a ser conversa de recomposição. Leve a comparação de crédito por operação para a mesa: é o " +
        "que mostra ao cliente que o preço novo o mantém no mesmo lugar, e não que ele está pagando " +
        "por algo que já tinha."
    );
  } else {
    avisos.push(
      "Gerar crédito integral é vantagem enquanto os concorrentes não geram. Quando eles optarem, a " +
        "vantagem se dissolve e o custo permanece. Trate o ganho comercial como janela, não como " +
        "patamar."
    );
  }

  if (a.respostas?.preco != null && Number(a.respostas.preco) <= 1) {
    avisos.push(
      "A empresa declarou não ter poder de renegociar preço. Nesse caso o cenário realista não é o " +
        "repasse: é a absorção do custo abaixo. Some a isso a pressão do cliente, que passa a saber " +
        "que este fornecedor gera crédito integral."
    );
  }

  const dinheiro = p.dinheiro?.absorvido_anual;

  return {
    faixa: `${pct(re)} a ${pct(teto)}`,
    /* a mesma subtração das pontas impressas — ver a nota de `disputaP` */
    excedente: `${num(disputaP)} p.p.`,
    posicao: pct(parte, 0),
    nivel,
    leitura,
    absorve: pct(cl),
    absorve_reais: dinheiro != null ? moeda(dinheiro) : null,
    avisos,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
 * A ABSORÇÃO — quando o repasse simplesmente não vai acontecer.
 *
 * Até 05/08/2026, `preco <= 1` mandava tudo para S2: "não optar nesta janela".
 * Em 3,7% da grade isso significava mandar a empresa esperar seis meses para
 * não pagar meio ponto da receita — e perder, nesse meio tempo, a única forma
 * de entregar crédito integral ao cliente SEM aumentar preço nenhum.
 *
 * Agora esses casos vão para S3, e este bloco é o que o laudo diz neles. Ele
 * troca a unidade do documento: falar em "negociar 4,2%" com quem declarou que
 * não negocia é escrever para ninguém.
 *
 * O QUE ESTE BLOCO É OBRIGADO A DIZER, e é a razão de a saída ser S3 e não S4:
 * o motor conhece a RECEITA e não conhece a MARGEM. Meio ponto de receita numa
 * empresa de 3% de margem é um sexto do lucro. Recomendar absorver seria
 * recomendar com um número que o sistema não tem.
 * ══════════════════════════════════════════════════════════════════════════ */

export interface BlocoAbsorcao {
  /** o custo líquido, em % da receita */
  custo: string;
  custo_reais: string | null;
  /** o crédito que o comprador passa a receber sem aumento de preço */
  entrega: string;
  /** a pergunta que devolve a decisão a quem tem o número */
  pergunta: string;
  linhas: string[];
}

export function absorcaoDoLaudo(a: AnaliseGravada): BlocoAbsorcao | null {
  const p = a.parametros ?? {};
  const preco = a.respostas?.preco;
  if (preco == null || Number(preco) > 1) return null;
  if (a.cl == null || a.fc == null || a.rq == null) return null;
  const cl = Number(a.cl), fc = Number(a.fc), rq = Number(a.rq);
  if (!(cl > 0) || !(fc > 0)) return null;
  /**
   * O PISO DE RECEITA QUALIFICADA VALE AQUI TAMBÉM.
   *
   * A primeira versão esquecia dele e o teste de concordância acusou 8 casos
   * (de 1.152) em que o motor dizia S1 — "não há a quem transferir crédito em
   * volume que justifique" — e o laudo, na mesma página, oferecia absorver o
   * custo para entregar crédito. Documento em contradição consigo mesmo, e o
   * tipo de erro que ninguém encontra lendo: os dois trechos estão certos
   * separadamente.
   */
  if (rq < (typeof p.rqMin === "number" ? p.rqMin : 0.3)) return null;
  const teto = typeof p.absorcaoMax === "number" ? p.absorcaoMax : 0.01;
  if (cl > teto) return null;

  const reais = p.dinheiro?.absorvido_anual;
  return {
    custo: pct(cl, 2),
    custo_reais: reais != null ? moeda(reais) : null,
    entrega: pct(fc),
    pergunta:
      `${pct(cl, 2)} da receita cabe na margem desta empresa? Este laudo conhece a receita e não ` +
      "conhece a margem — a resposta é do empresário, e é ela que decide.",
    linhas: [
      "A empresa declarou não ter poder de renegociar preço. O cenário realista, então, não é o " +
        "repasse calculado acima: é a ABSORÇÃO do custo líquido.",
      `Absorvendo, a empresa passa a arcar com ${pct(cl, 2)} da receita` +
        (reais != null ? ` — ${moeda(reais)} no ano` : "") +
        `, e o comprador passa a receber ${pct(fc)} de crédito sem nenhum aumento de preço.`,
      "É a única situação em que a opção entrega vantagem comercial sem depender de conversa " +
        "difícil. Também é a única em que o custo é integralmente da empresa.",
      "Se em algum momento o preço puder ser renegociado, o repasse calculado acima volta a valer " +
        "e a absorção deixa de ser necessária — mas o crédito já terá sido entregue, e a conversa " +
        "acontecerá sem nada para trocar.",
    ],
  };
}

/** a fronteira, dita em uma frase — vai no rodapé da seção */
export const FRONTEIRA_CONTA_NEGOCIACAO =
  "Até aqui é conta: os números acima decorrem das premissas informadas e da legislação citada, e " +
  "são de responsabilidade técnica do profissional que assina. A partir daqui é negociação: o " +
  "resultado comercial depende da conversa com cada cliente e é decisão do empresário. Nenhum " +
  "número deste laudo garante que o repasse será aceito.";

/**
 * A recomendação como ela vai para o PAPEL — 08/08/2026.
 *
 * `descricao` de `SAIDAS` é escrita para o contador e estava sendo impressa na
 * via do cliente; a `descricao_cliente` diz o mesmo fato na segunda pessoa e
 * sem vocabulário de ferramenta. Esta função devolve a do documento, porque é
 * ela que o laudo usa nos dois formatos (completo e curto). As telas internas
 * continuam lendo `SAIDAS` direto.
 */
/**
 * A RESSALVA QUE FICA COLADA NA CONCLUSÃO — 08/08/2026.
 *
 * A caixa da recomendação não tinha disclaimer nenhum: é o primeiro bloco que o
 * empresário lê, tem borda colorida e abre com um verbo no imperativo ("Optar",
 * "Não optar"), e o aviso correspondente estava quatro seções abaixo, no rodapé.
 * No laudo CURTO — que atende o maior volume da carteira — não havia nem isso,
 * porque a nota de parâmetros e a ressalva da negociação moram em blocos que
 * ele não imprime.
 *
 * Curta de propósito: o rodapé continua trazendo a versão completa. O que faltava
 * aqui era uma linha no lugar onde a dúvida acontece.
 */
export const RESSALVA_DA_RECOMENDACAO =
  "Recomendação técnica sobre estimativa de cenário, a partir das premissas declaradas neste " +
  "documento e dos parâmetros congelados na data de emissão. Não é apuração fiscal nem garantia " +
  "de resultado: a decisão é da empresa, e a responsabilidade técnica sobre a análise é do " +
  "profissional que assina.";

export function recomendacao(a: AnaliseGravada): { titulo: string; descricao: string; cor: string } {
  const s = (a.saida ?? "S1") as Saida;
  const saida = SAIDAS[s];
  return { titulo: saida.titulo, descricao: saida.descricao_cliente, cor: saida.cor };
}

/**
 * Rastreabilidade da base de cálculo do dDAS — como a parcela PIS/Cofris que
 * sai do DAS foi apurada. Torna o laudo auditável: qual RBT12, qual faixa, qual
 * alíquota (efetiva ou estimada). Vazio nas análises anteriores à Fatia 5.
 */
export function baseDeCalculo(a: AnaliseGravada): string[] {
  const d = a.parametros?.ddas;
  if (!d) return [];
  const linhas: string[] = [];
  if (d.fonte === "efetiva") {
    linhas.push(
      /* MESMA GRANDEZA, MESMAS CASAS — 10/08/2026. A memória de cálculo imprime
         10,66% no passo 1 e esta nota imprimia 10,7% duas linhas abaixo. Quem
         confere um laudo confere justamente assim: procura o mesmo número em
         dois lugares. Achar dois é achar um erro, mesmo quando não há. */
      `Alíquota efetiva do Simples: ${pct(d.aliquota, 2)} — apurada sobre a RBT12 de ${moeda(
        d.rbt12
      )} (Anexo ${d.anexo}, faixa ${d.faixa}).`
    );
  } else {
    linhas.push(
      `Alíquota do Simples: ${pct(d.aliquota)} — topo da faixa ${d.faixa} do Anexo ${d.anexo}, ` +
        `estimativa conservadora usada por falta de RBT12 informada (tende a superestimar o custo).`
    );
  }
  /**
   * A REDAÇÃO MUDOU EM 05/08/2026, e o número não.
   *
   * O laudo dizia "parcela PIS/Cofins que migra para a CBS". Isso descreve 2026.
   * A partir de 01/01/2027 vale o art. 519 da LC 214/2025: os Anexos I a V da
   * LC 123 são substituídos pelos Anexos XVIII a XXII, e as colunas "Cofins" e
   * "PIS/Pasep" DEIXAM DE EXISTIR — no lugar entram "CBS" e "IBS".
   *
   * A soma é idêntica nas faixas 1 a 5 (Anexo I: 12,74 + 2,76 = 15,50 = CBS
   * 15,33 + IBS 0,17), então nenhuma conta muda. O que muda é a fundamentação
   * de um documento assinado por contador — e citar coluna que a lei extinguiu
   * é o tipo de erro que só aparece quando alguém contesta.
   */
  linhas.push(
    /* o dDAS sai com 3 casas em todo o laudo: em 1,7% some o dígito que separa
       um cl de 2,3% de um de 2,4% — ver a nota da alíquota efetiva acima */
    `Parcela que sai do DAS ao optar: ${pct(d.sharePC)} da carga do Simples = ${pct(d.das, 3)} da receita.`
  );
  /**
   * O TETO DE 5% DO ISS TEM DE APARECER, e por um motivo prático.
   *
   * Quando ele morde, o `sharePC` impresso NÃO é o da tabela do anexo — é maior.
   * Um contador que confira a memória de cálculo contra a tabela vai encontrar
   * dois números diferentes e concluir que o laudo errou. A explicação custa
   * duas linhas e evita a única conversa que ninguém quer ter.
   */
  if (d.teto_iss) {
    linhas.push(
      `Teto de 5% do ISS aplicado: pela tabela do anexo o ISS efetivo seria ${pct(d.teto_iss.iss_sem_teto, 2)}, ` +
        `acima do limite legal de 5%. A diferença é transferida aos tributos federais da mesma faixa — ` +
        `inclusive à CBS e ao IBS —, o que eleva a parcela que sai do DAS de ${pct(d.teto_iss.sharePC_tabela)} ` +
        `para ${pct(d.teto_iss.sharePC_aplicado)} da carga do Simples.`
    );
    linhas.push(
      "Base: nota de rodapé dos Anexos XX e XXI da Lei Complementar nº 214/2025 — o ISS fica fixo em 5% e " +
        "os demais tributos recebem (alíquota efetiva − 5%) × percentual de redistribuição da faixa."
    );
  }

  linhas.push(
    "Essa parcela corresponde às colunas de CBS e IBS da partilha do anexo (Anexos XVIII a XXII da " +
      "Lei Complementar nº 214/2025, art. 519, com efeitos a partir de 1º/01/2027), de soma idêntica " +
      "à antiga partilha de Cofins e PIS/Pasep dos Anexos I a V da Lei Complementar nº 123/2006 nas " +
      "cinco primeiras faixas. Na 6ª faixa não há coluna de IBS, e a parcela é menor que a de 2026."
  );
  return linhas;
}

/**
 * OS CORTES DO MÉTODO — o que é norma e o que é convenção.
 *
 * O laudo já imprime as bandas dentro do motivo da saída ("dentro da banda de
 * fronteira, 0,8× a 1,2× o ganho do comprador"). O que faltava era dizer de
 * onde esses números vêm: não vêm de lugar nenhum na lei. São convenção do
 * método, e um número sem origem num documento técnico tira autoridade dele.
 *
 * A sensibilidade foi medida em 64.800 combinações — está aqui porque
 * "escolhemos 0,30" é fraco, e "escolhemos 0,30, e 0,25 ou 0,35 mudariam menos
 * de 3% dos casos" é verificável.
 */
export const NOTA_PARAMETROS =
  "Os cortes usados na recomendação — receita qualificada mínima de 30%, banda de fronteira de 0,8 a " +
  "1,2 vez o ganho do comprador e banda de 5% em torno do sublimite — são convenções deste método, " +
  "não decorrem de norma. Foram testados: adotar 25% ou 35% de receita qualificada mínima altera menos " +
  "de 3% das recomendações, e estreitar a banda de fronteira para 0,9–1,1 altera 3,6%. Os valores de " +
  "entrada e a memória de cálculo acima permitem refazer a conta com outros cortes.";

/** true quando a base do dDAS foi estimada (sem RBT12) — dispara o aviso no laudo */
export function dDASestimado(a: AnaliseGravada): boolean {
  return a.parametros?.ddas?.fonte === "conservador";
}

/**
 * REMOVIDA EM 05/08/2026 — ela estava ERRADA e sem uso, que é a pior
 * combinação: ninguém foi mordido ainda, e ela era exatamente a função que
 * alguém pegaria ao montar o bloco de recomendação do termo.
 *
 * `decisaoSugerida()` devolvia "optar" só para S4. S5 — custo líquido
 * NEGATIVO, a empresa paga menos no regime regular sem depender de negociar
 * com ninguém — voltava como "permanecer". É o caso mais forte de optar do
 * produto inteiro.
 *
 * A fonte é `ehOptar()` do motor (S4 ou S5), e agora existe uma só. Quem
 * precisa da recomendação do termo usa `recomendacaoDoTermo()` em lib/termo.ts.
 */

/* ==========================================================================
 * FATIA 6 — as dez seções.
 *
 * Tudo aqui LÊ o que foi congelado na análise. Nada recalcula: o laudo é prova,
 * e prova que se recalcula sozinha quando o motor muda não é prova.
 * ========================================================================== */

/** Faixas C e D recebem laudo curto: documentar a permanência, não simular a decisão. */
export function ehLaudoCurto(faixa?: string | null): boolean {
  return faixa === "C" || faixa === "D" || faixa === "MEI" || faixa === "FORA";
}

export interface PremissaImpressa {
  pergunta: string;
  resposta: string;
  origem: "coleta" | "informada" | "estimada" | "padrao";
  composicao?: string;
}

const ORIGEM_ROTULO: Record<string, string> = {
  // respondida pelo próprio cliente, no formulário — o grau mais forte de
  // proveniência que uma premissa pode ter neste produto
  coleta: "respondida pelo cliente no formulário",
  informada: "informada pelo cliente",
  estimada: "estimada pelo contador",
  padrao: "padrão do sistema",
};

export function rotuloOrigem(o: string): string {
  return ORIGEM_ROTULO[o] ?? ORIGEM_ROTULO.padrao;
}

/** Seção 3 — cada premissa com a origem marcada. Estimada aparece destacada. */
export function premissasComOrigem(a: AnaliseGravada): PremissaImpressa[] {
  const r = a.respostas ?? {};
  const p = a.parametros ?? {};
  const o = (k: string): PremissaImpressa["origem"] => {
    const v = p.origens?.[k];
    if (v === "coleta" || v === "informada" || v === "estimada" || v === "padrao") return v;
    return p.origem_premissas === "lote_cnae" ? "estimada" : "padrao";
  };
  const dq = p.detalhes?.qual;
  const dc = p.detalhes?.cred;

  const linhas: PremissaImpressa[] = [];
  if (r.b2b != null) {
    linhas.push({
      pergunta: "Parcela do faturamento vendida a outras empresas",
      resposta: pct(r.b2b),
      origem: o("b2b"),
    });
  }
  if (r.qual != null) {
    linhas.push({
      pergunta: "Dos clientes empresa, os que aproveitam crédito integral",
      resposta: pct(r.qual),
      origem: o("qual"),
      composicao: dq
        ? `${pct(dq.fora_simples)} fora do Simples, dos quais ${pct(dq.sem_aproveitamento)} ainda assim não aproveitariam o crédito.`
        : undefined,
    });
  }
  if (r.cred != null) {
    linhas.push({
      pergunta: "Compras que geram crédito, sobre a receita",
      resposta: pct(r.cred),
      origem: o("cred"),
      composicao: dc
        ? `${pct(dc.insumos)} em mercadorias e insumos, ${pct(dc.servicos)} em serviços de PJ, ${pct(dc.outros)} em energia, aluguel de PJ e fretes.`
        : undefined,
    });
  }
  if (r.folha != null) {
    linhas.push({ pergunta: "Folha sobre o faturamento", resposta: pct(r.folha), origem: o("folha") });
  }
  if (r.preco != null) {
    const t = ["não, o mercado define", "contratos travados", "com esforço", "tem poder de preço"][r.preco] ?? "—";
    linhas.push({ pergunta: "Poder de renegociar preço com o cliente empresa", resposta: t, origem: o("preco") });
  }
  if (r.conc != null) {
    linhas.push({
      pergunta: "Concorrentes diretos majoritariamente fora do Simples",
      resposta: r.conc === 1 ? "sim" : "não",
      origem: o("conc"),
    });
  }
  if (r.exig != null) {
    linhas.push({
      pergunta: "Cliente já sinalizou que exigirá crédito integral em 2027",
      resposta: r.exig === 1 ? "sim" : "não",
      origem: o("exig"),
    });
  }
  return linhas;
}

export interface PassoCalculo {
  passo: string;
  formula: string;
  substituicao: string;
  resultado: string;
}

/**
 * Seção 4 — MEMÓRIA DE CÁLCULO.
 *
 * O critério é um só: um fiscal precisa conseguir refazer no papel. Por isso
 * cada linha traz fórmula, substituição numérica e resultado — e não apenas o
 * resultado, que é o que um relatório de sistema entrega.
 */
export function memoriaDeCalculo(a: AnaliseGravada): PassoCalculo[] {
  const p = a.parametros ?? {};
  const d = p.ddas;
  const r = a.respostas ?? {};
  const passos: PassoCalculo[] = [];
  const n = (x: number | null | undefined, casas = 4) =>
    x == null || !isFinite(x) ? "—" : x.toFixed(casas).replace(".", ",");

  /**
   * RECEITA SEGREGADA. Quando a empresa tem atividade em mais de um anexo, o
   * passo 1 deixa de ser UMA alíquota e vira uma composição: cada anexo tem a
   * sua tabela e a sua partilha de PIS/Cofins, e o dDAS é a soma ponderada
   * pela receita de cada um. Sem imprimir a composição, o laudo traria um dDAS
   * que ninguém consegue refazer com a tabela de um anexo só — que é
   * exatamente o defeito que esta seção existe para não ter.
   */
  const segs = d?.segmentos;
  if (d && segs && segs.length > 1) {
    segs.forEach((s, i) => {
      const t = ANEXOS_SIMPLES[s.anexo]?.[s.faixa - 1];
      passos.push({
        passo: `1.${i + 1} Anexo ${s.anexo} — ${pct(s.share, 1)} da receita`,
        formula:
          s.fonte === "efetiva"
            ? "[(RBT12 × nominal − deduzir) ÷ RBT12] × partilha de PIS/Cofins do anexo"
            : "alíquota nominal do topo da faixa × partilha de PIS/Cofins do anexo",
        substituicao:
          s.fonte === "efetiva" && s.rbt12 && t
            ? `[(${moeda(s.rbt12)} × ${pct(t.nominal, 2)} − ${moeda(t.deduzir)}) ÷ ${moeda(s.rbt12)}] × ${pct(s.sharePC, 2)}`
            : `Anexo ${s.anexo}, faixa ${s.faixa} — RBT12 não informada`,
        resultado: `${pct(s.aliquota, 2)} de Simples · ${pct(s.das, 3)} de PIS/Cofins no anexo`,
      });
    });
    passos.push({
      passo: "2. Parcela de PIS/Cofins embutida no DAS (receita segregada)",
      formula: "dDAS = Σ (participação do anexo × PIS/Cofins do anexo)",
      substituicao: segs.map((s) => `${pct(s.share, 1)} × ${pct(s.das, 3)}`).join("  +  "),
      resultado: `dDAS = ${pct(d.das, 3)} da receita total`,
    });
  } else if (d) {
    /* A SUBSTITUIÇÃO LÊ O QUE FOI CONGELADO — 08/08/2026.
       Isto ia buscar a linha em `ANEXOS_SIMPLES` na hora de renderizar, e a
       tabela é constante viva (mudou na 6ª faixa em 05/08). Um laudo de julho
       reaberto hoje imprimia a nominal de hoje dentro de uma conta cuja
       alíquota foi congelada ontem — a substituição parava de fechar com o
       resultado, justamente na tabela que existe para ser refeita no papel.
       A tabela viva fica como reserva para as análises anteriores a esta data,
       que não têm as células gravadas. */
    const tabela =
      d.nominal != null && d.deduzir != null
        ? { nominal: d.nominal, deduzir: d.deduzir }
        : ANEXOS_SIMPLES[d.anexo]?.[d.faixa - 1];
    if (d.fonte === "efetiva" && d.rbt12 && tabela) {
      passos.push({
        passo: "1. Alíquota efetiva do Simples Nacional",
        formula: "(RBT12 × alíquota nominal − parcela a deduzir) ÷ RBT12",
        substituicao: `(${moeda(d.rbt12)} × ${pct(tabela.nominal, 2)} − ${moeda(tabela.deduzir)}) ÷ ${moeda(d.rbt12)}`,
        resultado: `${pct(d.aliquota, 2)}  (Anexo ${d.anexo}, faixa ${d.faixa})`,
      });
    } else {
      passos.push({
        passo: "1. Alíquota do Simples Nacional (estimada)",
        formula: "alíquota nominal do topo da faixa",
        substituicao: `Anexo ${d.anexo}, faixa ${d.faixa} — RBT12 não informada`,
        resultado: `${pct(d.aliquota, 2)}  (estimativa conservadora)`,
      });
    }
    passos.push({
      passo: "2. Parcela de PIS/Cofins embutida no DAS",
      formula: "alíquota do Simples × partilha de PIS/Cofins da faixa",
      substituicao: `${pct(d.aliquota, 2)} × ${pct(d.sharePC, 2)}`,
      resultado: `dDAS = ${pct(d.das, 3)} da receita`,
    });
  }

  if (r.b2b != null && r.qual != null) {
    passos.push({
      passo: "3. Receita qualificada",
      formula: "rq = vendas a PJ × PJ que aproveitam crédito",
      substituicao: `${n(r.b2b, 3)} × ${n(r.qual, 3)}`,
      resultado: `rq = ${pct(a.rq ?? 0)}`,
    });
  }
  if (p.aliquota != null && r.cred != null) {
    passos.push({
      passo: "4. Carga híbrida sobre a base",
      formula: "ch = alíquota IBS+CBS × (1 − compras com crédito)",
      substituicao: `${n(p.aliquota, 4)} × (1 − ${n(r.cred, 3)})`,
      resultado: `ch = ${pct(a.ch ?? 0)}`,
    });
  }
  if (a.ch != null && p.das != null) {
    passos.push({
      passo: "5. Custo líquido da empresa",
      formula: "cl = ch − dDAS",
      substituicao: `${n(Number(a.ch), 4)} − ${n(p.das, 5)}`,
      resultado: `cl = ${pct(Number(a.cl ?? 0))}`,
    });
  }
  if (a.cl != null && a.rq != null) {
    passos.push({
      passo: "6. Repasse de equilíbrio",
      formula: "re = cl ÷ rq",
      substituicao: `${n(Number(a.cl), 4)} ÷ ${n(Number(a.rq), 3)}`,
      resultado: `re = ${pct(Number(a.re ?? 0))}`,
    });
  }
  if (p.aliquota != null && p.das != null) {
    passos.push({
      passo: "7. Folga do adquirente",
      formula: "fc = alíquota IBS+CBS − dDAS",
      substituicao: `${n(p.aliquota, 4)} − ${n(p.das, 5)}`,
      resultado: `fc = ${pct(Number(a.fc ?? 0))}`,
    });
  }
  /**
   * O PASSO 8 É NOVO, e existe para o laudo não parecer errado.
   *
   * A comparação da decisão não é `re` contra `fc` — é `re × (1 − alíquota)`
   * contra `fc`. Sem este passo escrito, quem confere a conta encontra um
   * número na seção da recomendação que não sai de nenhuma linha da memória, e
   * conclui que o documento errou.
   *
   * A razão: quando o preço sobe, o IBS/CBS incide sobre o preço maior e o
   * comprador credita esse valor maior. Parte do reajuste volta para ele.
   */
  const liqM = reLiquidoDe(a);
  if (liqM != null && p.aliquota != null) {
    const liq = liqM;
    passos.push({
      passo: "8. O reajuste como o comprador sente",
      formula: "re líquido = re × (1 − alíquota IBS+CBS)",
      substituicao: `${n(Number(a.re), 4)} × (1 − ${n(Number(p.aliquota), 4)})`,
      resultado: `${pct(liq)} — parte do reajuste volta a ele como crédito`,
    });
  }
  if (a.fc != null && liqM != null) {
    const liq = liqM;
    passos.push({
      passo: "9. Folga da negociação",
      formula: "folga = fc − re líquido",
      substituicao: `${n(Number(a.fc), 4)} − ${n(liq, 4)}`,
      /* uma casa, como nas seções 5 e 7 — "4,16" aqui contra "4,2" lá era o
         mesmo número parecendo dois */
      resultado: `${((Number(a.fc) - liq) * 100).toFixed(1).replace(".", ",")} pontos percentuais`,
    });
  }
  /**
   * O CENÁRIO DE TABELA ÚNICA — o caminho que o motor não usa e o empresário
   * pode ter. Medido: em 636 de 1.694 combinações a tabela única fecha onde a
   * diferenciada não fecha, e em nenhuma o contrário.
   */
  const unicoM = reUnicoDe(a);
  if (unicoM != null && unicoM > 0) {
    passos.push({
      passo: "10. E se a empresa tiver uma tabela só",
      formula: "re único = cl (o custo se espalha por toda a receita)",
      substituicao: `${n(unicoM, 4)}`,
      resultado: `${pct(unicoM)} de reajuste em TODOS os preços`,
    });
  }
  return passos;
}

export interface LinhaQuadro {
  rotulo: string;
  dentro: string;
  fora: string;
  diferenca: string;
}

/**
 * Seção 5 — QUADRO COMPARATIVO: dentro do DAS × regime regular, em % e em R$.
 * Tudo derivado das grandezas que o motor já congelou; nada de premissa nova.
 */
export function quadroComparativo(a: AnaliseGravada): LinhaQuadro[] {
  const p = a.parametros ?? {};
  const d = p.ddas;
  const receita = p.dinheiro?.receita ?? p.rbt12 ?? null;
  if (!d || p.aliquota == null || a.ch == null) return [];

  const dentroPct = d.aliquota;
  const foraPct = d.aliquota - d.das + Number(a.ch);
  /**
   * A DIFERENÇA SAI DAS DUAS COLUNAS AO LADO — conserto de 10/08/2026.
   *
   * Ela era `Number(a.cl)`, o custo líquido gravado. Aritmeticamente é a mesma
   * grandeza que `fora − dentro`, e por isso a troca passou anos sem incomodar.
   * Só que `cl` chega deste laudo com a precisão que o registro guardou, e as
   * outras duas células são calculadas aqui, na hora, com precisão cheia. Num
   * laudo real de R$ 2,4 mi a linha saiu assim:
   *
   *     R$ 255.900   →   R$ 311.276   →   +R$ 55.368
   *
   * e 311.276 − 255.900 dá 55.376. Oito reais de diferença numa linha de três
   * células que TÊM de fechar, dentro de um documento cujo argumento é "quem
   * receber isto refaz a conta no papel". Pior: a mesma grandeza reaparece três
   * linhas abaixo, como custo absorvido, valendo R$ 55.375.
   *
   * Derivando das duas colunas impressas, a linha fecha por construção — venha
   * `cl` com a precisão que vier.
   */
  const difPct = foraPct - dentroPct;
  const emR$ = (x: number) => (receita ? moeda(x * receita) : "—");
  /* PONTO PERCENTUAL NÃO É PORCENTAGEM. "+2,31%" sobre uma linha de tributo
     lê-se como aumento relativo — R$ 5.911 em vez de R$ 55.376, um erro de dez
     vezes numa frase dita em reunião. */
  const pp = (x: number) =>
    !isFinite(x) ? "—" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2).replace(".", ",")} p.p.`;

  return [
    {
      rotulo: "Tributo da empresa, sobre a receita (antes do repasse)",
      dentro: pct(dentroPct, 2),
      fora: pct(foraPct, 2),
      diferenca: pp(difPct),
    },
    {
      /* "antes do repasse" nas DUAS linhas: é aqui que o leitor encontra
         "+R$ 55.376 de tributo" a quatro linhas de "ganho de R$ 70.224" e
         conclui que o documento se contradiz. Não se contradiz — mede momentos
         diferentes —, e era só isto que faltava dizer. */
      rotulo: "Tributo da empresa, por ano (antes do repasse)",
      dentro: emR$(dentroPct),
      fora: emR$(foraPct),
      diferenca: receita ? `${difPct >= 0 ? "+" : ""}${moeda(difPct * receita)}` : "—",
    },
    {
      rotulo: "Crédito transferido ao cliente PJ, por operação",
      dentro: pct(d.das, 3),
      fora: pct(p.aliquota, 2),
      diferenca: pp(Number(a.fc ?? 0)),
    },
    {
      rotulo: "Repasse de preço necessário para equilibrar",
      dentro: "—",
      fora: a.re != null ? pct(Number(a.re)) : "—",
      /**
       * A FOLGA AQUI É A MESMA DA MEMÓRIA DE CÁLCULO — conserto de 08/08/2026.
       *
       * Este quadro media a folga sobre o repasse CHEIO (`fc − re`), enquanto o
       * passo 9 da memória, o `Resultado.folga` do motor e a leitura da pressão
       * medem sobre o repasse LÍQUIDO (`fc − reLiquido`). O mesmo laudo
       * imprimia dois números diferentes com o mesmo nome, com uns 0,4 p.p. de
       * diferença — exatamente o tipo de coisa que a memória de cálculo existe
       * para não ter. A migração está documentada em lib/deriva.ts; este quadro
       * tinha ficado para trás.
       */
      /* DE QUEM É A FOLGA. Ela é o que o COMPRADOR ainda ganha depois de sentir
         o reajuste de equilíbrio — unidade "ganho do comprador". A seção 8 mede
         a mesma folga na unidade "reajuste de preço", onde ela vale
         folga ÷ (1 − alíquota) e sai maior. Eram dois números apresentados como
         "o que está na mesa", 0,4 p.p. distantes, em páginas seguidas. Agora
         cada um diz de que lado da mesa está. */
      diferenca: (() => {
        const liq = reLiquidoDe(a);
        if (liq == null || a.fc == null) return "—";
        return `o comprador ainda ganha ${((Number(a.fc) - liq) * 100)
          .toFixed(1)
          .replace(".", ",")} p.p.`;
      })(),
    },
  ];
}

/** Seção 7 — o que precisa continuar verdadeiro para a recomendação se manter. */
export function condicoesDeValidade(a: AnaliseGravada): string[] {
  const r = a.respostas ?? {};
  const p = a.parametros ?? {};
  const cond: string[] = [];
  if (a.rq != null) {
    cond.push(
      `A receita vendida a quem aproveita crédito permanecer em torno de ${pct(Number(a.rq))} do faturamento.`
    );
  }
  if (r.cred != null) {
    cond.push(`As compras que geram crédito permanecerem em torno de ${pct(r.cred)} da receita.`);
  }
  /**
   * `re > 0` — a condição de 05/08/2026, e ela remove uma frase impossível.
   *
   * Com custo líquido negativo o repasse de equilíbrio também é negativo, e o
   * laudo pedia que "o reajuste de preço de −0,1% seja efetivamente aceito
   * pelos clientes empresa". Reajuste negativo não é reajuste a ser aceito: é a
   * ausência de reajuste a negociar, que é justamente o que torna o caso fácil.
   * A condição some porque não existe — não porque foi escondida.
   */
  if (a.re != null && isFinite(Number(a.re)) && Number(a.re) > 0 && ehOptarSaida(a.saida)) {
    cond.push(
      `O reajuste de preço de ${pct(Number(a.re))} ser efetivamente aceito pelos clientes empresa antes do fim da janela.`
    );
  }
  if (p.carimbo) {
    cond.push(
      `A alíquota de referência de IBS/CBS ser fixada em patamar próximo de ${pct(p.carimbo.aliquota)} — o cenário alternativo de ${pct(p.carimbo.alternativa)} está na seção de sensibilidade.`
    );
  }
  if (p.rbt12 != null && p.sublimite) {
    cond.push(
      `A receita do ano permanecer do mesmo lado do sublimite de ${moeda(p.sublimite)}, que altera o que já sai do DAS.`
    );
  }
  /**
   * Com receita segregada, o mix É uma premissa. Cada anexo tem partilha de
   * PIS/Cofins própria, então mudar a proporção entre as atividades muda o
   * dDAS e pode mudar a decisão — sem que nada no cadastro da empresa mude.
   */
  const segs = p.ddas?.segmentos;
  if (segs && segs.length > 1) {
    cond.push(
      "A composição da receita permanecer próxima da declarada — " +
        segs.map((s) => `Anexo ${s.anexo} em ${pct(s.share, 1)}`).join(", ") +
        ". Cada anexo tem partilha de PIS/Cofins própria, e mudar o mix muda o que sai do DAS."
    );
    if (segs.some((s) => s.anexo === 3 || s.anexo === 5)) {
      cond.push(
        "O fator R do período manter a receita de serviço no anexo declarado — a folha em relação " +
          "à receita é o que decide entre o Anexo III e o Anexo V, e ela muda mês a mês."
      );
    }
  }
  cond.push("A empresa permanecer optante pelo Simples Nacional e em situação cadastral regular.");
  return cond;
}

function ehOptarSaida(s?: string | null): boolean {
  return s === "S4" || s === "S5";
}

/** Seção 8 — riscos e limites, incluindo os que esta análise específica carrega. */
export function riscosELimites(a: AnaliseGravada): string[] {
  const p = a.parametros ?? {};
  const riscos: string[] = [
    "A alíquota de referência de IBS e CBS ainda não foi fixada. A Resolução do Senado Federal tem prazo até 31 de outubro de 2026 — depois do encerramento da janela de opção. As duas contas deste laudo existem por causa disso.",
    "Os valores partem de premissas declaradas, não de apuração com dados fiscais efetivos. A conferência dos percentuais informados é responsabilidade do contador que assina.",
    "O cálculo trata a base como “por dentro”. A discussão sobre base por fora, ligada ao art. 516 da LC 214/2025, depende de posição jurídica e não foi aplicada aqui; se aplicada, deslocaria o resultado na direção de optar.",
    /**
     * ESTA LINHA ESTAVA INCOMPLETA, e a parte que faltava é a que responsabiliza.
     *
     * Ela dizia que a opção é semestral e cancelável, ponto — o que é verdade
     * para quase todo mundo e MENTIRA para exatamente o perfil que este laudo
     * mais recomenda: empresa com muito crédito de entrada, que acumula saldo e
     * pede ressarcimento.
     *
     * LC 214/2025, art. 41, § 5º: "É vedado ao contribuinte do Simples Nacional
     * [...] retirar-se do regime regular do IBS e da CBS caso tenha recebido
     * ressarcimento de créditos desses tributos no ano-calendário corrente ou
     * anterior, nos termos do art. 39."
     *
     * Ou seja: a reversibilidade que o documento promete some no dia em que a
     * empresa usa um mecanismo que o próprio regime oferece. Enquanto o
     * questionário não perguntar isso, o aviso vai incondicional — errar para o
     * lado de avisar demais é o único erro barato aqui.
     */
    /* O MÊS DA SEGUNDA JANELA ESTÁ EM DISPUTA NO PRÓPRIO TEXTO DA LEI, e este
       laudo não escolhe por conta própria — declara.

       Art. 41 da LC 123/2006, na consolidação da LC 214/2025 com a redação da
       LC 227/2026, traz DOIS parágrafos consecutivos com meses diferentes:
         § 10 — "exercida nos meses de setembro e MARÇO"   (redação da LC 227/2026)
         § 11 — "exercida nos meses de setembro e ABRIL"   (NR)
       Uma auditoria externa apontou abril como o correto; o texto do § 10 diz
       março. Afirmar um dos dois num documento assinado seria escolher a favor
       do cliente sem base — e é o tipo de frase que se contesta depois. */
    "A opção produz efeito por semestre e é cancelável até o último dia de novembro de 2026 — ou seja, ANTES de o efeito começar; iniciado o semestre, ela é irretratável até o fim dele (seção 2). A decisão de agora não encerra o assunto: a janela seguinte reabre a pergunta no primeiro semestre de 2027. ATENÇÃO ao mês: o art. 41 da LC 123/2006, na consolidação da LC 214/2025 com a redação da LC 227/2026, traz março no § 10 e abril no § 11 — confirme a data na Resolução do CGSN vigente antes de agendar com o cliente.",
    "A reversibilidade tem uma exceção, e ela alcança justamente quem acumula crédito: o art. 41, § 5º, da Lei Complementar nº 214/2025 veda a saída do regime regular ao contribuinte que tenha recebido ressarcimento de créditos de IBS ou CBS no ano-calendário corrente ou no anterior. Se a empresa pretende pedir ressarcimento do saldo credor, a decisão desta janela deixa de ser semestral e passa a ser de mão única — confirme esse ponto antes de assinar.",
  ];
  if (p.ddas?.fonte === "conservador") {
    riscos.push(
      "A RBT12 não foi informada: a parcela que sai do DAS foi estimada pelo topo da faixa, o que tende a superestimar o custo do regime regular. Informar a receita dos últimos 12 meses torna o número exato."
    );
  }
  if (p.origem_premissas === "lote_cnae") {
    riscos.push(
      "As premissas deste laudo foram estimadas a partir do CNAE na análise em lote e não foram confirmadas caso a caso."
    );
  }
  if (p.fator_r) {
    riscos.push(
      `Fator R e anexo declarado divergem: ${p.fator_r.texto} ${
        p.anexo_confirmado ? "O anexo foi confirmado pelo contador responsável." : "O anexo ainda não foi confirmado."
      }`
    );
  }
  if (p.partilha && p.partilha.valor == null) {
    riscos.push(p.partilha.motivo);
  }
  return riscos;
}

/** Seção 10 — a tabela do anexo usada, com a faixa da empresa destacada. */
export function tabelaDoAnexo(a: AnaliseGravada): {
  anexo: number;
  faixaAtual: number;
  linhas: { faixa: number; ate: string; nominal: string; deduzir: string; sharePC: string }[];
} | null {
  const d = a.parametros?.ddas;
  if (!d) return null;
  const tabela = ANEXOS_SIMPLES[d.anexo];
  if (!tabela) return null;
  return {
    anexo: d.anexo,
    faixaAtual: d.faixa,
    linhas: tabela.map((f, i) => ({
      faixa: i + 1,
      ate: moeda(f.teto),
      nominal: pct(f.nominal, 2),
      deduzir: moeda(f.deduzir),
      sharePC: pct(f.sharePC, 2),
    })),
  };
}

/** A cadeia normativa citada na seção 2 — a primeira pergunta de quem questionar depois. */
export const BASE_LEGAL: { norma: string; papel: string }[] = [
  {
    norma: "Emenda Constitucional nº 132/2023",
    papel: "instituiu o IBS e a CBS e desenhou a transição, inclusive para os optantes pelo Simples Nacional.",
  },
  {
    norma: "Lei Complementar nº 214/2025",
    papel:
      "regulamentou o IBS e a CBS e disciplinou a apuração pelo optante do Simples, dentro ou fora do documento único de arrecadação. O art. 41, § 3º cria a faculdade de apurar pelo regime regular; o § 5º veda a saída a quem recebeu ressarcimento de créditos.",
  },
  {
    norma: "Lei Complementar nº 214/2025, art. 519",
    papel:
      "substituiu os Anexos I a V da Lei Complementar nº 123/2006 pelos Anexos XVIII a XXII, com efeitos a partir de 1º/01/2027. É deles que sai a parcela usada neste laudo: as colunas de Cofins e PIS/Pasep dão lugar às de CBS e IBS, de soma idêntica nas cinco primeiras faixas.",
  },
  {
    norma: "Lei Complementar nº 214/2025, arts. 344 e 347",
    papel:
      "fixaram, para 2027 e 2028, o IBS em 0,05% estadual mais 0,05% municipal e a CBS na alíquota de referência reduzida em 0,1 ponto percentual. São a origem da alíquota usada no cenário principal.",
  },
  {
    norma: "Lei Complementar nº 214/2025, art. 47, § 9º, II",
    papel:
      "é o que sustenta a conta do outro lado do balcão: o adquirente sujeito ao regime regular credita, na compra de optante do Simples, montante equivalente ao devido por meio desse regime. Quando o fornecedor opta, o crédito passa a ser o do regime regular — e a diferença entre os dois é o ganho do comprador calculado aqui.",
  },
  {
    norma: "Lei Complementar nº 123/2006, art. 13, §§ 9º e 10",
    papel:
      "é o dispositivo operativo: faculta ao optante apurar IBS e CBS pelo regime regular, hipótese em que as parcelas relativas a eles não são cobradas pelo regime único, e fixa a opção como semestral e irretratável. Irretratável e cancelável não se contradizem, e a diferença é de MOMENTO: a opção pode ser cancelada enquanto não começa a produzir efeito — até o último dia de novembro de 2026, para o semestre de janeiro a junho de 2027 — e, iniciado o efeito, vale o semestre inteiro sem volta. Quanto ao MÊS da segunda janela o texto consolidado é contraditório: o § 10 (redação da LC 227/2026) diz setembro e março; o § 11 diz setembro e abril. Prevalece a data fixada pela Resolução do CGSN do ciclo.",
  },
  {
    norma: "Lei Complementar nº 227/2026",
    papel:
      "revogou o art. 87-B e postergou o art. 517 da LC 214/2025, deslocando o fundamento da regulamentação da opção.",
  },
  {
    norma: "Resolução CGSN nº 186/2026",
    papel:
      "abriu a janela de 1º a 30 de setembro de 2026 para a opção por apurar IBS e CBS fora do DAS, com efeito de janeiro a junho de 2027 e cancelamento até o último dia de novembro de 2026. Com a revogação do art. 87-B, a Resolução apoia-se no art. 41, §§ 3º e 4º, da Lei Complementar nº 123/2006.",
  },
];
