/**
 * MÉTRICAS DE NEGÓCIO — a receita que aparecia como zero, e a que não aparecia.
 *
 * Duas denúncias numa frase só: "tem valores pagos não apresentados". Por trás
 * dela, dois problemas diferentes:
 *
 *   1. o MRR lia SÓ `assinaturas.valor_centavos`, que o checkout nunca gravou.
 *      Assinante PRO pagante entrava como R$ 0 — e com ele iam junto ticket,
 *      receita por plano, MRR em risco e o valor de cada linha da fila de ação;
 *
 *   2. o dinheiro que REALMENTE entrou não tinha métrica nenhuma. O painel
 *      falava de MRR (promessa) e nada de caixa (extrato).
 *
 * A data entra como argumento em `caixaDe` pelo motivo de sempre: vencido é
 * pendente com data no passado, e isso não pode depender do dia em que o teste
 * roda.
 */

import { mrrDe, caixaDe } from "./negocio-calc.js";

let falhou = 0;
const ok = (nome, cond, detalhe) => {
  if (cond) console.log("ok:", nome);
  else {
    falhou++;
    console.log("FALHOU:", nome, detalhe === undefined ? "" : JSON.stringify(detalhe));
  }
};

const PLANOS = [
  { id: "gratis", nome: "Gratuito", preco_centavos: 0, ciclo: null },
  { id: "assinatura", nome: "PRO", preco_centavos: 4700, ciclo: "mensal" },
  { id: "pro_anual", nome: "PRO anual", preco_centavos: 47000, ciclo: "anual" },
];
const E = (extra) => ({
  id: "t1", nome: "Escritório", email: "a@b.c", criado_em: null,
  plano_id: null, plano_nome: null, plano_ciclo: null, status: "gratis",
  valor_centavos: null, vencimento: null, assinatura_id: null, checkout_url: null,
  asaas_id: null, usuarios: 1, empresas: 0, faixa_a: 0, analises: 0, laudos: 0,
  termos: 0, assinados: 0, ultima_analise: null, ultimo_laudo: null,
  ...extra,
});

/* ══════════════════════════════════════════════════════════ MRR ═════════ */
ok("mensal com valor gravado",
   mrrDe(E({ status: "ativa", plano_id: "assinatura", plano_ciclo: "mensal", valor_centavos: 4700 }), PLANOS) === 4700);
ok("anual entra dividido por 12",
   mrrDe(E({ status: "ativa", plano_id: "pro_anual", plano_ciclo: "anual", valor_centavos: 47000 }), PLANOS) === 3917,
   mrrDe(E({ status: "ativa", plano_id: "pro_anual", plano_ciclo: "anual", valor_centavos: 47000 }), PLANOS));

/* O CASO REAL DA BASE: assinante PRO ativo e pagante, com valor_centavos NULL
   porque o checkout nunca gravou o campo. Entrava como R$ 0. */
ok("assinatura SEM valor gravado cai para o preço do plano",
   mrrDe(E({ status: "ativa", plano_id: "assinatura", plano_ciclo: "mensal", valor_centavos: null }), PLANOS) === 4700,
   mrrDe(E({ status: "ativa", plano_id: "assinatura", plano_ciclo: "mensal", valor_centavos: null }), PLANOS));
ok("...e sem o ciclo também, lendo o do plano",
   mrrDe(E({ status: "ativa", plano_id: "pro_anual", plano_ciclo: null, valor_centavos: null }), PLANOS) === 3917);

/* o desconto negociado não pode ser apagado pelo preço de tabela */
ok("valor combinado vence o preço de tabela",
   mrrDe(E({ status: "ativa", plano_id: "assinatura", plano_ciclo: "mensal", valor_centavos: 2900 }), PLANOS) === 2900);

ok("quem não está ativo não é receita",
   mrrDe(E({ status: "pendente", plano_id: "assinatura", plano_ciclo: "mensal", valor_centavos: 4700 }), PLANOS) === 0);
ok("cancelada também não",
   mrrDe(E({ status: "cancelada", plano_id: "assinatura", plano_ciclo: "mensal", valor_centavos: 4700 }), PLANOS) === 0);
ok("gratuito ativo não vira receita (preço zero)",
   mrrDe(E({ status: "ativa", plano_id: "gratis", plano_ciclo: null, valor_centavos: null }), PLANOS) === 0);
ok("avulso não é recorrente",
   mrrDe(E({ status: "ativa", plano_id: "x", plano_ciclo: "avulso", valor_centavos: 9900 }), PLANOS) === 0);
/* sem a lista de planos a função ainda tem que funcionar como antes */
ok("sem lista de planos, não quebra", mrrDe(E({ status: "ativa", plano_ciclo: "mensal", valor_centavos: 4700 })) === 4700);

/* ════════════════════════════════════════════════════════ CAIXA ═════════ */
const HOJE = new Date("2026-08-04T15:00:00Z");
const F = (status, valor, extra = {}) => ({ status, valor_centavos: valor, ...extra });

{
  const c = caixaDe(
    [
      F("pago", 47000, { pago_em: "2026-08-02T10:00:00Z" }),
      F("pago", 4700, { pago_em: "2026-07-15T10:00:00Z" }),
      F("pendente", 4700, { vencimento: "2026-08-20" }),
      F("pendente", 4700, { vencimento: "2026-07-20" }), // venceu e ninguém marcou
      F("vencido", 4700, { vencimento: "2026-06-30" }),
      F("cancelado", 99900, { vencimento: "2026-08-10" }),
      F("estornado", 47000, {}),
    ],
    HOJE
  );
  ok("recebido no MÊS só conta o que caiu neste mês", c.recebido_mes === 47000, c.recebido_mes);
  ok("recebido total soma tudo que foi pago", c.recebido_total === 51700, c.recebido_total);
  ok("em aberto é só o que ainda está no prazo", c.aberto === 4700, c.aberto);
  /* o rótulo do banco não manda sozinho: a data decide */
  ok("pendente com data no passado conta como VENCIDO", c.vencido === 9400, c.vencido);
  ok("...e são 2 telefonemas, não 1", c.vencidas === 2, c.vencidas);
  /* a soma dos três baldes = tudo menos a cancelada (99900) e a estornada
     (47000). Se alguma delas vazasse para qualquer balde, este número muda. */
  ok("cancelada e estornada não entram em balde nenhum",
     c.aberto + c.vencido + c.recebido_total === 65800,
     { aberto: c.aberto, vencido: c.vencido, total: c.recebido_total });
  ok("estornada não conta como cobrança paga", c.pagas === 2, c.pagas);
}
{
  /* fatura paga sem data de pagamento: entra no total, não no mês — inventar
     o mês faria a receita do mês subir sozinha */
  const c = caixaDe([F("pago", 4700, { pago_em: null })], HOJE);
  ok("paga sem data entra no total e não no mês", c.recebido_total === 4700 && c.recebido_mes === 0, c);
}
{
  const c = caixaDe([], HOJE);
  ok("sem faturas, tudo zero",
     c.recebido_mes + c.recebido_total + c.aberto + c.vencido + c.vencidas + c.pagas === 0);
}
{
  /* vence HOJE ainda está em aberto: cobrar quem tem o dia inteiro para pagar
     queima a régua de cobrança */
  const c = caixaDe([F("pendente", 4700, { vencimento: "2026-08-04" })], HOJE);
  ok("o que vence hoje ainda está em aberto", c.aberto === 4700 && c.vencido === 0, c);
}

console.log(falhou === 0 ? "\nTUDO PASSOU" : `\n${falhou} FALHA(S)`);
process.exit(falhou === 0 ? 0 : 1);
