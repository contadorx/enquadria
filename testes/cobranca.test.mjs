/**
 * A régua e as métricas: as duas coisas onde errar custa dinheiro ou confiança.
 *
 * Cobrar duas vezes o mesmo mês é o e-mail mais caro do produto. MRR inflado é
 * decisão de negócio tomada sobre número falso. As duas famílias vivem aqui.
 */
import {
  devidosHoje, elegivel, jaPagou, distanciaEmDias, competenciaDe, preencher,
  valorReal, ehPagante, calcularMetricas,
} from "./cobranca.js";

let falhas = 0;
const ok = (c, m) => { if (c) console.log("ok:", m); else { console.log("FALHOU:", m); falhas++; } };

const PASSOS = [
  { chave: "emissao", momento: "emissao", dias: 0, assunto: "a", corpo: "b", ativo: true },
  { chave: "antes_5", momento: "vencimento", dias: -5, assunto: "a", corpo: "b", ativo: true },
  { chave: "no_dia", momento: "vencimento", dias: 0, assunto: "a", corpo: "b", ativo: true },
  { chave: "apos_3", momento: "vencimento", dias: 3, assunto: "a", corpo: "b", ativo: true },
  { chave: "desligado", momento: "vencimento", dias: 0, assunto: "a", corpo: "b", ativo: false },
];
const CONTA = {
  id: "t1", status: "ativa", is_teste: false, acesso_cortesia: false, emails_optout: false,
  proximo_vencimento: "2026-09-10", ultimo_pagamento: null, valor_mensal: 297,
};
const VAZIO = new Set();

/* ── datas ───────────────────────────────────────────────────────────── */
ok(distanciaEmDias("2026-09-05", "2026-09-10") === 5, "distância simples");
ok(distanciaEmDias("2026-09-10", "2026-09-05") === -5, "distância negativa");
ok(distanciaEmDias("2026-02-28", "2026-03-01") === 1, "vira o mês certo");
ok(distanciaEmDias("2026-12-31", "2027-01-01") === 1, "vira o ano certo");
ok(competenciaDe("2026-09-10") === "2026-09", "competência é o mês do vencimento");

/* ── o passo certo no dia certo ──────────────────────────────────────── */
ok(devidosHoje(CONTA, PASSOS, "2026-09-05", VAZIO).map(e => e.passo_chave)[0] === "antes_5",
   "cinco dias antes sai o aviso de 5 dias");
ok(devidosHoje(CONTA, PASSOS, "2026-09-10", VAZIO).map(e => e.passo_chave).includes("no_dia"),
   "no dia do vencimento sai o do dia");
ok(devidosHoje(CONTA, PASSOS, "2026-09-13", VAZIO).map(e => e.passo_chave)[0] === "apos_3",
   "três dias depois sai a cobrança");
ok(devidosHoje(CONTA, PASSOS, "2026-09-07", VAZIO).length === 0, "dia sem passo não manda nada");
ok(!devidosHoje(CONTA, PASSOS, "2026-09-10", VAZIO).map(e => e.passo_chave).includes("desligado"),
   "passo desligado não sai");

/* ── a trava contra cobrar duas vezes ────────────────────────────────── */
const jaMandou = new Set(["t1|no_dia|2026-09"]);
ok(devidosHoje(CONTA, PASSOS, "2026-09-10", jaMandou).length === 0,
   "passo já enviado nesta competência não repete");
// mas o MESMO passo no ciclo seguinte precisa sair
const outroCiclo = { ...CONTA, proximo_vencimento: "2026-10-10" };
ok(devidosHoje(outroCiclo, PASSOS, "2026-10-10", jaMandou).length === 1,
   "e volta a sair na competência seguinte");

/* ── quem não pode ser cobrado ───────────────────────────────────────── */
for (const [campo, valor, nome] of [
  ["is_teste", true, "conta de teste"],
  ["acesso_cortesia", true, "cortesia"],
  ["emails_optout", true, "quem pediu para não receber"],
]) {
  const c = { ...CONTA, [campo]: valor };
  ok(!elegivel(c).pode, `${nome} não é elegível`);
  ok(devidosHoje(c, PASSOS, "2026-09-10", VAZIO).length === 0, `${nome} não recebe nada`);
}
for (const st of ["cancelada", "suspensa", "trial"]) {
  ok(devidosHoje({ ...CONTA, status: st }, PASSOS, "2026-09-10", VAZIO).length === 0,
     `conta ${st} não recebe cobrança`);
}
ok(devidosHoje({ ...CONTA, proximo_vencimento: null }, PASSOS, "2026-09-10", VAZIO).length === 0,
   "sem vencimento não há régua");

/* ── quem pagou sai na hora ──────────────────────────────────────────── */
ok(jaPagou({ ...CONTA, ultimo_pagamento: "2026-09-10" }), "pagou no dia quita o ciclo");
ok(jaPagou({ ...CONTA, ultimo_pagamento: "2026-09-12" }), "pagou depois também");
ok(!jaPagou({ ...CONTA, ultimo_pagamento: "2026-08-10" }), "pagamento do ciclo anterior não quita este");
ok(devidosHoje({ ...CONTA, ultimo_pagamento: "2026-09-11" }, PASSOS, "2026-09-13", VAZIO).length === 0,
   "quem pagou não recebe a cobrança de D+3");

/* ── template é burro de propósito ───────────────────────────────────── */
ok(preencher("vence {{vencimento}}, {{valor}}", { vencimento: "10/09", valor: "R$ 297,00" })
   === "vence 10/09, R$ 297,00", "troca as marcações");
ok(preencher("oi {{inexistente}}!", {}) === "oi !", "marcação sem valor vira vazio, não sobra na tela");

/* ── MRR: o erro que infla receita ───────────────────────────────────── */
const base = { status: "ativa", is_teste: false, acesso_cortesia: false, valor_mensal: 297,
  ultimo_pagamento: "2026-08-01", ultimo_pagamento_valor: 297, ciclo_cobranca: "mensal", cancelado_em: null };

ok(ehPagante(base), "ativa com pagamento confirmado é pagante");
ok(!ehPagante({ ...base, ultimo_pagamento: null }),
   "assinou e NUNCA pagou não entra no MRR — o erro clássico do gateway");
ok(!ehPagante({ ...base, is_teste: true }), "conta de teste nunca é pagante");
ok(!ehPagante({ ...base, acesso_cortesia: true }), "cortesia tem acesso, não é receita");
ok(valorReal({ ...base, ciclo_cobranca: "anual", ultimo_pagamento_valor: 2400 }) === 200,
   "anual vira mensal dividindo por 12");
ok(valorReal({ ...base, ultimo_pagamento_valor: 190 }) === 190,
   "vale o que foi pago, não o preço de tabela");

const m = calcularMetricas([
  base,
  { ...base, ultimo_pagamento_valor: 197 },
  { ...base, is_teste: true, ultimo_pagamento_valor: 9999 },
  { ...base, status: "trial", ultimo_pagamento: null, ultimo_pagamento_valor: null },
  { ...base, status: "cancelada", cancelado_em: "2026-08-15T00:00:00Z" },
], "2026-08");
ok(m.mrr === 494, "MRR soma só os pagantes reais (297+197)");
ok(m.ignoradasTeste === 1, "e informa quantas contas de teste ficaram de fora");
ok(m.pagantes === 2, "conta os pagantes");
ok(m.ticket === 247, "ticket = MRR / pagantes");
ok(m.arr === 494 * 12, "ARR é MRR × 12");
ok(m.mrrPotencial === 297, "trial entra no potencial, não no MRR");
ok(Math.round(m.churnPct) === 33, "churn = 1 cancelada / (2 pagantes + 1)");

const semChurn = calcularMetricas([base], "2026-08");
ok(semChurn.churnPct === null || semChurn.churnPct === 0, "sem cancelamento, churn é zero ou nulo");
ok(semChurn.ltv === null, "LTV com churn zero é nulo, não um número gigante num slide");

process.exit(falhas ? 1 : 0);
