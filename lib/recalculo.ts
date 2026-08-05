/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A ANÁLISE QUE CONTRADIZ OS PRÓPRIOS NÚMEROS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O CASO REAL, 05/08/2026 — Transportadora Rota Certa.
 *
 * Custo líquido de −0,051%: NEGATIVO. A empresa paga menos no regime regular
 * pelos créditos das próprias compras, sem depender de negociar preço com
 * ninguém. A árvore do motor manda esse caso para S5 — "optar por vantagem
 * direta". A análise gravada dizia S4, "optar CONDICIONADO A REPASSE", porque
 * foi calculada antes de 26/07, quando S5 ganhou saída própria.
 *
 * O termo saiu assim, e o cartão se contradizia dentro de si mesmo: o título
 * dizia "condicionado a repasse" e o fundamento dizia "a vantagem não depende
 * de renegociar preço com ninguém". Nos pontos a observar aparecia a condição
 * impossível: "o reajuste de preço de −0,1% ser efetivamente aceito pelos
 * clientes" — reajuste negativo não é reajuste a ser aceito.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * COMO A INCOERÊNCIA É DETECTADA: rodando o motor de novo.
 *
 * A alternativa seria uma lista de regras ("cl ≤ 0 tem de ser S5", "rq < rqMin
 * tem de ser S1"). Ela seria uma SEGUNDA cópia da árvore de decisão, e as duas
 * divergiriam na primeira correção — o defeito de sempre. Aqui o teste é o
 * próprio motor: com as MESMAS respostas e os MESMOS parâmetros congelados, ele
 * diz outra coisa? Então a análise é de outra época.
 *
 * OS PARÂMETROS SÃO OS CONGELADOS, e isso é o desenho inteiro. Recalcular com
 * os parâmetros de hoje misturaria duas mudanças — a da árvore e a da alíquota
 * — e o contador não saberia qual delas moveu a recomendação. Aqui só a LÓGICA
 * é a de hoje; a alíquota, o dDAS e as bandas continuam sendo os do dia em que
 * a empresa foi analisada.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * SEM RESPOSTAS OU SEM dDAS, NÃO RECALCULA. Uma análise antiga sem `das`
 * congelado não tem como ser refeita nas condições dela; refazer com o dDAS
 * padrão seria inventar a premissa que mais mexe no resultado. Nesse caso o
 * documento sai como está e o defeito continua visível — que é melhor do que
 * um número novo sem procedência.
 */
import {
  decidir, PARAMETROS_2027, MOTOR_VERSAO, SAIDAS,
  type Parametros, type Resultado, type Respostas, type Saida,
} from "./motor";
import type { AnaliseGravada } from "./laudo";

export interface Recalculo {
  /** houve mudança de saída — só isso é motivo para reescrever a análise */
  mudou: boolean;
  /** por que não foi possível recalcular; null quando foi */
  impedimento: string | null;
  de: Saida | null;
  para: Saida | null;
  resultado: Resultado | null;
  parametros: Parametros | null;
  /** a frase para o contador, pronta; null quando nada mudou */
  aviso: string | null;
}

/**
 * OS PARÂMETROS CONGELADOS, remontados.
 *
 * O que a análise gravou tem precedência sobre a convenção atual em TODO campo.
 * Os defaults só entram no que não existia quando ela foi feita — `rqMin` e
 * `absorcaoMax` só passaram a ser congelados em agosto, e usar o valor de hoje
 * neles é o mais próximo da verdade que existe.
 */
export function parametrosCongelados(a: AnaliseGravada): Parametros | null {
  /* `corteS1` está OBSOLETO no motor e por isso saiu do tipo de
     `AnaliseGravada` — mas análises antigas ainda o carregam no JSON, e ele
     continua sendo passado adiante em vez de descartado */
  const p = (a.parametros ?? {}) as NonNullable<AnaliseGravada["parametros"]> & { corteS1?: number };
  if (p.das == null || p.aliquota == null) return null;
  return {
    ...PARAMETROS_2027,
    aliquota: Number(p.aliquota),
    das: Number(p.das),
    corteS1: p.corteS1 ?? PARAMETROS_2027.corteS1,
    fronteiraMin: p.fronteiraMin ?? PARAMETROS_2027.fronteiraMin,
    fronteiraMax: p.fronteiraMax ?? PARAMETROS_2027.fronteiraMax,
    rqMin: p.rqMin ?? PARAMETROS_2027.rqMin,
    absorcaoMax: p.absorcaoMax ?? PARAMETROS_2027.absorcaoMax,
    rbt12: p.rbt12 ?? null,
    sublimite: p.sublimite ?? PARAMETROS_2027.sublimite,
    bandaSublimite: p.bandaSublimite ?? PARAMETROS_2027.bandaSublimite,
  };
}

const RESPOSTAS_EXIGIDAS = ["b2b", "qual", "cred", "folha", "preco", "conc"] as const;

export function recalcular(a: AnaliseGravada): Recalculo {
  const vazio: Recalculo = {
    mudou: false, impedimento: null, de: a.saida ?? null, para: null,
    resultado: null, parametros: null, aviso: null,
  };

  const r = a.respostas;
  if (!r || RESPOSTAS_EXIGIDAS.some((k) => r[k] == null)) {
    return { ...vazio, impedimento: "a análise não guardou as respostas completas" };
  }
  const p = parametrosCongelados(a);
  if (!p) {
    return {
      ...vazio,
      impedimento:
        "a análise não guardou o dDAS e a alíquota usados — refazer com os de hoje trocaria a " +
        "premissa que mais mexe no resultado",
    };
  }

  const res = decidir(r as unknown as Respostas, p);
  const mudou = !!a.saida && res.saida !== a.saida;

  return {
    mudou,
    impedimento: null,
    de: a.saida ?? null,
    para: res.saida,
    resultado: res,
    parametros: p,
    aviso: mudou ? frase(a.saida as Saida, res.saida) : null,
  };
}

function frase(de: Saida, para: Saida): string {
  return (
    `Esta análise foi refeita na emissão: com as MESMAS respostas e os MESMOS parâmetros ` +
    `daquele dia, o motor de hoje leva de ${de} (${SAIDAS[de]?.titulo ?? "—"}) para ` +
    `${para} (${SAIDAS[para]?.titulo ?? "—"}). O que mudou foi a lógica da decisão, não a ` +
    `premissa — a alíquota, o dDAS e as bandas continuam sendo os da análise original. ` +
    `Confira antes de assinar: o documento congela a versão nova.`
  );
}

/**
 * OS CAMPOS A REGRAVAR quando a saída mudou.
 *
 * O carimbo do motor entra JUNTO: análise refeita sem carimbo novo é a mesma
 * armadilha de novo, seis meses depois, sem nada indicando que ela já passou
 * por aqui.
 */
export function camposRecalculados(rc: Recalculo, parametrosAtuais: Record<string, unknown>) {
  if (!rc.mudou || !rc.resultado) return null;
  const r = rc.resultado;
  return {
    rq: r.rq, ch: r.ch, cl: r.cl, re: r.re, fc: r.fc, saida: r.saida,
    parametros: {
      ...parametrosAtuais,
      motivo: r.motivo,
      motor: MOTOR_VERSAO,
      rqMin: rc.parametros?.rqMin,
      absorcaoMax: rc.parametros?.absorcaoMax,
      /* o rastro do conserto, para a tela de deriva e para quem perguntar
         depois por que o número do laudo não bate com o print de julho */
      recalculada_em: null as string | null,
      recalculada_de: rc.de,
    },
  };
}
