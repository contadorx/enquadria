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

/** mensagem do bloqueio, usada na API e onde não couber o muro inteiro */
export function mensagemBloqueio(s: SituacaoPlano): string {
  return `Você já emitiu ${s.usados} de ${s.limite} laudos do plano gratuito. Assine o PRO para emitir laudos e termos ilimitados.`;
}

const moedaBR = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

/**
 * O MURO — a única superfície de conversão que este produto tem.
 *
 * Três decisões deliberadas, cada uma corrigindo um erro comum:
 *
 * 1. NÃO dizer "você atingiu o limite do plano gratuito". É linguagem de
 *    punição no momento de maior valor: o contador acabou de produzir dois
 *    documentos com a marca dele e está tentando o terceiro, que já é para um
 *    cliente de verdade. Punir aqui transforma desejo em frustração.
 *
 * 2. Pôr O NÚMERO DELE contra o NOSSO na mesma linha. O honorário de
 *    referência já está no mapa de risco e é premissa editável dele —
 *    reaproveitar aqui É o argumento: uma análise cobrada paga o ano.
 *
 * 3. Garantir que o que ele já produziu continua dele. Medo de perder o
 *    trabalho feito trava mais assinatura do que preço.
 *
 * Sobre o ANUAL vir primeiro: a opção de IBS/CBS é semestral. Quem assina
 * mensal em setembro emite tudo, não tem o que fazer em outubro e cancela
 * antes de ver o produto funcionar a segunda vez. O argumento do anual não é
 * truque de venda, é o fato do produto — e por isso está escrito na tela.
 */
export interface Muro {
  titulo: string;
  linhas: string[];
  /** a conta lado a lado, quando dá para montar */
  conta: { honorario: number; anual: number; vezes: number } | null;
  nota_anual: string;
  garantia: string;
}

export function montarMuro(
  s: SituacaoPlano,
  honorario: number,
  precoAnualCentavos?: number | null
): Muro {
  const anual = precoAnualCentavos ? precoAnualCentavos / 100 : null;
  const conta =
    anual && anual > 0 && honorario > 0
      ? { honorario, anual, vezes: Math.floor(honorario / anual) }
      : null;

  const proximo = s.usados + 1;
  return {
    titulo: `Você já emitiu ${s.usados} ${s.usados === 1 ? "laudo" : "laudos"}. Este é o ${proximo}º.`,
    linhas: conta
      ? [
          "Uma única análise cobrada do seu cliente paga o Enquadria por um ano inteiro.",
          `Referência da sua tela: ${moedaBR(conta.honorario)} por empresa · o plano anual custa ${moedaBR(conta.anual)}.`,
        ]
      : ["Uma única análise cobrada do seu cliente paga o Enquadria por um ano inteiro."],
    conta,
    nota_anual:
      "A opção é semestral: esta janela fecha em 30/09 e a mesma carteira volta à mesa na janela do primeiro semestre de 2027. O anual cobre as duas.",
    garantia: `Os ${s.usados} laudos que você já emitiu continuam válidos e verificáveis, com ou sem assinatura.`,
  };
}

/** aviso suave quando está perto do limite (não bloqueia) */
export function avisoLimite(s: SituacaoPlano): string | null {
  if (s.ilimitado || s.bloqueado) return null;
  if (s.restantes === 1) return "Resta 1 laudo do plano gratuito.";
  if (s.restantes <= 2) return `Restam ${s.restantes} laudos do plano gratuito.`;
  return null;
}
