/**
 * PRESSÃO COMERCIAL — a separação entre a conta e a negociação.
 *
 * O laudo respondia "a conta fecha?" e parava. Quem lê conclui que o difícil
 * acabou, e o difícil começa ali: ao exercer a opção o crédito integral passa
 * ao comprador AUTOMATICAMENTE, e o preço se negocia depois — quando não há
 * mais nada para trocar.
 *
 * Esta suíte guarda três coisas:
 *
 *  1. a aritmética da faixa de negociação (piso, teto, excedente, posição);
 *  2. que NENHUMA saída da árvore mudou — a camada é aditiva, por decisão;
 *  3. que o documento DIZ onde termina a responsabilidade do contador. Esta é
 *     a parte que ninguém percebe faltando até alguém cobrar.
 */
import { decidir, dDASefetivo, pressaoComercial, PARAMETROS_2027 } from "./motor.js";
import { pressaoDoLaudo, FRONTEIRA_CONTA_NEGOCIACAO } from "./laudo.js";

let f = 0;
const ok = (c, m, e) => {
  if (!c) { f++; console.log("FALHOU:", m, e === undefined ? "" : JSON.stringify(e)); }
  else console.log("ok:", m);
};
const perto = (a, b, tol = 1e-12) => Math.abs(a - b) <= tol;
const A = PARAMETROS_2027.aliquota;
const resp = (x = {}) => ({ b2b: .8, qual: .9, cred: .35, folha: .2, preco: 3, conc: 0, exig: 0, ...x });

/* ═══════════════════════ 1 · a faixa ════════════════════════════════════ */
const d = decidir(resp(), PARAMETROS_2027);
const pr = pressaoComercial(d, PARAMETROS_2027);

ok(pr != null, "há faixa de negociação quando existe repasse a fazer");
ok(perto(pr.piso, d.re), "o piso é o repasse de equilíbrio — abaixo dele a empresa absorve");
ok(perto(pr.teto, d.fc / (1 - A)), "o teto é fc ÷ (1 − a) — acima dele o crédito não cobre o aumento");
ok(pr.teto > pr.piso, "e o teto é maior que o piso: existe o que negociar");
ok(perto(pr.excedente, pr.teto - pr.piso), "o excedente é a diferença entre os dois");
ok(perto(pr.parte_minima, pr.piso / pr.teto), "a posição é quanto da faixa a empresa precisa");
ok(perto(pr.absorve, d.cl), "e o que ela absorve sem repassar nada é o custo líquido");

/* o teto é o ponto de indiferença do comprador — conferido pela conta dele */
{
  const p = pr.teto;
  const ganho = A * (1 + p) - PARAMETROS_2027.das;
  ok(perto(ganho, p, 1e-12), "no teto, o crédito extra do comprador iguala exatamente o aumento", { ganho, p });
}
/* e um centavo acima do teto o comprador passa a perder */
{
  const p = pr.teto + 0.0001;
  ok(A * (1 + p) - PARAMETROS_2027.das < p, "um pouco acima do teto ele recusa, e a conta mostra por quê");
}

/* ═══════════════════════ 2 · quando NÃO há faixa ════════════════════════ */
ok(pressaoComercial(decidir(resp({ cred: .95 }), PARAMETROS_2027), PARAMETROS_2027) === null,
   "custo líquido negativo não tem negociação — a empresa já paga menos sozinha");
ok(pressaoComercial(decidir(resp({ b2b: .2, qual: .5 }), PARAMETROS_2027), PARAMETROS_2027) === null,
   "sem receita qualificada não há com quem negociar");
/* piso acima do teto: o repasse é maior do que o crédito do comprador cobre.
   A primeira versão devolvia uma faixa de 42,5% a 8,0% — número que parece
   número e não é. */
{
  const semFaixa = decidir(resp({ b2b: .6, qual: .55, cred: .1 }), PARAMETROS_2027);
  ok(semFaixa.re > semFaixa.fc / (1 - A), "há caso em que o repasse necessário estoura o teto do comprador");
  ok(pressaoComercial(semFaixa, PARAMETROS_2027) === null,
     "e aí a seção não sai — faixa invertida no laudo é pior que nenhuma");
}
/* as duas regras (motor e laudo) precisam recusar os MESMOS casos */
{
  let divergencias = 0, n = 0;
  for (const b2b of [.2, .4, .6, .8, 1]) for (const qual of [.3, .5, .7, .9, 1])
    for (let cred = 0; cred <= .95; cred += .05) {
      const x = decidir(resp({ b2b, qual, cred }), PARAMETROS_2027);
      const noMotor = pressaoComercial(x, PARAMETROS_2027) != null;
      const noLaudo = pressaoDoLaudo({
        id: "x", rq: x.rq, ch: x.ch, cl: x.cl, re: x.re, fc: x.fc, saida: x.saida, prioridade: false,
        respostas: { b2b, qual, cred, preco: 3, conc: 0 }, calculado_em: null,
        parametros: { aliquota: A, das: PARAMETROS_2027.das },
      }) != null;
      n++; if (noMotor !== noLaudo) divergencias++;
    }
  ok(divergencias === 0, `motor e laudo recusam os mesmos casos (${n} conferidos)`, divergencias);
}

/* ═══════════════════════ 3 · os níveis de leitura ═══════════════════════ */
const niveis = new Set();
let apertadaEmS3 = 0, s3 = 0;
for (const anexo of [1, 2, 3, 4, 5]) for (const rbt12 of [600_000, 1_500_000, 3_000_000]) {
  const das = dDASefetivo(anexo, rbt12).das;
  for (const b2b of [.4, .6, .8, 1]) for (const qual of [.5, .7, .9, 1])
    for (let cred = 0; cred <= .8; cred += .05) for (const preco of [0, 2, 3]) {
      if (b2b * qual < .3) continue;
      const p = { ...PARAMETROS_2027, das, rbt12 };
      const x = decidir({ b2b, qual, cred, folha: .2, preco, conc: 0, exig: 0 }, p);
      const q = pressaoComercial(x, p);
      if (!q) continue;
      niveis.add(q.nivel);
      if (x.saida === "S3") { s3++; if (q.nivel === "apertada") apertadaEmS3++; }
    }
}
ok(niveis.has("folgada") && niveis.has("media") && niveis.has("apertada"),
   "os três níveis aparecem na grade — nenhum é decorativo", [...niveis]);
/**
 * A DESCOBERTA QUE MOTIVOU A SEÇÃO: a "Zona de fronteira — decisão do
 * empresário" é justamente onde a pressão é MÁXIMA. O laudo mandava decidir
 * sem avisar que quase não sobra espaço para negociar.
 */
ok(s3 > 0 && apertadaEmS3 / s3 > 0.5,
   `na Zona de fronteira a pressão é apertada em ${((apertadaEmS3 / s3) * 100).toFixed(0)}% dos casos`,
   { apertadaEmS3, s3 });

/* ═══════════════════════ 4 · a camada é ADITIVA ═════════════════════════ */
let mudou = 0, total = 0;
for (const anexo of [1, 3, 5]) for (const rbt12 of [600_000, 2_000_000, 4_000_000]) {
  const das = dDASefetivo(anexo, rbt12).das;
  for (const b2b of [.4, .7, 1]) for (const qual of [.5, .8, 1])
    for (let cred = 0; cred <= .8; cred += .1) for (const preco of [0, 1, 2, 3]) {
      if (b2b * qual < .3) continue;
      const p = { ...PARAMETROS_2027, das, rbt12 };
      const r = { b2b, qual, cred, folha: .2, preco, conc: 0, exig: 0 };
      const antes = decidir(r, p).saida;
      pressaoComercial(decidir(r, p), p);          // calcular não pode alterar nada
      const depois = decidir(r, p).saida;
      total++; if (antes !== depois) mudou++;
    }
}
ok(mudou === 0, `a camada não muda saída nenhuma (${total} casos conferidos)`, mudou);

/* ═══════════════════════ 5 · o que o laudo DIZ ══════════════════════════ */
const analise = (extra = {}, respostas = {}) => ({
  id: "x", rq: d.rq, ch: d.ch, cl: d.cl, re: d.re, fc: d.fc, saida: d.saida, prioridade: false,
  respostas: { b2b: .8, qual: .9, cred: .35, preco: 3, conc: 0, ...respostas },
  calculado_em: null,
  parametros: { aliquota: A, das: PARAMETROS_2027.das, ...extra },
});

const bloco = pressaoDoLaudo(analise());
ok(bloco != null, "o laudo monta a seção quando há negociação a fazer");
ok(/%/.test(bloco.faixa) && bloco.faixa.includes(" a "), "com a faixa em português (X a Y)", bloco.faixa);
ok(bloco.avisos.length >= 2, "e pelo menos dois avisos", bloco.avisos.length);
ok(/ANTES DE EXERCER A OPÇÃO/.test(bloco.avisos[0]),
   "o PRIMEIRO aviso é a regra de sequência — é a frase mais cara do documento");
ok(/independentemente de acordo de preço/.test(bloco.avisos[0]),
   "e ela diz por quê: o crédito passa sozinho");

/* a erosão muda de texto conforme a concorrência */
ok(/vantagem se dissolve|janela, não como/.test(pressaoDoLaudo(analise({}, { conc: 0 })).avisos.join(" ")),
   "sem concorrente fora do Simples, o aviso é de erosão futura");
ok(/já entregam|reduz uma desvantagem/.test(pressaoDoLaudo(analise({}, { conc: 1 })).avisos.join(" ")),
   "com concorrente fora do Simples, o aviso é de desvantagem presente — não de vantagem");

/* quem se declarou travado recebe o aviso da absorção */
const travado = pressaoDoLaudo(analise({}, { preco: 1 }));
ok(travado.avisos.some((x) => /não é o repasse: é a absorção/.test(x)),
   "empresa sem poder de preço é avisada de que o cenário realista é absorver");
ok(!pressaoDoLaudo(analise({}, { preco: 3 })).avisos.some((x) => /é a absorção/.test(x)),
   "e quem tem poder de preço não recebe esse aviso — ausência também é informação");

/* ═══════════════════════ 6 · a fronteira, dita com todas as letras ══════ */
ok(/responsabilidade técnica do profissional que assina/.test(FRONTEIRA_CONTA_NEGOCIACAO),
   "o texto diz de quem é a conta");
ok(/decisão do empresário/.test(FRONTEIRA_CONTA_NEGOCIACAO),
   "e de quem é a negociação");
ok(/Nenhum número deste laudo garante que o repasse será aceito/.test(FRONTEIRA_CONTA_NEGOCIACAO),
   "e nega expressamente a garantia — é o que separa 'eu recomendei' de 'eu informei'");

console.log(f === 0 ? "\nOK" : `\n${f} FALHA(S)`);
process.exit(f === 0 ? 0 : 1);
