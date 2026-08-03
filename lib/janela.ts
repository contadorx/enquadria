/**
 * A JANELA, num lugar só — e agora o CALENDÁRIO INTEIRO, não só setembro.
 *
 * As datas viviam duplicadas no layout e na tela da janela — duas cópias da
 * mesma verdade que iriam divergir no primeiro ajuste. A Resolução CGSN
 * nº 186/2026 abriu de 1º a 30 de setembro de 2026, com efeito em jan–jun/2027
 * e cancelamento até o último dia de novembro de 2026.
 *
 * POR QUE O ARQUIVO CRESCEU. O produto sabia contar até 30/09 e depois dizia
 * "janela encerrada" para sempre. Isso é o contador lendo, no dia 1º de
 * outubro, que a ferramenta que ele acabou de assinar terminou o serviço —
 * quando na verdade começa ali a parte que quase ninguém trabalha:
 *
 *   · até 31/10 a alíquota de referência é FIXADA. Todo laudo emitido em
 *     setembro saiu com estimativa; com o número real, cada um vira uma
 *     revisão cobrável;
 *   · até 30/11 dá para CANCELAR a opção. Quem optou e viu a conta virar tem
 *     saída — e quem não olhar perde o prazo;
 *   · a opção é semestral, então a mesma carteira volta à mesa em 2027.
 *
 * Um produto de janela morre em outubro. Um produto de CALENDÁRIO atravessa.
 */

export const JANELA = {
  abre: "2026-09-01",
  fecha: "2026-09-30",
  efeito: "janeiro a junho de 2027",
  cancelavel_ate: "2026-11-30",
};

export const MARCOS = {
  abre: JANELA.abre,
  fecha: JANELA.fecha,
  /** prazo da Resolução do Senado para fixar a alíquota de referência */
  aliquota_ate: "2026-10-31",
  cancelavel_ate: JANELA.cancelavel_ate,
  efeito_inicio: "2027-01-01",
  efeito_fim: "2027-06-30",
  /**
   * A PRÓXIMA JANELA É PREVISÃO, NÃO NORMA PUBLICADA.
   *
   * A opção é semestral, então existe uma janela para o segundo semestre de
   * 2027 — mas a data ainda não saiu. Marcar como prevista é o que separa
   * "prepare-se" de "está na lei", e o produto inteiro se sustenta em não
   * confundir os dois.
   */
  proxima_prevista: "2027-03-01",
  proxima_confirmada: false,
};

export interface EstadoJanela {
  /** dias que faltam para 30/09; 0 depois do fechamento */
  dias: number;
  /** posição na régua, 0 a 100 */
  posPct: number;
  /** antes de 1º de setembro a janela ainda não abriu */
  aberta: boolean;
  encerrada: boolean;
}

/**
 * Calculado sempre no SERVIDOR e passado por prop. Chamar `Date` dentro de um
 * componente de cliente faz servidor e navegador renderizarem valores
 * diferentes — e a hidratação quebra sem dizer por quê.
 */
export function estadoDaJanela(agora = Date.now()): EstadoJanela {
  const ini = new Date(JANELA.abre).getTime();
  const fim = new Date(JANELA.fecha).getTime();
  return {
    dias: Math.max(Math.ceil((fim - agora) / 86400000), 0),
    posPct: Math.round(Math.min(Math.max((agora - ini) / (fim - ini), 0), 1) * 100),
    aberta: agora >= ini && agora <= fim,
    encerrada: agora > fim,
  };
}

/* ══════════════════════════════════════════════════════════════════════
   AS FASES DO CALENDÁRIO
   ══════════════════════════════════════════════════════════════════════ */

export type Fase =
  | "antes"        // ainda não abriu
  | "aberta"       // 01/09 a 30/09 — a decisão
  | "aliquota"     // 01/10 a 31/10 — a alíquota está sendo fixada
  | "cancelamento" // 01/11 a 30/11 — última chance de desfazer
  | "efeito"       // 01/12 até a próxima janela — o regime rodando
  | "proxima";     // a partir da próxima janela prevista

export interface FaseAtual {
  fase: Fase;
  /** o que aparece no selo do cockpit */
  selo: string;
  /** a frase que explica o que fazer agora */
  chamada: string;
  /** dias até o marco desta fase; null quando não há contagem */
  dias: number | null;
  /** a data do marco desta fase, em ISO */
  marco: string | null;
  /** true quando a data é previsão, não norma publicada */
  previsto: boolean;
}

const fimDoDia = (iso: string) => new Date(iso + "T23:59:59Z").getTime();

/**
 * Dias que FALTAM, contados até o início do dia do marco — o mesmo critério do
 * `estadoDaJanela` acima. Se um contasse o dia corrente e o outro não, o selo
 * do cockpit e a contagem da régua mostrariam números diferentes para o mesmo
 * prazo, e o contador não teria como saber qual acreditar.
 *
 * No próprio dia do marco devolve 0, e quem exibe traduz isso para
 * "último dia" — que é a informação que importa.
 */
const faltam = (iso: string, agora: number) =>
  Math.max(Math.ceil((new Date(iso + "T00:00:00Z").getTime() - agora) / 86400000), 0);

export function faseDaJanela(agora = Date.now()): FaseAtual {
  if (agora < new Date(MARCOS.abre + "T00:00:00Z").getTime()) {
    return {
      fase: "antes",
      selo:
        faltam(MARCOS.abre, agora) > 0 ? `abre em ${faltam(MARCOS.abre, agora)} dias` : "abre hoje",
      chamada:
        "A janela abre em 1º de setembro. Use o tempo para triar a carteira e chegar no dia 1 com a fila pronta.",
      dias: faltam(MARCOS.abre, agora),
      marco: MARCOS.abre,
      previsto: false,
    };
  }

  if (agora <= fimDoDia(MARCOS.fecha)) {
    const d = faltam(MARCOS.fecha, agora);
    return {
      fase: "aberta",
      selo: d > 1 ? `faltam ${d} dias` : "último dia",
      chamada:
        "A janela está aberta. Depois de 30/09 a decisão fica travada pelo semestre inteiro.",
      dias: d,
      marco: MARCOS.fecha,
      previsto: false,
    };
  }

  if (agora <= fimDoDia(MARCOS.aliquota_ate)) {
    return {
      fase: "aliquota",
      selo:
        faltam(MARCOS.aliquota_ate, agora) > 0
          ? `alíquota em ${faltam(MARCOS.aliquota_ate, agora)} dias`
          : "alíquota sai hoje",
      chamada:
        "A janela fechou, mas a alíquota de referência só é fixada até 31/10. Todo laudo de " +
        "setembro saiu com estimativa — quando o número sair, cada um vira uma revisão cobrável.",
      dias: faltam(MARCOS.aliquota_ate, agora),
      marco: MARCOS.aliquota_ate,
      previsto: false,
    };
  }

  if (agora <= fimDoDia(MARCOS.cancelavel_ate)) {
    return {
      fase: "cancelamento",
      selo:
        faltam(MARCOS.cancelavel_ate, agora) > 0
          ? `cancelar: faltam ${faltam(MARCOS.cancelavel_ate, agora)} dias`
          : "último dia para cancelar",
      chamada:
        "Segunda onda: com a alíquota fixada, dá para refazer a conta de quem optou — e cancelar " +
        "a opção até 30/11 para quem a conta não fechou.",
      dias: faltam(MARCOS.cancelavel_ate, agora),
      marco: MARCOS.cancelavel_ate,
      previsto: false,
    };
  }

  if (agora <= fimDoDia(MARCOS.proxima_prevista)) {
    return {
      fase: "efeito",
      selo: "próxima janela em 2027",
      chamada:
        "O regime escolhido vale de janeiro a junho de 2027. A opção é semestral: a mesma " +
        "carteira volta à mesa na próxima janela, prevista para março.",
      dias: faltam(MARCOS.proxima_prevista, agora),
      marco: MARCOS.proxima_prevista,
      previsto: !MARCOS.proxima_confirmada,
    };
  }

  return {
    fase: "proxima",
    selo: "nova janela",
    chamada:
      "Nova janela de opção. A carteira triada do ano passado é o ponto de partida — e agora " +
      "com seis meses de histórico para comparar.",
    dias: null,
    marco: null,
    previsto: !MARCOS.proxima_confirmada,
  };
}
