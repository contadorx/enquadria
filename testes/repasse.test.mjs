/**
 * O REPASSE COMO O COMPRADOR SENTE, E O CENÁRIO DE TABELA ÚNICA.
 *
 * Duas correções de 05/08/2026, as duas vindas da auditoria externa.
 *
 * C7 — a comparação era `re` contra `fc`, e ignorava que o reajuste faz o
 * IBS/CBS incidir sobre o preço MAIOR: o comprador credita esse valor maior e
 * não sente o aumento inteiro. A conta dele fecha quando
 * `a(1 + re) − das ≥ re`, o que é `re(1 − a) ≤ fc`. Uma constante, não uma
 * iteração — a alíquota é constante.
 *
 * B3 — `re = cl / rq` supõe preço diferenciado. Com tabela única o custo se
 * espalha por toda a receita e o reajuste é o próprio `cl`, sempre menor. Não
 * entra na decisão (o motor decide pelo cenário difícil); entra no laudo.
 */
import { decidir, dDASefetivo, fechaComPrecoUnico, PARAMETROS_2027 } from "./motor.js";

let f = 0;
const ok = (c, m, e) => {
  if (!c) { f++; console.log("FALHOU:", m, e === undefined ? "" : JSON.stringify(e)); }
  else console.log("ok:", m);
};
const perto = (a, b, tol = 1e-12) => Math.abs(a - b) <= tol;
const A = PARAMETROS_2027.aliquota;
const resp = (x = {}) => ({ b2b: .8, qual: .9, cred: .35, folha: .2, preco: 3, conc: 0, exig: 0, ...x });

/* ═══════════════════════ 1 · a álgebra da correção ══════════════════════ */
const d = decidir(resp(), PARAMETROS_2027);
ok(perto(d.re_liquido, d.re * (1 - A)), "re_liquido = re × (1 − alíquota)", { re: d.re, liq: d.re_liquido });
ok(d.re_liquido < d.re, "e é sempre MENOR que o repasse cheio — parte volta como crédito");
ok(perto(d.folga, d.fc - d.re_liquido), "a folga é medida na mesma escala da decisão (sobre o líquido)");

/* o ponto de indiferença do comprador: paga `re` a mais, ganha a(1+re) − das */
for (const cred of [0, .2, .4, .6]) {
  const x = decidir(resp({ cred }), PARAMETROS_2027);
  const ganhoExtra = A * (1 + x.re) - PARAMETROS_2027.das;   // crédito depois do reajuste
  const custoExtra = x.re;                                    // o que ele paga a mais
  const fechaPelaConta = ganhoExtra >= custoExtra;
  const fechaPeloMotor = x.re_liquido <= x.fc;
  ok(fechaPelaConta === fechaPeloMotor,
     `cred ${cred}: "re(1−a) ≤ fc" é o mesmo que "a(1+re) − das ≥ re"`,
     { ganhoExtra, custoExtra, liq: x.re_liquido, fc: x.fc });
}

/* a folga extra é uma CONSTANTE — 1/(1−a), e não depende do caso */
const fator = 1 / (1 - A);
ok(perto(fator, 1.0964912280701755, 1e-12), `o fator é 1/(1−a) = ${fator.toFixed(6)}`, fator);
for (const cred of [0, .3, .6]) {
  const x = decidir(resp({ cred }), PARAMETROS_2027);
  ok(perto(x.re / x.re_liquido, fator, 1e-12),
     `cred ${cred}: a razão re/re_liquido é a mesma constante em qualquer caso`);
}

/* ═══════════════════════ 2 · o caso limítrofe que a correção acerta ═════ */
/* C07 do gabarito: re estourava 1,2×fc por 13 centésimos de ponto */
const c07 = decidir(resp({ b2b: .85, qual: .85, cred: .1, preco: 2, conc: 1, exig: 1 }), PARAMETROS_2027);
ok(c07.re > 1.2 * c07.fc, "C07: o repasse CRU estourava o teto da banda", { re: c07.re, teto: 1.2 * c07.fc });
ok(c07.re_liquido <= 1.2 * c07.fc, "e o líquido cabe dentro dela");
ok(c07.saida === "S3", "por isso a saída é S3, não S1", c07.saida);

/* ═══════════════════════ 3 · tabela única (B3) ══════════════════════════ */
ok(perto(d.re_unico, d.cl), "re_unico é o próprio cl — o custo espalhado por toda a receita");
ok(d.re_unico < d.re, "e é SEMPRE menor que o diferenciado, porque rq < 1");
ok(perto(d.re_unico, d.re * d.rq, 1e-12), "porque re_unico = re × rq");

/* não entra na decisão: o motor decide pelo cenário difícil */
const dificil = decidir(resp({ b2b: .5, qual: .6, cred: .2 }), PARAMETROS_2027);
ok(dificil.re > dificil.re_unico, "mesmo quando a tabela única fecharia, a saída usa o diferenciado");

/* o helper que o laudo usa */
let abre = 0, inverso = 0, n = 0;
for (const anexo of [1, 3, 5]) for (const rbt12 of [600_000, 1_500_000, 3_000_000]) {
  const das = dDASefetivo(anexo, rbt12).das;
  for (const b2b of [.4, .6, .8, 1]) for (const qual of [.5, .7, .9, 1]) for (let cred = 0; cred <= .7; cred += .05) {
    if (b2b * qual < .3) continue;
    const p = { ...PARAMETROS_2027, das, rbt12 };
    const x = decidir({ b2b, qual, cred, folha: .2, preco: 3, conc: 0, exig: 0 }, p);
    if (x.cl <= 0) continue;
    n++;
    const difFecha = x.re_liquido <= x.fc * 1.2;
    const uniFecha = fechaComPrecoUnico(x, p);
    if (!difFecha && uniFecha) abre++;
    if (difFecha && !uniFecha) inverso++;
  }
}
ok(abre > 0, `a tabela única abre ${abre} de ${n} casos que o diferenciado recusa`, { abre, n });
ok(inverso === 0, "e NUNCA o contrário — é matemática, não sorte: re_unico = re × rq e rq < 1", inverso);
ok(!fechaComPrecoUnico(decidir(resp({ b2b: .2, qual: .5 }), PARAMETROS_2027), PARAMETROS_2027),
   "sem receita qualificada o helper devolve falso em vez de prometer um caminho");

/**
 * AS DUAS BANDAS usam o líquido — as duas, não uma.
 *
 * Corrigir só o teto (1,2×) e deixar o piso (0,8×) no repasse cheio produz uma
 * árvore que só é pega por deriva de cenário no gabarito, sem dizer a causa.
 * Estes dois casos foram escolhidos para cair exatamente entre as duas versões
 * de cada banda.
 */
{
  /* teto: re estoura, líquido não */
  const t = decidir(resp({ b2b: .85, qual: .85, cred: .1, preco: 2 }), PARAMETROS_2027);
  ok(t.re > 1.2 * t.fc && t.re_liquido <= 1.2 * t.fc && t.saida !== "S1",
     "o TETO da banda compara o líquido (o cru estouraria e daria S1)", { saida: t.saida });

  /* piso: re cai na banda, líquido fica abaixo → tem de ser S4, não S3 */
  const das = dDASefetivo(1, 1_200_000).das;
  const p = { ...PARAMETROS_2027, das, rbt12: 1_200_000 };
  const b = decidir({ b2b: .8, qual: .9, cred: .35, folha: .15, preco: 2, conc: 1, exig: 0 }, p);
  ok(b.re >= 0.8 * b.fc && b.re_liquido < 0.8 * b.fc && b.saida === "S4",
     "o PISO da banda também compara o líquido (o cru daria S3)", { re: b.re, liq: b.re_liquido, piso: 0.8 * b.fc, saida: b.saida });
}

/* ═══════════════════════ 4 · o que NÃO pode ter mudado ═════════════════ */
ok(decidir(resp({ b2b: .2, qual: .5 }), PARAMETROS_2027).saida === "S1",
   "o piso de receita qualificada continua vindo antes de tudo");
ok(decidir(resp({ cred: .95 }), PARAMETROS_2027).saida === "S5",
   "custo líquido negativo continua sendo S5, sem passar pelo repasse");
ok(decidir(resp({ preco: 1, cred: .2 }), PARAMETROS_2027).saida === "S2",
   "e o veto do `preco` continua onde estava — a correção não mexeu nele");

console.log(f === 0 ? "\nOK" : `\n${f} FALHA(S)`);
process.exit(f === 0 ? 0 : 1);
