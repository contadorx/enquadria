#!/usr/bin/env node
/**
 * AUDITORIA DE SCHEMA — colunas que o código pede e ninguém garante que existem.
 *
 * POR QUE ESTE ARQUIVO EXISTE
 *
 * Ao ligar o aviso de "termo assinado", escrevi
 * `.from("termos").select("id, token, decisao, tenant_id, ...")`. A coluna
 * `tenant_id` NÃO existe em `termos` — a migration 0020 conta termos por
 * escritório fazendo join com `analises` justamente porque não existe.
 *
 * Nada teria pego isso. O TypeScript não tipa o cliente do Supabase aqui: para
 * ele, `select()` recebe uma string. O build passa. Os testes de função pura
 * passam. O erro só apareceria em produção — e no pior lugar possível, dentro
 * da rota de ASSINATURA, derrubando o fecho da esteira inteiro para acrescentar
 * um aviso que era acessório.
 *
 * A REGRA, e por que ela é esta
 *
 * Não tenho o schema: as tabelas iniciais não estão versionadas neste repo
 * (as migrations começam em 0020). Então a verificação não pode ser "existe no
 * banco?" — tem de ser uma pergunta que o próprio código responda:
 *
 *   toda coluna pedida a uma tabela precisa ter PROVENIÊNCIA: ou aparece em
 *   alguma migration, ou é usada em pelo menos um OUTRO ponto do código.
 *
 * Uma coluna citada UMA VEZ SÓ, numa tabela que o app inteiro já consulta, é
 * exatamente a assinatura de um campo inventado na hora. Foi o meu caso:
 * `tenant_id` era a única menção entre todos os selects de `termos`.
 *
 * DISPENSA: `// schema-ok: <motivo>` na mesma linha ou na anterior. Coluna nova
 * que chega junto com a migration que a cria não precisa de dispensa — a
 * migration já é a proveniência.
 */

import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(new URL("..", import.meta.url).pathname);
const PASTAS = ["app", "lib", "components"];
const MIGRATIONS = path.join(RAIZ, "supabase", "migrations");

/* ── 1. as migrations, POR TABELA ───────────────────────────────────────
 *
 * A primeira versão procurava o nome da coluna no texto inteiro das
 * migrations. Isso deixou passar exatamente o bug que motivou o arquivo:
 * `termos.tenant_id` — porque `tenant_id` existe em OUTRAS tabelas, e a busca
 * global achava a palavra e dava a coluna por boa. Proveniência tem de ser da
 * tabela, não do vocabulário do projeto.
 */
const colunasMigration = new Map();
const anota = (tabela, coluna) => {
  const t = tabela.toLowerCase();
  if (!colunasMigration.has(t)) colunasMigration.set(t, new Set());
  colunasMigration.get(t).add(coluna.toLowerCase());
};

if (fs.existsSync(MIGRATIONS)) {
  for (const f of fs.readdirSync(MIGRATIONS).filter((x) => x.endsWith(".sql"))) {
    const sql = fs.readFileSync(path.join(MIGRATIONS, f), "utf8");

    // create table [if not exists] [public.]X ( ... )
    for (const m of sql.matchAll(
      /create\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_]+)\s*\(([\s\S]*?)\n\s*\)\s*;/gi
    )) {
      for (const linha of m[2].split("\n")) {
        const c = linha.trim().match(/^([a-z_][a-z0-9_]*)\s+[a-z]/i);
        if (c && !/^(primary|foreign|unique|check|constraint)$/i.test(c[1])) anota(m[1], c[1]);
      }
    }

    // alter table [public.]X add column [if not exists] Y
    for (const m of sql.matchAll(
      /alter\s+table\s+(?:public\.)?([a-z_]+)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)/gi
    )) {
      anota(m[1], m[2]);
    }

    // as migrations que descobrem o schema fazem alter por format(); pego o par
    // (tabela, coluna) das checagens de information_schema
    for (const m of sql.matchAll(
      /table_name\s*=\s*'([a-z_]+)'\s+and\s+column_name\s*=\s*'([a-z_]+)'/gi
    )) {
      anota(m[1], m[2]);
    }
  }
}

/* ── 2. varre os selects do código ──────────────────────────────────── */
function arquivos(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      arquivos(p, acc);
    } else if (/\.(ts|tsx)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

const lista = PASTAS.flatMap((d) =>
  fs.existsSync(path.join(RAIZ, d)) ? arquivos(path.join(RAIZ, d)) : []
);

/**
 * PROVENIÊNCIA TAMBÉM VEM DE ESCRITA. Uma coluna que o app GRAVA existe — e a
 * primeira versão desta auditoria só olhava `select`, acusando `empresas.porte`
 * e `termos.otp_hash`, que são gravadas a poucas linhas do select que as lê.
 * Auditoria que acusa código correto é auditoria que o time aprende a ignorar.
 */
const escritas = new Set();
const RE_ESCRITA = /\.from\(\s*["'`]([a-z_]+)["'`]\s*\)[\s\S]{0,200}?\.(?:insert|upsert|update)\(\s*\{([\s\S]{0,900}?)\}\s*[,)]/g;

/**
 * E a escrita nem sempre é literal. O importador monta um array `registros` e
 * chama `.upsert(comLote)` — as colunas estão num objeto a cinquenta linhas de
 * distância. Quando o arquivo comprovadamente ESCREVE numa tabela por variável,
 * toda chave de objeto daquele arquivo conta como proveniência para ela. É mais
 * frouxo, e de propósito: o custo de deixar passar uma coluna é zero (ela já
 * estava passando antes desta auditoria existir); o custo de acusar código
 * correto é o time desligar a auditoria.
 */
const RE_ESCRITA_VAR = /\.from\(\s*["'`]([a-z_]+)["'`]\s*\)[\s\S]{0,200}?\.(?:insert|upsert|update)\(\s*[A-Za-z_$]/g;

/** tabela -> coluna -> [ "arquivo:linha" ] */
const uso = new Map();
/** "arquivo:linha" dispensado explicitamente */
const dispensados = new Set();

/**
 * .from("tabela") ... .select("a, b, c") — o select pode estar linhas abaixo.
 *
 * O trecho entre os dois NÃO pode conter outro `.from(`. Sem essa trava, um
 * `.from("empresas").update(...)` seguido, dezesseis linhas depois, de um
 * `.from("coletas").select("token")` casava empresas com token e a auditoria
 * acusava uma coluna que ninguém escreveu. O `.from(` intermediário é a
 * fronteira natural entre duas consultas.
 */
const RE = /\.from\(\s*["'`]([a-z_]+)["'`]\s*\)((?:(?!\.from\()[\s\S]){0,400}?)\.select\(\s*["'`]([^"'`]+)["'`]/g;

for (const arq of lista) {
  const src = fs.readFileSync(arq, "utf8");
  const linhas = src.split("\n");
  const rel = path.relative(RAIZ, arq);

  for (const m of src.matchAll(RE_ESCRITA)) {
    const tabela = m[1];
    for (const chave of m[2].matchAll(/(?:^|[\n{,])\s*([a-z_][a-z0-9_]*)\s*:/g)) {
      escritas.add(`${tabela}.${chave[1]}`);
    }
  }
  for (const m of src.matchAll(RE_ESCRITA_VAR)) {
    const tabela = m[1];
    for (const chave of src.matchAll(/(?:^|[\n{,])\s*([a-z_][a-z0-9_]*)\s*:/g)) {
      escritas.add(`${tabela}.${chave[1]}`);
    }
  }

  for (const m of src.matchAll(RE)) {
    const tabela = m[1];
    /**
     * A LINHA É A DO `.select(`, NÃO A DO `.from(`.
     *
     * A primeira versão usava o início do casamento — e o `.from()` costuma
     * ficar duas ou três linhas acima do `.select()`, com a dispensa
     * `// schema-ok:` logo em cima deste último. Resultado: a auditoria
     * ignorava todas as dispensas e continuava acusando. Erro clássico de
     * ferramenta de análise: apontar o lugar errado do próprio casamento.
     */
    const desloc = m[0].lastIndexOf(".select(");
    const linha = src.slice(0, m.index + (desloc >= 0 ? desloc : 0)).split("\n").length;
    const cols = m[3]
      .split(",")
      .map((c) => c.trim())
      .filter((c) => c && !c.includes("(") && !c.includes(")") && c !== "*");

    // a dispensa pode estar na própria linha do select ou nas duas acima
    const contexto = [linhas[linha - 3], linhas[linha - 2], linhas[linha - 1]]
      .filter(Boolean)
      .join("\n");
    const dispensado = /schema-ok:/.test(contexto);

    for (const col of cols) {
      if (!uso.has(tabela)) uso.set(tabela, new Map());
      const porCol = uso.get(tabela);
      if (!porCol.has(col)) porCol.set(col, []);
      porCol.get(col).push(`${rel}:${linha}`);
      if (dispensado) dispensados.add(`${tabela}.${col}`);
    }
  }
}

/* ── 3. julga ───────────────────────────────────────────────────────── */
let falhas = 0;
const MIN_SELECTS = 3; // tabela consultada em poucos lugares não dá sinal

for (const [tabela, porCol] of [...uso.entries()].sort()) {
  const sitios = new Set([...porCol.values()].flat()).size;
  if (sitios < MIN_SELECTS) continue;

  for (const [col, ondes] of [...porCol.entries()].sort()) {
    if (ondes.length > 1) continue; // lida em mais de um lugar: tem proveniência
    if (escritas.has(`${tabela}.${col}`)) continue; // o app grava: existe
    if (dispensados.has(`${tabela}.${col}`)) continue;
    // a migration cria/altera ESTA coluna NESTA tabela? proveniência.
    if (colunasMigration.get(tabela)?.has(col.toLowerCase())) continue;

    falhas++;
    console.log(
      `SUSPEITA  ${tabela}.${col}\n` +
        `          citada uma única vez, em ${ondes[0]}, e ausente das migrations.\n` +
        `          Se a coluna existe, cite a migration ou marque com  // schema-ok: <motivo>`
    );
  }
  console.log(`ok: ${tabela} (${porCol.size} colunas, ${sitios} consultas)`);
}

console.log(
  falhas === 0
    ? "NENHUMA COLUNA SEM PROVENIÊNCIA"
    : `${falhas} coluna(s) suspeita(s)`
);
process.exit(falhas ? 1 : 0);
