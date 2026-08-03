/**
 * MÉTRICAS DE RECEITA.
 *
 * Esta suíte já cobriu também um motor de régua de cobrança. Ele foi removido
 * na consolidação de 03/08 — `lib/reguas.ts` já fazia isso — e as asserções
 * dele saíram junto: teste de código que ninguém executa dá a impressão de que
 * algo está protegido quando não há nada rodando ali.
 *
 * As regras da régua que valiam a pena migraram para testes/reguas.test.mjs.
 */
import { valorReal, ehPagante, calcularMetricas } from "./cobranca.js";

let falhas = 0;
const ok = (c, m) => { if (c) console.log("ok:", m); else { console.log("FALHOU:", m); falhas++; } };

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
