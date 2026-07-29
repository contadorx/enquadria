/**
 * A JANELA, num lugar só.
 *
 * As datas viviam duplicadas no layout e na tela da janela — duas cópias da
 * mesma verdade que iriam divergir no primeiro ajuste. A Resolução CGSN
 * nº 186/2026 abriu de 1º a 30 de setembro de 2026, com efeito em jan–jun/2027
 * e cancelamento até o último dia de novembro de 2026.
 */

export const JANELA = {
  abre: "2026-09-01",
  fecha: "2026-09-30",
  efeito: "janeiro a junho de 2027",
  cancelavel_ate: "2026-11-30",
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
