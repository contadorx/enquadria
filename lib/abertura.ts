import {
  compararRegimes,
  premissasDoSetor,
  anexoDoSetor,
  fatorR,
  PREMISSAS_PADRAO,
  TETOS,
  type EntradaComparativo,
  type Premissas,
  type ResultadoComparativo,
  type ResultadoRegime,
  type Setor,
} from "./comparativo";

/**
 * ESTUDO DE ABERTURA — o serviço que sobrevive a 30 de setembro.
 *
 * POR QUE ISTO EXISTE. A janela de opção fecha em 30/09/2026 e leva junto a
 * pergunta que trouxe o contador para cá. Se o produto não responder outra
 * pergunta a partir de 01/10, ele vira uma assinatura sem uso — e assinatura
 * sem uso não renova, por melhor que tenha sido o mês de setembro.
 *
 * A pergunta seguinte não tem prazo: **em que regime esta empresa deve
 * nascer?** Ela chega ao escritório o ano inteiro, vem de quem ainda não é
 * cliente, e hoje é respondida de cabeça ou numa planilha que o contador
 * refaz toda vez.
 *
 * O QUE ESTE MOTOR ACRESCENTA ao comparativo que já existe (lib/comparativo):
 *
 *  1. RECEITA É CHUTE, E CHUTE PRECISA DE FAIXA. Empresa que não existe não
 *     tem RBT12: tem uma projeção do sócio, quase sempre otimista. Rodar um
 *     cenário só e imprimir "Simples" seria dar precisão que o dado não tem.
 *     Três cenários mostram se a resposta MUDA quando o faturamento vem
 *     abaixo do esperado — e é essa mudança, quando existe, que vale o
 *     honorário.
 *
 *  2. FATOR R É DECISÃO DE ABERTURA, não de apuração. No serviço, a diferença
 *     entre o Anexo III e o V é enorme, e quem decide é a folha — que na
 *     abertura ainda está sendo desenhada. O motor calcula o pró-labore que
 *     leva ao Anexo III e diz, com os dois números na mesa, se compensa.
 *
 *  3. O CLIENTE DELE JÁ IMPORTA. Nascer no Simples puro vendendo para PJ é
 *     entrar em 2027 entregando crédito zero ao comprador. Isso não aparece
 *     em nenhuma conta de carga tributária — e é o que o Enquadria sabe.
 *
 * Tudo é PREMISSA declarada, como no resto do produto: alíquota de CBS ainda
 * não publicada, receita projetada pelo sócio, margem estimada. O documento
 * imprime as três coisas.
 */

export interface EntradaAbertura {
  /** como o negócio será chamado no documento */
  nome_negocio: string;
  setor: Setor;
  /** faturamento MENSAL esperado — é assim que o sócio pensa */
  receita_mensal: number;
  /** salários mensais previstos, SEM o pró-labore */
  folha_mensal: number;
  /** pró-labore mensal previsto dos sócios */
  prolabore_mensal: number;
  /** fração da receita em compras que geram crédito de IBS/CBS */
  compras_credito: number;
  /** lucro esperado como fração da receita */
  margem_lucro: number;
  /** o cliente final é empresa? muda tudo a partir de 2027 */
  vende_para_pj: boolean;
}

export const ENTRADA_PADRAO: EntradaAbertura = {
  nome_negocio: "",
  setor: "servicos",
  receita_mensal: 30000,
  folha_mensal: 0,
  prolabore_mensal: 3000,
  compras_credito: 0.15,
  margem_lucro: 0.25,
  vende_para_pj: true,
};

/**
 * OS TRÊS CENÁRIOS.
 *
 * Não são simetria bonita: são as três conversas que o contador tem com quem
 * está abrindo. "Se vier menos da metade do que você espera" é a que evita o
 * regime escolhido errado — e a que ninguém faz sozinho.
 */
export const CENARIOS: { chave: "baixo" | "base" | "alto"; rotulo: string; fator: number }[] = [
  { chave: "baixo", rotulo: "Se vier 40% menos", fator: 0.6 },
  { chave: "base", rotulo: "Como você projetou", fator: 1 },
  { chave: "alto", rotulo: "Se crescer 50%", fator: 1.5 },
];

/** o teto do Anexo III no serviço: folha total ≥ 28% da receita */
export const FATOR_R_LIMITE = 0.28;

/** INSS do sócio sobre o pró-labore (11%, até o teto do salário de contribuição) */
export const INSS_SOCIO = 0.11;

/**
 * O ANEXO DE PARTIDA.
 *
 * Fora do serviço, o setor decide. No serviço, quem decide é a FOLHA — e é
 * por isso que o anexo de uma empresa que ainda não abriu não é um dado: é
 * uma consequência de uma escolha que o contador ainda pode fazer.
 */
export function anexoDeAbertura(setor: Setor, receitaAnual: number, folhaAnual: number): number {
  const base = anexoDoSetor(setor);
  if (setor !== "servicos") return base;
  return fatorR(receitaAnual, folhaAnual) >= FATOR_R_LIMITE ? 3 : 5;
}

/** converte a entrada mensal (como o sócio pensa) na entrada anual do motor */
export function entradaAnual(e: EntradaAbertura, fator = 1): EntradaComparativo {
  const receita = e.receita_mensal * 12 * fator;
  const folha = (e.folha_mensal + e.prolabore_mensal) * 12;
  return {
    receita,
    anexo: anexoDeAbertura(e.setor, receita, folha),
    setor: e.setor,
    folha,
    compras_credito: e.compras_credito,
    margem_lucro: e.margem_lucro,
  };
}

export interface CenarioAbertura {
  chave: "baixo" | "base" | "alto";
  rotulo: string;
  receita_anual: number;
  anexo: number;
  comparativo: ResultadoComparativo;
  menor: ResultadoRegime | undefined;
}

export interface EstudoFatorR {
  /** aplicável só a serviço — fora dele não existe escolha de anexo */
  aplicavel: boolean;
  atual: number;
  /** folha total anual necessária para alcançar os 28% */
  folha_alvo_anual: number;
  /** quanto de pró-labore MENSAL a mais para chegar lá (0 = já está) */
  prolabore_extra_mensal: number;
  /** custo anual desse pró-labore extra (INSS do sócio) */
  custo_extra_anual: number;
  /** economia anual de DAS ao sair do Anexo V para o III */
  economia_anual: number;
  /** compensa? economia maior que o custo */
  vale: boolean;
  frase: string;
}

/**
 * VALE A PENA SUBIR O PRÓ-LABORE PARA CAIR NO ANEXO III?
 *
 * A conta que todo contador de serviço faz de cabeça na abertura, e que erra
 * quando a receita é alta: o pró-labore necessário cresce junto com ela, e a
 * partir de certo ponto o remédio custa mais que a doença.
 *
 * HONESTIDADE DO CUSTO: contamos o INSS do sócio (11%) sobre o acréscimo. O
 * IRPF depende da situação pessoal de cada um e NÃO entra aqui — está dito no
 * documento. Contar por baixo e avisar é melhor que estimar por cima e
 * recomendar o contrário do certo.
 */
export function estudarFatorR(e: EntradaAbertura, premissas: Premissas): EstudoFatorR {
  const receitaAnual = e.receita_mensal * 12;
  const folhaAnual = (e.folha_mensal + e.prolabore_mensal) * 12;
  const atual = fatorR(receitaAnual, folhaAnual);

  if (e.setor !== "servicos") {
    return {
      aplicavel: false,
      atual,
      folha_alvo_anual: 0,
      prolabore_extra_mensal: 0,
      custo_extra_anual: 0,
      economia_anual: 0,
      vale: false,
      frase: "Fator R não se aplica: ele decide entre os Anexos III e V, que são de serviço.",
    };
  }

  const alvo = receitaAnual * FATOR_R_LIMITE;
  const falta = Math.max(alvo - folhaAnual, 0);

  if (falta === 0) {
    return {
      aplicavel: true,
      atual,
      folha_alvo_anual: alvo,
      prolabore_extra_mensal: 0,
      custo_extra_anual: 0,
      economia_anual: 0,
      vale: true,
      frase: `A folha projetada já passa dos ${Math.round(FATOR_R_LIMITE * 100)}% da receita: o Anexo III está garantido desde o primeiro ano. Mantenha o pró-labore nesse patamar — se ele cair, o enquadramento vai junto.`,
    };
  }

  // quanto custa e quanto economiza — as duas pontas na mesma moeda
  const custo = falta * INSS_SOCIO;
  const comV = compararRegimes({ ...entradaAnual(e), anexo: 5 }, premissas);
  const comIII = compararRegimes(
    { ...entradaAnual(e), anexo: 3, folha: folhaAnual + falta },
    premissas
  );
  const dasV = comV.regimes.find((r) => r.regime === "simples_puro")?.total ?? 0;
  const dasIII = comIII.regimes.find((r) => r.regime === "simples_puro")?.total ?? 0;
  const economia = dasV - dasIII;
  const vale = economia > custo;

  const reais = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

  return {
    aplicavel: true,
    atual,
    folha_alvo_anual: alvo,
    prolabore_extra_mensal: falta / 12,
    custo_extra_anual: custo,
    economia_anual: economia,
    vale,
    frase: vale
      ? `Subindo o pró-labore em ${reais(falta / 12)} por mês, a folha alcança os ${Math.round(FATOR_R_LIMITE * 100)}% e a empresa nasce no Anexo III: ${reais(economia)} a menos de DAS por ano, contra ${reais(custo)} de INSS a mais. Compensa — e o dinheiro do pró-labore não é gasto, é remuneração do sócio.`
      : `Para alcançar os ${Math.round(FATOR_R_LIMITE * 100)}% seria preciso subir o pró-labore em ${reais(falta / 12)} por mês. O INSS extra (${reais(custo)}/ano) supera a economia de DAS (${reais(economia)}/ano): neste desenho, não compensa forçar o Anexo III.`,
  };
}

export interface EstudoAbertura {
  entrada: EntradaAbertura;
  premissas: Premissas;
  cenarios: CenarioAbertura[];
  /** o regime recomendado no cenário base */
  recomendado: ResultadoRegime | undefined;
  /** a resposta muda entre os cenários? é o que justifica revisar depois */
  estavel: boolean;
  fator_r: EstudoFatorR;
  alertas: string[];
}

export function estudarAbertura(
  e: EntradaAbertura,
  premissasBase: Premissas = PREMISSAS_PADRAO
): EstudoAbertura {
  const premissas = premissasDoSetor(e.setor, premissasBase);

  const cenarios: CenarioAbertura[] = CENARIOS.map((c) => {
    const entrada = entradaAnual(e, c.fator);
    const comparativo = compararRegimes(entrada, premissas);
    return {
      chave: c.chave,
      rotulo: c.rotulo,
      receita_anual: entrada.receita,
      anexo: entrada.anexo,
      comparativo,
      menor: comparativo.menor,
    };
  });

  const base = cenarios.find((c) => c.chave === "base");
  const recomendado = base?.menor;
  const estavel = new Set(cenarios.map((c) => c.menor?.regime ?? "—")).size === 1;

  return {
    entrada: e,
    premissas,
    cenarios,
    recomendado,
    estavel,
    fator_r: estudarFatorR(e, premissas),
    alertas: alertasDeAbertura(e, cenarios, recomendado),
  };
}

/**
 * OS ALERTAS — o que o comparativo de carga não vê.
 *
 * Carga tributária ordena os regimes; ela não diz que o Anexo IV recolhe a
 * contribuição patronal por fora, nem que nascer no Simples puro vendendo
 * para empresa significa entrar em 2027 entregando crédito zero ao comprador.
 * É aqui que o Enquadria sabe algo que uma planilha de regimes não sabe.
 */
export function alertasDeAbertura(
  e: EntradaAbertura,
  cenarios: CenarioAbertura[],
  recomendado: ResultadoRegime | undefined
): string[] {
  const alertas: string[] = [];
  const alto = cenarios.find((c) => c.chave === "alto");
  const base = cenarios.find((c) => c.chave === "base");

  if (base && base.anexo === 4) {
    alertas.push(
      "Anexo IV: a contribuição patronal NÃO está no DAS. É a conta que mais surpreende quem abre construtora — o encargo sobre a folha vem por fora, todo mês."
    );
  }

  if (alto && alto.receita_anual > TETOS.simples) {
    alertas.push(
      "No cenário de crescimento, o faturamento passa do teto do Simples (R$ 4,8 milhões). Não é motivo para não começar nele — é motivo para combinar desde já a revisão quando a receita chegar perto."
    );
  }

  if (e.vende_para_pj && recomendado?.regime === "simples_puro") {
    alertas.push(
      "Os clientes são empresas: a partir de 2027, o Simples unificado entrega crédito de IBS/CBS quase zero a quem compra desta empresa, e isso vira pressão por desconto. Reveja a opção pelo recolhimento por fora do DAS na primeira janela após a abertura."
    );
  }

  if (!e.vende_para_pj) {
    alertas.push(
      "Venda a consumidor final: o crédito de IBS/CBS não pesa na decisão, porque quem compra não aproveita crédito. A conta aqui é de carga, não de competitividade."
    );
  }

  if (e.margem_lucro <= 0.05) {
    alertas.push(
      "Margem projetada muito baixa. Se ela se confirmar, o Lucro Real merece uma segunda olhada — ele tributa o lucro efetivo, não o presumido."
    );
  }

  return alertas;
}

/** a frase de abertura do documento — a conclusão antes da tabela */
export function conclusaoDaAbertura(est: EstudoAbertura): string {
  const nome = est.recomendado?.nome;
  if (!nome) return "Não foi possível recomendar um regime com os dados informados.";
  return est.estavel
    ? `Nos três cenários de faturamento, o regime de menor carga é o mesmo: ${nome}. A escolha não depende de o faturamento vir como projetado — o que é uma boa notícia para quem está começando.`
    : `No faturamento projetado, o regime de menor carga é ${nome} — mas a resposta MUDA nos outros cenários. Vale combinar uma revisão assim que os primeiros meses reais aparecerem.`;
}
