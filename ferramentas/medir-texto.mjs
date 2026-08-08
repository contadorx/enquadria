/**
 * MEDIR O TEXTO DA INTERFACE — onde as palavras estão, em número.
 *
 * Reduzir texto por impressão é como cortar custo por impressão: corta-se o
 * que está à vista, não o que pesa. Este script tira a impressão do caminho.
 *
 * O que ele conta como texto de tela:
 *   · nós de texto do JSX (o que fica entre > e <)
 *   · literais de prosa (string com espaço, mais de 25 caracteres, começando
 *     por letra) — cobre title=, placeholder=, e as constantes de copy
 *
 * O que ele NÃO conta, de propósito: comentários de código. Comentário longo é
 * documentação para quem mantém, e o produto não os exibe.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RAIZ = process.cwd();
const ALVOS = ["app", "components", "lib"];
const IGNORA = /node_modules|\.next|testes|ferramentas/;

function arquivos(dir, acc = []) {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (IGNORA.test(p)) continue;
    const s = statSync(p);
    if (s.isDirectory()) arquivos(p, acc);
    else if (/\.(tsx|ts)$/.test(p)) acc.push(p);
  }
  return acc;
}

/** tira comentários sem estragar as strings que interessam */
function semComentarios(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
}

const PALAVRA = /[A-Za-zÀ-ÿ]/;

function trechos(src) {
  const t = [];
  // nós de texto do JSX
  for (const m of src.matchAll(/>([^<>{}]{12,})</g)) {
    const s = m[1].replace(/\s+/g, " ").trim();
    if (s.length >= 12 && PALAVRA.test(s[0]) && s.includes(" ")) t.push(s);
  }
  // literais de prosa
  for (const m of src.matchAll(/["'`]([^"'`\n]{26,})["'`]/g)) {
    const s = m[1].replace(/\s+/g, " ").trim();
    if (!s.includes(" ")) continue;
    if (!PALAVRA.test(s[0])) continue;
    if (/^[a-z-]+:|^\//.test(s)) continue; // classes css e rotas
    if (/(rounded|text-\[|border|bg-|flex|grid|px-|py-)/.test(s)) continue;
    t.push(s);
  }
  return t;
}

const linhas = [];
for (const dir of ALVOS) {
  for (const p of arquivos(join(RAIZ, dir))) {
    const src = semComentarios(readFileSync(p, "utf8"));
    const ts = trechos(src);
    if (!ts.length) continue;
    const chars = ts.reduce((n, s) => n + s.length, 0);
    const palavras = ts.reduce((n, s) => n + s.split(/\s+/).length, 0);
    const maior = ts.slice().sort((a, b) => b.length - a.length)[0];
    linhas.push({ arq: relative(RAIZ, p), trechos: ts.length, chars, palavras, maior, todos: ts });
  }
}

linhas.sort((a, b) => b.chars - a.chars);

const alvo = process.argv[2];
if (alvo) {
  const f = linhas.find((l) => l.arq.includes(alvo));
  if (!f) {
    console.log("nada encontrado para", alvo);
    process.exit(0);
  }
  console.log(`\n${f.arq} — ${f.palavras} palavras em ${f.trechos} trechos\n`);
  for (const s of f.todos.slice().sort((a, b) => b.length - a.length)) {
    console.log(`[${String(s.length).padStart(4)}] ${s}`);
  }
  process.exit(0);
}

const total = linhas.reduce((n, l) => n + l.palavras, 0);
console.log(`\nTEXTO DE TELA — ${total} palavras em ${linhas.length} arquivos\n`);
console.log("palavras  trechos  arquivo");
for (const l of linhas.slice(0, 40)) {
  console.log(
    `${String(l.palavras).padStart(8)}  ${String(l.trechos).padStart(7)}  ${l.arq}`
  );
}
console.log(`\n(os 40 maiores concentram ${Math.round(
  (linhas.slice(0, 40).reduce((n, l) => n + l.palavras, 0) / total) * 100
)}% do texto)`);
