/**
 * AS CONTAS DO NEGÓCIO — a parte que não fala com o banco.
 *
 * Separado de `lib/negocio.ts` por um motivo prático: aquele arquivo importa o
 * cliente do Supabase no topo, e um arquivo assim não roda numa suíte de
 * função pura — o teste precisaria de banco, de sessão e de `next/headers`,
 * ou seja, não existiria.
 *
 * Aqui ficam os tipos e a aritmética. Lá fica a busca. `lib/negocio.ts`
 * reexporta tudo isto, então nenhum import de tela precisou mudar.
 */

export interface Escritorio {
  id: string;
  nome: string | null;
  email: string | null;
  criado_em: string | null;
  plano_id: string | null;
  plano_nome: string | null;
  plano_ciclo: string | null;
  status: string;
  valor_centavos: number | null;
  vencimento: string | null;
  assinatura_id: string | null;
  checkout_url: string | null;
  asaas_id: string | null;
  usuarios: number;
  empresas: number;
  faixa_a: number;
  analises: number;
  laudos: number;
  termos: number;
  assinados: number;
  ultima_analise: string | null;
  ultimo_laudo: string | null;

  /* ── marcações da conta (0044) ─────────────────────────────────────────── */
  is_teste?: boolean;
  emails_optout?: boolean;
  /** status COMERCIAL da conta, em `tenants` — não confundir com o `status` do
   *  contrato, logo acima, que vem de `assinaturas` */
  status_conta?: string;

  /* ── o pagamento REAL, vindo de `faturas` (0047) ───────────────────────── */
  /** data da última fatura PAGA — o único registro que ninguém digita */
  pago_em?: string | null;
  pago_valor_centavos?: number | null;
  pagas?: number;
  fatura_aberta_centavos?: number | null;
  fatura_aberta_vence?: string | null;

  /* ── a conta, do lado que não é contrato (0047) ────────────────────────── */
  crc?: string | null;
  acesso_cortesia?: boolean;
  cortesia_ate?: string | null;
  cortesia_motivo?: string | null;
  obs_admin?: string | null;
  cancelado_em?: string | null;
  cancelado_motivo?: string | null;

  /* ── o que foi DIGITADO em `tenants`, para comparar (0047) ─────────────── */
  t_valor_mensal?: number | null;
  t_ultimo_pagamento?: string | null;
  t_ultimo_pagamento_valor?: number | null;
  t_ciclo?: string | null;
  t_proximo_vencimento?: string | null;
}

export interface Plano {
  id: string;
  nome: string;
  descricao: string | null;
  chamada: string | null;
  preco_centavos: number;
  recorrente: boolean;
  ativo: boolean;
  publico: boolean;
  destaque: boolean;
  ordem: number;
  ciclo: string | null;
  dias_acesso: number | null;
  limite_analises: number | null;
  limite_empresas: number | null;
  limite_usuarios: number | null;
  recursos: string[];
}

export interface Recurso {
  chave: string;
  nome: string;
  descricao: string | null;
  categoria: string;
  ordem: number;
}

export interface Acao {
  tipo: string;
  urgencia: "alta" | "media" | "baixa";
  escritorio: string;
  detalhe: string;
  valor?: number;
  tenant_id: string;
}

export interface Negocio {
  erro?: string;
  /** receita mensal normalizada, em centavos (anual entra dividido por 12) */
  mrr: number;
  arr: number;
  ticket: number;
  mrrEmRisco: number;
  assinantes: number;
  gratuitos: number;
  vencendo: number;
  vencidos: number;
  novosNoMes: number;
  /** escritórios que já emitiram pelo menos 1 laudo */
  provaram: number;
  conversao: number;
  funil: { etapa: string; n: number; pct: number; nota: string }[];
  porPlano: { nome: string; assinantes: number; mrr: number; pct: number }[];
  uso: { empresas: number; analises: number; laudos: number; termos: number; assinados: number };
  historico: { mes: string; mrr: number; assinantes: number }[];
  /** o extrato: o que entrou, o que está em aberto, o que venceu */
  caixa: Caixa;
  /** o que não pôde ser lido — número zerado por falha não pode passar por número */
  avisos: string[];
  janela: { abre: string; fecha: string; dias: number; pct: number };
  acoes: Acao[];
  meta: { assinantes: number; mrr: number };
  escritorios: Escritorio[];
  planos: Plano[];
  recursos: Recurso[];
  config: Record<string, any>;
}

const DIA = 86_400_000;
const dias = (de: string | Date, ate: string | Date = new Date()) =>
  Math.floor((new Date(ate).getTime() - new Date(de).getTime()) / DIA);

export const brl = (centavos: number) =>
  ((Number(centavos) || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });

export const brl2 = (centavos: number) =>
  ((Number(centavos) || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });

/**
 * MRR normalizado de um escritório: o anual entra dividido por 12.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * O BUG QUE ZERAVA A RECEITA INTEIRA.
 *
 * `assinaturas.valor_centavos` é NULL em toda assinatura criada pelo checkout
 * — a rota nunca gravou esse campo. Como esta função lia SÓ dele, o assinante
 * PRO mensal que acabou de pagar entrava como R$ 0. E não era só o MRR: ticket
 * médio, receita por plano, MRR em risco, histórico e o valor de cada linha da
 * fila de ação saem todos daqui. Uma coluna vazia zerava o painel inteiro, com
 * dinheiro real na conta.
 *
 * A CORREÇÃO TEM DUAS PARTES, e as duas são necessárias:
 *
 *   · o checkout passou a gravar `valor_centavos` (dali para a frente);
 *   · esta função caiu para o PREÇO DO PLANO quando o campo está vazio — que é
 *     o que conserta o histórico já gravado, sem precisar de migração de dados.
 *
 * A ordem importa: o valor da assinatura vem primeiro porque ele é o que foi
 * realmente combinado com AQUELE escritório. Um desconto negociado não pode ser
 * apagado pelo preço de tabela.
 * ───────────────────────────────────────────────────────────────────────────
 */
export function mrrDe(e: Escritorio, planos: Plano[] = []): number {
  if (e.status !== "ativa") return 0;

  const combinado = Number(e.valor_centavos || 0);
  const tabela = Number(planos.find((p) => p.id === e.plano_id)?.preco_centavos || 0);
  const v = combinado || tabela;
  if (!v) return 0;

  /* o ciclo também pode faltar: sem ele, o plano é a segunda opinião */
  const ciclo = e.plano_ciclo || planos.find((p) => p.id === e.plano_id)?.ciclo || null;
  if (ciclo === "anual") return Math.round(v / 12);
  if (ciclo === "mensal") return v;
  return 0; // avulso não é receita recorrente
}

/**
 * O DINHEIRO QUE ENTROU DE VERDADE — e não a projeção.
 *
 * MRR é promessa: o que a base ativa vale por mês SE todo mundo continuar. Não
 * é o que caiu na conta. Faltava a segunda pergunta, que é a que se faz olhando
 * o extrato: quanto recebi, quanto está em aberto, quanto venceu e ninguém
 * pagou. Com a central de faturas no ar, a resposta existe e não estava em
 * lugar nenhum do painel.
 *
 * Função pura sobre as faturas, com a data injetada — vencido é pendente com
 * data no passado, e isso não pode ser calculado com `new Date()` no meio de
 * um componente.
 */
export interface Caixa {
  recebido_mes: number;
  recebido_total: number;
  aberto: number;
  vencido: number;
  /** quantas cobranças venceram sem pagamento — cada uma é um telefonema */
  vencidas: number;
  pagas: number;
}

/**
 * O MÊS E O DIA NO CALENDÁRIO BRASILEIRO.
 *
 * `toISOString().slice(0,7)` é o mês em UTC. Depois das 21h do último dia do
 * mês, o UTC já virou: o card "Recebido no mês" zerava e passava a mostrar o
 * mês seguinte enquanto o usuário ainda estava no mês corrente. E um pagamento
 * confirmado em 31/08 às 22h era gravado como 01/09 e contava em setembro.
 */
const emSP = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric", month: "2-digit", day: "2-digit",
});
export function diaBr(d: Date): string {
  return emSP.format(d);
}
export function mesBr(d: Date | string): string {
  if (typeof d === "string") {
    // data-calendário já vem no formato certo; timestamp passa pelo fuso
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.slice(0, 7) : emSP.format(new Date(d)).slice(0, 7);
  }
  return emSP.format(d).slice(0, 7);
}

export function caixaDe(
  faturas: { status: string; valor_centavos: number; vencimento?: string | null; pago_em?: string | null }[],
  hoje: Date
): Caixa {
  const mes = mesBr(hoje);
  const hojeISO = diaBr(hoje);
  const c: Caixa = { recebido_mes: 0, recebido_total: 0, aberto: 0, vencido: 0, vencidas: 0, pagas: 0 };

  for (const f of faturas) {
    const v = Number(f.valor_centavos || 0);
    if (f.status === "pago") {
      c.recebido_total += v;
      c.pagas++;
      if (f.pago_em && mesBr(f.pago_em) === mes) c.recebido_mes += v;
      continue;
    }
    if (f.status === "cancelado" || f.status === "estornado") continue;

    // pendente ou vencido: a data decide, não o rótulo que o webhook gravou
    const venceu = f.status === "vencido" || (!!f.vencimento && f.vencimento < hojeISO);
    if (venceu) {
      c.vencido += v;
      c.vencidas++;
    } else {
      c.aberto += v;
    }
  }
  return c;
}

export function ativo(e: Escritorio): boolean {
  if (e.status !== "ativa") return false;
  return !e.vencimento || new Date(e.vencimento) >= new Date();
}

