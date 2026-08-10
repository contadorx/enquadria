/**
 * AS NORMAS CITADAS NO TEXTO — o teste do que não pode virar link errado.
 *
 * Este arquivo protege duas coisas de naturezas diferentes:
 *
 * 1. QUE A CITAÇÃO VIRE LINK nas formas que um contador escreve de verdade —
 *    "LC 214/2025", "Lei Complementar nº 214, de 2025", "LC 214". O texto da
 *    matéria é digitado à mão no painel; ninguém padroniza citação enquanto
 *    escreve, e um casamento que só funciona na forma canônica é o mesmo que
 *    não funcionar.
 *
 * 2. QUE ELA NÃO VIRE LINK QUANDO NÃO HÁ PARA ONDE APONTAR. Resolução do
 *    CGSN não tem endereço dedutível — o sistema da Receita endereça por um
 *    número interno. Se um dia alguém "melhorar" isso inventando uma URL, o
 *    produto passa a publicar fonte falsa na página que se vende por citar a
 *    fonte. É o teste mais importante deste arquivo.
 */
import { partirPorNormas, quantasNormas, ehEndereco } from "./normas.js";

let f = 0;
const ok = (c, m, e) => {
  if (!c) { f++; console.log("FALHOU:", m, e === undefined ? "" : JSON.stringify(e)); }
  else console.log("ok:", m);
};
const igual = (achado, esperado, m) => ok(achado === esperado, m, { achado, esperado });

const links = (t, fonte) => partirPorNormas(t, fonte).filter((p) => p.tipo === "link");
const inteiro = (t, fonte) => partirPorNormas(t, fonte).map((p) => p.texto).join("");

/* ═══════════ 1 · as formas que aparecem no texto de verdade ════════════ */

for (const forma of [
  "LC 214/2025", "LC 214", "Lei Complementar nº 214, de 2025",
  "Lei Complementar 214/2025", "lei complementar nº 214",
]) {
  const l = links(`Conforme a ${forma}, o regime muda.`);
  igual(l.length, 1, `"${forma}" vira link`);
  igual(
    l[0]?.url,
    "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm",
    `"${forma}" aponta para a LC 214 no Planalto`
  );
}

igual(links("A EC 132/2023 criou o IBS.").length, 1, "a EC 132 vira link");
igual(links("Emenda Constitucional nº 132 de 2023").length, 1, "a EC por extenso também");
igual(links("O Simples vem da LC 123/2006.").length, 1, "a LC 123 vira link");

/* ═══════════ 2 · o que NÃO pode virar link inventado ═══════════════════ */

igual(
  links("A Resolução CGSN nº 186/2026 abriu a janela.").length,
  0,
  "sem fonte declarada, a Resolução CGSN continua TEXTO — não se inventa endereço de norma"
);

igual(
  links("O Ato Declaratório Executivo nº 4/2026 trata do prazo.").length,
  0,
  "o mesmo vale para ato declaratório sem fonte"
);

const comFonte = links(
  "A Resolução CGSN nº 186/2026 abriu a janela.",
  "https://exemplo.gov.br/resolucao-186"
);
igual(comFonte.length, 1, "com a fonte declarada em URL, a Resolução vira link para ela");
igual(comFonte[0]?.oficial, false, "e é marcada como NÃO oficial — vai com nofollow");

igual(
  links("A Resolução CGSN nº 186/2026.", "LC 214/2025, art. 349").length,
  0,
  "fonte que é citação, e não endereço, não vira link"
);

ok(!ehEndereco("Resolução CGSN nº 186/2026"), "citação não é endereço");
ok(!ehEndereco("javascript:alert(1)"), "só http(s) conta como endereço");
ok(ehEndereco("https://www.planalto.gov.br/x"), "https conta como endereço");

/* ═══════════ 3 · o texto não pode ser alterado pela quebra ═════════════ */

const original =
  "A LC 214/2025 e a EC 132/2023 mudam a conta; a Resolução CGSN nº 186/2026 abriu a janela.";
igual(
  inteiro(original, "https://exemplo.gov.br/x"),
  original,
  "juntar os pedaços devolve o texto exatamente como entrou"
);

igual(quantasNormas(original, "https://exemplo.gov.br/x"), 3, "as três citações viram link");

/* uma citação dentro de outra não pode partir o texto no meio da palavra */
igual(
  inteiro("Lei Complementar nº 214, de 2025, art. 349"),
  "Lei Complementar nº 214, de 2025, art. 349",
  "correspondências sobrepostas não duplicam nem comem caracteres"
);

/* ═══════════ 4 · estado do RegExp entre chamadas ═══════════════════════ */

/* `lastIndex` é estado do próprio objeto RegExp, e os padrões são de módulo:
   sem reiniciar, a segunda chamada começaria do meio do texto anterior e
   perderia a citação. Este teste é o que pega essa regressão. */
igual(links("LC 214/2025 no começo").length, 1, "primeira chamada acha");
igual(links("LC 214/2025 no começo").length, 1, "segunda chamada idêntica acha o mesmo");
igual(links("texto longo antes e a LC 214/2025 bem no fim").length, 1, "e uma terceira, mais longa, também");

/* ═══════════ 5 · entradas degeneradas ══════════════════════════════════ */

igual(partirPorNormas(null).length, 0, "texto nulo devolve nada");
igual(partirPorNormas("").length, 0, "texto vazio devolve nada");
igual(links("Nenhuma norma citada aqui.").length, 0, "texto sem citação não inventa link");

console.log(f === 0 ? "\nTODOS OS TESTES PASSARAM" : `\n${f} FALHA(S)`);
process.exit(f === 0 ? 0 : 1);
