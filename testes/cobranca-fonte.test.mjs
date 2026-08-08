/**
 * DE ONDE VEM O NÚMERO DO MRR — e o que acontece quando as fontes discordam.
 *
 * Até 05/08/2026 existiam duas telas para o mesmo escritório, com fontes
 * diferentes e as duas editáveis: Contas escrevia em `tenants`, Cobranças em
 * `assinaturas`. O mesmo escritório tinha status em dois lugares e valor em
 * dois, e o MRR saía do lado digitado à mão.
 *
 * Esta suíte trava a ordem nova: fatura paga > contrato > digitado. E trava o
 * que é mais importante que a ordem — que a divergência APAREÇA em vez de ser
 * resolvida em silêncio.
 */
import { valorReal, ehPagante, origemDoValor, divergencias, calcularMetricas } from "./cobranca.js";

let f = 0;
const ok = (c, m, e) => {
  if (!c) { f++; console.log("FALHOU:", m, e === undefined ? "" : JSON.stringify(e)); }
  else console.log("ok:", m);
};
const perto = (a, b) => Math.abs(a - b) < 0.005;

const conta = (x = {}) => ({
  status: "ativa", is_teste: false, acesso_cortesia: false,
  valor_mensal: null, ultimo_pagamento: null, ultimo_pagamento_valor: null,
  ciclo_cobranca: "mensal", cancelado_em: null,
  pago_em: null, pago_valor_centavos: null, contrato_centavos: null,
  ...x,
});

/* ═══════════════════════════════ 1 · a ordem da cascata ═════════════════ */
const completa = conta({
  pago_valor_centavos: 19000, contrato_centavos: 25000,
  ultimo_pagamento_valor: 297, valor_mensal: 397, ultimo_pagamento: "2026-07-11",
});
ok(perto(valorReal(completa), 190), "a FATURA PAGA vence todo o resto", valorReal(completa));
ok(origemDoValor(completa) === "fatura", "e a tela sabe dizer que veio da fatura");

const semFatura = conta({ contrato_centavos: 25000, ultimo_pagamento_valor: 297, valor_mensal: 397 });
ok(perto(valorReal(semFatura), 250), "sem fatura, vale o CONTRATO", valorReal(semFatura));
ok(origemDoValor(semFatura) === "contrato", "e a origem é o contrato");

const soDigitado = conta({ ultimo_pagamento_valor: 297, valor_mensal: 397 });
ok(perto(valorReal(soDigitado), 297), "sem fatura e sem contrato, vale o digitado", valorReal(soDigitado));
ok(origemDoValor(soDigitado) === "digitado", "e a origem é o digitado — que continua existindo");
ok(origemDoValor(conta()) === "nenhum", "conta sem nada declara que não tem número");

/* o caso que motivou a mudança: pagava 190 e entrava no MRR como 297 */
ok(!perto(valorReal(completa), 297),
   "o escritório que paga R$ 190 NÃO entra mais como R$ 297 por causa do campo digitado");

/* anual continua virando mensal, em qualquer origem */
ok(perto(valorReal(conta({ pago_valor_centavos: 240000, ciclo_cobranca: "anual" })), 200),
   "anual vira mensal também quando o valor vem da fatura");

/* ═══════════════════════════════ 2 · quem é pagante ═════════════════════ */
ok(ehPagante(conta({ pago_em: "2026-07-11" })), "fatura paga faz pagante");
ok(ehPagante(conta({ ultimo_pagamento: "2026-07-02" })),
   "e o campo digitado também — existe pagamento fora do gateway");
ok(!ehPagante(conta({ pago_em: "2026-07-11", is_teste: true })), "conta de teste nunca é pagante");
ok(!ehPagante(conta({ pago_em: "2026-07-11", acesso_cortesia: true })), "cortesia nunca é pagante");
ok(!ehPagante(conta({ pago_em: "2026-07-11", status: "cancelada" })), "cancelada nunca é pagante");
ok(!ehPagante(conta({ contrato_centavos: 25000 })),
   "contrato ATIVO sem pagamento nenhum NÃO é pagante — é o erro clássico do gateway");

/* ═══════════════════════════════ 3 · as divergências ════════════════════ */
const d1 = divergencias(conta({ pago_valor_centavos: 19000, ultimo_pagamento_valor: 297, pago_em: "2026-07-11", ultimo_pagamento: "2026-07-11" }));
ok(d1.length === 1 && d1[0].campo === "valor", "valor digitado diferente da fatura vira divergência", d1);
ok(/R\$\s?190/.test(d1[0].real) && /R\$\s?297/.test(d1[0].digitado), "com os dois números na tela", d1[0]);
ok(d1[0].saida.length > 20, "e uma saída, não só o diagnóstico");

const d2 = divergencias(conta({ pago_em: "2026-07-11", ultimo_pagamento: "2026-05-01", pago_valor_centavos: 19000, ultimo_pagamento_valor: 190 }));
ok(d2.some((d) => d.campo === "último pagamento"), "data digitada diferente da fatura vira divergência", d2);
ok(d2.some((d) => /11\/07\/2026/.test(d.real)), "com a data da fatura em português");

const d3 = divergencias(conta({ ultimo_pagamento: "2026-07-02" }));
ok(d3.some((d) => d.campo === "sem fatura"),
   "pagante pela mão SEM fatura nenhuma é avisado — pode ser webhook que não entregou", d3);

ok(divergencias(conta({ pago_em: "2026-07-11", pago_valor_centavos: 19000 })).length === 0,
   "quem só tem fatura não diverge de nada");
ok(divergencias(conta()).length === 0, "conta vazia não inventa divergência");
ok(divergencias(conta({ pago_valor_centavos: 19000, ultimo_pagamento_valor: 190.001 })).length === 0,
   "diferença de um milésimo é arredondamento, não conflito");

/* ═══════════════════════════════ 4 · o MRR agregado ═════════════════════ */
const m = calcularMetricas([
  conta({ pago_em: "2026-07-11", pago_valor_centavos: 19000, ultimo_pagamento_valor: 297 }),
  conta({ pago_em: "2026-07-11", pago_valor_centavos: 29700 }),
  conta({ ultimo_pagamento: "2026-07-02", valor_mensal: 150 }),   // por fora
  conta({ is_teste: true, pago_em: "2026-07-11", pago_valor_centavos: 99900 }),
  conta({ contrato_centavos: 29700, status: "ativa" }),           // assinou e não pagou
], "2026-08");
ok(m.pagantes === 3, "três pagantes: dois por fatura, um por fora", m.pagantes);
ok(perto(m.mrr, 190 + 297 + 150), "e o MRR soma o valor REAL de cada um", m.mrr);
ok(m.ignoradasTeste === 1, "a conta de teste fica fora e é contada à parte");
ok(perto(m.arr, m.mrr * 12), "ARR é o MRR × 12");

console.log(f === 0 ? "\nOK" : `\n${f} FALHA(S)`);
process.exit(f === 0 ? 0 : 1);
