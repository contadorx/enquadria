/**
 * 2029 A 2033 — a transição em degraus, destravada.
 *
 * Em 2027–2028 a coluna IBS da partilha do DAS é simbólica (0,17% contra 15,33%
 * de CBS no Anexo I). De 2029 em diante ICMS e ISS migram para o IBS em degraus
 * anuais, e a fatia que SAI do DAS quando a empresa opta triplica até 2033. Um
 * motor que respondesse 2031 com a tabela de 2027 erraria por um fator de 3 —
 * por isso ele se recusava a responder.
 *
 * Agora responde. O que esta suíte guarda:
 *
 *  1. que 2027 continua EXATAMENTE como estava (o desbloqueio não pode mexer no
 *     ano que decide a janela de setembro de 2026);
 *  2. que os degraus são monótonos e batem com a lei em pontos conferidos à mão
 *     contra o texto compilado;
 *  3. que o teto de ISS de 2029+ é declarado INDEFINIDO em vez de estimado —
 *     é a regra da casa, e ela custa uma seção do laudo.
 */
import {
  dDASefetivo, anexoNoExercicio, sharePCDe, ANEXOS_SIMPLES,
  EXERCICIOS_PARAMETRIZADOS, tetoISSIndefinido, decidir, PARAMETROS_2027,
} from "./motor.js";

let f = 0;
const ok = (c, m, e) => {
  if (!c) { f++; console.log("FALHOU:", m, e === undefined ? "" : JSON.stringify(e)); }
  else console.log("ok:", m);
};
const perto = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

/* ═══════════ 1 · 2027 e 2028 intactos ══════════════════════════════════ */
for (const anexo of [1, 2, 3, 4, 5]) {
  const base = ANEXOS_SIMPLES[anexo];
  for (const ex of [2027, 2028]) {
    const t = anexoNoExercicio(anexo, ex);
    ok(t.every((l, i) => l.sharePC === base[i].sharePC && l.nominal === base[i].nominal && l.shareISS === base[i].shareISS),
       `anexo ${anexo} em ${ex} é a mesma tabela de sempre — byte a byte`);
  }
}
for (const anexo of [1, 3, 5]) for (const rbt12 of [400_000, 1_500_000, 3_000_000]) {
  ok(perto(dDASefetivo(anexo, rbt12).das, dDASefetivo(anexo, rbt12, null, 2027).das),
     `dDAS sem exercício é dDAS de 2027 (anexo ${anexo}, ${rbt12})`);
}

/* ═══════════ 2 · os degraus ════════════════════════════════════════════ */
ok(EXERCICIOS_PARAMETRIZADOS.join(",") === "2027,2028,2029,2030,2031,2032,2033",
   "os sete exercícios da lei estão abertos", EXERCICIOS_PARAMETRIZADOS);
ok(sharePCDe(1, 1, 2034).valor === null, "2034 continua fechado — a lei acaba em 2033");
ok(/não está parametrizada/.test(sharePCDe(1, 1, 2026).motivo), "e 2026 também, com o motivo");

/**
 * VALORES CONFERIDOS À MÃO contra o texto compilado (Anexo XVIII, faixa 1):
 *   2027-28  CBS 15,33 + IBS 0,17  = 15,50%
 *   2029     CBS 15,50 + IBS 3,40  = 18,90%
 *   2030     CBS 15,50 + IBS 6,80  = 22,30%
 *   2031     CBS 15,50 + IBS 10,20 = 25,70%
 *   2032     CBS 15,50 + IBS 13,60 = 29,10%
 *   2033     CBS 15,50 + IBS 34,00 = 49,50%
 */
const esperado = { 2027: 0.155, 2029: 0.189, 2030: 0.223, 2031: 0.257, 2032: 0.291, 2033: 0.495 };
for (const [ano, v] of Object.entries(esperado)) {
  ok(perto(anexoNoExercicio(1, Number(ano))[0].sharePC, v),
     `Anexo I faixa 1 em ${ano}: ${(v * 100).toFixed(2)}%`, anexoNoExercicio(1, Number(ano))[0].sharePC);
}
ok(perto(anexoNoExercicio(1, 2033)[0].sharePC / anexoNoExercicio(1, 2027)[0].sharePC, 3.193548387096774, 1e-9),
   "de 2027 a 2033 a fatia que sai do DAS multiplica por 3,19 — a ordem de grandeza do erro que isto evitava");

/* monotonicidade: em faixas 1–5 a fatia só cresce ano a ano */
{
  let quebras = 0;
  for (const anexo of [1, 2, 3, 4, 5]) for (let i = 0; i < 5; i++) {
    let ant = -1;
    for (const ano of [2027, 2029, 2030, 2031, 2032, 2033]) {
      const v = anexoNoExercicio(anexo, ano)[i].sharePC;
      if (v < ant - 1e-12) quebras++;
      ant = v;
    }
  }
  ok(quebras === 0, "a fatia nunca ANDA PARA TRÁS nas faixas 1–5: a transição é de mão única", quebras);
}
/* a 6ª faixa é a exceção, e ela é estrutural: acima do sublimite ICMS/ISS já
   está fora do DAS, então não há o que migrar */
for (const anexo of [1, 2, 3, 4, 5]) {
  const anos = [2029, 2030, 2031, 2032, 2033].map((a) => anexoNoExercicio(anexo, a)[5].sharePC);
  ok(new Set(anos).size === 1, `anexo ${anexo}: a 6ª faixa não se move de 2029 a 2033`, anos);
}
/* o nominal da 6ª faixa sobe 0,10 p.p. em 2029 e para por aí */
for (const [anexo, nom] of [[1, 0.19], [2, 0.3], [3, 0.33], [4, 0.33], [5, 0.305]]) {
  ok(perto(anexoNoExercicio(anexo, 2029)[5].nominal, nom),
     `anexo ${anexo}: nominal da 6ª faixa em 2029 é ${(nom * 100).toFixed(2)}%`);
  ok(anexoNoExercicio(anexo, 2029)[5].nominal > ANEXOS_SIMPLES[anexo][5].nominal,
     `…e é maior que o de 2027-2028`);
}

/* ═══════════ 3 · o teto de ISS de 2029+ é INDEFINIDO, não estimado ═════ */
{
  /* Anexo III, 5ª faixa, RBT12 alta: a efetiva passa do gatilho de 14,92537% */
  const d27 = dDASefetivo(3, 3_500_000, null, 2027);
  ok(d27.aliquota > 0.1492537, "o caso escolhido morde o teto em 2027", d27.aliquota);
  ok(d27.teto_iss != null, "…e em 2027 o teto é APLICADO, com a nota da lei");
  ok(!d27.teto_iss_indefinido, "sem marca de indefinição");

  const d29 = dDASefetivo(3, 3_500_000, null, 2029);
  ok(d29.teto_iss_indefinido === true,
     "em 2029 a mesma empresa recebe a marca de teto INDEFINIDO — a nota muda de estrutura a cada ano e o texto compilado traz duas redações");
  ok(d29.teto_iss == null, "e nenhum número de teto é inventado");
  ok(d29.das < d29.aliquota * anexoNoExercicio(3, 2029)[4].sharePC + 1e-12,
     "o das devolvido é o SEM teto — o menor, portanto o viés é contra optar");
}
ok(!tetoISSIndefinido(1, 5, 0.2, 2029), "anexo sem ISS nunca fica indefinido");
ok(!tetoISSIndefinido(3, 4, 0.14, 2029), "fora da 5ª faixa também não");
ok(!tetoISSIndefinido(3, 5, 0.10, 2029), "e abaixo do gatilho tampouco — indefinição sem causa é ruído");
ok(!tetoISSIndefinido(3, 5, 0.2, 2028), "em 2028 a nota existe e vale: nada de indefinido");

/* ═══════════ 4 · a conta muda de sinal, que é o ponto ══════════════════ */
{
  const r = { b2b: .8, qual: .9, cred: .35, folha: .2, preco: 3, conc: 0, exig: 0 };
  const rbt12 = 1_500_000;
  const s = {};
  for (const ano of [2027, 2029, 2031, 2033]) {
    const das = dDASefetivo(1, rbt12, null, ano).das;
    s[ano] = decidir(r, { ...PARAMETROS_2027, das, rbt12 });
  }
  ok(s[2033].cl < s[2027].cl,
     "com mais saindo do DAS, o custo líquido de optar CAI ano a ano", { c27: s[2027].cl, c33: s[2033].cl });
  ok(s[2033].fc < s[2027].fc,
     "e o ganho do comprador também cai — ele já receberia crédito de qualquer jeito", { f27: s[2027].fc, f33: s[2033].fc });
}
{
  /**
   * QUANTO DA GRADE MUDA DE RESPOSTA conforme o exercício. Um caso isolado não
   * provaria nada — a primeira versão deste teste escolheu um em que a saída era
   * S4 nos quatro anos, e passar teria sido pior do que falhar.
   */
  let mudam = 0, n = 0;
  for (const anexo of [1, 2, 3, 4, 5]) for (const rbt12 of [300_000, 700_000, 1_500_000, 2_500_000, 3_400_000])
    for (const b2b of [.4, .6, .8, 1]) for (const qual of [.5, .7, .9, 1])
      for (let cred = 0; cred <= .8; cred += .1) for (const preco of [0, 2, 3]) {
        const r = { b2b, qual, cred, folha: .2, preco, conc: 0, exig: 0 };
        const saidas = [2027, 2029, 2031, 2033].map(
          (a) => decidir(r, { ...PARAMETROS_2027, das: dDASefetivo(anexo, rbt12, null, a).das, rbt12 }).saida
        );
        n++; if (new Set(saidas).size > 1) mudam++;
      }
  ok(mudam / n > 0.15,
     `a resposta muda com o exercício em ${((mudam / n) * 100).toFixed(0)}% da grade (${mudam} de ${n}) — era exatamente isto que o motor não podia responder`,
     { mudam, n });
}

console.log(f === 0 ? "\nOK" : `\n${f} FALHA(S)`);
process.exit(f === 0 ? 0 : 1);
