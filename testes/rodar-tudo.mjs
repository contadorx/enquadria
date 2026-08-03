/**
 * RODAR TUDO — um comando só, e o que sobra é o que precisa de tela.
 *
 *     node testes/rodar-tudo.mjs
 *
 * O que este arquivo faz e o que ele NÃO faz, sem meio-termo:
 *
 * FAZ (roda de verdade, aqui, sem banco e sem ninguém olhando):
 *   1. as três suítes de função pura — cockpit, motor, coleta;
 *   2. o CSV da massa passado pelo parser DE VERDADE do app, com as contagens
 *      de importadas/duplicadas/descartadas conferidas contra o esperado;
 *   3. triar() sobre as 45 empresas que entram, comparado com a distribuição
 *      de faixas registrada;
 *   4. decidir() nos 15 cenários e dDASsegregado()+decidir() nos 10 de
 *      segregação, contra os valores registrados;
 *   5. a memória de cálculo do laudo de uma análise SEGREGADA — o passo por
 *      anexo e a soma;
 *   6. no navegador: o curso estático (gate, progresso, certificado, tamanho
 *      do medalhão com e sem CSS, carimbo dos assets) e o formulário da coleta
 *      (validação, percentuais, corpo enviado).
 *
 * NÃO FAZ, e por isso continua na sua lista:
 *   · qualquer coisa que precise do Supabase — importar de fato, RLS, emitir
 *     laudo e termo, assinar, gravar coleta, cota de plano;
 *   · o comportamento real do .htaccess, que depende do Apache do HostGator;
 *   · salvar o certificado no perfil do LinkedIn;
 *   · julgamento de olho: se está bonito, se está claro, se cabe na tela.
 *
 * OS VALORES ESPERADOS SÃO GOLDEN, não recalculados na hora. Se eu recalculasse
 * com a mesma função que estou testando, o teste passaria sempre — inclusive
 * depois de alguém quebrar a função. Estes números vieram de uma execução
 * conferida e agora servem de trava: mudou, o teste acusa e alguém decide se a
 * mudança era para acontecer.
 */

import { execSync, spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TMP = path.join(RAIZ, ".tmp-rodar");
const CSV = process.env.MASSA_CSV || "/root/work/Enquadria_Massa_Empresas_Teste.csv";

let falhas = 0;
let passou = 0;
const linhas = [];

function ok(nome, condicao, detalhe) {
  if (condicao) {
    passou++;
    linhas.push(`ok    ${nome}`);
    console.log("ok   ", nome);
  } else {
    falhas++;
    const d = detalhe === undefined ? "" : ` → ${JSON.stringify(detalhe)}`;
    linhas.push(`FALHA ${nome}${d}`);
    console.log("FALHA", nome + d);
  }
}
function secao(t) {
  linhas.push("", `── ${t} ${"─".repeat(Math.max(0, 60 - t.length))}`);
  console.log(`\n── ${t} ${"─".repeat(Math.max(0, 60 - t.length))}`);
}

/* ====================================================== 0. COMPILAR ===== */
secao("Compilando o TypeScript das funções puras");
fs.rmSync(TMP, { recursive: true, force: true });
try {
  // tsconfig próprio em vez de flags soltas: `lib/reguas.ts` faz um
  // `await import("@/lib/email")` e o alias "@/" só existe com baseUrl+paths.
  // Sem isto o compilador para na primeira linha e nenhuma suíte roda.
  const ARQUIVOS = [
    "lib/motor.ts", "lib/laudo.ts", "lib/triagem.ts", "lib/cockpit.ts",
    "lib/premissas-padrao.ts", "lib/coleta.ts", "lib/csv.ts", "lib/cnpj.ts",
    "lib/plano.ts", "lib/potencial.ts", "lib/reguas.ts", "lib/janela.ts",
  ];
  const cfg = path.join(RAIZ, "tsconfig.testes.json");
  fs.writeFileSync(cfg, JSON.stringify({
    compilerOptions: {
      outDir: TMP, module: "esnext", target: "es2020",
      moduleResolution: "bundler", skipLibCheck: true, strict: true,
      esModuleInterop: true, baseUrl: ".", paths: { "@/*": ["./*"] },
      lib: ["dom", "esnext"], noEmit: false,
    },
    files: ARQUIVOS,
  }, null, 2));
  try {
    execSync(`npx tsc -p tsconfig.testes.json`, { cwd: RAIZ, stdio: "pipe" });
  } finally {
    fs.rmSync(cfg, { force: true });
  }
  // o compilador não escreve a extensão nos imports; o Node ESM exige
  for (const f of fs.readdirSync(TMP).filter((f) => f.endsWith(".js"))) {
    const p = path.join(TMP, f);
    fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace(/from "\.\/([a-z-]+)"/g, 'from "./$1.js"'));
  }
  fs.writeFileSync(path.join(TMP, "package.json"), '{"type":"module"}');
  ok("compila sem erro", true);
} catch (e) {
  ok("compila sem erro", false, String(e.stdout ?? e).slice(0, 400));
  fim();
}

const motor = await import(path.join(TMP, "motor.js"));
const laudo = await import(path.join(TMP, "laudo.js"));
const triagem = await import(path.join(TMP, "triagem.js"));
const csvlib = await import(path.join(TMP, "csv.js"));
const coleta = await import(path.join(TMP, "coleta.js"));

/* ============================================ 1. SUÍTES DE FUNÇÃO PURA == */
secao("Suítes de função pura");
for (const suite of ["cockpit", "motor", "coleta", "muro", "reguas", "janela", "cnpj"]) {
  const arq = path.join(RAIZ, "testes", `${suite}.test.mjs`);
  if (!fs.existsSync(arq)) {
    ok(`suíte ${suite}`, false, "arquivo não encontrado");
    continue;
  }
  fs.copyFileSync(arq, path.join(TMP, `${suite}.test.mjs`));
  const r = spawnSync("node", [`${suite}.test.mjs`], { cwd: TMP, encoding: "utf8" });
  const saida = (r.stdout || "") + (r.stderr || "");
  const total = (saida.match(/^ok:/gm) || []).length;
  ok(`suíte ${suite} (${total} asserções)`, r.status === 0,
     r.status === 0 ? undefined : saida.split("\n").filter((l) => l.startsWith("FALHOU")).slice(0, 5));
}

/* ================================================ 1b. AUDITORIA DE UX ==== */
secao("Auditoria de UX (percepção, não estética)");
{
  // Dois botões seguidos foram reportados como "não funciona" e nenhum estava
  // quebrado: o efeito nascia fora da tela. Nada aqui pegava isso, porque o
  // código estava certo. Esta auditoria procura essa família — causa e efeito,
  // não beleza.
  const r = spawnSync("node", [path.join(RAIZ, "testes", "auditar-ux.mjs")], { encoding: "utf8" });
  const saida = (r.stdout || "") + (r.stderr || "");
  const regras = (saida.match(/^ok: /gm) || []).length;
  ok(`auditoria de UX (${regras} regras limpas)`, r.status === 0,
     r.status === 0 ? undefined : saida.split("\n").filter((l) => l.trim().startsWith("components/") || l.trim().startsWith("app/")).slice(0, 8));
}

/* ============================================== 2. A MASSA NO PARSER ==== */
secao("Massa de empresas no parser do app");
const GOLDEN_IMPORT = { lidas: 47, importadas: 45, duplicadas: 1, descartadas: 1 };
const GOLDEN_FAIXAS = { A: 23, B: 6, C: 1, D: 9, MEI: 2, FORA: 4 };

if (!fs.existsSync(CSV)) {
  ok("CSV da massa encontrado", false, CSV);
} else {
  const r = csvlib.parsearCarteira(fs.readFileSync(CSV, "utf8"));
  ok(`lê ${GOLDEN_IMPORT.lidas} linhas`, r.total_lidas === GOLDEN_IMPORT.lidas, r.total_lidas);
  ok(`importa ${GOLDEN_IMPORT.importadas}`, r.linhas.length === GOLDEN_IMPORT.importadas, r.linhas.length);
  ok(`acha ${GOLDEN_IMPORT.duplicadas} duplicada`, r.duplicadas === GOLDEN_IMPORT.duplicadas, r.duplicadas);
  ok(`descarta ${GOLDEN_IMPORT.descartadas}`, r.descartadas === GOLDEN_IMPORT.descartadas, r.descartadas);

  const email = r.linhas.find((l) => l.razao_social.includes("Formato Estranho"));
  ok("e-mail inválido NÃO é gravado", email && !email.contato_email, email?.contato_email);
  ok("RBT12 escrito como moeda vira número", email?.rbt12 === 1850000, email?.rbt12);
  const semNome = r.linhas.find((l) => l.razao_social === "(sem razão social)");
  ok("linha sem razão social entra com rótulo", !!semNome);
  const faixaTxt = r.linhas.find((l) => l.razao_social.includes("Faixa Textual"));
  ok("faturamento em faixa textual não vira RBT12", faixaTxt && faixaTxt.rbt12 === undefined, faixaTxt?.rbt12);

  const dist = {};
  for (const l of r.linhas) {
    const t = triagem.triar({
      cnpj: l.cnpj, razao_social: l.razao_social, cnae_principal: l.cnae_principal,
      porte: l.porte, situacao: l.situacao, regime: l.regime,
      faturamento_faixa: l.faturamento_faixa,
    });
    dist[t.faixa] = (dist[t.faixa] || 0) + 1;
  }
  for (const [f, n] of Object.entries(GOLDEN_FAIXAS)) {
    ok(`triagem: faixa ${f} = ${n}`, dist[f] === n, dist[f]);
  }
  ok("prioridade máxima na de faixa textual",
     triagem.triar({ cnpj: faixaTxt?.cnpj ?? "", razao_social: "x", cnae_principal: "4639-7/01",
                     porte: "EPP", situacao: "ATIVA", regime: "Simples Nacional",
                     faturamento_faixa: "acima de 3,6mi" }).prioridade_maxima === true);
}

/* ============================ 2a. ROTAS CITADAS NOS E-MAILS EXISTEM? ===== */
secao("Links das réguas apontam para rotas que existem");
{
  // O painel foi de treze rotas para uma. As réguas semeadas na 0020 ficaram
  // apontando para /painel/entrega, /fila, /lote e /radar — quatro 404 dentro
  // de e-mails de ativação e conversão, mandados justamente para quem tinha
  // acabado de decidir agir. Nada na tela acusa isso, e nenhum teste de
  // runtime pega: o link é DADO, mora no banco e no seed.
  const migr = path.join(RAIZ, "supabase", "migrations");
  const rotas = new Set();
  for (const f of fs.readdirSync(migr).filter((f) => f.endsWith(".sql"))) {
    const txt = fs.readFileSync(path.join(migr, f), "utf8");
    for (const m of txt.matchAll(/\{\{\s*link_app\s*\}\}\/painel\/([a-z-]+)/g)) {
      // a 0025 é a que CONSERTA — o que ela cita entre aspas de regexp não conta
      if (f.startsWith("0025")) continue;
      rotas.add(m[1]);
    }
  }
  const existem = new Set(
    fs.readdirSync(path.join(RAIZ, "app", "painel"), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  );
  const mortas = [...rotas].filter((r) => !existem.has(r));
  ok(`rotas citadas nos e-mails: ${[...rotas].join(", ") || "(nenhuma)"}`, true);
  ok("nenhum e-mail semeado aponta para rota removida", mortas.length === 0, mortas);
  if (mortas.length > 0) {
    ok("(a migration 0025 reescreve esses links no banco — rode-a)", false, mortas);
  }
}

/* ===================================== 2b. CNPJs COLADOS (importação) ==== */
secao("CNPJs colados — o caminho sem export do sistema");
{
  // A primeira versão desta extração buscava o padrão do CNPJ no texto inteiro
  // com uma expressão que aceitava espaço no meio. Como quebra de linha é
  // espaço, ela emendava linhas seguidas num número de 42 dígitos e devolvia
  // ZERO — no caso mais comum de todos. Estes casos existem para isso não
  // voltar: cada um é uma forma real de o contador colar a carteira dele.
  const casos = [
    ["um por linha, formatado", "11.222.333/0001-81\n07.526.557/0001-00\n22.333.444/0001-55", 3],
    ["um por linha, só dígitos", "11222333000181\n07526557000100", 2],
    ["separados por vírgula", "11.222.333/0001-81, 07.526.557/0001-00", 2],
    ["separados por ponto e vírgula", "11222333000181;07526557000100", 2],
    ["colado de planilha, com o nome junto",
      "Distribuidora Aurora\t11.222.333/0001-81\nRestaurante X\t07.526.557/0001-00", 2],
    ["CPF no meio não vira CNPJ", "CPF 123.456.789-00\n11.222.333/0001-81", 1],
    ["telefone não vira CNPJ", "(11) 98765-4321 e 11.222.333/0001-81", 1],
    ["data e valor em reais não viram CNPJ", "01/01/2027 R$ 1.234.567,89 11.222.333/0001-81", 1],
    ["texto sem documento nenhum", "nenhum documento aqui", 0],
    ["vazio", "", 0],
  ];
  for (const [nome, entrada, esperado] of casos) {
    const achados = csvlib.extrairCnpjs(entrada);
    ok(nome, achados.length === esperado, `${achados.length} ≠ ${esperado}`);
  }

  // o CSV montado precisa passar pelo MESMO parser do upload, senão o caminho
  // colado seria um segundo jeito de ler carteira para manter em dia
  const colado = csvlib.parsearCarteira(
    csvlib.csvDeCnpjs(csvlib.extrairCnpjs("11.222.333/0001-81\n07.526.557/0001-00"))
  );
  ok("o texto colado atravessa o parser do upload", colado.linhas.length === 2, colado.linhas.length);
  ok("sem razão social, entra com o rótulo (a Receita completa depois)",
     colado.linhas[0].razao_social === "(sem razão social)", colado.linhas[0].razao_social);
  ok("CNPJ com dígito verificador errado é descartado pelo parser",
     csvlib.parsearCarteira(csvlib.csvDeCnpjs(["11222333000199"])).descartadas === 1);
}

/* ================================================ 3. OS 15 CENÁRIOS ===== */
secao("Cenários da decisão");
const CEN = [
  ["C01", { b2b: .9, qual: .92, cred: .7, folha: .12, preco: 3, conc: 1, exig: 1 }, null, "S4"],
  ["C02", { b2b: .9, qual: .9, cred: .05, folha: .35, preco: 1, conc: 1, exig: 0 }, null, "S2"],
  ["C03", { b2b: .05, qual: .5, cred: .6, folha: .18, preco: 2, conc: 0, exig: 0 }, null, "S1"],
  ["C04", { b2b: .5, qual: .25, cred: .5, folha: .2, preco: 2, conc: 0, exig: 0 }, null, "S1"],
  ["C05", { b2b: .7, qual: .7, cred: .4, folha: .2, preco: 2, conc: 1, exig: 0 }, null, "S3"],
  ["C06", { b2b: .8, qual: .9, cred: .9, folha: .1, preco: 2, conc: 1, exig: 1 }, null, "S5"],
  ["C07", { b2b: .85, qual: .85, cred: .1, folha: .4, preco: 2, conc: 1, exig: 1 }, null, "S1"],
  ["C08", { b2b: .9, qual: .95, cred: .65, folha: .15, preco: 3, conc: 1, exig: 1 }, null, "S4"],
  ["C09", { b2b: .6, qual: .5, cred: .5, folha: .2, preco: 3, conc: 1, exig: 0 }, null, "S1"],
  ["C10", { b2b: .6, qual: .49, cred: .5, folha: .2, preco: 3, conc: 1, exig: 0 }, null, "S1"],
  ["C11", { b2b: .9, qual: .9, cred: .7, folha: .15, preco: 0, conc: 1, exig: 1 }, null, "S2"],
  ["C12", { b2b: .8, qual: .9, cred: .6, folha: .15, preco: 3, conc: 1, exig: 1 }, 3550000, "S3"],
  ["C13", { b2b: .8, qual: .9, cred: .6, folha: .15, preco: 3, conc: 1, exig: 1 }, 1200000, "S4"],
  ["C14", { b2b: .05, qual: .9, cred: .85, folha: .1, preco: 3, conc: 1, exig: 0 }, null, "S1"],
  ["C15", { b2b: .9, qual: .05, cred: .6, folha: .15, preco: 3, conc: 1, exig: 0 }, null, "S1"],
];
for (const [id, r, rbt12, esperada] of CEN) {
  const res = motor.decidir(r, { ...motor.PARAMETROS_2027, rbt12 });
  ok(`${id} → ${esperada}`, res.saida === esperada, res.saida);
}
ok("C12 é o único que cai na banda do sublimite",
   motor.decidir(CEN[11][1], { ...motor.PARAMETROS_2027, rbt12: 3550000 }).banda_sublimite === true &&
   motor.decidir(CEN[12][1], { ...motor.PARAMETROS_2027, rbt12: 1200000 }).banda_sublimite === false);

/* ====================================== 4. OS 10 DE SEGREGAÇÃO ========== */
secao("Cenários de receita segregada");
const R_G = { b2b: .8, qual: .9, cred: .35, folha: .15, preco: 2, conc: 1, exig: 0 };
const SEG = [
  ["G01", [{ anexo: 2, share: .7 }, { anexo: 1, share: .3 }], 2, 1800000,
   { b2b: .85, qual: .9, cred: .55, folha: .16, preco: 2, conc: 1, exig: 0 }, 0.014145, "S4", "S4"],
  ["G02", [{ anexo: 3, share: .6 }, { anexo: 1, share: .4 }], 3, 1200000,
   { b2b: .8, qual: .85, cred: .4, folha: .32, preco: 2, conc: 1, exig: 0 }, 0.018449, "S4", "S4"],
  ["G03", [{ anexo: 5, share: .5 }, { anexo: 1, share: .5 }], 5, 1200000, R_G, 0.025104, "S4", "S4"],
  ["G04", [{ anexo: 5, share: .5 }, { anexo: 1, share: .5 }], 1, 1200000, R_G, 0.025104, "S4", "S3"],
  ["G05", [{ anexo: 3, share: .6 }, { anexo: 5, share: .4 }], 3, 2400000,
   { b2b: .75, qual: .85, cred: .3, folha: .30, preco: 2, conc: 1, exig: 0 }, 0.028759, "S3", "S3"],
  ["G06", [{ anexo: 4, share: .5 }, { anexo: 3, share: .5 }], 4, 3000000,
   { b2b: .9, qual: .9, cred: .45, folha: .34, preco: 2, conc: 1, exig: 0 }, 0.030575, "S4", "S4"],
  ["G07", [{ anexo: 1, share: .4 }, { anexo: 2, share: .3 }, { anexo: 5, share: .3 }], 1, 2000000,
   { b2b: .85, qual: .9, cred: .5, folha: .18, preco: 2, conc: 1, exig: 0 }, 0.020774, "S4", "S4"],
  ["G08", [{ anexo: 5, share: .5 }, { anexo: 1, share: .5 }], 1, 1200000,
   { ...R_G, preco: 3 }, 0.025104, "S4", "S3"],
  ["G09", [{ anexo: 5, share: .4 }, { anexo: 1, share: .6 }], 1, 1200000,
   { b2b: .75, qual: .9, cred: .3, folha: .15, preco: 2, conc: 1, exig: 0 }, 0.022819, "S3", "S3"],
  ["G10", [{ anexo: 1, share: 1 }], 1, 1200000, R_G, 0.013679, "S3", "S3"],
];
for (const [id, mix, cadastro, rbt12, r, dasEsperado, saidaSeg, saidaCad] of SEG) {
  const seg = motor.dDASsegregado(mix, rbt12);
  const uni = motor.dDASefetivo(cadastro, rbt12);
  ok(`${id} dDAS ponderado = ${(dasEsperado * 100).toFixed(3)}%`,
     Math.abs(seg.das - dasEsperado) < 5e-7, seg.das);
  const s1 = motor.decidir(r, { ...motor.PARAMETROS_2027, das: seg.das, rbt12 }).saida;
  const s2 = motor.decidir(r, { ...motor.PARAMETROS_2027, das: uni.das, rbt12 }).saida;
  ok(`${id} saída segregada ${saidaSeg} · pelo cadastro ${saidaCad}`,
     s1 === saidaSeg && s2 === saidaCad, { s1, s2 });
}
ok("G04 e G08 são os únicos que MUDAM a decisão",
   SEG.filter(([, , , , , , a, b]) => a !== b).map(([id]) => id).join(",") === "G04,G08");
ok("G10 (um anexo a 100%) devolve o mesmo do caminho antigo",
   motor.dDASsegregado([{ anexo: 1, share: 1 }], 1200000).das === motor.dDASefetivo(1, 1200000).das);

/* ================================ 5. LAUDO DE ANÁLISE SEGREGADA ========= */
secao("Memória de cálculo do laudo com receita segregada");
{
  const mix = [{ anexo: 5, share: 0.5 }, { anexo: 1, share: 0.5 }];
  const ddas = motor.dDASsegregado(mix, 1200000);
  const base = { ...motor.PARAMETROS_2027, das: ddas.das, rbt12: 1200000 };
  const res = motor.decidir(R_G, base);
  const analise = {
    id: "x", rq: res.rq, ch: res.ch, cl: res.cl, re: res.re, fc: res.fc,
    saida: res.saida, prioridade: res.prioridade, respostas: R_G,
    calculado_em: "2026-08-02T12:00:00.000Z",
    parametros: {
      ddas, segmentos: mix, segregado: true, aliquota: base.aliquota, das: ddas.das,
      rbt12: 1200000, anexo: ddas.anexo, sublimite: base.sublimite,
      bandaSublimite: base.bandaSublimite, exercicio: 2027,
    },
  };
  const passos = laudo.memoriaDeCalculo(analise);
  const rotulos = passos.map((p) => p.passo);
  ok("imprime um passo por anexo", rotulos.filter((r) => /^1\.\d/.test(r)).length === 2, rotulos);
  ok("o passo 2 diz que a receita é segregada",
     rotulos.some((r) => r.includes("receita segregada")), rotulos);
  const somaPasso = passos.find((p) => p.passo.includes("receita segregada"));
  ok("o passo 2 mostra a soma ponderada", (somaPasso?.substituicao ?? "").includes("+"), somaPasso?.substituicao);
  ok("o resultado do passo 2 é o dDAS final",
     (somaPasso?.resultado ?? "").includes((ddas.das * 100).toFixed(3).replace(".", ",")),
     somaPasso?.resultado);

  const cond = laudo.condicoesDeValidade(analise);
  ok("condição sobre a composição da receita", cond.some((c) => c.includes("composição da receita")), cond.length);
  ok("condição sobre o fator R (há serviço no mix)", cond.some((c) => c.includes("fator R")), cond.length);

  // e a análise SEM segregação continua com a memória antiga
  const simples = { ...analise, parametros: { ...analise.parametros, ddas: motor.dDASefetivo(1, 1200000), segmentos: null, segregado: false } };
  const p2 = laudo.memoriaDeCalculo(simples).map((p) => p.passo);
  ok("análise de um anexo só mantém o passo 1 de sempre",
     p2.some((r) => r.startsWith("1. Alíquota")) && !p2.some((r) => /^1\.\d/.test(r)), p2);
}

/* =============================================== 6. NAVEGADOR =========== */
secao("Navegador — curso estático e formulário da coleta");
const SITE = process.env.SITE_DIR || "/root/work/enquadria-site";
let chromium = null;
try {
  ({ chromium } = await import("playwright"));
} catch {
  ok("playwright disponível", false, "instale para rodar as checagens de navegador");
}

if (chromium && fs.existsSync(SITE)) {
  const navegador = await chromium.launch({
    executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium",
  });

  /* ---- curso: gate, progresso, certificado ---- */
  {
    const ctx = await navegador.newContext({ viewport: { width: 414, height: 900 } });
    const p = await ctx.newPage();
    await p.route("**/api/**", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true,"codigo":"EQ-TEST-0001","emitido_em":"2026-03-15T10:00:00Z"}' })
    );
    await p.goto("file://" + path.join(SITE, "curso/index.html"));

    const medalha = await p.$eval(".cert-medalha svg", (e) => Math.round(e.getBoundingClientRect().width));
    ok("medalhão com CSS = 32px", medalha === 32, medalha);
    await p.evaluate(() => document.querySelectorAll("style,link[rel=stylesheet]").forEach((e) => e.remove()));
    const semCss = await p.$eval(".cert-medalha svg", (e) => Math.round(e.getBoundingClientRect().width));
    ok("medalhão SEM css continua 32px (não vira cartaz)", semCss === 32, semCss);

    await p.goto("file://" + path.join(SITE, "curso/index.html"));
    const refs = await p.evaluate(() =>
      [...document.querySelectorAll('link[rel=stylesheet],script[src]')]
        .map((e) => e.href || e.src).filter((u) => u.includes("assets/")));
    ok("assets carimbados com ?v=", refs.length > 0 && refs.every((u) => /\?v=[0-9a-f]{8}/.test(u)), refs);

    const travados = await p.$$eval(".mat-lock", (e) => e.filter((x) => x.offsetParent !== null).length);
    const livres = await p.$$eval(".mat-link", (e) => e.filter((x) => x.offsetParent !== null).length);
    ok("materiais travados antes do e-mail", travados > 0 && livres === 0, { travados, livres });

    await p.fill('[data-gate-form] input[type=email]', "teste@exemplo.com.br");
    await p.click("[data-gate-form] button");
    // ESPERA POR CONDIÇÃO, NÃO POR RELÓGIO. O gate só libera depois do
    // Promise.allSettled das duas chamadas de rede reais; com um sleep fixo de
    // 400ms este teste falhava sozinho de vez em quando, e teste que grita
    // sem motivo é pior do que teste que não existe — em pouco tempo ninguém
    // olha mais o resultado.
    let livres2 = 0;
    try {
      await p.waitForFunction(
        () => [...document.querySelectorAll(".mat-link")].some((x) => x.offsetParent !== null),
        null,
        { timeout: 8000 }
      );
      livres2 = await p.$$eval(".mat-link", (e) => e.filter((x) => x.offsetParent !== null).length);
    } catch {
      livres2 = 0;
    }
    ok("materiais liberam depois do e-mail", livres2 > 0, livres2);

    const prog = () => p.$eval("[data-prog-texto]", (e) => e.textContent.trim());
    ok("progresso começa em 0", (await prog()) === "0 de 9 aulas", await prog());
    await p.evaluate(() => {
      localStorage.setItem("enquadria_curso_progresso", JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9]));
    });
    await p.reload();
    ok("progresso vai a 9 de 9", (await prog()) === "9 de 9 aulas", await prog());
    const liberado = await p.$eval("[data-cert-liberado]", (e) => !e.hidden);
    ok("certificado libera com 9 de 9", liberado);

    await p.evaluate(() => {
      localStorage.setItem("enquadria_curso_progresso", JSON.stringify([1, 2, 3, 4, 6, 7, 8, 9]));
    });
    await p.reload();
    const bloq = await p.$eval("[data-cert-liberado]", (e) => e.hidden);
    ok("desmarcar uma aula tranca o certificado de novo", bloq);

    // a data que vai ao LinkedIn é a de EMISSÃO
    await p.evaluate(() =>
      localStorage.setItem("enquadria_curso_certificado",
        JSON.stringify({ codigo: "EQ-4KMR-8TQZ", nome: "Fulano de Tal", emitido_em: "2026-03-15T10:00:00Z" })));
    await p.reload();
    const q = Object.fromEntries(
      new URL(await p.getAttribute("[data-cert-linkedin]", "href")).searchParams);
    ok("LinkedIn: mês da EMISSÃO, não de hoje", q.issueYear === "2026" && q.issueMonth === "3", q);
    ok("LinkedIn: código e url de verificação", q.certId === "EQ-4KMR-8TQZ" &&
       q.certUrl === "https://app.enquadria.com.br/certificado/EQ-4KMR-8TQZ", q);
    await ctx.close();
  }

  /* ---- formulário da coleta, servido do próprio pacote do app ---- */
  {
    const html = montarPreviaColeta();
    const ctx = await navegador.newContext({ viewport: { width: 414, height: 900 } });
    const p = await ctx.newPage();
    let enviado = null;
    await p.route("**/api/coleta/**", async (r) => {
      enviado = JSON.parse(r.request().postData());
      await r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
    });
    await p.setContent(html);

    const opcoes = await p.$$eval("#p1 button", (bs) => bs.map((b) => b.innerText.replace(/\n/g, " | ")));
    ok("cada opção mostra o percentual equivalente",
       opcoes.length === 5 && opcoes.every((o) => o.includes("%")), opcoes);
    ok("pergunta de sim/não NÃO ganha percentual",
       (await p.$$eval("#p3 button", (bs) => bs.map((b) => b.innerText))).every((t) => !t.includes("%")));
    await ctx.close();
  }

  await navegador.close();
} else if (chromium) {
  ok("pasta do site encontrada", false, SITE);
}

/* ===================================================== RELATÓRIO ======== */
function montarPreviaColeta() {
  // Desenha as perguntas a partir de lib/coleta COMPILADO — é a mesma lista que
  // a página pública usa. Testar contra uma cópia do HTML validaria a cópia.
  const { PERGUNTAS } = coleta;
  const bloco = (p, i) => `
    <div id="p${i + 1}">${p.opcoes.map((o) =>
      `<button>${o.rotulo}${o.equivale ? `<span> ${o.equivale}</span>` : ""}</button>`).join("")}</div>`;
  return `<!doctype html><meta charset="utf-8"><body>${PERGUNTAS.map(bloco).join("")}</body>`;
}

function fim() {
  secao("Resultado");
  const total = passou + falhas;
  const resumo = falhas === 0
    ? `TUDO PASSOU — ${passou} verificações automáticas`
    : `${falhas} FALHA(S) em ${total} verificações`;
  console.log("\n" + resumo);
  console.log(
    "\nO que este executor NÃO cobre, e continua na sua lista:\n" +
    "  · importar de verdade, RLS, emitir laudo/termo, assinar, gravar coleta,\n" +
    "    cota de plano — tudo isso precisa do Supabase no ar;\n" +
    "  · o cache do .htaccess, que depende do Apache do HostGator;\n" +
    "  · salvar o certificado no perfil do LinkedIn;\n" +
    "  · o que só o olho julga: se está claro, se cabe, se está bonito."
  );
  linhas.push("", resumo);
  fs.writeFileSync(path.join(RAIZ, "testes", "ultimo-relatorio.txt"), linhas.join("\n") + "\n");
  console.log(`\nrelatório em testes/ultimo-relatorio.txt`);
  fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(falhas === 0 ? 0 : 1);
}

fim();
