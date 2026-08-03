/**
 * TESTE DOS E-MAILS QUE VÃO AO CLIENTE DO CONTADOR.
 *
 * Estes dois e-mails são o único texto do produto que chega a alguém que nunca
 * viu o Enquadria e nunca vai ver. Quem assina embaixo é o CONTADOR — e é o CRC
 * dele que responde pelo que estiver escrito ali. Por isso as asserções aqui
 * não são de formatação: são de compromisso.
 *
 * O QUE ESTE ARQUIVO PROÍBE, e por quê:
 *
 *  · PROMESSA DE ECONOMIA. O laudo apresenta cenários sob premissas declaradas.
 *    Um e-mail que promete "economize", "reduza sua carga" ou "pague menos"
 *    cria expectativa que o documento não sustenta — e quem responde por ela é
 *    o profissional, não a ferramenta.
 *  · A PALAVRA "BLINDAGEM" e parentes. Vocabulário que sugere proteção
 *    absoluta contra o Fisco não descreve nada que exista.
 *  · O NOME DA FERRAMENTA. O cliente não comprou software, comprou o
 *    profissional. E-mail que se anuncia como sistema transforma um entregável
 *    técnico em notificação automática.
 *  · GARANTIA DE RESULTADO. "vai", "garantido", "com certeza".
 *
 * E EXIGE:
 *  · o link, uma vez só (duas chamadas disputam entre si);
 *  · o nome da empresa e o do escritório, escapados;
 *  · o prazo de 30 de setembro no laudo, que é o que dá urgência honesta;
 *  · a ressalva de que a decisão é do profissional, no comparativo.
 *
 * Rodado por testes/rodar-tudo.mjs.
 */

import { htmlLaudoCliente, htmlComparativoCliente } from "./emails-cliente.js";

let f = 0;
const ok = (c, m, e) => {
  if (!c) { f++; console.log("FALHOU:", m, e === undefined ? "" : JSON.stringify(e)); }
  else console.log("ok:", m);
};

const LAUDO = htmlLaudoCliente({
  empresa: "Distribuidora Aurora Autopeças Ltda",
  escritorio: "Oliveira Contabilidade",
  link: "https://app.enquadria.com.br/laudo/abc-123",
  numero: 7,
  decisao: "optar",
});

const COMP = htmlComparativoCliente({
  empresa: "Casa Nova Restaurante ME",
  escritorio: "Oliveira Contabilidade",
  link: "https://app.enquadria.com.br/comparativo/def-456",
  numero: 12,
  menor: "Lucro Presumido",
});

/* ── o que NÃO pode estar escrito ──────────────────────────────────── */
/**
 * A regra do nome da ferramenta vale para o TEXTO VISÍVEL, não para a URL.
 *
 * O link é `app.enquadria.com.br/laudo/<token>` — o cliente vê o domínio na
 * barra do navegador, e não há como evitar isso sem domínio próprio por
 * escritório (que não existe hoje e é decisão de outra fase). O que dá para
 * garantir, e é o que importa, é que a MENSAGEM seja do contador: nenhuma
 * linha de texto anuncia a ferramenta.
 */
const soTexto = (h) => h.replace(/<[^>]*>/g, " ");

const PROIBIDO = [
  [/economiz/i, "promessa de economia"],
  [/pagar? menos/i, "promessa de pagar menos"],
  [/reduz(a|ir|ção)\s+(a\s+)?(sua\s+)?carga/i, "promessa de reduzir carga"],
  [/blindage?m/i, "a palavra blindagem"],
  [/garantid/i, "garantia de resultado"],
  [/enquadria/i, "o nome da ferramenta"],
];
for (const [re, oque] of [...PROIBIDO]) {
  ok(!re.test(soTexto(LAUDO)), `laudo não contém ${oque}`);
  ok(!re.test(soTexto(COMP)), `comparativo não contém ${oque}`);
}
// e a exceção conhecida fica registrada, para ninguém "consertar" por engano
ok(/enquadria/i.test(LAUDO), "a marca aparece SÓ na URL — exceção conhecida, ver comentário acima");

/* ── o que TEM de estar ────────────────────────────────────────────── */
ok(LAUDO.includes("Oliveira Contabilidade"), "laudo assina com o escritório");
ok(LAUDO.includes("Distribuidora Aurora Autopeças Ltda"), "laudo nomeia a empresa");
ok(LAUDO.includes("https://app.enquadria.com.br/laudo/abc-123"), "laudo leva o link público");
ok(LAUDO.includes("0007"), "laudo cita o número com 4 dígitos");
ok(/30 de setembro/.test(LAUDO), "laudo lembra o prazo da janela");
ok(/mem[óo]ria de c[áa]lculo/i.test(LAUDO), "laudo anuncia a memória de cálculo");

ok(COMP.includes("Lucro Presumido"), "comparativo cita o regime de menor carga");
ok(/cen[áa]rio analisado/i.test(COMP), "comparativo amarra a afirmação ao cenário");
ok(/decis[ãa]o.*(nossa|profissional)/i.test(COMP), "comparativo diz de quem é a decisão", COMP.slice(-400));
ok(/n[ãa]o [ée] uma apura[çc][ãa]o|estudo de cen[áa]rios/i.test(COMP), "comparativo se declara estudo, não apuração");

/* ── uma chamada só ────────────────────────────────────────────────── */
const botoes = (h) => (h.match(/border-radius:999px/g) || []).length;
ok(botoes(LAUDO) === 1, "laudo tem UM botão", botoes(LAUDO));
ok(botoes(COMP) === 1, "comparativo tem UM botão", botoes(COMP));

/* ── a decisão só é anunciada quando existe ────────────────────────── */
const semDecisao = htmlLaudoCliente({
  empresa: "Gama Padaria", escritorio: "X", link: "https://e/l/t", numero: 3, decisao: null,
});
ok(!/vale optar|vale permanecer/i.test(semDecisao),
   "laudo curto (faixas C/D/MEI/FORA) não anuncia decisão que o documento não toma");
const permanecer = htmlLaudoCliente({
  empresa: "Y", escritorio: "X", link: "https://e/l/t", numero: 4, decisao: "permanecer",
});
ok(/vale permanecer/i.test(permanecer), "decisão 'permanecer' aparece com esse nome");
ok(/vale optar/i.test(LAUDO), "decisão 'optar' aparece com esse nome");

const semMenor = htmlComparativoCliente({
  empresa: "Y", escritorio: "X", link: "https://e/c/t", numero: 5, menor: null,
});
ok(!/menor carga é/i.test(semMenor), "sem regime de menor carga, não inventa um");

/* ── injeção pelo nome da empresa ──────────────────────────────────── */
// razão social vem de CSV do contador: é entrada de terceiro dentro de HTML.
const malicioso = htmlLaudoCliente({
  empresa: '<script>alert(1)</script>',
  escritorio: '"><b>x',
  link: "https://e/l/t",
  numero: 1,
  decisao: null,
});
ok(!malicioso.includes("<script>"), "nome de empresa não injeta tag");
ok(malicioso.includes("&lt;script&gt;"), "nome de empresa sai escapado");
ok(!/<b>x/.test(malicioso), "nome de escritório não injeta tag");

console.log(f === 0 ? "TODOS OS TESTES PASSARAM" : `${f} FALHAS`);
process.exit(f ? 1 : 0);
