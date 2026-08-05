/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RBT12 PROJETADA — a conta é decidida em 2026 e vivida em 2027.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O DEFEITO QUE ISTO CORRIGE, e ele é estrutural, não de arredondamento.
 *
 * A opção se exerce até 30/09/2026 e produz efeito de JANEIRO A JUNHO DE 2027.
 * Até aqui o motor calculava a parcela que sai do DAS com a RBT12 de HOJE — a
 * receita dos doze meses que terminam na análise. Para uma empresa parada, dá
 * no mesmo. Para uma empresa que cresce 25% ao ano, não: em junho de 2027 ela
 * pode estar duas faixas acima, com outra alíquota efetiva, outra parcela de
 * PIS/Cofins saindo do DAS e — no limite — fora do Simples.
 *
 * O laudo afirmava um número para um período em que ele já não valia.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * POR QUE OS DOIS EXTREMOS BASTAM.
 *
 * A RBT12 projetada é MONÓTONA no tempo: com crescimento positivo ela só sobe,
 * com crescimento negativo só desce. A faixa é monótona na RBT12. Logo, se a
 * saída da árvore é a mesma no início e no fim do período de efeito, ela é a
 * mesma o período inteiro — não é necessário varrer mês a mês, e dizer isso é
 * mais honesto do que simular doze pontos e dar ao leitor a impressão de que
 * houve uma simulação.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DE ONDE VEM O CRESCIMENTO, e por que a ordem importa.
 *
 *   1. MEDIDO — RBT12 de hoje contra a RBT12 de doze meses atrás. É um número
 *      que o contador TEM: sai do mesmo relatório de onde saiu a RBT12. Não é
 *      opinião sobre o futuro, é o que a empresa fez.
 *   2. INFORMADO — o contador digitou uma expectativa. Vale, e o laudo diz que
 *      é expectativa.
 *   3. NENHUM — sem os dois, projeção é chute. A função devolve `null` em vez
 *      de projetar com 0% e fingir que 0% foi uma medição. O laudo não ganha
 *      uma seção nova, e é isso que deve acontecer.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * O QUE ESTA CAMADA NÃO FAZ. Ela não recomenda. Quando os dois cenários
 * discordam, a saída vai para S3 — decisão do empresário — porque o que decide
 * é o faturamento de 2027, que ninguém neste documento conhece. Vender
 * projeção como certeza é o erro mais caro que um laudo pode cometer, e é
 * exatamente o que "otimizar" esta camada produziria.
 */
import {
  decidir, dDASefetivo, faixaDe, moeda, pct,
  type Respostas, type Parametros, type Resultado, type Saida,
} from "./motor";

/** sublimite de ICMS/ISS do Simples Nacional */
export const SUBLIMITE = 3_600_000;
/** teto de receita do Simples Nacional */
export const TETO_SIMPLES = 4_800_000;

/**
 * HORIZONTE PADRÃO — 9 meses.
 *
 * A janela fecha em 30/09/2026 e o efeito vai até 30/06/2027: nove meses entre
 * a decisão e o fim do período em que ela vale. É o horizonte conservador (o
 * ponto mais distante), e o argumento de monotonicidade acima garante que ele,
 * com o ponto de hoje, delimita o período inteiro.
 */
export const MESES_ATE_FIM_DO_EFEITO = 9;

export interface EntradaProjecao {
  /** RBT12 de hoje */
  rbt12: number;
  /** RBT12 de doze meses atrás — quando existe, o crescimento é MEDIDO */
  rbt12_anterior?: number | null;
  /** crescimento anual em fração (0,25 = 25%), quando informado à mão */
  crescimento?: number | null;
  /** horizonte em meses; padrão 9 */
  meses?: number;
  /** anexo, para localizar a faixa */
  anexo: number;
}

export interface Projecao {
  rbt12: number;
  rbt12_projetado: number;
  /** crescimento anual usado, em fração */
  crescimento: number;
  origem: "medido" | "informado";
  meses: number;
  faixa: number | null;
  faixa_projetada: number | null;
  das: number;
  das_projetado: number;
  muda_faixa: boolean;
  /** a RBT12 cruza o sublimite de ICMS/ISS dentro do período de efeito */
  cruza_sublimite: boolean;
  /** a RBT12 cruza o teto do Simples: em 2027 a empresa não é mais optante */
  cruza_teto: boolean;
  /** já está acima do teto hoje — não há decisão de setembro a tomar */
  acima_do_teto_hoje: boolean;
}

/**
 * A projeção em si. Devolve `null` quando não há base para projetar — e essa é
 * a resposta certa, não 0% de crescimento.
 */
export function projetarRBT12(e: EntradaProjecao): Projecao | null {
  const meses = e.meses ?? MESES_ATE_FIM_DO_EFEITO;
  if (!(e.rbt12 > 0) || !(meses > 0)) return null;

  let crescimento: number;
  let origem: Projecao["origem"];
  if (e.rbt12_anterior != null && Number(e.rbt12_anterior) > 0) {
    crescimento = e.rbt12 / Number(e.rbt12_anterior) - 1;
    origem = "medido";
  } else if (e.crescimento != null && isFinite(Number(e.crescimento))) {
    crescimento = Number(e.crescimento);
    origem = "informado";
  } else {
    return null;
  }

  /**
   * CRESCIMENTO COMPOSTO, não linear. (1+g)^(m/12) e não 1 + g×(m/12).
   * Com 25% ao ano em 9 meses a diferença é de 0,4 ponto — pequena aqui, e
   * grande no dia em que alguém usar 24 meses. Composto é o que "ao ano"
   * significa.
   *
   * Piso em −100%: crescimento abaixo disso é receita negativa.
   */
  const g = Math.max(crescimento, -0.999999);
  const projetado = e.rbt12 * Math.pow(1 + g, meses / 12);

  const faixa = faixaDe(e.anexo, e.rbt12);
  const faixaProj = faixaDe(e.anexo, projetado);
  const das = dDASefetivo(e.anexo, e.rbt12).das;
  const dasProj = dDASefetivo(e.anexo, projetado).das;

  return {
    rbt12: e.rbt12,
    rbt12_projetado: projetado,
    crescimento,
    origem,
    meses,
    faixa,
    faixa_projetada: faixaProj,
    das,
    das_projetado: dasProj,
    muda_faixa: faixa !== faixaProj,
    /* "cruza" é atravessar a linha DENTRO do período. Quem já está do outro
       lado hoje não cruza nada — está lá, e isso é outro assunto. */
    cruza_sublimite: e.rbt12 <= SUBLIMITE && projetado > SUBLIMITE,
    cruza_teto: e.rbt12 <= TETO_SIMPLES && projetado > TETO_SIMPLES,
    acima_do_teto_hoje: e.rbt12 > TETO_SIMPLES,
  };
}

export interface DecisaoProjetada {
  hoje: Resultado;
  projetado: Resultado;
  /** as duas contas discordam sobre optar ou não */
  divergem: boolean;
  /** a saída final: a de hoje, ou S3 quando as duas discordam */
  saida: Saida;
  motivo: string;
  projecao: Projecao;
  /** as frases que vão para a seção do laudo, na ordem */
  linhas: string[];
}

/**
 * As duas contas, lado a lado, e a saída que sobrevive às duas.
 *
 * REGRA: divergência não é empate a ser desempatado pelo motor — é a informação
 * de que a decisão depende do faturamento de 2027. Vai para S3.
 */
export function decidirComProjecao(
  r: Respostas,
  p: Parametros,
  proj: Projecao
): DecisaoProjetada {
  const hoje = decidir(r, { ...p, das: proj.das, rbt12: proj.rbt12 });
  const projetado = decidir(r, { ...p, das: proj.das_projetado, rbt12: proj.rbt12_projetado });
  const divergem = hoje.saida !== projetado.saida;

  const linhas: string[] = [];
  const gTxt = `${(proj.crescimento * 100).toFixed(1).replace(".", ",")}% ao ano`;
  linhas.push(
    proj.origem === "medido"
      ? `A receita dos últimos doze meses cresceu ${gTxt} sobre os doze anteriores. ` +
        `Mantido esse ritmo, a RBT12 em junho de 2027 será de ${moeda(proj.rbt12_projetado)}.`
      : `Com a expectativa informada de ${gTxt}, a RBT12 em junho de 2027 será de ` +
        `${moeda(proj.rbt12_projetado)}. É expectativa, não medição.`
  );

  if (proj.muda_faixa) {
    linhas.push(
      `A empresa muda da faixa ${proj.faixa} para a faixa ${proj.faixa_projetada} dentro do ` +
        `período de efeito. A parcela que sai do DAS passa de ${pct(proj.das, 2)} para ` +
        `${pct(proj.das_projetado, 2)} da receita, e é ela que sustenta a conta deste laudo.`
    );
  } else {
    linhas.push(
      `A faixa não muda dentro do período de efeito: a parcela que sai do DAS permanece em ` +
        `${pct(proj.das, 2)} da receita.`
    );
  }

  /* os dois cruzamentos, em ordem de gravidade */
  if (proj.acima_do_teto_hoje) {
    linhas.push(
      `A RBT12 de hoje (${moeda(proj.rbt12)}) já supera o teto do Simples Nacional de ` +
        `${moeda(TETO_SIMPLES)}. Não há decisão de setembro a tomar: a empresa não é optante.`
    );
  } else if (proj.cruza_teto) {
    linhas.push(
      `ALERTA — a projeção ultrapassa o teto do Simples Nacional (${moeda(TETO_SIMPLES)}) dentro ` +
        "do período de efeito. Se isso se confirmar, a empresa é excluída do Simples e apurará " +
        "IBS e CBS pelo regime regular de qualquer forma: a opção perde objeto, e o que passa a " +
        "importar é preparar a transição, não decidir sobre ela."
    );
  }
  if (proj.cruza_sublimite) {
    linhas.push(
      `ALERTA — a projeção ultrapassa o sublimite de ${moeda(SUBLIMITE)} dentro do período de ` +
        "efeito. Acima dele, ICMS e ISS saem do documento único por força do próprio Simples, e a " +
        "comparação entre permanecer e apurar por fora muda de natureza no meio do exercício."
    );
  }

  let saida: Saida;
  let motivo: string;
  if (divergem) {
    saida = "S3";
    motivo =
      `Com a RBT12 de hoje a conta indica ${hoje.saida}; com a RBT12 projetada para o fim do ` +
      `período de efeito, ${projetado.saida}. A decisão depende do faturamento de 2027, que este ` +
      "laudo não conhece — os dois cenários vão à mesa do empresário.";
    linhas.push(motivo);
  } else {
    saida = hoje.saida;
    motivo = hoje.motivo;
    linhas.push(
      "As duas contas — RBT12 de hoje e RBT12 projetada — levam à mesma saída. Como a RBT12 " +
        "cresce (ou cai) de forma monótona, e a faixa acompanha, a recomendação vale para todo o " +
        "período de efeito, e não só para as duas datas conferidas."
    );
  }

  return { hoje, projetado, divergem, saida, motivo, projecao: proj, linhas };
}
