/**
 * O QUE O LAUDO AFIRMA — testes da fundamentação, não da conta.
 *
 * A conta já é testada em motor.test.mjs. Estes testes guardam outra coisa: as
 * FRASES que um contador assina. Elas mudaram em 05/08/2026 por três motivos,
 * e cada um deles é uma forma de o documento estar errado sem nenhum número
 * estar errado.
 *
 *  1. O laudo dizia que a opção é semestral e cancelável, ponto. É verdade para
 *     quase todo mundo e MENTIRA para o perfil que ele mais recomenda: o
 *     art. 41, § 5º da LC 214/2025 veda a saída a quem recebeu ressarcimento de
 *     créditos. Quem acumula crédito e usa o mecanismo, trancou.
 *
 *  2. A fundamentação citava a "partilha de PIS/Cofins". A partir de 1º/01/2027
 *     essa coluna não existe: o art. 519 substituiu os Anexos I a V pelos
 *     XVIII a XXII, com colunas de CBS e IBS. A soma é idêntica — o número está
 *     certo e a citação, não.
 *
 *  3. Os cortes do método (30%, 0,8–1,2, ±5%) apareciam no laudo sem origem.
 *     Número sem origem em documento técnico tira autoridade do documento.
 *
 * REGRA DESTA SUÍTE: procurar em texto é frágil — casa com comentário, com
 * import, com a segunda ocorrência. Aqui só se procura no VALOR DE RETORNO das
 * funções, e sempre com o par "contém X" + "NÃO contém a versão antiga".
 */
import { riscosELimites, BASE_LEGAL, NOTA_PARAMETROS, baseDeCalculo } from "./laudo.js";

let f = 0;
const ok = (c, m, e) => {
  if (!c) { f++; console.log("FALHOU:", m, e === undefined ? "" : JSON.stringify(e).slice(0, 300)); }
  else console.log("ok:", m);
};

/* uma análise mínima, do jeito que o laudo recebe */
const analise = (extra = {}) => ({
  saida: "S4",
  parametros: {
    ddas: { anexo: 3, faixa: 4, aliquota: 0.1402, sharePC: 0.166, das: 0.02327, rbt12: 1_500_000, fonte: "efetiva" },
    ...extra,
  },
});

/* ═══════════════════════════════ 1 · o cadeado do art. 41, § 5º ═══════ */
const riscos = riscosELimites(analise());
const texto = riscos.join(" \n ");

ok(riscos.some((r) => /art\. 41, § 5º/.test(r)),
   "o laudo cita o art. 41, § 5º da LC 214/2025", riscos.length);
ok(riscos.some((r) => /ressarcimento/i.test(r) && /LC 214|Lei Complementar nº 214/.test(r)),
   "e diz que é o ressarcimento que tranca");
ok(riscos.some((r) => /mão única|não .*semestral|deixa de ser semestral/i.test(r)),
   "e diz o que isso faz com a reversibilidade");

/* o aviso é INCONDICIONAL enquanto o questionário não perguntar. Se um dia
   virar condicional, este teste falha e obriga quem mexeu a decidir. */
ok(riscosELimites(analise({ origem_premissas: "lote_cnae" })).some((r) => /art\. 41, § 5º/.test(r)),
   "o aviso do cadeado sai também no laudo de lote");
ok(riscosELimites({ saida: "S1", parametros: {} }).some((r) => /art\. 41, § 5º/.test(r)),
   "e sai até quando a recomendação é NÃO optar (a empresa pode optar assim mesmo)");

/**
 * A FRASE DA REVERSIBILIDADE.
 *
 * Não basta procurar o que sumiu: apagar a frase inteira também faria um
 * "não contém" passar. Por isso o par — a frase TEM de existir, e a promessa
 * TEM de vir acompanhada da data e da fonte da data.
 */
const linhaRev = riscos.find((r) => /janela seguinte reabre a pergunta/.test(r));
ok(!!linhaRev, "a linha da reversibilidade continua existindo");
ok(!!linhaRev && /março/.test(linhaRev), "e nomeia a janela seguinte: março", linhaRev);
ok(!!linhaRev && /Resolução do CGSN|Resolução do Comitê/.test(linhaRev),
   "e diz que a data exata dentro do mês vem da Resolução do CGSN", linhaRev);
ok(!!linhaRev && !/reabre a pergunta\.\s*$/.test(linhaRev),
   "a promessa não termina mais sem ressalva", linhaRev);
/**
 * O CADEADO VEM COLADO NA FRASE QUE ELE CORRIGE — e este teste precisou de uma
 * análise CHEIA para valer.
 *
 * Na primeira versão eu conferi a ordem na análise mínima, que não dispara
 * nenhum risco condicional. Aí "logo depois" e "no fim da lista" são a mesma
 * posição, e mover o cadeado para o fim passava batido. Com a análise abaixo
 * entram três riscos condicionais entre um ponto e outro, e a ordem volta a
 * significar alguma coisa.
 */
const riscosCheios = riscosELimites({
  saida: "S4",
  parametros: {
    ddas: { anexo: 3, faixa: 1, aliquota: 0.06, sharePC: 0.156, das: 0.00936, rbt12: null, fonte: "conservador" },
    origem_premissas: "lote_cnae",
    fator_r: { texto: "Folha em 15% da receita." },
    partilha: { valor: null, motivo: "Exercício não parametrizado." },
  },
});
const iRev = riscosCheios.findIndex((r) => /janela seguinte reabre a pergunta/.test(r));
const iCad = riscosCheios.findIndex((r) => /art\. 41, § 5º/.test(r));
ok(riscosCheios.length >= 7,
   `a análise de controle dispara riscos condicionais (${riscosCheios.length} riscos)`);
ok(iRev >= 0 && iCad === iRev + 1,
   "e o cadeado vem imediatamente depois da frase que ele corrige, não no fim da lista",
   { iRev, iCad, total: riscosCheios.length });

/* ═══════════════════════════════ 2 · a base legal ════════════════════ */
const normas = BASE_LEGAL.map((b) => b.norma).join(" | ");
const papeis = BASE_LEGAL.map((b) => b.papel).join(" | ");

for (const [busca, rotulo] of [
  [/art\. 519/, "art. 519 (substituição dos Anexos I a V)"],
  [/arts\. 344 e 347/, "arts. 344 e 347 (as alíquotas de 2027-2028)"],
  [/art\. 47, § 9º, II/, "art. 47, § 9º, II (o crédito do comprador)"],
  [/art\. 13, §§ 9º e 10/, "art. 13, §§ 9º e 10 da LC 123 (o dispositivo operativo)"],
  [/227\/2026/, "LC 227/2026"],
  [/186\/2026/, "Resolução CGSN 186/2026"],
]) ok(busca.test(normas) || busca.test(papeis), `a base legal cita ${rotulo}`);

ok(/Anexos XVIII a XXII/.test(papeis),
   "e nomeia os Anexos XVIII a XXII, que substituem os antigos");
ok(/§ 5º veda a saída/.test(papeis),
   "e registra o § 5º na própria cadeia normativa, não só no risco");

/* NÃO pode ter sumido nada do que já estava certo */
ok(/Emenda Constitucional nº 132\/2023/.test(normas), "a EC 132/2023 continua na base legal");
ok(BASE_LEGAL.length >= 8, `a base legal cresceu (${BASE_LEGAL.length} normas)`);
ok(BASE_LEGAL.every((b) => b.norma && b.papel && b.papel.length > 40),
   "toda norma citada explica o próprio papel — citação sem função é enfeite");

/* ═══════════════════════════════ 3 · a nova redação da parcela ═══════ */
const base = baseDeCalculo(analise()).join(" \n ");

ok(/Parcela que sai do DAS ao optar/.test(base),
   "a base de cálculo nomeia a parcela sem prender à coluna antiga", base);
ok(!/migra para a CBS/.test(base),
   "a redação antiga ('parcela PIS/Cofins que migra para a CBS') saiu");
ok(/Anexos XVIII a XXII/.test(base) && /art\. 519/.test(base),
   "e a nova diz de onde a parcela vem: Anexos XVIII a XXII, art. 519");
ok(/soma idêntica/.test(base),
   "dizendo que a soma é idêntica à antiga — senão o contador acha que o número mudou");
ok(/16,6%/.test(base),
   "a parcela impressa continua sendo o sharePC da faixa (16,6% no Anexo III faixa 4)", base);
ok(/1\.500\.000/.test(base) && /Anexo 3, faixa 4/.test(base),
   "e a rastreabilidade da RBT12, do anexo e da faixa continua lá");

/* sem RBT12 o laudo tem de continuar avisando que estimou */
const semRbt = baseDeCalculo({
  saida: "S4",
  parametros: { ddas: { anexo: 3, faixa: 1, aliquota: 0.06, sharePC: 0.156, das: 0.00936, rbt12: null, fonte: "conservador" } },
}).join(" ");
ok(/estimativa conservadora/.test(semRbt), "sem RBT12, o aviso de estimativa continua saindo");
ok(/Anexos XVIII a XXII/.test(semRbt), "e a fundamentação nova vale nos dois caminhos");

/* ═══════════════════════════════ 4 · a nota dos cortes ═══════════════ */
ok(/30%/.test(NOTA_PARAMETROS), "a nota dos cortes traz a receita qualificada mínima");
ok(/0,8 a 1,2|0,8–1,2/.test(NOTA_PARAMETROS), "traz a banda de fronteira");
ok(/5% em torno do sublimite/.test(NOTA_PARAMETROS), "traz a banda do sublimite");
ok(/não decorrem de norma/.test(NOTA_PARAMETROS),
   "e DIZ que não decorrem de norma — é o ponto inteiro da nota");
ok(/menos\s+de 3%/.test(NOTA_PARAMETROS) && /3,6%/.test(NOTA_PARAMETROS),
   "com a sensibilidade medida, não com adjetivo");

console.log(f === 0 ? "\nOK" : `\n${f} FALHA(S)`);
process.exit(f === 0 ? 0 : 1);
