/**
 * PLANO E LIMITES — o gate do freemium.
 *
 * A isca é a triagem; o pago é o papel cobrável. O limite incide sobre a
 * EMISSÃO DE LAUDO, não sobre analisar: o contador pode rodar a carteira
 * inteira, ver tudo e sentir o valor — o bloqueio só aparece quando ele vai
 * transformar isso em documento com a marca dele.
 *
 * Regra: limite_analises nulo = ilimitado. Sem assinatura ativa, vale o plano
 * grátis (2 laudos de degustação).
 */

export const LIMITE_GRATIS = 2;

/**
 * COLETA DE DADOS COM A EMPRESA — mesmo desenho, contador próprio.
 *
 * O grátis precisa poder EXPERIMENTAR: mandar o formulário para dois clientes,
 * ver a resposta chegar e sentir o que muda quando os cinco números que não
 * estão na escrituração param de ser chute. Alinhado aos 2 laudos de
 * degustação — dá para rodar uma empresa de ponta a ponta sem pagar nada.
 *
 * O que o grátis não dá é a CARTEIRA. Uma resposta é curiosidade; trinta é
 * método, e método é o que o PRO vende. Reabrir uma coleta encerrada da mesma
 * empresa não consome cota nova: a cota é por empresa perguntada, não por
 * clique — senão o contador que fechou o link sem querer perde uma das duas.
 */
export const LIMITE_COLETAS_GRATIS = 2;

export interface Assinatura {
  plano_id: string | null;
  limite_analises: number | null;
  valido_ate: string | null;
}

export interface SituacaoPlano {
  /** true quando não há teto de emissão */
  ilimitado: boolean;
  limite: number;
  usados: number;
  restantes: number;
  bloqueado: boolean;
  plano_id: string | null;
}

/**
 * Resolve a situação do tenant. `assinatura` vem da RPC assinatura_ativa();
 * quando não há assinatura ativa, cai no plano grátis.
 */
export function situacaoPlano(
  assinatura: Assinatura | null | undefined,
  laudosEmitidos: number
): SituacaoPlano {
  const temAssinatura = !!assinatura?.plano_id;
  const limiteBruto = temAssinatura ? assinatura?.limite_analises ?? null : LIMITE_GRATIS;
  const ilimitado = limiteBruto == null;
  const limite = ilimitado ? Infinity : Number(limiteBruto);
  const usados = Math.max(laudosEmitidos, 0);
  const restantes = ilimitado ? Infinity : Math.max(limite - usados, 0);

  return {
    ilimitado,
    limite,
    usados,
    restantes,
    bloqueado: !ilimitado && usados >= limite,
    plano_id: assinatura?.plano_id ?? null,
  };
}

/** mensagem do bloqueio, usada na API e na tela */
export function mensagemBloqueio(s: SituacaoPlano): string {
  return `Você já emitiu ${s.usados} de ${s.limite} laudos do plano gratuito. Assine o PRO para emitir laudos e termos ilimitados.`;
}

/** aviso suave quando está perto do limite (não bloqueia) */
export function avisoLimite(s: SituacaoPlano): string | null {
  if (s.ilimitado || s.bloqueado) return null;
  if (s.restantes === 1) return "Resta 1 laudo do plano gratuito.";
  if (s.restantes <= 2) return `Restam ${s.restantes} laudos do plano gratuito.`;
  return null;
}
