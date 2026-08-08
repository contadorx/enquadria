/**
 * A TABELA DE 2027–2028 E O TETO DE 5% DO ISS.
 *
 * Esta suíte guarda a correção mais cara desta base: até 05/08/2026 o motor
 * calculava a decisão de 2027 com a tabela de 2026.
 *
 * Três coisas mudaram, e cada uma tem teste próprio:
 *
 *  1. a alíquota NOMINAL da 6ª faixa cai 0,10 ponto em todos os cinco anexos
 *     (LC 214/2025, Anexos XVIII a XXII, vigência 1º/01/2027 a 31/12/2028);
 *  2. o sharePC da 6ª faixa cai entre 0,21 e 0,38 ponto, porque naquela faixa
 *     NÃO HÁ coluna de IBS;
 *  3. o teto de 5% do ISS redistribui o excedente aos federais INCLUSIVE à CBS
 *     e ao IBS, o que ELEVA o que sai do DAS do prestador de serviço de porte
 *     médio.
 *
 * Os números vêm do PDF do texto compilado no Planalto, e cada linha de
 * partilha foi conferida por soma (fecha 100%) e pela razão IBS/(CBS+IBS).
 */
import { dDASefetivo, dDASsegregado, ANEXOS_SIMPLES, TETO_ISS, faixaDe } from "./motor.js";

let f = 0;
const ok = (c, m, e) => {
  if (!c) { f++; console.log("FALHOU:", m, e === undefined ? "" : JSON.stringify(e)); }
  else console.log("ok:", m);
};
const perto = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

/* ═════════════════════════════ 1 · a 6ª faixa de 2027–2028 ═══════════════ */
const F6 = {
  1: { nominal: 0.189, sharePC: 0.3402, antigoNominal: 0.19, antigoSharePC: 0.344 },
  2: { nominal: 0.299, sharePC: 0.2522, antigoNominal: 0.30, antigoSharePC: 0.255 },
  3: { nominal: 0.329, sharePC: 0.1929, antigoNominal: 0.33, antigoSharePC: 0.195 },
  4: { nominal: 0.329, sharePC: 0.247, antigoNominal: 0.33, antigoSharePC: 0.25 },
  5: { nominal: 0.304, sharePC: 0.1978, antigoNominal: 0.305, antigoSharePC: 0.20 },
};
for (const [anexo, v] of Object.entries(F6)) {
  const linha = ANEXOS_SIMPLES[Number(anexo)][5];
  ok(perto(linha.nominal, v.nominal), `anexo ${anexo}: nominal da 6ª faixa é ${v.nominal} (2027–2028)`, linha.nominal);
  ok(perto(linha.sharePC, v.sharePC), `anexo ${anexo}: sharePC da 6ª faixa é ${v.sharePC}`, linha.sharePC);
  /* o par que impede a volta do valor antigo por descuido */
  ok(!perto(linha.nominal, v.antigoNominal), `anexo ${anexo}: NÃO é a nominal de 2026 (${v.antigoNominal})`);
  ok(!perto(linha.sharePC, v.antigoSharePC), `anexo ${anexo}: NÃO é o sharePC de 2026 (${v.antigoSharePC})`);
  /* a 6ª faixa não tem ISS na partilha — acima do sublimite ele sai do DAS */
  ok(linha.shareISS == null, `anexo ${anexo}: a 6ª faixa não carrega participação de ISS`);
}

/* a queda é de exatos 0,10 ponto em todos — é o espelho da CBS reduzida */
for (const [anexo, v] of Object.entries(F6))
  ok(perto(v.antigoNominal - v.nominal, 0.001, 1e-12),
     `anexo ${anexo}: a nominal caiu exatamente 0,10 p.p.`, (v.antigoNominal - v.nominal) * 100);

/* ═════════════════════════════ 2 · faixas 1 a 5 não mudaram ══════════════ */
const F15 = { 1: [0.155, 0.155, 0.155, 0.155, 0.155], 2: [0.14, 0.14, 0.14, 0.14, 0.14],
              3: [0.156, 0.171, 0.166, 0.166, 0.156], 4: [0.215, 0.25, 0.24, 0.23, 0.22],
              5: [0.1715, 0.1715, 0.1815, 0.1915, 0.1715] };
for (const [anexo, esperado] of Object.entries(F15))
  esperado.forEach((s, i) =>
    ok(perto(ANEXOS_SIMPLES[Number(anexo)][i].sharePC, s),
       `anexo ${anexo} faixa ${i + 1}: sharePC segue ${s} (CBS + IBS = a antiga Cofins + PIS)`,
       ANEXOS_SIMPLES[Number(anexo)][i].sharePC));

/* ═════════════════════════════ 3 · o teto de 5% do ISS ══════════════════ */

/* a regra tem de EXISTIR antes de tudo: esvaziar TETO_ISS fazia a suíte
   estourar com TypeError em vez de acusar, e crash é diagnóstico ruim */
ok(!!TETO_ISS[3] && !!TETO_ISS[4], "existe regra de teto do ISS para os Anexos III e IV");

/* a conta da lei, literal: (efetiva − 5%) × percentual redistribuído */
for (const [anexo, rbt12] of [[3, 2_430_000], [3, 3_330_000], [4, 2_430_000], [4, 3_330_000]]) {
  const d = dDASefetivo(anexo, rbt12);
  const regra = TETO_ISS[anexo];
  const pelaLei = (d.aliquota - 0.05) * (regra?.sharePCredistribuido ?? 0);
  ok(!!d.teto_iss, `anexo ${anexo} RBT12 ${rbt12}: o teto do ISS mordeu`);
  ok(perto(d.das, pelaLei, 1e-12),
     `anexo ${anexo} RBT12 ${rbt12}: das = (efetiva − 5%) × ${regra?.sharePCredistribuido}`,
     { das: d.das, pelaLei });
  /* e o resultado é MAIOR que sem o teto — é o ponto inteiro da correção */
  const semTeto = d.aliquota * ANEXOS_SIMPLES[anexo][4].sharePC;
  ok(d.das > semTeto, `anexo ${anexo} RBT12 ${rbt12}: com o teto sai MAIS do DAS que pela tabela`,
     { comTeto: d.das, semTeto });
}

/* o caso de maior erro medido: Anexo IV, 3,33 mi — 3,6258% → 4,2101% */
const iv = dDASefetivo(4, 3_330_000);
ok(perto(iv.das, 0.042101, 1e-6), "Anexo IV a 3,33 mi: das = 4,2101%", iv.das);
ok(perto(0.0362583, 0.164811 * 0.22, 1e-6), "e sem o teto seria 3,6258% — 16% menos");

/* NÃO morde onde a lei não manda */
let divergencias = 0;
for (const anexo of [1, 2, 3, 4, 5])
  for (let faixa = 1; faixa <= 6; faixa++) {
    const t = ANEXOS_SIMPLES[anexo][faixa - 1];
    const piso = faixa === 1 ? 1000 : ANEXOS_SIMPLES[anexo][faixa - 2].teto;
    for (let i = 0; i <= 40; i++) {
      const rbt12 = Math.round(piso + ((t.teto - piso) * i) / 40);
      const d = dDASefetivo(anexo, rbt12);
      /* usar a faixa QUE O MOTOR ESCOLHEU, não a do laço: na borda exata do
         teto a RBT12 ainda pertence à faixa de baixo, e comparar com a de cima
         inventa divergência (foi o que aconteceu na primeira versão deste teste) */
      const shareISS = ANEXOS_SIMPLES[anexo][d.faixa - 1].shareISS ?? 0;
      const deveria = shareISS * d.aliquota > 0.05 && !!TETO_ISS[anexo] && TETO_ISS[anexo].faixa === d.faixa;
      if (deveria !== !!d.teto_iss) divergencias++;
    }
  }
ok(divergencias === 0, "o teto morde exatamente onde a lei manda, em 1.230 pontos", divergencias);

/* Anexo V não tem a nota na lei — e não precisa */
let maiorIssV = 0;
for (let i = 0; i <= 400; i++) {
  const rbt12 = Math.round(1_800_001 + ((3_600_000 - 1_800_001) * i) / 400);
  maiorIssV = Math.max(maiorIssV, 0.235 * dDASefetivo(5, rbt12).aliquota);
}
ok(maiorIssV <= 0.05, "Anexo V: o ISS efetivo nunca passa de 5% na 5ª faixa — por isso a lei não traz a nota", maiorIssV);
ok(maiorIssV > 0.0499, "e chega rente ao limite (não é folga larga, é limite calibrado)", maiorIssV);
ok(TETO_ISS[5] === undefined, "por isso não há regra de teto para o Anexo V");
ok(TETO_ISS[1] === undefined && TETO_ISS[2] === undefined, "nem para Comércio e Indústria, que não têm ISS");

/* ═════════════════════════════ 4 · o teto na receita segregada ══════════ */
const seg = dDASsegregado([{ anexo: 3, share: 0.5 }, { anexo: 1, share: 0.5 }], 3_330_000);
const soIII = dDASefetivo(3, 3_330_000);
const soI = dDASefetivo(1, 3_330_000);
ok(perto(seg.das, soIII.das * 0.5 + soI.das * 0.5, 1e-12),
   "na receita segregada o teto é aplicado dentro do anexo que o sofre", { seg: seg.das });
ok(seg.das > (soIII.aliquota * ANEXOS_SIMPLES[3][4].sharePC) * 0.5 + soI.das * 0.5,
   "e o resultado segregado também sobe por causa dele");

/* ═════════════════════════════ 5 · o que o laudo recebe ═════════════════ */
const comTeto = dDASefetivo(3, 3_330_000);
ok(perto(comTeto.sharePC, comTeto.das / comTeto.aliquota, 1e-12),
   "o sharePC devolvido é o EFETIVAMENTE aplicado — quem imprime não vê um número e a conta com outro");
ok(comTeto.sharePC > ANEXOS_SIMPLES[3][4].sharePC,
   "e ele é maior que o da tabela, porque o excedente do ISS foi para a CBS");
ok(comTeto.teto_iss.iss_sem_teto > 0.05,
   "o laudo recebe o ISS que a tabela produziria sem o teto, para poder explicar");
ok(perto(comTeto.teto_iss.sharePC_tabela, ANEXOS_SIMPLES[3][4].sharePC),
   "e o da tabela, para mostrar os dois lado a lado");
ok(dDASefetivo(1, 1_000_000).teto_iss === undefined,
   "quem não sofre o teto não carrega o campo — ausência é informação");

console.log(f === 0 ? "\nOK" : `\n${f} FALHA(S)`);
process.exit(f === 0 ? 0 : 1);
