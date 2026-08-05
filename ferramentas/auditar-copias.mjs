/**
 * UMA LISTA SÓ — o auditor da duplicação silenciosa.
 *
 *     node ferramentas/auditar-copias.mjs
 *     node ferramentas/auditar-copias.mjs --autoteste
 *
 * ───────────────────────────────────────────────────────────────────────────
 * O CASO REAL, 05/08/2026.
 *
 * As cláusulas de ciência do termo existiam em DOIS lugares: `lib/esign.ts` e
 * `components/FolhaTermo.tsx`. Quando o cadeado do art. 41 § 5º entrou, ele
 * entrou numa TERCEIRA cópia nova, em `lib/termo.ts`.
 *
 * Efeito: o termo que o cliente abre pelo link de assinatura continuou
 * mostrando a lista antiga — e é justamente essa lista que entra no conteúdo
 * canônico, que vira hash, que é o que ele assina. A lista corrigida existia e
 * não chegava a ninguém.
 *
 * Nada quebra quando isso acontece. Compila, builda, os testes passam. O sinal
 * só aparece quando alguém compara duas telas — que é o que esta ferramenta faz
 * sem depender de alguém lembrar de comparar.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * COMO ELA PROCURA: por FRASES âncora, não por nome de constante. Renomear a
 * constante é o jeito mais fácil de escapar de um auditor que procura nomes —
 * e a frase é o que o cliente lê. Cada âncora tem um dono declarado; qualquer
 * outro arquivo que contenha a frase é uma cópia.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const IGNORAR = new Set(["node_modules", ".next", ".git", "public", "testes", "ferramentas"]);

/**
 * As frases que só podem existir NUMA fonte. Escolhidas por serem literais que
 * o usuário lê — se elas aparecem em dois arquivos, existem duas versões do
 * mesmo texto, e uma delas vai ficar para trás.
 */
const ANCORAS = [
  {
    frase: "A opção vale por semestre e não pode ser alterada dentro do período.",
    dono: "lib/termo.ts",
    oque: "cláusulas de ciência do termo (viram hash na assinatura)",
  },
  {
    frase: "Até aqui é conta",
    dono: "lib/laudo.ts",
    oque: "a fronteira entre a conta e a negociação",
  },
  {
    frase: "NEGOCIE O PREÇO ANTES DE EXERCER A OPÇÃO",
    dono: "lib/laudo.ts",
    oque: "a regra de sequência do crédito",
  },
];

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

export function auditar(fontes) {
  const achados = [];
  for (const a of ANCORAS) {
    const donos = fontes
      .filter(([, txt]) => txt.includes(a.frase))
      .map(([p]) => p.replace(RAIZ + "/", ""));

    if (donos.length === 0) {
      achados.push({ ...a, tipo: "sumiu", onde: [], detalhe: "a frase não existe em lugar nenhum" });
    } else if (donos.length > 1 || donos[0] !== a.dono) {
      achados.push({
        ...a,
        tipo: donos.length > 1 ? "duplicada" : "mudou de dono",
        onde: donos,
        detalhe: donos.length > 1 ? `${donos.length} cópias` : `esperava em ${a.dono}`,
      });
    }
  }
  return achados;
}

/* ═══════════════════════════ AUTOTESTE ═══════════════════════════════════ */
function autoteste() {
  const base = arquivos(RAIZ).map((p) => [p, readFileSync(p, "utf8")]);
  let f = 0;
  const ok = (c, m) => { if (c) console.log("ok:", m); else { f++; console.log("FALHOU:", m); } };

  ok(auditar(base).length === 0, `hoje cada texto tem um dono só (${base.length} arquivos)`);

  /* o bug real: a lista reaparece numa segunda superfície */
  const alvo = join(RAIZ, "components/FolhaTermo.tsx");
  const s1 = base.map(([p, t]) =>
    p === alvo ? [p, t + '\nconst COPIA = ["A opção vale por semestre e não pode ser alterada dentro do período."];\n'] : [p, t]);
  const r1 = auditar(s1);
  ok(r1.some((x) => x.tipo === "duplicada" && x.onde.length === 2),
     "pega a segunda cópia da lista de ciência — o bug de 05/08 de volta");

  /* mudar de arquivo sem duplicar também precisa avisar: o dono declarado é
     parte do desenho, e mover o texto sem atualizar a âncora esconde a mudança */
  const dono = join(RAIZ, "lib/termo.ts");
  const s2 = base.map(([p, t]) =>
    p === dono ? [p, t.replace("A opção vale por semestre e não pode ser alterada dentro do período.", "MOVIDA")] : [p, t]);
  ok(auditar(s2).some((x) => x.tipo === "sumiu"), "e avisa quando a frase simplesmente some");

  ok(auditar(base.filter(([p]) => !p.endsWith("lib/laudo.ts"))).some((x) => x.tipo === "sumiu"),
     "vale para as outras âncoras também, não só para a primeira");

  console.log(f === 0 ? "\nOK" : `\n${f} FALHA(S)`);
  return f === 0 ? 0 : 1;
}

if (process.argv.includes("--autoteste")) process.exit(autoteste());
else {
  const achados = auditar(arquivos(RAIZ).map((p) => [p, readFileSync(p, "utf8")]));
  for (const a of achados) {
    console.log(`CÓPIA: ${a.oque} — ${a.detalhe}`);
    console.log(`       ${a.onde.join(" · ") || "(nenhum arquivo)"}`);
    console.log(`       o dono é ${a.dono}; as demais superfícies devem importar de lá.`);
  }
  if (!achados.length) console.log("ok: cada texto do documento tem um dono só");
  process.exit(achados.length ? 1 : 0);
}
