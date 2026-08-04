/**
 * UMA CONTA, UM PLANO — e o que fazer com o que sobra.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * O PROBLEMA, com as palavras de quem viu acontecer:
 *
 *   "eu assinei o mensal e depois mudei para o anual; se eu clicar novamente
 *    no plano, nova fatura."
 *
 * Cada clique em "Assinar" criava uma assinatura nova e uma cobrança nova. Em
 * uma tarde de testes, 17 assinaturas na mesma conta e boletos abertos de dois
 * planos diferentes. Não é só bagunça de tabela: é a chance real de o cliente
 * pagar o boleto errado — e o webhook, obediente, ativar o plano abandonado por
 * cima do que ele acabou de comprar.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * AS TRÊS REGRAS, e o motivo de cada uma:
 *
 *  1. CLICOU DE NOVO NO MESMO PLANO → devolve a cobrança que já existe. Ninguém
 *     quer duas vias do mesmo boleto; quem clica de novo está procurando o link
 *     que perdeu.
 *
 *  2. TROCOU DE PLANO COM A ANTERIOR AINDA NÃO PAGA → a anterior é cancelada,
 *     no Asaas e aqui. A fatura NÃO some da lista: vira "Cancelada". Sumir com
 *     o histórico de uma cobrança é a pior forma de organizar cobrança.
 *
 *  3. TROCOU DE PLANO COM A ANTERIOR PAGA E VALENDO → nada é cancelado agora.
 *     O plano pago continua de pé até o novo ser pago; na confirmação, os dias
 *     que sobravam entram como CRÉDITO no novo. Cancelar na hora do clique
 *     tiraria acesso já pago de quem estava justamente pagando mais.
 *
 * Por que aqui e não na rota: a decisão inteira é aritmética sobre uma lista.
 * Dentro da rota, ela só seria testável com Asaas e banco no ar — ou seja, não
 * seria testada. A data entra como ARGUMENTO pelo mesmo motivo: `new Date()`
 * dentro da função faz o teste depender do dia em que roda.
 */

export type StatusAssinatura = "pendente" | "ativa" | "cancelada" | string;

export interface AssinaturaResumo {
  id: string;
  plano_id: string;
  status: StatusAssinatura;
  /** AAAA-MM-DD — nulo em assinatura sem prazo (cortesia vitalícia) */
  valido_ate?: string | null;
  asaas_id?: string | null;
  checkout_url?: string | null;
}

const DIA = 86_400_000;

/**
 * O DIA É O DO BRASIL, não o do servidor.
 *
 * Um teste banal ("clicar às 23h59 conta os mesmos dias que clicar ao
 * meio-dia") falhou, e o achado é real: o app roda em UTC na Vercel e o
 * contador está em São Paulo. Contando dias pelo relógio do servidor, quem
 * clica no fim da noite perde um dia de crédito — para ele ainda é hoje, para
 * o servidor já é amanhã.
 *
 * Fixar o fuso também é o que torna o resultado igual aqui, na Vercel e na
 * máquina de quem for conferir depois.
 */
const FUSO = "America/Sao_Paulo";
const emSaoPaulo = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** AAAA-MM-DD no calendário brasileiro */
function dataBr(d: Date): string {
  return emSaoPaulo.format(d);
}

/** AAAA-MM-DD → número comparável, sem passar por fuso nenhum */
function serial(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** aceita uma data-calendário ("2026-08-04") ou um instante */
function comoDia(v: Date | string): string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : dataBr(new Date(v));
}

/**
 * Quantos dias ainda restam de uma assinatura paga.
 *
 * Vencida hoje = 0, não negativo: crédito negativo tiraria dias do plano novo,
 * que é o oposto do combinado. Sem data (cortesia sem prazo) também é 0 — dias
 * infinitos não somam em lugar nenhum, e quem tem cortesia não está comprando.
 */
export function diasRestantes(validoAte: string | null | undefined, hoje: Date): number {
  if (!validoAte) return 0;
  const fim = serial(validoAte);
  const agora = serial(dataBr(hoje));
  if (fim === null || agora === null) return 0;
  return Math.max(0, Math.round((fim - agora) / DIA));
}

/**
 * A data em que o plano novo vence: base + dias do plano + crédito herdado.
 *
 * A base aceita string porque é o que o Asaas manda: `confirmedDate` vem como
 * "2026-08-04", e `new Date("2026-08-04")` é meia-noite em UTC — ou seja, 21h
 * do dia ANTERIOR no Brasil. Passar por Date ali custava um dia de acesso a
 * todo mundo que pagasse.
 */
export function validadeFinal(base: Date | string, diasPlano: number, credito = 0): string {
  const s = serial(comoDia(base));
  if (s === null) return "";
  const fim = new Date(s + (Math.max(0, diasPlano) + Math.max(0, credito)) * DIA);
  return fim.toISOString().slice(0, 10);
}

export interface Contratacao {
  /** "reaproveitar": já existe cobrança aberta deste mesmo plano */
  acao: "reaproveitar" | "nova";
  /** quando reaproveita, a assinatura cuja cobrança volta para a tela */
  reaproveitar?: AssinaturaResumo;
  /** ids de assinaturas PENDENTES que perdem a validade agora */
  cancelar: string[];
  /** dias pagos que sobram do plano ativo e entram no novo na confirmação */
  credito_dias: number;
  /** o plano pago que segue valendo até o novo ser pago (não é cancelado aqui) */
  ativa_atual?: AssinaturaResumo;
}

/**
 * O QUE FAZER quando alguém clica em "Assinar" o plano `planoId`.
 *
 * Devolve um plano de ação e não toca em nada: quem grava é a rota, quem
 * cancela no Asaas é a rota. Assim esta decisão inteira roda em teste.
 */
export function decidirContratacao(
  planoId: string,
  assinaturas: AssinaturaResumo[],
  hoje: Date
): Contratacao {
  const pendentes = assinaturas.filter((a) => a.status === "pendente");

  const ativa = assinaturas.find(
    (a) => a.status === "ativa" && (!a.valido_ate || diasRestantes(a.valido_ate, hoje) > 0)
  );

  /* a cobrança aberta deste mesmo plano — só serve se tiver link para onde
     mandar a pessoa; pendente sem checkout_url é lixo de tentativa falha */
  const mesmoPlano = pendentes.filter((a) => a.plano_id === planoId && !!a.checkout_url);
  const reaproveitar = mesmoPlano[mesmoPlano.length - 1];

  const cancelar = pendentes.filter((a) => a.id !== reaproveitar?.id).map((a) => a.id);

  return {
    acao: reaproveitar ? "reaproveitar" : "nova",
    reaproveitar,
    cancelar,
    credito_dias: ativa && ativa.plano_id !== planoId ? diasRestantes(ativa.valido_ate, hoje) : 0,
    ativa_atual: ativa,
  };
}

/**
 * O QUE FAZER quando um pagamento é CONFIRMADO para a assinatura `vencedoraId`.
 *
 * É o único momento em que o plano pago anterior pode cair — e ele cai com os
 * dias que sobravam somados ao novo. Chega aqui pelo webhook, que é o único
 * lugar do sistema onde "pago" é verdade.
 */
export interface Sucessao {
  /** todas as outras assinaturas do escritório que saem de cena */
  cancelar: string[];
  /** dias herdados do plano pago anterior */
  credito_dias: number;
}

export function decidirSucessao(
  vencedoraId: string,
  assinaturas: AssinaturaResumo[],
  hoje: Date
): Sucessao {
  const outras = assinaturas.filter((a) => a.id !== vencedoraId && a.status !== "cancelada");

  /* só a ATIVA gera crédito: pendente é cobrança não paga, e somar dias por
     boleto emitido seria dar acesso de graça a quem só clicou */
  const credito = outras
    .filter((a) => a.status === "ativa")
    .reduce((soma, a) => soma + diasRestantes(a.valido_ate, hoje), 0);

  return { cancelar: outras.map((a) => a.id), credito_dias: credito };
}

/** o texto que a tela mostra quando há dias herdados — some quando não há */
export function fraseCredito(dias: number): string | null {
  if (dias <= 0) return null;
  return dias === 1
    ? "O dia que ainda restava do seu plano atual entra no novo quando o pagamento for confirmado."
    : `Os ${dias} dias que ainda restam do seu plano atual entram no novo quando o pagamento for confirmado.`;
}
