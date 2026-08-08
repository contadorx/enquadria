/**
 * MAPEAR AS AÇÕES — quantas coisas clicáveis existem em cada tela, e o que elas
 * prometem.
 *
 * A pergunta que este script responde: onde o contador tem escolha demais? Uma
 * tela com 4 ações tem um caminho; uma tela com 19 tem dezenove, e quem chega
 * ali pela primeira vez gasta a atenção escolhendo em vez de trabalhando.
 *
 * Conta: <button> com rótulo de texto, <Link>/<a> com href, e <label> que abre
 * seletor de arquivo. Não conta o que é decoração nem o que só existe dentro de
 * modal fechado — então o número é um PISO, não um teto.
 *
 *   node ferramentas/mapear-acoes.mjs            → ranking por tela
 *   node ferramentas/mapear-acoes.mjs Cockpit    → as ações daquela tela
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RAIZ = process.cwd();
const IGNORA = /node_modules|\.next|testes|ferramentas/;

function arquivos(dir, acc = []) {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (IGNORA.test(p)) continue;
    const s = statSync(p);
    if (s.isDirectory()) arquivos(p, acc);
    else if (p.endsWith(".tsx")) acc.push(p);
  }
  return acc;
}

const semComentarios = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

const limpo = (s) => s.replace(/\s+/g, " ").trim();
const TEXTO = /[A-Za-zÀ-ÿ]/;

function acoesDe(src) {
  const a = [];

  // botões com rótulo literal
  for (const m of src.matchAll(/<button\b[^>]*>([\s\S]{0,120}?)<\/button>/g)) {
    const bruto = limpo(m[1].replace(/<[^>]*>/g, " "));
    const rotulo = bruto.replace(/\{[^}]*\}/g, "«dinâmico»").trim();
    if (!rotulo) continue;
    a.push({ tipo: "botão", rotulo: rotulo.slice(0, 60) });
  }

  // links de navegação
  for (const m of src.matchAll(/<(?:Link|a)\b[^>]*href=\{?["'`]([^"'`}]+)["'`]\}?[^>]*>([\s\S]{0,100}?)<\/(?:Link|a)>/g)) {
    const rotulo = limpo(m[2].replace(/<[^>]*>/g, " ")).replace(/\{[^}]*\}/g, "«dinâmico»");
    if (!rotulo || !TEXTO.test(rotulo)) continue;
    a.push({ tipo: "link", rotulo: rotulo.slice(0, 50), destino: m[1] });
  }

  // seletor de arquivo disfarçado de botão
  for (const m of src.matchAll(/<label\b[^>]*>([\s\S]{0,120}?)<input[^>]*type="file"/g)) {
    const rotulo = limpo(m[1].replace(/<[^>]*>/g, " "));
    if (rotulo) a.push({ tipo: "arquivo", rotulo: rotulo.slice(0, 50) });
  }

  return a;
}

const mapa = [];
for (const dir of ["app", "components"]) {
  for (const p of arquivos(join(RAIZ, dir))) {
    const src = semComentarios(readFileSync(p, "utf8"));
    const a = acoesDe(src);
    if (a.length) mapa.push({ arq: relative(RAIZ, p), acoes: a });
  }
}
mapa.sort((x, y) => y.acoes.length - x.acoes.length);

const alvo = process.argv[2];
if (alvo) {
  const f = mapa.find((m) => m.arq.includes(alvo));
  if (!f) {
    console.log("nada encontrado para", alvo);
    process.exit(0);
  }
  console.log(`\n${f.arq} — ${f.acoes.length} ações\n`);
  for (const a of f.acoes) {
    console.log(`  [${a.tipo.padEnd(7)}] ${a.rotulo}${a.destino ? `  → ${a.destino}` : ""}`);
  }
  process.exit(0);
}

console.log("\nAÇÕES POR TELA — o piso, não o teto\n");
console.log("ações  arquivo");
for (const m of mapa.slice(0, 25)) {
  console.log(`${String(m.acoes.length).padStart(5)}  ${m.arq}`);
}
