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
    "lib/emails-cliente.ts", "lib/erros-auth.ts", "lib/ajuda.ts", "lib/cobranca.ts", "lib/nps.ts",
    "lib/escritorio.ts", "lib/roteiro.ts", "lib/abertura.ts", "lib/comparativo.ts",
    "lib/curso.ts", "lib/faturas.ts", "lib/documento.ts", "lib/assinatura.ts",
    "lib/negocio-calc.ts",
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

/**
 * A LISTA VEM DO DISCO, e isso é a correção de um susto real.
 *
 * Esta linha era um array escrito à mão. Duas suítes novas (assinatura e
 * negócio) foram criadas, o array foi editado, e uma edição posterior o
 * restaurou — as duas sumiram da execução sem NENHUM sinal: o executor
 * continuou verde, só com 9 asserções a menos num total de 170. Teste que
 * some em silêncio é pior que teste que não existe, porque a confiança fica.
 *
 * Lendo a pasta, criar o arquivo já basta para ele rodar. E se algum dia uma
 * suíte precisar ficar de fora, isso vira uma decisão escrita aqui — não um
 * esquecimento.
 */
const SUITES = fs
  .readdirSync(path.join(RAIZ, "testes"))
  .filter((f) => f.endsWith(".test.mjs"))
  .map((f) => f.replace(/\.test\.mjs$/, ""))
  .sort();

ok(`${SUITES.length} suítes encontradas na pasta`, SUITES.length > 0, SUITES);

for (const suite of SUITES) {
  const arq = path.join(RAIZ, "testes", `${suite}.test.mjs`);
  fs.copyFileSync(arq, path.join(TMP, `${suite}.test.mjs`));
  const r = spawnSync("node", [`${suite}.test.mjs`], { cwd: TMP, encoding: "utf8" });
  const saida = (r.stdout || "") + (r.stderr || "");
  const total = (saida.match(/^ok:/gm) || []).length;
  ok(`suíte ${suite} (${total} asserções)`, r.status === 0,
     r.status === 0 ? undefined : (saida.split("\n").filter((l) => l.startsWith("FALHOU")).slice(0, 5).length
       ? saida.split("\n").filter((l) => l.startsWith("FALHOU")).slice(0, 5)
       : saida.split("\n").filter(Boolean).slice(-6)));
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

/* ============================================ 1b2. SCHEMA SEM LASTRO ==== */
secao("Auditoria de schema (colunas que ninguém garante que existem)");
{
  /**
   * O cliente do Supabase não é tipado aqui: `select()` recebe uma string, e
   * pedir uma coluna inexistente compila, passa nos testes de função pura e só
   * quebra em produção. Aconteceu com `termos.tenant_id`, dentro da rota de
   * ASSINATURA — o fecho da esteira derrubado por um aviso acessório.
   */
  const r = spawnSync("node", [path.join(RAIZ, "testes", "auditar-schema.mjs")], { encoding: "utf8" });
  const saida = (r.stdout || "") + (r.stderr || "");
  const tabelas = (saida.match(/^ok: /gm) || []).length;
  ok(`auditoria de schema (${tabelas} tabelas com proveniência)`, r.status === 0,
     r.status === 0 ? undefined : saida.split("\n").filter((l) => l.startsWith("SUSPEITA")).slice(0, 6));
}

/* ==================================== 1b3. UPSERT QUE O BANCO RECUSA ==== */
secao("Auditoria de upsert (o onConflict que o Postgres não consegue inferir)");
{
  /**
   * A central de faturas ficou VAZIA por dias com tudo aparentemente
   * funcionando: cobrança gerada, e-mail enviado, webhook recebido, 200 em
   * todo mundo. O culpado era um `where` numa linha de índice — `ON CONFLICT
   * (asaas_id)` não infere índice PARCIAL, e o supabase-js devolve o erro em
   * vez de lançar, então ninguém lia.
   *
   * Três upserts estavam quebrados pelo mesmo motivo (faturas, curso_leads,
   * convites) e nenhum teste alcançava: compilam, passam no lint, sobem, e só
   * o banco reclama — para ninguém.
   */
  const r = spawnSync("node", [path.join(RAIZ, "testes", "auditar-upsert.mjs")], { encoding: "utf8" });
  const saida = (r.stdout || "") + (r.stderr || "");
  const conferidos = (saida.match(/^ok: /gm) || []).length;
  ok(`auditoria de upsert (${conferidos} conferidos)`, r.status === 0,
     r.status === 0 ? undefined : saida.split("\n").filter((l) => l.startsWith("QUEBRADO")).slice(0, 8));
}

/* ============== 1b4. A PROMESSA DE SEGURANÇA TEM QUE TER LASTRO ========= */
secao("Segurança do dado — o que a tela promete no momento da fricção");
{
  /**
   * O momento mais caro do produto é pedir a CARTEIRA do contador: a lista de
   * clientes, o ativo do escritório, a alguém que conheceu o sistema há dez
   * minutos. Quem hesita ali não escreve perguntando — fecha a aba.
   *
   * Por isso a resposta foi para dentro da tarefa. E por isso ela precisa de
   * trava: promessa de segurança que descola do documento publicado é pior do
   * que promessa nenhuma, porque vira desmentido no dia em que alguém confere.
   * Cada afirmação do bloco tem que continuar existindo no documento.
   */
  const comp = fs.readFileSync(path.join(RAIZ, "components/SegurancaDoDado.tsx"), "utf8");
  const legal = fs.readFileSync(path.join(RAIZ, "lib/legal.json"), "utf8");
  const seg = JSON.parse(legal).documentos.find((d) => d.slug === "seguranca");
  const textoSeg = JSON.stringify(seg).toLowerCase();

  const AFIRMACOES = [
    ["separação no banco, não filtro de tela", "row level security"],
    ["não treina modelo com o conteúdo da conta", "treinar modelo"],
    ["nenhuma IA processa a carteira", "inteligência artificial"],
    ["o contador exporta quando quiser", "exporta"],
    ["tráfego em TLS", "tls"],
  ];
  for (const [nome, agulha] of AFIRMACOES) {
    ok(`a tela promete "${nome}" e o documento sustenta`, textoSeg.includes(agulha), agulha);
  }

  /**
   * O link tem que estar nas DUAS versões do bloco — a compacta (trilha) e a
   * inteira (tela de importar). Procurar no arquivo passava com o link
   * removido de uma delas, porque a outra ainda casava: o mesmo erro de
   * guarda que já apareceu três vezes nesta base.
   */
  const iComp = comp.indexOf("if (compacto)");
  const variante = { compacta: comp.slice(iComp, comp.indexOf("return (", comp.indexOf("}", iComp))), inteira: comp.slice(comp.lastIndexOf("return (")) };
  for (const [nome, trecho] of Object.entries(variante)) {
    ok(`a versão ${nome} do bloco linka Segurança e Privacidade`,
       /href="\/seguranca"/.test(trecho) && /href="\/privacidade"/.test(trecho),
       trecho.replace(/\s+/g, " ").slice(0, 100));
  }

  /* o pedido encolheu: uma empresa antes da carteira inteira */
  const trilha = fs.readFileSync(path.join(RAIZ, "components/Trilha.tsx"), "utf8");
  ok("a trilha pede UMA empresa antes da carteira inteira",
     /Comece por uma empresa/.test(trilha) && !/titulo: "Suba a carteira"/.test(trilha));
  ok("e mostra a segurança no passo em que a carteira é pedida",
     /SegurancaDoDado/.test(trilha));

  const imp = fs.readFileSync(path.join(RAIZ, "app/painel/importar/page.tsx"), "utf8");
  ok("a tela de importar mostra o bloco na PRIMEIRA vez",
     /jaTem === 0 &&[\s\S]{0,80}<SegurancaDoDado/.test(imp));
  /* quem já tem carteira já decidiu: repetir a conversa vira ruído, e ruído
     gasta a credibilidade que o texto deveria construir. A checagem é simples
     de propósito: UMA aparição, e ela dentro da guarda. */
  const semGuarda = imp.replace(/\{jaTem === 0 && \([\s\S]*?\n      \)\}/, "");
  ok("...e NÃO repete para quem já tem carteira",
     (imp.match(/<SegurancaDoDado/g) || []).length === 1 && !/<SegurancaDoDado/.test(semGuarda),
     `${(imp.match(/<SegurancaDoDado/g) || []).length} aparições · fora da guarda: ${/<SegurancaDoDado/.test(semGuarda)}`);
}

/* ======================================= 1c. O QUE O CLIENTE ALCANÇA ==== */
secao("Endereços públicos — o que chega ao cliente sem login");
{
  /**
   * O cliente do contador NÃO TEM CONTA e nunca vai ter — e no caso do estudo
   * de abertura ele nem cliente é ainda. Seis endereços
   * existem para ele, e todos dependem de continuar fora da guarda do
   * middleware. Proteger um deles por engano não quebra build nem teste de
   * função pura: quebra em produção, como um cliente batendo em tela de login
   * para ler o laudo que pagou — e o contador só descobre quando reclamam.
   */
  const PUBLICAS = ["assinar", "coleta", "laudo", "comparativo", "termo", "abertura"];
  const mw = fs.readFileSync(path.join(RAIZ, "middleware.ts"), "utf8");
  const guarda = mw.match(/path\.startsWith\("([^"]+)"\)/g) || [];
  const prefixos = guarda.map((g) => g.match(/"([^"]+)"/)[1]);

  for (const rota of PUBLICAS) {
    const existe = fs.existsSync(path.join(RAIZ, "app", rota, "[token]", "page.tsx"));
    const protegida = prefixos.some((p) => `/${rota}`.startsWith(p));
    ok(`/${rota}/[token] existe e é pública`, existe && !protegida,
       !existe ? "página não encontrada" : `bloqueada pelo middleware (${prefixos.join(", ")})`);
  }

  /**
   * E a página pública NÃO pode ler com a sessão: `createClient` de
   * supabase-server devolve o cliente do usuário, que não existe aqui. Uma
   * página assim compila, sobe, e devolve 404 para todo cliente.
   */
  for (const rota of PUBLICAS) {
    const arq = path.join(RAIZ, "app", rota, "[token]", "page.tsx");
    if (!fs.existsSync(arq)) continue;
    const src = fs.readFileSync(arq, "utf8");
    ok(`/${rota}/[token] lê por token, não por sessão`,
       src.includes("createAdminClient") && !/from "@\/lib\/supabase-server"/.test(src),
       src.includes("supabase-server") ? "importa o cliente de sessão" : "não usa createAdminClient");
  }

  /**
   * O BOTÃO DO E-MAIL PRECISA ABRIR O DOCUMENTO.
   *
   * Bug real: o comprovante de assinatura dizia "guardar uma cópia do termo" e
   * apontava para /assinar/[token], que depois de assinado mostra um aviso e o
   * hash. O cliente ficava sem via nenhuma — e isso não aparece em build, em
   * tipo nem em teste de função: aparece na hora em que alguém contesta a
   * decisão e a única via imprimível está atrás do login da outra parte.
   */
  {
    const api = fs.readFileSync(path.join(RAIZ, "app/api/assinar/route.ts"), "utf8");
    const linha = (api.match(/const linkTermo = [^\n]+/) || [""])[0];
    ok("o comprovante do cliente linka o termo, não a página de assinatura",
       linha.includes("/termo/") && !linha.includes("/assinar/"), linha || "linha não encontrada");
  }

  /**
   * E O VÍDEO DA AULA aceita o link que o YouTube entrega no botão
   * compartilhar. `src={aula.video}` cru obrigava a colar a URL de embed —
   * quem colasse youtu.be publicava uma aula com o player recusando carregar.
   */
  {
    const aula = fs.readFileSync(path.join(RAIZ, "app/curso/[slug]/page.tsx"), "utf8");
    ok("a aula normaliza a URL do vídeo antes do iframe",
       aula.includes("urlDeEmbed") && !/src=\{aula\.video\}/.test(aula),
       /src=\{aula\.video\}/.test(aula) ? "iframe recebe a URL crua" : "não chama urlDeEmbed");
  }
}


/* ================================== 1d. OS DOCUMENTOS IMPRIMEM IGUAL ==== */
secao("Impressão — o PDF que chega ao cliente");
{
  /**
   * O CSS de impressão estava copiado em quatro folhas e já tinha divergido:
   * laudo 18mm, termo 18/16, relatório 22. Documento com margem diferente do
   * termo da mesma empresa parece montado em lugares diferentes — e é
   * exatamente o que o white-label promete que não acontece. Nada disso
   * quebra build: só aparece no papel.
   */
  const FOLHAS = [
    "components/LaudoFolha.tsx",
    "components/ComparativoFolha.tsx",
    "components/FolhaTermo.tsx",
    "app/doc/relatorio/page.tsx",
  ];
  for (const f of FOLHAS) {
    const src = fs.readFileSync(path.join(RAIZ, f), "utf8");
    const proprias = (src.match(/@page\s*\{/g) || []).length;
    ok(`${f} usa o CSS de impressão comum`,
       src.includes("CSS_IMPRESSAO") && proprias === 0,
       proprias > 0 ? "declara @page por conta própria" : "não importa CSS_IMPRESSAO");
  }

  const comum = fs.readFileSync(path.join(RAIZ, "lib/impressao.ts"), "utf8");
  ok("o CSS comum apaga o fundo cinza do app no papel",
     /html,\s*body\s*\{\s*background:\s*#fff/.test(comum));

  /**
   * A MARGEM NÃO PODE DEPENDER SÓ DO `@page`.
   *
   * Bug real: PDF com o texto encostado na borda. A opção "Margens" da janela
   * de impressão é do usuário e sobrescreve o `@page` — quem deixou em
   * "Nenhuma" uma vez imprime assim para sempre. Com a folha zerando o
   * próprio padding, não sobrava nada entre o texto e o corte.
   *
   * Este teste existe porque `padding: 0 !important` na impressão PARECE
   * limpeza correta: a folha imita papel na tela, então zerar soa certo. É
   * exatamente o tipo de "arrumação" que volta.
   */
  // a partir do CSS de verdade, não do comentário que o explica
  const css = comum.slice(comum.indexOf("export const CSS_IMPRESSAO"));
  const bloco = css.slice(css.indexOf(".sheet {"), css.indexOf("tr, li"));
  ok("a folha guarda a própria margem na impressão (o usuário pode zerar a do papel)",
     /padding:\s*\d+mm/.test(bloco) && !/padding:\s*0\s*!important/.test(bloco),
     bloco.replace(/\s+/g, " ").slice(0, 120));
  ok("e o @page também declara margem, para quando o navegador respeitar",
     /@page\s*\{\s*margin:\s*\d+mm/.test(comum));
  ok("e impede a linha de tabela partida entre páginas",
     /tr,\s*li\s*\{\s*page-break-inside:\s*avoid/.test(comum));

  /**
   * A margem do `@page` não apaga o cabeçalho do navegador — a URL e a data
   * no pé de cada página saem assim mesmo, num laudo com a marca do
   * escritório. Só a caixinha do usuário apaga, e ninguém desmarca uma opção
   * que não sabe que existe.
   */
  const botao = fs.readFileSync(path.join(RAIZ, "components/BotaoImprimir.tsx"), "utf8");
  ok("o botão de PDF ensina a desmarcar cabeçalhos e rodapés",
     /Cabeçalhos e rodapés/.test(botao) && /Salvar como PDF/.test(botao));
  ok("e a avisar sobre a opção de margens, que é a que corta o texto",
     /Margens/.test(botao));
}

/* =========================== 1e. TIRAR EMPRESA DA FILA TEM VOLTA ======== */
secao("Arquivar — a saída e o caminho de volta");
{
  /**
   * Arquivar sem tela de arquivadas é sumiço: a única tela que sabe
   * desarquivar é o dossiê, e o dossiê se abre a partir da fila — de onde a
   * empresa acabou de sair.
   */
  const dossie = fs.readFileSync(path.join(RAIZ, "app/api/dossie/route.ts"), "utf8");
  ok("o dossiê abre empresa arquivada (senão arquivar não tem volta)",
     !/\.is\("arquivada_em", null\)/.test(dossie) && /arquivada_em/.test(dossie));

  const fila = fs.readFileSync(path.join(RAIZ, "app/painel/page.tsx"), "utf8");
  ok("mas a FILA continua escondendo as arquivadas",
     /\.is\("arquivada_em", null\)/.test(fila));

  ok("existe a tela que lista as arquivadas",
     fs.existsSync(path.join(RAIZ, "app/painel/arquivadas/page.tsx")));

  const nav = fs.readFileSync(path.join(RAIZ, "lib/nav.ts"), "utf8");
  ok("e ela é alcançável pelo menu", /\/painel\/arquivadas/.test(nav));
}


/* ================================= 1f. O MENU NÃO PODE REGREDIR ========= */
secao("Menu — a estrutura que já foi desfeita sem querer");
{
  /**
   * Esta estrutura foi decidida, desfeita numa reorganização e redecidida.
   * Nada aqui quebra build: um item de menu que reaparece no lugar errado só
   * é percebido por quem usa o produto todo dia — e aí já foi ao ar.
   */
  const nav = fs.readFileSync(path.join(RAIZ, "lib/nav.ts"), "utf8");
  const bloco = (nome) => {
    const i = nav.indexOf(`export const ${nome}`);
    if (i < 0) return "";
    return nav.slice(i, nav.indexOf("];", i));
  };

  ok("Reforma e Curso andam juntos (o que a pessoa quer APRENDER)",
     /painel\/reforma/.test(bloco("ABAS_APRENDER")) && /"\/curso"/.test(bloco("ABAS_APRENDER")));
  ok("Ajuda e chamados andam juntos (o que ela quer RESOLVER)",
     /painel\/ajuda/.test(bloco("ABAS_AJUDA")) && /painel\/chamados/.test(bloco("ABAS_AJUDA")));
  ok("e as duas duplas não se misturam",
     !/painel\/reforma/.test(bloco("ABAS_AJUDA")) && !/painel\/chamados/.test(bloco("ABAS_APRENDER")));

  ok("o comparativo de regimes tem porta própria, fora da empresa",
     fs.existsSync(path.join(RAIZ, "app/painel/estudos/page.tsx")) &&
     /painel\/estudos/.test(bloco("ABAS_ESTUDOS")));
  ok("e divide a faixa com a abertura",
     /painel\/abertura/.test(bloco("ABAS_ESTUDOS")));

  /**
   * A área de plataforma é só do superadmin. Seis links dela no menu lateral
   * dobravam o menu de quem trabalha na carteira todo dia.
   */
  const plataforma = nav.slice(nav.indexOf("export const NAV_PLATAFORMA"), nav.indexOf("export const ABAS_ESCRITORIO"));
  const itensPlataforma = (plataforma.match(/href:/g) || []).length;
  ok("Plataforma é UM item de menu, com o resto dentro da página",
     itensPlataforma === 1, `${itensPlataforma} itens no menu`);

  const abasNegocio = fs.readFileSync(path.join(RAIZ, "components/NegocioAbas.tsx"), "utf8");
  ok("e a faixa de abas do Negócio não é uma segunda lista escrita à mão",
     abasNegocio.includes("ABAS_NEGOCIO") && !/const ABAS = \[/.test(abasNegocio));

  /* Planos é item próprio de menu; a faixa do escritório não pertence a ele */
  const planos = fs.readFileSync(path.join(RAIZ, "app/painel/planos/page.tsx"), "utf8");
  ok("a tela de Planos não carrega as abas de Configurações/Equipe/Indique",
     !/AbasEscritorio/.test(planos));
}


/* ============================ 1g. O CAMINHO DO DINHEIRO NÃO PODE CALAR == */
secao("Contratação — o clique que não fazia nada");
{
  /**
   * Bug real: "Assinar" não fazia NADA. Três defeitos empilhados —
   *   1. não mandávamos `cpfCnpj`, que o Asaas exige para criar cliente;
   *   2. o erro do Asaas era engolido num `catch` que devolvia null;
   *   3. a tela só tratava "tem link" e "Asaas desligado" — faltava o
   *      terceiro caso, Asaas LIGADO e sem link, que é onde o clique morria.
   *
   * Nada disso quebra build, e nenhum teste de função pura alcança. O que
   * protege é exigir que cada elo continue existindo.
   */
  const asaas = fs.readFileSync(path.join(RAIZ, "lib/asaas.ts"), "utf8");
  /* olhar só por "cpfCnpj" no arquivo casava com o NOME DO PARÂMETRO e passava
     mesmo com o campo fora do corpo do POST — o defeito exato que existia.
     A checagem tem que ser no corpo enviado ao endpoint de clientes. */
  const posCustomers = asaas.indexOf('`${base}/customers`');
  const corpoCliente = posCustomers < 0 ? "" : asaas.slice(posCustomers, posCustomers + 400);
  ok("a criação do cliente manda cpfCnpj NO CORPO do POST",
     /body:[\s\S]*cpfCnpj/.test(corpoCliente),
     corpoCliente.replace(/\s+/g, " ").slice(0, 140));
  ok("as chamadas mandam User-Agent (sem ele o Asaas responde 401)",
     /User-Agent/.test(asaas));
  ok("o erro do Asaas sobe em vez de virar null",
     /erro\?: string/.test(asaas) && !/\} catch \{\s*return \{ ativo: true \};/.test(asaas));

  const checkout = fs.readFileSync(path.join(RAIZ, "app/api/checkout/route.ts"), "utf8");
  ok("o checkout recusa antes de chamar o Asaas quando falta documento",
     /criticaDocumento/.test(checkout) && /falta_documento/.test(checkout));
  ok("e responde erro quando o Asaas está ligado e não devolveu link",
     /cobranca\.ativo && !cobranca\.checkout_url/.test(checkout));


  /**
   * O WEBHOOK PRECISA RESPONDER NOS DOIS CAMINHOS.
   *
   * Caso real (04/08/2026): a rota vive em `/api/asaas`, o painel do Asaas foi
   * configurado com `/api/webhooks/asaas` — o caminho mais natural de escrever.
   * Resultado: 404 em todo evento, penalização automática, fila suspensa. A
   * cobrança existia lá e não existia aqui: sem fatura, sem e-mail, sem acesso.
   *
   * Nada disso quebra build. O que protege é exigir que os dois endereços
   * continuem existindo — e que o segundo NÃO seja uma segunda implementação,
   * que divergiria na primeira correção.
   */
  const alias = path.join(RAIZ, "app/api/webhooks/asaas/route.ts");
  ok("o webhook também responde em /api/webhooks/asaas", fs.existsSync(alias));
  if (fs.existsSync(alias)) {
    const src = fs.readFileSync(alias, "utf8");
    ok("e o alias reexporta o mesmo handler, sem copiar a lógica",
       /export \{ POST \} from "@\/app\/api\/asaas\/route"/.test(src) && !/statusDoAsaas|upsert/.test(src));
  }

  /* webhook é entrega best-effort: tem que existir caminho para reconstruir */
  const asaasLib = fs.readFileSync(path.join(RAIZ, "lib/asaas.ts"), "utf8");
  ok("existe como reimportar as faturas que o webhook perdeu",
     /export async function importarFaturas/.test(asaasLib));
  ok("e a importação só aceita pagamento com externalReference nosso",
     /externalReference/.test(asaasLib.slice(asaasLib.indexOf("importarFaturas"))));

  /* a cobrança gerada não pode depender de webhook para chegar em alguém */
  const checkout2 = fs.readFileSync(path.join(RAIZ, "app/api/checkout/route.ts"), "utf8");
  ok("o link de pagamento sai por e-mail na hora da contratação",
     /htmlCobrancaGerada/.test(checkout2));


  /**
   * QUEM ESCREVE FATURA É O SERVIDOR — nunca a sessão do usuário.
   *
   * Bug real: o checkout gravava a fatura com o cliente da SESSÃO. A RLS de
   * `faturas` dá ao escritório apenas SELECT (de propósito: quem pudesse
   * escrever inseriria uma linha "paga" e liberaria acesso sem pagar). A
   * escrita era recusada, o supabase-js devolve `{error}` em vez de lançar, o
   * código ignorava — e o sintoma foi: o e-mail da cobrança saía e a fatura
   * não aparecia em lugar nenhum.
   */
  const mig39 = fs.readFileSync(path.join(RAIZ, "supabase/migrations/0039_faturas.sql"), "utf8");
  ok("a RLS de faturas dá só leitura ao escritório",
     /faturas_do_escritorio[\s\S]{0,120}for select/.test(mig39));

  const ck = fs.readFileSync(path.join(RAIZ, "app/api/checkout/route.ts"), "utf8");
  /* olhar uma janela em volta da chamada casava com o `createAdminClient` da
     linha vizinha e passava mesmo com a escrita feita pela sessão — que é o
     defeito exato que existia. A checagem é na CHAMADA. */
  ok("...e por isso o checkout grava a fatura com o cliente de serviço",
     /\(admin \?\? supabase\)\.from\("faturas"\)/.test(ck),
     (ck.match(/[\w.() ?]*\.from\("faturas"\)/) || ["não achei a chamada"])[0]);

  /**
   * O ERRO DA GRAVAÇÃO PRECISA CHEGAR NA TELA, não só no log.
   *
   * Enquanto a falha da fatura era um `console.error`, o bug do índice parcial
   * (0041) durou dias: a cobrança nascia, o e-mail saía, a linha não gravava, e
   * a única pista morava num log que ninguém abre. Log não é aviso.
   */
  ok("e o resultado da gravação volta na resposta do checkout",
     /fatura_registrada/.test(ck) && /fatura_erro/.test(ck));

  /* o terceiro estado da tela de planos: contratado e ainda não pago */
  const telaPlanos = fs.readFileSync(path.join(RAIZ, "app/painel/planos/page.tsx"), "utf8");
  ok("a tela de planos mostra a assinatura pendente de pagamento",
     /pendente/.test(telaPlanos) && /aguardando/i.test(telaPlanos));

  /**
   * E O ESTADO É POR PLANO, não global.
   *
   * Bug real: com uma pendência de mensal na mesa, contratar o ANUAL não mudava
   * o botão do cartão anual. A tela lia UMA pendência (`.limit(1)`) e comparava
   * com todos os cartões — o cartão certo perdia a corrida por acaso.
   */
  ok("e lê TODAS as pendentes, não a primeira que aparecer",
     !/\.eq\("status", "pendente"\)\s*\n?\s*\.limit\(1\)/.test(telaPlanos) &&
     /pendentes\.has\(p\.id\)/.test(telaPlanos),
     /limit\(1\)/.test(telaPlanos) ? "ainda usa limit(1)" : "não indexa por plano");

  /**
   * E A TELA RELÊ O BANCO DEPOIS DE CONTRATAR.
   *
   * Sem isto, contratar abria a aba do pagamento e deixava esta página
   * exatamente como estava: sem a fatura nova na lista e sem o cartão mudar de
   * estado. Do lado de quem clicou, indistinguível de "não funcionou".
   */
  ok("e recarrega o estado depois da contratação",
     /await carregar\(\)/.test(telaPlanos));

  /**
   * ═════════════════════════════════════════════════════════════════════════
   * UMA CONTA, UM PLANO — a ligação entre a regra e o mundo.
   *
   * A decisão em si é função pura e está coberta em `testes/assinatura.test.mjs`
   * (36 asserções, quebradas de propósito em quatro frentes). O que NENHUM
   * teste de função pura alcança é a fiação: a rota chamar a decisão, o webhook
   * encerrar as superadas, o boleto velho morrer no Asaas. Cada elo abaixo,
   * quando some, produz o mesmo sintoma da denúncia original — cobrança
   * duplicada e dois planos na mesma conta.
   * ═════════════════════════════════════════════════════════════════════════
   */
  ok("o checkout decide pela regra de plano único, não por conta própria",
     /decidirContratacao/.test(ck) && /encerrarAssinaturas/.test(ck));
  ok("e clicar de novo no mesmo plano devolve a cobrança existente",
     /reaproveitar/.test(ck) && /reaproveitada: true/.test(ck));

  const wh = fs.readFileSync(path.join(RAIZ, "app/api/asaas/route.ts"), "utf8");
  ok("a troca de plano só acontece quando o pagamento é confirmado",
     /decidirSucessao/.test(wh) && /encerrarAssinaturas/.test(wh));
  /* a ORDEM é o que impede a conta ficar sem plano nenhum com o dinheiro pago */
  ok("...e as antigas caem DEPOIS de a nova virar ativa",
     wh.indexOf('status: "ativa"') < wh.indexOf("await encerrarAssinaturas"),
     { ativa: wh.indexOf('status: "ativa"'), encerrar: wh.indexOf("await encerrarAssinaturas") });
  ok("os dias pagos que sobram entram no plano novo",
     /credito/.test(wh) && /validadeFinal\(/.test(wh));

  /**
   * O BOLETO ABANDONADO PRECISA MORRER NO ASAAS.
   *
   * Deixá-lo aberto é o pior dos dois mundos: o cliente pode pagar o plano que
   * largou, e o webhook — que não sabe de nada — ativa aquele por cima do que
   * ele acabou de comprar.
   */
  ok("existe como cancelar a cobrança no Asaas",
     /export async function cancelarCobranca/.test(asaas) && /method: "DELETE"/.test(asaas));
  const encerrar = fs.readFileSync(path.join(RAIZ, "lib/assinatura-server.ts"), "utf8");
  ok("e o encerramento usa isso antes de marcar a fatura",
     encerrar.indexOf("cancelarCobranca(") < encerrar.indexOf('status: "cancelado"'));
  ok("e fatura PAGA nunca é reescrita",
     /\.in\("status", \["pendente", "vencido"\]\)/.test(encerrar));

  /**
   * ═════════════════════════════════════════════════════════════════════════
   * AS MÉTRICAS DE RECEITA — o painel que mostrava R$ 0 com dinheiro na conta.
   *
   * `assinaturas.valor_centavos` era NULL em toda assinatura criada pelo
   * checkout, e o MRR lia só dele. As contas estão cobertas em
   * `testes/negocio.test.mjs`; aqui garantimos que a rota grava o valor e que a
   * tela do negócio mostra o caixa, que é a pergunta que faltava.
   * ═════════════════════════════════════════════════════════════════════════
   */
  /* procurar `valor_centavos: plano.preco_centavos` no arquivo inteiro casava
     com a chamada do Asaas e com o upsert da fatura, e passava mesmo com o
     campo FORA do insert da assinatura — que é onde o painel lê. A checagem
     tem que ser dentro do insert. */
  {
    const i = ck.indexOf('.from("assinaturas")\n    .insert(');
    const insert = i < 0 ? "" : ck.slice(i, i + 320);
    ok("o checkout grava o valor NO INSERT da assinatura (senão o MRR nasce zero)",
       /\.insert\(/.test(insert) && /valor_centavos:\s*plano\.preco_centavos/.test(insert),
       insert.replace(/\s+/g, " ").slice(0, 170) || "não achei o insert de assinaturas");
  }

  const telaNegocio = fs.readFileSync(path.join(RAIZ, "app/painel/negocio/page.tsx"), "utf8");
  ok("o painel separa receita recorrente (promessa) de caixa (extrato)",
     /Receita recorrente/.test(telaNegocio) && /o que entrou de verdade/.test(telaNegocio));
  ok("e mostra o que venceu sem pagamento", /caixa\.vencido/.test(telaNegocio));

  /**
   * ═════════════════════════════════════════════════════════════════════════
   * A FILA DE E-MAILS QUE NÃO ANDAVA.
   *
   * "e-mails proativos que nunca saem de próximos disparos": escritório sem
   * NENHUM usuário planeja e-mail em toda execução, não tem destinatário, e
   * volta amanhã igual. Eram 6 de 16 na base real. Misturados na mesma lista,
   * faziam o motor parecer quebrado.
   * ═════════════════════════════════════════════════════════════════════════
   */
  const telaEmails = fs.readFileSync(path.join(RAIZ, "app/painel/negocio/emails/page.tsx"), "utf8");
  /* olhar só por "separarFila" casava com a LINHA DO IMPORT e passava mesmo
     com a chamada trocada por `const sairao = previsao` — o defeito exato que
     a quebra proposital introduziu. A checagem é na chamada. */
  ok("a fila separa o que vai sair do que está travado sem destinatário",
     /=\s*separarFila\(previsao\)/.test(telaEmails) && /travados\.length/.test(telaEmails),
     (telaEmails.match(/const .*sairao.*=.*/) || ["não achei a chamada"])[0]);
  ok("e a contagem por grupo conta só o que REALMENTE sai",
     /for \(const p of sairao\)/.test(telaEmails));
  ok("o escritório órfão vira ação na fila do negócio, com conserto",
     /Escritório sem usuário/.test(fs.readFileSync(path.join(RAIZ, "lib/negocio.ts"), "utf8")));

  /* sem batimento, "o motor não rodou" e "rodou e não tinha nada" são
     indistinguíveis — e foi assim que a fila ficou dias parecendo entupida */
  const cron = fs.readFileSync(path.join(RAIZ, "app/api/cron/negocio/route.ts"), "utf8");
  ok("cada execução do motor deixa um batimento", /reguas_execucao/.test(cron));
  ok("e a tela mostra quando ele rodou pela última vez", /ultimaExec/.test(telaEmails));

  /**
   * ═════════════════════════════════════════════════════════════════════════
   * O CRON PRECISA CONSEGUIR LER A BASE — o bug mais caro desta sequência.
   *
   * `negocio_escritorios()` é SECURITY DEFINER e exigia superadmin. O cron usa
   * a service role, para quem `auth.uid()` é NULL: a função levantava
   * "acesso restrito". O erro era descartado (a linha desestruturava só o
   * `data`), a lista vinha vazia, e a resposta era {"planejados":0,"erros":[]}
   * — indistinguível de um dia sem nada a fazer. Dias mudos com a tela
   * mostrando 16 na fila, porque LÁ quem chama é a sessão do superadmin.
   * ═════════════════════════════════════════════════════════════════════════
   */
  const mig42 = path.join(RAIZ, "supabase/migrations/0042_cron_le_escritorios.sql");
  ok("existe a migration que deixa a service role ler os escritórios", fs.existsSync(mig42));
  if (fs.existsSync(mig42)) {
    const sql = fs.readFileSync(mig42, "utf8");
    /* A VARREDURA IGNORA COMENTÁRIOS, e isso não é detalhe: esta migration
       EXPLICA o bug em prosa, citando "service_role" e "current_user" no
       texto. Olhando o arquivo inteiro, a guarda passava mesmo com a
       liberação removida do código — porque a explicação continuava lá. */
    const codigo = sql.replace(/^\s*--.*$/gm, "");
    ok("a guarda nova aceita superadmin E service role",
       /= 'service_role'/.test(codigo) && /is_superadmin/.test(codigo),
       (codigo.match(/return[^;]*service_role[^;]*/) || ["não achei a liberação"])[0].trim());
    /* current_user dentro de SECURITY DEFINER é o DONO da função, não quem
       chamou: checar por ali daria "postgres" para todo mundo e liberaria geral */
    ok("...e não usa current_user, que mentiria dentro de SECURITY DEFINER",
       !/current_user/.test(codigo));
    ok("e a RPC de escritórios passou a usar a guarda nova",
       /negocio_escritorios[\s\S]*e_plataforma\(\)/.test(sql));
  }

  /**
   * ═════════════════════════════════════════════════════════════════════════
   * A TELA DE CONTAS PRECISA ENXERGAR AS CONTAS.
   *
   * Ela lê `tenants` pelo cliente do navegador, sujeita à RLS — e `tenants`
   * tinha UMA política: `id = tenant_atual()`. Uma linha, a própria. Era a
   * única tabela de plataforma sem política de gestor: faturas, chamados,
   * indicacoes, nps, ajuda, curso e assistente já tinham.
   * ═════════════════════════════════════════════════════════════════════════
   */
  const mig43 = path.join(RAIZ, "supabase/migrations/0043_contas_da_plataforma.sql");
  ok("existe a migration que deixa a plataforma ver todos os escritórios", fs.existsSync(mig43));
  if (fs.existsSync(mig43)) {
    const sql43 = fs.readFileSync(mig43, "utf8").replace(/^\s*--.*$/gm, "");
    ok("a política nova é sobre tenants e usa a guarda de plataforma",
       /on public\.tenants/.test(sql43) && /e_plataforma\(\)/.test(sql43));
    /* `tenants` é a raiz do grafo e as FK descem em CASCADE: um delete
       acidental na tela de administração apagaria a operação de um cliente */
    ok("...e NÃO concede delete (as FK descem em cascade)",
       !/for all/i.test(sql43) && !/for delete/i.test(sql43),
       (sql43.match(/for (all|delete)/i) || ["ok"])[0]);
  }

  const telaContas = fs.readFileSync(path.join(RAIZ, "app/painel/negocio/contas/page.tsx"), "utf8");
  /* RLS que recusa escrita não devolve erro: devolve zero linhas. Sem pedir a
     linha de volta, a tela diz "salvo" tendo salvo nada. */
  ok("a tela de contas confirma a gravação pedindo a linha de volta",
     /\.update\(campos\)[\s\S]{0,80}\.select\("id"\)/.test(telaContas) &&
     /!alterado\?\.length/.test(telaContas));

  /**
   * ═════════════════════════════════════════════════════════════════════════
   * A VARREDURA DE 04/08 — quatro defeitos que mandavam e-mail errado ou
   * perdiam dinheiro, cada um com sua guarda.
   * ═════════════════════════════════════════════════════════════════════════
   */
  {
    const rgc = fs.readFileSync(path.join(RAIZ, "lib/reguas.ts"), "utf8");

    /* o map de carregarContexto esquecia `termos`, e a régua "laudo sem termo"
       ia para quem tinha TODOS os termos — de novo a cada laudo novo */
    const iMap = rgc.indexOf("})) as EscritorioRegua[]");
    const mapa = iMap < 0 ? "" : rgc.slice(Math.max(0, iMap - 1600), iMap);
    ok("o contexto das réguas copia `termos` da RPC",
       /termos:\s*Number\(/.test(mapa), "o map não copia termos");
    ok("...e também is_teste / emails_optout, que decidem quem NÃO recebe",
       /is_teste:/.test(mapa) && /emails_optout:/.test(mapa));

    /* a chave-mestra não pode falhar aberta */
    ok("erro ao ler a config PARA o motor (senão as réguas religam sozinhas)",
       /cfgErro/.test(rgc) && /não consegui ler a configuração/.test(rgc));

    /* a escada de cobrança dependia de um vencimento que ninguém gravava */
    const ckv = fs.readFileSync(path.join(RAIZ, "app/api/checkout/route.ts"), "utf8");
    /* `vencimento: cobranca.vencimento` aparece DUAS vezes no arquivo (o
       update da assinatura e o upsert da fatura). Procurar no arquivo inteiro
       passava com o campo removido do update da assinatura — que é o único que
       a escada de cobrança lê. A checagem é no bloco certo. */
    const iUpd = ckv.indexOf('.from("assinaturas")\n      .update(');
    const upd = iUpd < 0 ? "" : ckv.slice(iUpd, iUpd + 320);
    ok("o checkout grava o vencimento NA ASSINATURA (sem ele a escada não cobra)",
       /vencimento: cobranca\.vencimento/.test(upd),
       upd.replace(/\s+/g, " ").slice(0, 150) || "não achei o update da assinatura");
    ok("e reserva a chave da régua ao mandar o link (senão vai duas vezes)",
       /chave_unica: `cobranca_gerada:\$\{assinatura\.id\}`/.test(ckv));
  }

  {
    const wh2 = fs.readFileSync(path.join(RAIZ, "app/api/asaas/route.ts"), "utf8");
    /* PAYMENT_CHECKOUT_VIEWED e afins caíam no default "pendente" e eram
       gravados por cima de uma fatura PAGA, apagando o pago_em */
    /* olhar só por "jaLiquidada" casava com a DECLARAÇÃO e passava com a
       condição trocada por `if (false)` — a checagem é no if */
    ok("evento inócuo não derruba fatura já liquidada",
       /if \(jaLiquidada && status === "pendente"\)/.test(wh2) && /doPagamento/.test(wh2),
       (wh2.match(/if \([^)]*jaLiquidada[^)]*\)/) || ["não achei a guarda"])[0]);
    /* data-calendário do Asaas não pode virar new Date(): seria o dia anterior */
    ok("o pago_em não perde um dia no fuso",
       /T12:00:00-03:00/.test(wh2) && !/pago_em: pagoEm \? new Date\(pagoEm\)/.test(wh2));

    const as2 = fs.readFileSync(path.join(RAIZ, "lib/asaas.ts"), "utf8");
    /* "sincronizar" ativava a assinatura e deixava a fatura "em aberto" — foi
       o bug que o dono teve que consertar na mão */
    const iRec = as2.indexOf("export async function reconciliarAssinatura");
    const rec = iRec < 0 ? "" : as2.slice(iRec, as2.indexOf("export async function importarFaturas"));
    ok("sincronizar também marca a FATURA como paga",
       /\.from\("faturas"\)/.test(rec) && /status: "pago"/.test(rec),
       "reconciliarAssinatura não toca em faturas");
  }

  {
    const ng = fs.readFileSync(path.join(RAIZ, "app/api/negocio/route.ts"), "utf8");
    /* a tela manda o objeto de config inteiro com um `base` congelado: sem
       merge no servidor, ajustar um campo religava as réguas desligadas */
    ok("a configuração é mesclada no servidor, não substituída",
       /\.\.\.anterior, \.\.\.\(valor as Record<string, unknown>\)/.test(ng));
    /* a assinatura era inserida ANTES de validar o documento, e o 400 não
       desfazia: cada clique deixava uma pendente fantasma que silenciava as
       réguas de conversão daquele escritório */
    ok("gerar_cobranca valida o documento ANTES de criar a assinatura",
       ng.indexOf("ainda não tem CPF/CNPJ cadastrado") < ng.indexOf('origem: "painel"'));
    ok("e o motivo do Asaas sobe em vez de virar ok:true",
       /cob\.ativo && !cob\.checkout_url/.test(ng));
  }

  /**
   * ═════════════════════════════════════════════════════════════════════════
   * A SEGUNDA LEVA DA VARREDURA — o que estava triado e agora está fechado.
   * ═════════════════════════════════════════════════════════════════════════
   */
  {
    const wh3 = fs.readFileSync(path.join(RAIZ, "app/api/asaas/route.ts"), "utf8");

    /* dinheiro devolvido tem que derrubar o acesso; chargeback ABERTO é
       acusação, não veredito — cortar quem talvez tenha razão custa o cliente */
    ok("estorno concluído revoga o acesso",
       /const DEVOLVIDO = new Set/.test(wh3) && /if \(devolvido && assinaturaId\)/.test(wh3));
    ok("...e chargeback apenas ABERTO mantém o acesso",
       /const CONTESTADO = new Set/.test(wh3) && /contestado: true/.test(wh3));

    /* 200 sem ter gravado faz o Asaas descartar o evento para sempre */
    ok("sem service role o webhook devolve 5xx, para o Asaas reenviar",
       /if \(!admin\)[\s\S]{0,240}status: 503/.test(wh3));

    /* reprocessamento não pode tirar acesso já concedido */
    ok("a validade nunca regride num evento repetido",
       /jaTinha && jaTinha > data \? jaTinha : data/.test(wh3));

    /* as colunas que a aba Contas soma e ninguém escrevia */
    ok("o pagamento alimenta as colunas de cobrança do escritório",
       /ultimo_pagamento:/.test(wh3) && /valor_mensal: mensalizado/.test(wh3));
  }

  {
    const aj = fs.readFileSync(path.join(RAIZ, "app/painel/negocio/ajuda/page.tsx"), "utf8");
    /* coluna que o formulário grava tem que ser coluna que o formulário leu */
    const sel = (aj.match(/\.select\("id, slug[^"]*"\)/) || [""])[0];
    ok("o editor de ajuda LÊ tipo e destaque antes de gravá-los",
       /tipo/.test(sel) && /destaque/.test(sel), sel || "não achei o select");
    ok("e publicado_em só é gravado na PRIMEIRA publicação",
       /!jaPublicadoEm \? \{ publicado_em/.test(aj));

    const ncalc = fs.readFileSync(path.join(RAIZ, "lib/negocio.ts"), "utf8");
    ok("MRR em risco não conta o mesmo escritório duas vezes", /emRisco\.set\(e\.id, e\)/.test(ncalc));
    /* procurar só pelo nome da variável passava com a CONTA revertida: a
       declaração continuava lá, sem ninguém usar. A checagem é na expressão. */
    ok("a conversão do funil não passa de 100%",
       /const conversao = comLaudo \? Math\.round\(\(provaramEPagaram \/ comLaudo\)/.test(ncalc),
       (ncalc.match(/const conversao = [^;]*/) || ["não achei a conta"])[0]);
    ok("e o painel avisa quando um número zerou por falha de leitura",
       /avisos\.push/.test(ncalc));

    const calc2 = fs.readFileSync(path.join(RAIZ, "lib/negocio-calc.ts"), "utf8");
    /* o mês em UTC zerava o caixa depois das 21h do dia 31 */
    ok("o mês do caixa é o do calendário brasileiro",
       /export function mesBr/.test(calc2) && !/hoje\.toISOString\(\)\.slice\(0, 7\)/.test(calc2));
  }

  {
    const rg2 = fs.readFileSync(path.join(RAIZ, "lib/reguas.ts"), "utf8");
    /* degrau desligado não pode bloquear os de baixo */
    ok("a escada de cobrança só considera degrau LIGADO",
       /\.filter\(\(\[chave\]\) => !!regras\[chave\]\)/.test(rg2));
    /* a régua cobre um período; a chave por fase mandava dois e-mails iguais */
    ok("o pós-janela é um toque só, não um por fase",
       /`pos_janela_revisao:\$\{e\.id\}`/.test(rg2));
    /* aviso de vencimento pressupõe que já houve tempo de pagar */
    ok("o pré-vencimento não sai na rodada em que a cobrança nasce",
       /!geradaSaiAgora/.test(rg2));
    /* o corte de cota caía sempre nos mesmos, e em quem nem podia receber */
    ok("o limite por execução corta quem VAI sair, não quem está travado",
       /out\.filter\(\(x\) => !!x\.para\)\.slice\(0, teto\)/.test(rg2));
    ok("e as vencidas são apuradas pelo dia do Brasil",
       /America\/Sao_Paulo/.test(rg2.slice(rg2.indexOf("export async function vencidasPendentes"))));

    const ng2 = fs.readFileSync(path.join(RAIZ, "app/api/negocio/route.ts"), "utf8");
    /* a MENSAGEM continua no arquivo mesmo com a guarda desligada (`if (false)`):
       a checagem é na condição */
    ok("plano com identificador vazio é recusado",
       /if \(!id\) \{/.test(ng2) && /Não consegui derivar um identificador/.test(ng2),
       (ng2.match(/if \(![a-z]+\) \{[\s\S]{0,60}derivar/) || ["a guarda do id sumiu"])[0].slice(0, 60));

    /**
     * `indexOf` DE ALGO QUE NÃO EXISTE É -1, e -1 é menor que tudo: a
     * comparação de ordem passava justamente quando a checagem era REMOVIDA.
     * Exigir a presença antes de comparar a ordem é o que fecha o buraco.
     */
    const iExiste = ng2.indexOf('.select("id").eq("id", id).maybeSingle()');
    const iLimpa = ng2.indexOf("destaque: false");
    ok("o destaque só é limpo depois de confirmar que o plano existe",
       iExiste >= 0 && iLimpa >= 0 && iExiste < iLimpa,
       { confirmacao: iExiste, limpeza: iLimpa });
    ok("limpar a data de acesso também espelha em valido_ate",
       /"vencimento" in patch/.test(ng2));
  }

  /**
   * ═════════════════════════════════════════════════════════════════════════
   * O AVISO AO CONTATIA — a costura que era manual.
   *
   * Sem ele, quem cria conta na terça recebe "você conhece o Enquadria?" na
   * quarta, porque continua na cadência de prospecção até alguém aplicar a tag
   * à mão. As guardas abaixo protegem as três propriedades que fazem isto
   * poder existir num caminho crítico.
   * ═════════════════════════════════════════════════════════════════════════
   */
  {
    const ct = fs.readFileSync(path.join(RAIZ, "lib/contatia.ts"), "utf8");

    /* o segredo não pode trafegar: assina-se `timestamp.corpo` */
    ok("o aviso é assinado com HMAC sobre timestamp+corpo",
       /createHmac\("sha256", segredo\)/.test(ct) && /\$\{ts\}\.\$\{corpo\}/.test(ct));
    /* sem timeout, um CRM lento vira espera na cara de quem confirmou o e-mail */
    ok("...com timeout, para não segurar o cadastro", /AbortController/.test(ct) && /TIMEOUT_MS/.test(ct));
    /* a função NÃO pode lançar: ela roda no meio do login */
    ok("...e nunca lança: devolve o motivo em vez de estourar",
       /catch \(e\)/.test(ct) && !/throw /.test(ct));

    const cb = fs.readFileSync(path.join(RAIZ, "app/auth/callback/route.ts"), "utf8");
    ok("o cadastro ativo é avisado na confirmação do e-mail",
       /avisarContatia/.test(cb) && /cadastro_ativo/.test(cb));
    /* a chave é o TENANT: clicar duas vezes no link de confirmação não pode
       inscrever a pessoa duas vezes na cadência do outro lado */
    ok("...com chave idempotente por escritório",
       /chaveDe\("cadastro_ativo", tenantId \?\? user\.id\)/.test(cb));
    /* falha do CRM não pode impedir alguém de entrar no produto */
    ok("...dentro de try/catch, sem segurar o redirecionamento",
       /try \{[\s\S]{0,900}avisarContatia[\s\S]{0,600}\} catch/.test(cb));

    const wh4 = fs.readFileSync(path.join(RAIZ, "app/api/asaas/route.ts"), "utf8");
    ok("quem paga vira 'Cliente', com evento próprio",
       /evento: "assinatura_ativa"/.test(wh4));

    const ng3 = fs.readFileSync(path.join(RAIZ, "app/api/negocio/route.ts"), "utf8");
    ok("existe reprocesso para quem se cadastrou antes do webhook",
       /case "avisar_contatia"/.test(ng3));
    /* conta de teste marcada no painel não pode entrar no CRM */
    ok("...que respeita is_teste e pula escritório sem usuário",
       /if \(t\.is_teste\)/.test(ng3) && /if \(!email\)/.test(ng3));
  }

  const rg = fs.readFileSync(path.join(RAIZ, "lib/reguas.ts"), "utf8");
  /* olhar por "error" no arquivo inteiro casaria com qualquer coisa: a
     checagem é na desestruturação da RPC, que era exatamente o que faltava */
  ok("o contexto das réguas LÊ o erro da RPC em vez de descartá-lo",
     /\{ data: escRaw, error: escErro \}/.test(rg),
     (rg.match(/const \[\{ data: escRaw[^\]]*/) || ["não achei a leitura"])[0].slice(0, 90));
  ok("e fonte quebrada não vira fila vazia silenciosa",
     /if \(ctx\.erro\)/.test(rg) && /erros: \[ctx\.erro\]/.test(rg));
  ok("o cron não relata 0 planejados sem dizer nada",
     /planejados === 0 && !r\.erros\.length/.test(cron));

  const tela = fs.readFileSync(path.join(RAIZ, "app/painel/planos/page.tsx"), "utf8");
  ok("a tela de planos tem onde mostrar o erro da contratação",
     /erroCheckout/.test(tela));
  ok("e trata o pop-up bloqueado, que também parece clique perdido",
     /bloqueou a janela/.test(tela));
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
