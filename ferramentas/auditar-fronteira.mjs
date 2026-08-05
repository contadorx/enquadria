/**
 * A FRONTEIRA SERVIDOR ↔ CLIENTE — a falha que compila, builda e só cai no ar.
 *
 *     node ferramentas/auditar-fronteira.mjs
 *     node ferramentas/auditar-fronteira.mjs --autoteste
 *
 * ───────────────────────────────────────────────────────────────────────────
 * O CASO REAL, 05/08/2026.
 *
 * `comoMetrica()` foi escrita dentro de `components/ContaLinha.tsx`, que começa
 * com `"use client"`. A tela de Contas — Server Component — a importava de lá e
 * a chamava três vezes. O TypeScript aprovou (os tipos batem), o `next build`
 * passou (o grafo é válido), e a página em produção respondeu:
 *
 *     Application error: a server-side exception has occurred
 *
 * Porque no App Router TODO export de um módulo `"use client"` vira, do lado do
 * servidor, uma REFERÊNCIA para o cliente — um proxy com um id, não a função.
 * Ler não quebra. Chamar lança. E lança em runtime, na rota, para o usuário.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * A REGRA QUE ESTE ARQUIVO GUARDA.
 *
 * Da fronteira só atravessa COMPONENTE (identificador em maiúscula: o servidor
 * o renderiza, não o invoca). Função pura, constante, helper — tudo isso mora
 * em `lib/`, onde os dois lados podem importar de verdade.
 *
 * `import type { ... }` não conta: some na compilação, não vira proxy.
 *
 * POR QUE NÃO CONFIAR NO COMPILADOR: ele não sabe o que é "cliente". A
 * diretiva `"use client"` é convenção do framework, não do TypeScript. Nenhuma
 * das 254 verificações da suíte alcançava isso — todas rodam em Node, onde
 * `comoMetrica` é só uma função.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const IGNORAR = new Set(["node_modules", ".next", ".git", "public", "supabase", "testes", "ferramentas"]);

function arquivos(dir) {
  const fora = [];
  (function anda(d) {
    for (const n of readdirSync(d)) {
      if (IGNORAR.has(n) || n.startsWith(".tmp")) continue;
      const p = join(d, n);
      if (statSync(p).isDirectory()) anda(p);
      else if (/\.tsx?$/.test(n)) fora.push(p);
    }
  })(dir);
  return fora;
}

/** roda a auditoria sobre um conjunto de arquivos já lidos — separado do disco
 *  para o autoteste poder sabotar sem escrever nada */
export function auditar(fontes) {
  const cliente = new Map();
  for (const [p, txt] of fontes) cliente.set(p, /^\s*["']use client["']/.test(txt));

  const resolve = (esp) => {
    if (!esp.startsWith("@/")) return null;
    const base = join(RAIZ, esp.slice(2));
    for (const ext of [".tsx", ".ts", "/index.tsx", "/index.ts"]) {
      // `.get() === true` e NÃO `.has()`: com `has` o mapa inteiro responde
      // "sim" e a auditoria acusa 400 travessias inexistentes. Erro meu, na
      // primeira versão, e ele não aparece em nenhum caso feliz.
      if (cliente.get(base + ext) === true) return base + ext;
    }
    return null;
  };

  const achados = [];
  for (const [p, txt] of fontes) {
    if (cliente.get(p)) continue;                       // cliente → cliente pode
    const re = /import\s+(type\s+)?\{([^}]*)\}\s+from\s+["']([^"']+)["']/g;
    let m;
    while ((m = re.exec(txt))) {
      if (m[1]) continue;                               // `import type {…}`
      const alvo = resolve(m[3]);
      if (!alvo) continue;
      for (const bruto of m[2].split(",")) {
        const nome = bruto.trim();
        if (!nome || /^type\s/.test(nome)) continue;     // `{ type Foo }`
        const id = (nome.split(/\s+as\s+/)[0] || "").trim();
        if (!id || /^[A-Z]/.test(id)) continue;          // componente: atravessa
        achados.push({ de: p.replace(RAIZ + "/", ""), id, modulo: m[3] });
      }
    }
  }
  return achados;
}

/* ═══════════════════════════ AUTOTESTE ═══════════════════════════════════
 * Injeta uma travessia que não existe no disco. Se a auditoria não a pegar,
 * ela não vale nada — e sai com 1 para ninguém confiar no verde.
 * ═══════════════════════════════════════════════════════════════════════ */
function autoteste() {
  const base = arquivos(RAIZ).map((p) => [p, readFileSync(p, "utf8")]);
  const limpo = auditar(base);
  let f = 0;
  const ok = (c, m) => { if (c) console.log("ok:", m); else { f++; console.log("FALHOU:", m); } };

  ok(limpo.length === 0, `o código de hoje não tem travessia (${base.length} arquivos)`);

  const cli = join(RAIZ, "components/ContaLinha.tsx");
  const srv = join(RAIZ, "app/painel/negocio/contas/page.tsx");
  ok(existsSync(cli) && existsSync(srv), "os dois arquivos do caso real existem");

  /* sabotagem 1 — exatamente o bug de 05/08 */
  const s1 = base.map(([p, t]) =>
    p === srv ? [p, t.replace('import { ContaLinha } from "@/components/ContaLinha";',
                              'import { ContaLinha, comoMetrica } from "@/components/ContaLinha";')] : [p, t]);
  const r1 = auditar(s1);
  ok(r1.some((a) => a.id === "comoMetrica"), "pega o bug original de volta quando ele é reintroduzido");

  /* sabotagem 2 — renomeada no import, que é como ela reapareceria */
  const s2 = base.map(([p, t]) =>
    p === srv ? [p, t.replace('import { ContaLinha } from "@/components/ContaLinha";',
                              'import { ContaLinha, comoMetrica as m } from "@/components/ContaLinha";')] : [p, t]);
  ok(auditar(s2).length === 1, "pega mesmo com `as` — o apelido não esconde a travessia");

  /* sabotagem 3 — o que NÃO pode acusar: componente e tipo */
  const s3 = base.map(([p, t]) =>
    p === srv ? [p, t.replace('import { ContaLinha } from "@/components/ContaLinha";',
                              'import { ContaLinha } from "@/components/ContaLinha";\nimport type { ContaMetrica } from "@/components/ContaLinha";')] : [p, t]);
  ok(auditar(s3).length === 0, "e NÃO acusa componente nem `import type` — falso positivo aqui vira ruído ignorado");

  /* sabotagem 4 — a travessia dentro de um arquivo cliente é legítima */
  const s4 = base.map(([p, t]) =>
    p === cli ? [p, t.replace('import { ExcluirConta } from "@/components/ExcluirConta";',
                              'import { ExcluirConta } from "@/components/ExcluirConta";\nimport { acaoQualquer } from "@/components/ExcluirConta";')] : [p, t]);
  ok(auditar(s4).length === 0, "cliente importando de cliente continua livre");

  console.log(f === 0 ? "\nOK" : `\n${f} FALHA(S)`);
  return f === 0 ? 0 : 1;
}

if (process.argv.includes("--autoteste")) process.exit(autoteste());
else {
  const achados = auditar(arquivos(RAIZ).map((p) => [p, readFileSync(p, "utf8")]));
  for (const a of achados) {
    console.log(`FRONTEIRA: ${a.de} importa \`${a.id}\` de ${a.modulo} ("use client").`);
    console.log(`           No servidor isso é um proxy. Chamar derruba a rota. Mova para lib/.`);
  }
  if (!achados.length) console.log("ok: nenhuma função atravessa a fronteira servidor → cliente");
  process.exit(achados.length ? 1 : 0);
}
