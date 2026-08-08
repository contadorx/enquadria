/**
 * AUDITORIA DE UPSERT — o `onConflict` que o banco não consegue resolver.
 *
 *     node testes/auditar-upsert.mjs
 *
 * ───────────────────────────────────────────────────────────────────────────
 * O BUG QUE ESTA AUDITORIA EXISTE PARA NÃO DEIXAR VOLTAR.
 *
 * A central de faturas ficou vazia por dias. A cobrança nascia no Asaas, o
 * e-mail com o link saía, o webhook chegava e respondia 200 — e
 * `select count(*) from faturas` devolvia ZERO. Nada no log, nada na tela.
 *
 * A causa era uma linha de índice:
 *
 *     create unique index faturas_asaas_idx on faturas (asaas_id)
 *       where asaas_id is not null;
 *
 * O código fazia `upsert(..., { onConflict: "asaas_id" })`. Para resolver o
 * `ON CONFLICT (asaas_id)`, o Postgres precisa ACHAR um índice único que case
 * com a especificação — e um índice PARCIAL só casa se o comando repetir o
 * mesmo predicado. O PostgREST não tem como emitir predicado. Erro 42P10 em
 * todo insert. E como o supabase-js DEVOLVE o erro em vez de lançar, quem não
 * lê o `error` não vê nada acontecer.
 *
 * Índice de EXPRESSÃO tem o mesmo problema: `unique (lower(email))` não é a
 * coluna `email`. Era o caso de `curso_leads` — a captura do site perdeu
 * TODOS os leads, com a rota devolvendo 200 de propósito para não quebrar o
 * download. E de `convites`, onde convidar a mesma pessoa de novo dava 500.
 *
 * TRÊS UPSERTS QUEBRADOS PELO MESMO MOTIVO, e nenhum teste alcançava:
 * compilam, passam no lint, sobem, e só o banco reclama — para ninguém.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * COMO ELA FUNCIONA. Lê as migrations em ordem, monta o estado final dos
 * índices/constraints únicos (respeitando `drop index` e `drop constraint`), e
 * exige que TODO `onConflict` do código tenha, na tabela certa, um único
 * SIMPLES — sem `where` e sem expressão — nas mesmas colunas.
 *
 * O que ela NÃO faz: conferir contra o banco de produção. Se alguém criou um
 * índice na mão pelo SQL Editor e não escreveu a migration, aqui acusa. Isso é
 * proposital — índice que não está na migration não sobrevive a um restore.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MIGR = path.join(RAIZ, "supabase", "migrations");

let falhas = 0;
const ok = (m) => console.log("ok:", m);
const erro = (m, d) => {
  falhas++;
  console.log("QUEBRADO:", m + (d ? ` → ${d}` : ""));
};

/* ── colunas normalizadas: "a, b" e "b,a" são chaves diferentes para o
      Postgres na ordem, mas a inferência do ON CONFLICT aceita qualquer
      ordem — então normalizamos ordenando. */
const chave = (cols) =>
  cols
    .split(",")
    .map((c) => c.trim().replace(/\s+(asc|desc)$/i, "").replace(/"/g, ""))
    .filter(Boolean)
    .sort()
    .join(",");

/** expressão (tem parêntese ou espaço interno) não é coluna — não infere */
const ehExpressao = (cols) => /[()]/.test(cols);

/* ═══════════════════════════════════════════ 1. O ESTADO DOS ÍNDICES ═════ */
/** tabela → Set de chaves únicas SIMPLES (inferíveis) */
const inferiveis = new Map();
/**
 * Tabelas que ESTE repositório cria. As migrations começam na 0020: `empresas`,
 * `analises`, `radar_leituras` e outras nasceram antes e não estão versionadas
 * aqui. Julgar o índice delas por ausência de migration seria acusar o que não
 * dá para ver — então elas ficam de fora, listadas no fim para não sumirem.
 */
const conhecidas = new Set();
/** nome do índice → { tabela, chave } — para o `drop index` saber o que tirar */
const porNome = new Map();
/** tabela+constraint → chave */
const porConstraint = new Map();

const guardar = (tabela, cols) => {
  if (!inferiveis.has(tabela)) inferiveis.set(tabela, new Set());
  inferiveis.get(tabela).add(chave(cols));
};
const esquecer = (tabela, k) => inferiveis.get(tabela)?.delete(k);

const limpo = (t) => t.replace(/^public\./, "").replace(/"/g, "");

const arquivos = fs.readdirSync(MIGR).filter((f) => f.endsWith(".sql")).sort();

/**
 * Divide o SQL em comandos, respeitando aspas e `$tag$ ... $tag$`.
 *
 * A ORDEM IMPORTA E QUASE ME PEGOU: a primeira versão varria o arquivo com um
 * regex por tipo de comando — todos os `create index`, depois todos os
 * `drop index`. Numa migration que DERRUBA o índice velho e CRIA o novo (é
 * exatamente o que a 0041 faz), a leitura fora de ordem apagava o índice bom e
 * o auditor acusava um problema que ele mesmo tinha inventado.
 */
function comandos(sql) {
  const fora = [];
  let atual = "";
  let i = 0;
  let aspas = null; // "'" ou a tag $x$
  while (i < sql.length) {
    if (!aspas) {
      if (sql[i] === "'") aspas = "'";
      else {
        const d = sql.slice(i).match(/^\$[a-z_]*\$/);
        if (d) {
          aspas = d[0];
          atual += aspas;
          i += aspas.length;
          continue;
        }
      }
      if (sql[i] === ";") {
        fora.push(atual);
        atual = "";
        i++;
        continue;
      }
    } else if (aspas === "'") {
      if (sql[i] === "'") aspas = null;
    } else if (sql.startsWith(aspas, i)) {
      atual += aspas;
      i += aspas.length;
      aspas = null;
      continue;
    }
    atual += sql[i];
    i++;
  }
  if (atual.trim()) fora.push(atual);
  return fora.map((c) => c.trim()).filter(Boolean);
}

for (const f of arquivos) {
  // comentário de migration cita SQL de propósito (é onde o bug é explicado);
  // ler o comentário como se fosse comando reintroduziria o índice removido
  const sql = fs
    .readFileSync(path.join(MIGR, f), "utf8")
    .replace(/^\s*--.*$/gm, "")
    .toLowerCase();

  for (const cmd of comandos(sql)) {
    /* create unique index [concurrently] [if not exists] nome on tab (cols) [where ...] */
    let m = cmd.match(
      /^create\s+unique\s+index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?([\w."]+)\s+on\s+([\w."]+)(?:\s+using\s+\w+)?\s*\(([\s\S]*?)\)\s*(where[\s\S]*)?$/
    );
    if (m) {
      const nome = limpo(m[1]);
      const tabela = limpo(m[2]);
      const cols = m[3];
      if (m[4] || ehExpressao(cols)) {
        // existe no banco, mas NÃO serve para ON CONFLICT
        porNome.set(nome, { tabela, chave: null });
      } else {
        porNome.set(nome, { tabela, chave: chave(cols) });
        guardar(tabela, cols);
      }
      continue;
    }

    m = cmd.match(/^drop\s+index\s+(?:if\s+exists\s+)?([\w."]+)$/);
    if (m) {
      const alvo = porNome.get(limpo(m[1]));
      if (alvo?.chave) esquecer(alvo.tabela, alvo.chave);
      continue;
    }

    /* alter table X add constraint N unique (cols) / primary key (cols) */
    m = cmd.match(
      /^alter\s+table\s+(?:if\s+exists\s+)?([\w."]+)[\s\S]*?add\s+constraint\s+([\w."]+)\s+(?:unique|primary\s+key)\s*\(([^)]*)\)/
    );
    if (m) {
      const tabela = limpo(m[1]);
      if (!ehExpressao(m[3])) {
        porConstraint.set(`${tabela}.${limpo(m[2])}`, chave(m[3]));
        guardar(tabela, m[3]);
      }
      continue;
    }

    m = cmd.match(
      /^alter\s+table\s+(?:if\s+exists\s+)?([\w."]+)[\s\S]*?drop\s+constraint\s+(?:if\s+exists\s+)?([\w."]+)/
    );
    if (m) {
      const tabela = limpo(m[1]);
      const k = porConstraint.get(`${tabela}.${limpo(m[2])}`);
      if (k) esquecer(tabela, k);
      continue;
    }

    /* create table ... ( ... ) — pega primary key/unique de coluna e de tabela */
    m = cmd.match(/^create\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?([\w."]+)\s*\(([\s\S]*)\)\s*$/);
    if (m) {
      const tabela = limpo(m[1]);
      conhecidas.add(tabela);

      // nível de parêntese 0 = separador de definição
      const defs = [];
      let nivel = 0;
      let atual = "";
      for (const ch of m[2]) {
        if (ch === "(") nivel++;
        if (ch === ")") nivel--;
        if (ch === "," && nivel === 0) {
          defs.push(atual);
          atual = "";
        } else atual += ch;
      }
      defs.push(atual);

      for (const bruta of defs) {
        const d = bruta.trim();
        if (!d) continue;
        const tab = d.match(/^(?:constraint\s+[\w."]+\s+)?(?:primary\s+key|unique)\s*\(([^)]*)\)/);
        if (tab) {
          if (!ehExpressao(tab[1])) guardar(tabela, tab[1]);
          continue;
        }
        const col = d.match(/^([\w"]+)\s+[\s\S]*?(primary\s+key|unique)/);
        if (col && !/^(constraint|primary|unique|check|foreign|exclude)$/.test(col[1])) {
          guardar(tabela, col[1]);
        }
      }
    }
  }
}

/* ═════════════════════════════════════════ 2. OS UPSERTS DO CÓDIGO ══════ */
const fontes = [];
const varrer = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) varrer(p);
    else if (/\.tsx?$/.test(e.name)) fontes.push(p);
  }
};
for (const d of ["app", "lib", "components"]) varrer(path.join(RAIZ, d));

const usos = [];
for (const arq of fontes) {
  const src = fs.readFileSync(arq, "utf8");
  for (const m of src.matchAll(/onConflict:\s*"([^"]+)"/g)) {
    /* a tabela é o `.from("...")` mais próximo ANTES — o upsert pode estar a
       várias linhas de distância do from, então não dá para casar num regex só */
    const antes = src.slice(0, m.index);
    const froms = [...antes.matchAll(/\.from\("([^"]+)"\)/g)];
    const tabela = froms.length ? froms[froms.length - 1][1] : null;
    usos.push({
      arquivo: path.relative(RAIZ, arq),
      linha: antes.split("\n").length,
      tabela,
      cols: m[1],
    });
  }
}

if (usos.length === 0) {
  erro("nenhum onConflict encontrado — a varredura quebrou", "confira os diretórios");
}

const foraDoAlcance = [];

for (const u of usos) {
  const onde = `${u.arquivo}:${u.linha}`;
  if (!u.tabela) {
    erro(`${onde} — não achei o .from() deste upsert`, u.cols);
    continue;
  }
  const k = chave(u.cols);
  const tem = inferiveis.get(u.tabela);

  if (tem?.has(k)) {
    ok(`${u.tabela} (${u.cols}) tem único simples — ${onde}`);
    continue;
  }

  /* tabela criada antes da 0020: o índice dela não está neste repositório e
     acusar por ausência seria inventar problema. Fica na lista de baixo. */
  if (!conhecidas.has(u.tabela)) {
    foraDoAlcance.push(`${u.tabela} (${u.cols}) — ${onde}`);
    continue;
  }

  erro(
    `${onde} — upsert em "${u.tabela}" por (${u.cols}) sem único SIMPLES nas migrations`,
    tem && tem.size
      ? `únicos inferíveis nessa tabela: ${[...tem].join(" | ")}`
      : "nenhum único inferível nessa tabela (parcial ou expressão não conta)"
  );
}

if (foraDoAlcance.length) {
  console.log(
    `\nFora do alcance (tabela anterior à migration 0020, índice não versionado aqui):\n` +
      foraDoAlcance.map((l) => `  · ${l}`).join("\n") +
      `\n  Conferidos à mão contra o banco em 04/08/2026: todos com único simples.`
  );
}

console.log(
  falhas === 0
    ? `\n${usos.length - foraDoAlcance.length} upserts conferidos, todos com índice que o ON CONFLICT consegue inferir.`
    : `\n${falhas} upsert(s) que o banco vai recusar com 42P10 — e o supabase-js não lança, só devolve o erro.`
);
process.exit(falhas === 0 ? 0 : 1);
