/**
 * C8 — O VETO DO `preco` DEIXOU DE SER ABSOLUTO.
 *
 * `preco <= 1` ("o mercado define o preço" / "contratos travados") mandava TUDO
 * para S2: não optar nesta janela, preparar março. Medido na grade, em 3,7% dos
 * casos isso significava mandar esperar seis meses para não pagar meio ponto da
 * receita — e perder, nesse meio tempo, a única forma de entregar crédito
 * integral ao cliente SEM aumentar preço nenhum.
 *
 * Agora, quando o custo de absorver cabe no teto (`absorcaoMax`, 1 ponto da
 * receita por convenção), a saída é S3 — "Zona de fronteira, decisão do
 * empresário". S3 e NÃO S4, e a diferença é a coisa mais importante deste
 * arquivo: o motor conhece a RECEITA e não conhece a MARGEM. Meio ponto de
 * receita numa empresa de 3% de margem é um sexto do lucro. Recomendar absorver
 * seria recomendar com um número que o sistema não tem.
 *
 * Por isso esta suíte testa DUAS coisas com o mesmo peso:
 *   · a aritmética do corte;
 *   · que o documento devolve a decisão em vez de tomá-la.
 */
import { decidir, dDASefetivo, PARAMETROS_2027 } from "./motor.js";
import { absorcaoDoLaudo } from "./laudo.js";

let f = 0;
const ok = (c, m, e) => {
  if (!c) { f++; console.log("FALHOU:", m, e === undefined ? "" : JSON.stringify(e)); }
  else console.log("ok:", m);
};
const resp = (x = {}) => ({ b2b: .8, qual: .9, cred: .35, folha: .2, preco: 3, conc: 0, exig: 0, ...x });
const TETO = PARAMETROS_2027.absorcaoMax;

/* ═══════════════════ 1 · o corte, nos dois lados ════════════════════════ */
ok(TETO === 0.01, "o teto de absorção é 1 ponto da receita, e está declarado no parâmetro", TETO);

/**
 * Dois casos construídos para cair um de cada lado do corte. `cl` = a(1−cred) −
 * das; com a = 8,8% e das = 1,473%, `cred` controla o `cl` diretamente:
 *   cred 0,90 → cl = 0,088×0,10 − 0,01473 = −0,0059  (negativo, é S5)
 *   cred 0,80 → cl = 0,088×0,20 − 0,01473 =  0,00287 (0,29% — CABE)
 *   cred 0,60 → cl = 0,088×0,40 − 0,01473 =  0,02047 (2,05% — NÃO cabe)
 */
const cabe = decidir(resp({ preco: 0, cred: .8 }), PARAMETROS_2027);
const naoCabe = decidir(resp({ preco: 0, cred: .6 }), PARAMETROS_2027);

ok(cabe.cl > 0 && cabe.cl <= TETO, `o caso que cabe absorve ${(cabe.cl * 100).toFixed(2)}%`, cabe.cl);
ok(cabe.saida === "S3", "e vai para S3 — Zona de fronteira, decisão do empresário", cabe.saida);
ok(cabe.absorcao_cabe === true, "com a marca `absorcao_cabe`, que é o que troca o texto do laudo");
ok(cabe.saida !== "S4", "NUNCA S4: recomendar absorver exigiria conhecer a margem, e o motor não conhece");

ok(naoCabe.cl > TETO, `o caso que não cabe absorve ${(naoCabe.cl * 100).toFixed(2)}%`, naoCabe.cl);
ok(naoCabe.saida === "S2", "e continua em S2 — preparar a janela de março", naoCabe.saida);
ok(!naoCabe.absorcao_cabe, "sem a marca");
ok(/acima do teto/.test(naoCabe.motivo) && /2,05%/.test(naoCabe.motivo),
   "e o motivo diz o número e o teto, em vez de só 'não tem poder de preço'", naoCabe.motivo);

/* o corte é EXATAMENTE o teto, não um arredondamento perto dele */
{
  /* p.absorcaoMax movido para bater no `cl` do caso: o que muda é o parâmetro,
     não a empresa — é assim que se testa um corte sem procurar a resposta */
  const cl = cabe.cl;
  const justo = decidir(resp({ preco: 0, cred: .8 }), { ...PARAMETROS_2027, absorcaoMax: cl });
  const umPoucoMenos = decidir(resp({ preco: 0, cred: .8 }), { ...PARAMETROS_2027, absorcaoMax: cl - 1e-9 });
  ok(justo.saida === "S3", "no teto exato ainda cabe (o corte é `>`, não `>=`)");
  ok(umPoucoMenos.saida === "S2", "um bilionésimo abaixo, não cabe mais — o corte é onde está escrito");
}

/* ═══════════════════ 2 · a marca só existe onde deve ════════════════════ */
ok(!decidir(resp({ preco: 2, cred: .8 }), PARAMETROS_2027).absorcao_cabe,
   "quem PODE renegociar não recebe a marca — a absorção é o cenário de quem não pode");
ok(!decidir(resp({ preco: 0, cred: .95 }), PARAMETROS_2027).absorcao_cabe,
   "custo líquido negativo não é absorção: é S5, e vem antes na árvore");
ok(decidir(resp({ preco: 0, cred: .95 }), PARAMETROS_2027).saida === "S5",
   "…confirmando que S5 continua ganhando de tudo isso");
ok(!decidir(resp({ preco: 0, b2b: .2, qual: .5, cred: .8 }), PARAMETROS_2027).absorcao_cabe,
   "sem receita qualificada não há vantagem a entregar — S1 continua vindo primeiro");

/* ═══════════════════ 3 · a mudança é CIRÚRGICA ══════════════════════════
 * A prova de que C8 não vazou para o resto: com `absorcaoMax = 0` a árvore
 * inteira tem de reproduzir, caso a caso, o comportamento anterior. Se algum
 * outro ramo tivesse sido tocado, esta comparação acusaria.
 * ══════════════════════════════════════════════════════════════════════════ */
{
  let iguais = 0, mudaram = 0, indevidas = 0, n = 0;
  const mudancas = new Set();
  for (const anexo of [1, 2, 3, 4, 5]) for (const rbt12 of [400_000, 900_000, 1_800_000, 3_000_000]) {
    const das = dDASefetivo(anexo, rbt12).das;
    const novo = { ...PARAMETROS_2027, das, rbt12: null };
    const velho = { ...novo, absorcaoMax: 0 };
    for (const b2b of [.2, .4, .6, .8, 1]) for (const qual of [.3, .5, .7, .9, 1])
      for (let cred = 0; cred <= .9; cred += .05) for (const preco of [0, 1, 2, 3]) {
        const r = { b2b, qual, cred, folha: .2, preco, conc: 0, exig: 0 };
        const a = decidir(r, velho).saida, b = decidir(r, novo).saida;
        n++;
        if (a === b) { iguais++; continue; }
        mudaram++;
        mudancas.add(`${a}→${b}`);
        if (a !== "S2" || b !== "S3" || preco > 1) indevidas++;
      }
  }
  ok(indevidas === 0, `toda mudança é S2→S3 e só com preço travado (${n} casos)`, { indevidas, mudancas: [...mudancas] });
  ok(mudancas.size === 1 && mudancas.has("S2→S3"), "e é a ÚNICA transição que aparece", [...mudancas]);
  ok(mudaram > 0 && mudaram / n < 0.05,
     `${((mudaram / n) * 100).toFixed(1)}% da grade mudou — mexeu no que devia e só nisso`, { mudaram, n });
  ok(iguais + mudaram === n, "e a contagem fecha");
}

/* ═══════════════════ 4 · o teto é convenção, e obedece ao parâmetro ═════ */
{
  const generoso = decidir(resp({ preco: 0, cred: .6 }), { ...PARAMETROS_2027, absorcaoMax: 0.05 });
  ok(generoso.saida === "S3" && generoso.absorcao_cabe,
     "subir o teto move o corte — o número não está escondido no código");
  ok(/5,00%/.test(generoso.motivo), "e o motivo imprime o teto que foi usado, não o padrão", generoso.motivo);
}

/* ═══════════════════ 5 · o que o LAUDO diz, que é o produto ═════════════ */
const analise = (x, respostas = {}, param = {}) => ({
  id: "x", rq: x.rq, ch: x.ch, cl: x.cl, re: x.re, fc: x.fc, saida: x.saida, prioridade: false,
  respostas: { b2b: .8, qual: .9, cred: .8, preco: 0, conc: 0, ...respostas },
  calculado_em: null,
  parametros: { aliquota: PARAMETROS_2027.aliquota, das: PARAMETROS_2027.das, absorcaoMax: TETO, ...param },
});

const bloco = absorcaoDoLaudo(analise(cabe));
ok(bloco != null, "o laudo monta a seção de absorção");
ok(bloco.custo === "0,29%", "com o custo em DUAS casas — em uma, 0,3% e 0,34% viram o mesmo número", bloco.custo);
ok(bloco.entrega === "7,3%", "e o que o comprador ganha sem pagar nada a mais", bloco.entrega);
ok(/conhece a receita e não conhece a margem/.test(bloco.pergunta),
   "a pergunta final admite o que o sistema NÃO sabe — é o que sustenta a saída ser S3 e não S4");
ok(bloco.linhas.some((l) => /não é o repasse calculado acima/.test(l) || /não é o repasse/.test(l)),
   "e o texto desmonta o repasse da seção anterior em vez de deixar os dois de pé");
ok(bloco.linhas.some((l) => /sem nenhum aumento de preço/.test(l)),
   "diz o que se ganha, senão a seção é só uma má notícia");
ok(bloco.linhas.some((l) => /sem nada para trocar/.test(l)),
   "e mantém a regra de sequência: o crédito passa primeiro, a conversa vem depois");

ok(absorcaoDoLaudo(analise(naoCabe, { cred: .6 })) === null,
   "acima do teto a seção NÃO sai — ela existiria para dizer 'absorva 2%', que não é conselho");
ok(absorcaoDoLaudo(analise(cabe, { preco: 3 })) === null,
   "quem tem poder de preço não recebe a seção");
ok(absorcaoDoLaudo(analise(cabe, {}, { absorcaoMax: 0.001 })) === null,
   "e o laudo respeita o teto CONGELADO na análise, não o padrão de hoje — " +
   "mudar a convenção amanhã não pode reescrever um documento assinado ontem");

/* motor e laudo têm de concordar sobre QUEM recebe a seção */
{
  let divergem = 0, n = 0, comSecao = 0;
  for (const b2b of [.4, .6, .8, 1]) for (const qual of [.5, .7, .9, 1])
    for (let cred = 0; cred <= .9; cred += .05) for (const preco of [0, 1, 2, 3]) {
      const r = { b2b, qual, cred, folha: .2, preco, conc: 0, exig: 0 };
      const x = decidir(r, PARAMETROS_2027);
      const noLaudo = absorcaoDoLaudo(analise(x, r)) != null;
      n++; if (noLaudo) comSecao++;
      if (!!x.absorcao_cabe !== noLaudo) divergem++;
    }
  ok(divergem === 0, `motor e laudo marcam os mesmos casos (${n} conferidos, ${comSecao} com seção)`, divergem);
}

console.log(f === 0 ? "\nOK" : `\n${f} FALHA(S)`);
process.exit(f === 0 ? 0 : 1);
