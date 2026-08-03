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

import {
  htmlLaudoCliente,
  htmlComparativoCliente,
  htmlColetaRespondida,
  htmlTermoAssinadoContador,
  htmlTermoAssinadoCliente,
} from "./emails-cliente.js";

import fsE from "node:fs";
import pathE from "node:path";

/**
 * A raiz é DESCOBERTA, não calculada por "../..".
 *
 * O executor copia cada suíte para `.tmp-rodar/` e roda de lá — um caminho
 * relativo ao arquivo apontaria para dentro da pasta temporária, e o teste
 * falharia dizendo que as rotas não existem. Sobe até achar o package.json.
 */
function acharRaiz(dir) {
  for (let i = 0; i < 6; i++) {
    if (fsE.existsSync(pathE.join(dir, "package.json")) && fsE.existsSync(pathE.join(dir, "app"))) {
      return dir;
    }
    dir = pathE.dirname(dir);
  }
  return null;
}
const RAIZ_E = acharRaiz(process.cwd());

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

/* ── os três avisos que fecham os silêncios ────────────────────────── */
const COLETA = htmlColetaRespondida({
  empresa: "Aurora Autopeças", escritorio: "Oliveira Contabilidade",
  link: "https://e/painel/empresa/1", respondente: "Marcos Aurélio",
});
ok(/respondeu/i.test(COLETA), "coleta: diz o que aconteceu");
ok(COLETA.includes("Marcos Aurélio"), "coleta: nomeia quem respondeu");
ok(/conferir|escritura/i.test(COLETA), "coleta: lembra que o contador confere antes de aplicar");
ok(!/aplicad[oa] (automaticamente|sozinh)/i.test(COLETA),
   "coleta: NÃO diz que a resposta entrou sozinha na análise");
ok(botoes(COLETA) === 1, "coleta: um botão");

const ASSIN_CONT = htmlTermoAssinadoContador({
  empresa: "Aurora", escritorio: "Oliveira Contabilidade",
  link: "https://e/painel/empresa/1", assinante: "Marcos", decisao: "optar",
});
ok(ASSIN_CONT.includes("Marcos"), "termo/contador: nomeia quem assinou");
ok(/optar/i.test(ASSIN_CONT), "termo/contador: registra a decisão");
ok(/trilha de auditoria|evid[êe]ncia/i.test(ASSIN_CONT), "termo/contador: aponta a prova");

const ASSIN_CLI = htmlTermoAssinadoCliente({
  empresa: "Aurora", escritorio: "Oliveira Contabilidade",
  link: "https://e/assinar/tok", decisao: "permanecer",
});
ok(/recebemos sua assinatura/i.test(ASSIN_CLI), "termo/cliente: confirma o recebimento");
ok(/permanecer/i.test(ASSIN_CLI), "termo/cliente: repete a decisão registrada");
ok(/n[ãa]o pode ser alterada/i.test(ASSIN_CLI), "termo/cliente: avisa que a decisão trava no semestre");
for (const [re, oque] of PROIBIDO) {
  ok(!re.test(soTexto(ASSIN_CLI)), `termo/cliente não contém ${oque}`);
}

/* ── o cabeçalho é o mesmo do documento: logo, nome, CRC ───────────── */
/**
 * O cliente compara as duas coisas lado a lado: primeiro chega o e-mail,
 * depois abre o laudo. Cabeçalho diferente faz a mensagem parecer de terceiro,
 * e a tese do produto é o contador parecer especialista. O CRC não é enfeite:
 * é a credencial que separa isto de um disparo qualquer.
 */
const COM_MARCA = htmlLaudoCliente({
  empresa: "Aurora",
  escritorio: { nome: "Oliveira Contabilidade", crc: "CRC 1SP123456/O-4", logo_url: "https://x/logo.png" },
  link: "https://e/laudo/tok", numero: 1, decisao: "optar",
});
ok(COM_MARCA.includes("CRC 1SP123456/O-4"), "cabeçalho leva o CRC");
ok(/<img src="https:\/\/x\/logo\.png"/.test(COM_MARCA), "cabeçalho leva o logotipo");
ok(COM_MARCA.includes("Oliveira Contabilidade"), "cabeçalho leva o nome");

const SEM_MARCA = htmlLaudoCliente({
  empresa: "Aurora", escritorio: { nome: "Só o Nome" },
  link: "https://e/laudo/tok", numero: 1, decisao: null,
});
ok(!/<img/.test(SEM_MARCA), "sem logo cadastrado, não sai <img> quebrada");
ok(!/CRC/i.test(SEM_MARCA), "sem CRC cadastrado, não inventa credencial");
ok(SEM_MARCA.includes("Só o Nome"), "e o nome continua lá");

// as rotas passam a identidade inteira, não só o nome
for (const rel of ["app/api/laudo/enviar/route.ts", "app/api/comparativo/enviar/route.ts"]) {
  if (!RAIZ_E) break;
  const src = fsE.readFileSync(pathE.join(RAIZ_E, rel), "utf8");
  ok(/escritorio\s*=\s*\{[^}]*crc[^}]*logo_url/.test(src),
     `${rel} manda nome, CRC e logo ao template`);
}

/* ── a promessa de "é só responder" precisa de reply-to ────────────── */
/**
 * Estes e-mails convidam o cliente a responder, e o remetente do Postal é
 * `nao-responda@enquadria.com.br`. Sem `responderPara` no chamador, o convite
 * é falso: a resposta cai numa caixa que ninguém lê. Pior que não convidar a
 * responder é convidar e sumir — e quem leva a culpa é o contador.
 *
 * Este teste é ESTÁTICO de propósito: o que precisa ser garantido não é o
 * texto, é que todo lugar que convida a responder passe o reply-to.
 */


const CONVIDAM = [
  "app/api/laudo/enviar/route.ts",
  "app/api/comparativo/enviar/route.ts",
  "app/api/termo/route.ts",
  "app/api/termo/lote/route.ts",
];
ok(!!RAIZ_E, "achei a raiz do projeto a partir de " + process.cwd());
/**
 * A VERIFICAÇÃO OLHA DENTRO DA CHAMADA, não o arquivo inteiro.
 *
 * A primeira versão testava `/responderPara/.test(src)` — e passava com o
 * código quebrado, porque a linha `const responderPara = ...` continuava lá
 * mesmo depois de eu tirar a variável de dentro do `enviarEmail({...})`. É o
 * mesmo defeito da primeira auditoria de UX: a regra media a presença da
 * palavra, não o comportamento. Aqui cada chamada de envio é isolada e cada
 * uma tem de carregar o reply-to.
 */
for (const rel of CONVIDAM) {
  if (!RAIZ_E) break;
  const arq = pathE.join(RAIZ_E, rel);
  if (!fsE.existsSync(arq)) { ok(false, `${rel} existe`); continue; }
  const src = fsE.readFileSync(arq, "utf8");

  const chamadas = [];
  for (const m of src.matchAll(/enviarEmail\(\s*\{/g)) {
    // fecha a chave contando profundidade — regex sozinha não casa aninhamento
    let i = m.index + m[0].length - 1, prof = 0;
    for (; i < src.length; i++) {
      if (src[i] === "{") prof++;
      else if (src[i] === "}") { prof--; if (prof === 0) break; }
    }
    chamadas.push(src.slice(m.index, i + 1));
  }

  ok(chamadas.length > 0, `${rel} tem chamada de envio`);
  const semReply = chamadas.filter((c) => !/responderPara/.test(c)).length;
  ok(semReply === 0, `${rel}: toda chamada manda a resposta ao contador`,
     semReply ? `${semReply} de ${chamadas.length} sem responderPara` : undefined);
}

// e o texto que faz a promessa continua fazendo — se sumir, o reply-to vira órfão
ok(/responder a este e-mail/i.test(LAUDO), "laudo convida a responder");
ok(/responder a este e-mail/i.test(COMP), "comparativo convida a responder");

console.log(f === 0 ? "TODOS OS TESTES PASSARAM" : `${f} FALHAS`);
process.exit(f ? 1 : 0);
