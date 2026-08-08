#!/usr/bin/env node
/**
 * AUDITOR DA CASCA PÚBLICA — as duas metades do site têm que ter o MESMO menu.
 *
 * ---------------------------------------------------------------------------
 * O DEFEITO QUE ESTE AUDITOR EXISTE PARA PEGAR
 *
 * O site é HTML portado (`const HTML = "…"` + `site.css`) e o app é Tailwind.
 * O cabeçalho, portanto, existe DUAS VEZES: uma dentro de cada string de HTML
 * das páginas portadas, outra em `components/CascaPublica.tsx`. Nada no
 * TypeScript, no build ou nos 327 testes olha para as duas ao mesmo tempo.
 *
 * O resultado apareceu no ar: /reforma e /curso com um menu, /precos e /faq
 * com outro. Quem navegava entre as duas metades via a marca mudar de tamanho
 * e os botões mudarem de forma no meio do mesmo site — o sinal de que se saiu
 * do site sem querer. E o dia em que se acrescentou "Reforma" ao menu, ela
 * entrou em cinco arquivos de HTML e num array de TypeScript, à mão.
 *
 * O que este auditor confere, e por que cada regra:
 *
 *   1. MESMOS LINKS, MESMA ORDEM. O menu do `CascaPublica` e o `.nav-links` de
 *      cada página portada precisam ter os mesmos `href`, na mesma ordem. É a
 *      regra que quebra quando alguém acrescenta uma página e esquece metade
 *      dos arquivos.
 *
 *   2. NENHUM CABEÇALHO ÓRFÃO. Toda página pública servida pelo app tem de
 *      passar por `CascaPublica` ou por `FolhaDoSite`. Um `<header>` escrito à
 *      mão numa página nova é uma terceira casca nascendo.
 *
 *   3. O `casca.css` NÃO PODE TER REGRA DE ELEMENTO. É a razão de ele existir
 *      separado do `site.css`: uma regra `p { … }` aqui reescreveria a
 *      tipografia de toda página em Tailwind que carrega a casca.
 *
 *   4. NENHUM LINK RELATIVO nas páginas portadas. `href="curso/aula-1.html"`
 *      funcionava quando o site era arquivo em pasta; virou rota, e o mesmo
 *      href passou a resolver para /precos/curso/aula-1.html — 404 silencioso
 *      no rodapé de todas as páginas.
 *
 * Roda com `--autoteste`: além de varrer, reintroduz cada defeito e confere
 * que a varredura o pega. Auditor que só sabe dizer "ok" não é trava.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const AUTOTESTE = process.argv.includes("--autoteste");

/** as páginas do site portadas de HTML — as que têm o cabeçalho embutido */
const PORTADAS = [
  "app/page.tsx",
  "app/precos/page.tsx",
  "app/faq/page.tsx",
  "app/guia/page.tsx",
  "app/como-funciona/page.tsx",
];

const ler = (rel) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

const falhas = [];
const oks = [];
function regra(nome, condicao, detalhe) {
  if (condicao) oks.push(nome);
  else falhas.push({ nome, detalhe });
}

/* ---------------------------------------------------------------- extração */

/** os hrefs do array LINKS do CascaPublica, na ordem */
export function linksDaCasca(fonte) {
  const bloco = fonte.match(/const LINKS = \[([\s\S]*?)\];/);
  if (!bloco) return null;
  return [...bloco[1].matchAll(/href:\s*"([^"]+)"/g)].map((m) => m[1]);
}

/**
 * os hrefs do `<nav class="nav-links">` de uma página portada, na ordem.
 * O HTML mora dentro de uma string JS, então as aspas vêm escapadas (\").
 */
export function linksDaPaginaPortada(fonte) {
  const bloco = fonte.match(/nav-links\\">([\s\S]*?)<\/nav>/);
  if (!bloco) return null;
  return [...bloco[1].matchAll(/href=\\"([^\\"]+)\\"/g)]
    .map((m) => m[1])
    /* o CTA do celular mora dentro do mesmo <nav> e não é item de menu */
    .filter((h) => !/^https?:/.test(h));
}

/* ------------------------------------------------------- 1. mesmos links */

const casca = ler("components/CascaPublica.tsx");
const esperado = linksDaCasca(casca);
regra("o CascaPublica declara um array LINKS legível", Array.isArray(esperado) && esperado.length > 0);

for (const rel of PORTADAS) {
  const achado = linksDaPaginaPortada(ler(rel));
  regra(
    `${rel} tem o mesmo menu do CascaPublica`,
    achado !== null && esperado !== null && achado.join(" ") === esperado.join(" "),
    achado === null ? "não achei o <nav class=nav-links>" : `no HTML: ${achado.join(" ")}\n     na casca: ${esperado?.join(" ")}`
  );
}

/* -------------------------------------------------- 2. nenhum órfão */

/** rotas que NÃO são públicas: painel, documentos por token, auth */
const PRIVADAS = /^app\/(painel|doc|api|login|redefinir|auth|coleta|termo|laudo|assinar|abertura|comparativo|certificado|descadastro)\b/;

function paginasPublicas(dir = "app", achadas = []) {
  for (const nome of fs.readdirSync(path.join(RAIZ, dir))) {
    const rel = `${dir}/${nome}`;
    const abs = path.join(RAIZ, rel);
    if (fs.statSync(abs).isDirectory()) {
      if (!PRIVADAS.test(rel)) paginasPublicas(rel, achadas);
    } else if (nome === "page.tsx" && !PRIVADAS.test(rel)) {
      achadas.push(rel);
    }
  }
  return achadas;
}

const SEM_CASCA_POR_DESENHO = new Set([
  /* o exemplo do laudo é a folha do documento, sem cabeçalho de site */
]);

for (const rel of paginasPublicas()) {
  if (SEM_CASCA_POR_DESENHO.has(rel)) continue;
  const src = ler(rel);
  const temCasca = /CascaPublica|FolhaDoSite|DocumentoLegal/.test(src);
  regra(
    `${rel} usa a casca do site`,
    temCasca,
    "página pública com cabeçalho próprio — é uma terceira casca nascendo"
  );
}

/* --------------------------------------- 3. casca.css sem regra de elemento */

const css = ler("app/casca.css");
const semComentarios = css.replace(/\/\*[\s\S]*?\*\//g, "");
const seletores = [...semComentarios.matchAll(/(^|\})\s*([^{}@]+)\{/g)].map((m) => m[2].trim());
const deElemento = seletores
  .flatMap((s) => s.split(",").map((x) => x.trim()))
  .filter((s) => s && !s.startsWith(".") && !s.startsWith("@") && !/\.casca-/.test(s));
regra(
  "casca.css não tem regra de elemento",
  deElemento.length === 0,
  `regras soltas: ${deElemento.join(" · ")}`
);

/* --------------------------------- 3b. nenhuma massa de conferência solta */

/**
 * PARA CONFERIR A /reforma NO OLHO É PRECISO TER MATÉRIA NA TELA — e o banco
 * de desenvolvimento não tem nenhuma. A saída é injetar uma massa temporária
 * na função que lê do banco, tirar as capturas, e desfazer.
 *
 * O passo "e desfazer" é o que se esquece. Massa esquecida não quebra build,
 * não quebra teste e não quebra tela: ela vai para produção e o site publica
 * onze normas inventadas como se fossem reais, com data e fonte. Num produto
 * cujo assunto é norma tributária, é o pior defeito possível.
 *
 * O marcador é fixo de propósito: quem for injetar massa de novo usa o mesmo
 * comentário e esta regra pega.
 */
{
  const MARCADOR = "MASSA DE CONFERÊNCIA";
  const sujos = [];
  const varrer = (dir) => {
    for (const nome of fs.readdirSync(path.join(RAIZ, dir))) {
      const rel = `${dir}/${nome}`;
      const abs = path.join(RAIZ, rel);
      if (fs.statSync(abs).isDirectory()) varrer(rel);
      else if (/\.tsx?$/.test(nome) && fs.readFileSync(abs, "utf8").includes(MARCADOR)) sujos.push(rel);
    }
  };
  for (const raiz of ["app", "lib", "components"]) varrer(raiz);
  regra(
    "nenhuma massa de conferência esquecida no código",
    sujos.length === 0,
    `dados inventados prestes a ir ao ar: ${sujos.join(" · ")}`
  );
}

/* ------------------------------------------- 4. nenhum link relativo no HTML */

for (const rel of PORTADAS) {
  const src = ler(rel);
  const relativos = [...src.matchAll(/href=\\"([^\\"#][^\\"]*)\\"/g)]
    .map((m) => m[1])
    .filter((h) => !/^(\/|https?:|mailto:|tel:)/.test(h));
  regra(
    `${rel} não tem link relativo`,
    relativos.length === 0,
    `viraria 404 fora da raiz: ${[...new Set(relativos)].join(" · ")}`
  );
}

/* ------------------------------------------------------------- autoteste */

if (AUTOTESTE) {
  /* cada sabotagem tem de ser PEGA — auditor que não pega o defeito que
     conhece não protege de nada */
  const sabotagens = [
    {
      nome: "menu com um link a menos numa página portada",
      roda: () => {
        const original = ler("app/precos/page.tsx");
        const quebrado = original.replace(/<a href=\\"\/reforma\\">Reforma<\/a>\\n\s*/, "");
        const links = linksDaPaginaPortada(quebrado);
        return links !== null && links.join(" ") !== esperado.join(" ");
      },
    },
    {
      nome: "link relativo no rodapé",
      roda: () => {
        const src = `href=\\"curso/aula-1.html\\"`;
        const relativos = [...src.matchAll(/href=\\"([^\\"#][^\\"]*)\\"/g)]
          .map((m) => m[1])
          .filter((h) => !/^(\/|https?:|mailto:|tel:)/.test(h));
        return relativos.length > 0;
      },
    },
    {
      /* sabotagem DE VERDADE: escreve um arquivo com a massa dentro de lib/,
         roda a varredura e confere que ele foi pego — depois apaga. Testar a
         regra contra uma string em memória não prova que a varredura chega
         nas subpastas, que é justamente onde ela poderia falhar. */
      nome: "massa de conferência esquecida num arquivo de lib/",
      roda: () => {
        const alvo = path.join(RAIZ, "lib", "__sabotagem_casca.ts");
        fs.writeFileSync(alvo, `/* MASSA DE CONFERÊNCIA */\nexport const X = 1;\n`);
        try {
          const achados = [];
          const varrer = (dir) => {
            for (const nome of fs.readdirSync(path.join(RAIZ, dir))) {
              const rel = `${dir}/${nome}`;
              const abs = path.join(RAIZ, rel);
              if (fs.statSync(abs).isDirectory()) varrer(rel);
              else if (/\.tsx?$/.test(nome) && fs.readFileSync(abs, "utf8").includes("MASSA DE CONFERÊNCIA"))
                achados.push(rel);
            }
          };
          for (const raiz of ["app", "lib", "components"]) varrer(raiz);
          return achados.includes("lib/__sabotagem_casca.ts");
        } finally {
          fs.rmSync(alvo, { force: true });
        }
      },
    },
    {
      nome: "regra de elemento no casca.css",
      roda: () => {
        const sujo = css + "\np { margin: 0; }\n";
        const sels = [...sujo.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(^|\})\s*([^{}@]+)\{/g)]
          .map((m) => m[2].trim())
          .flatMap((s) => s.split(",").map((x) => x.trim()))
          .filter((s) => s && !s.startsWith(".") && !s.startsWith("@") && !/\.casca-/.test(s));
        return sels.length > 0;
      },
    },
  ];
  for (const s of sabotagens) {
    regra(`sabotagem pega: ${s.nome}`, s.roda(), "a sabotagem passou sem ser notada");
  }
}

/* --------------------------------------------------------------- relatório */

console.log(`\nAUDITORIA DA CASCA PÚBLICA — ${PORTADAS.length} páginas portadas + a casca em Tailwind\n`);
for (const n of oks) console.log(`ok: ${n}`);
if (falhas.length) {
  console.log("");
  for (const f of falhas) {
    console.log(`FALHOU: ${f.nome}`);
    if (f.detalhe) console.log(`     ${f.detalhe}`);
  }
  console.log(`\n${falhas.length} problema(s) — o menu está diferente entre as metades do site.`);
  process.exit(1);
}
console.log("\nAS DUAS METADES DO SITE TÊM O MESMO MENU");
