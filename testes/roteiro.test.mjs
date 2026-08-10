/**
 * TESTE DO ROTEIRO E DA LEITURA EM REAIS.
 *
 * Duas coisas que só erram em silêncio:
 *
 *  · o roteiro marcando como pendente um passo já feito (a lista perde a
 *    credibilidade na primeira vez que isso acontece e ninguém mais lê);
 *  · a frase de leitura dizendo que há ganho quando não há — aqui o erro sai
 *    da tela e vai para dentro de uma reunião com o cliente.
 *
 * Rodado pelo testes/rodar-tudo.mjs junto das demais suítes puras.
 */
import {
  roteiroDaEmpresa,
  progressoRoteiro,
  leituraDoDinheiro,
  ACOES_DAS_PREMISSAS,
} from "./roteiro.js";

let f = 0;
const ok = (c, m, e) => {
  if (!c) { f++; console.log("FALHOU:", m, e === undefined ? "" : JSON.stringify(e)); }
  else console.log("ok:", m);
};

const vazio = { temColeta: false, temAnalise: false, temLaudo: false, temTermo: false, assinado: false };
const estado = (x) => roteiroDaEmpresa({ ...vazio, ...x });
const porChave = (ps, k) => ps.find((p) => p.chave === k).estado;

/* ─────────────────────────────────── o roteiro ──────────────────────── */
{
  const p = estado({});
  ok(porChave(p, "dados") === "agora", "empresa nova começa em reunir premissas");
  ok(p.filter((x) => x.estado === "agora").length === 1, "só existe UM passo atual");
  ok(p.filter((x) => x.estado === "depois").length === 4, "os outros quatro esperam");
}
{
  // quem preencheu na mão nunca pediu formulário — e não pode ficar devendo
  const p = estado({ temAnalise: true });
  ok(porChave(p, "dados") === "feito", "análise salva também fecha o passo das premissas");
  ok(porChave(p, "laudo") === "agora", "com análise salva, o próximo passo é emitir");
}
{
  const p = estado({ temColeta: true });
  ok(porChave(p, "dados") === "feito", "cliente que respondeu fecha o passo das premissas");
  ok(porChave(p, "analise") === "agora", "e o atual passa a ser salvar a análise");
}
{
  const p = estado({ temColeta: true, temAnalise: true, temLaudo: true });
  ok(porChave(p, "termo") === "agora", "com laudo emitido, o atual é o termo");
  ok(progressoRoteiro(p).feitos === 3, "conta 3 de 5", progressoRoteiro(p));
}
{
  const p = estado({ temColeta: true, temAnalise: true, temLaudo: true, temTermo: true, assinado: true });
  ok(p.every((x) => x.estado === "feito"), "esteira fechada: nenhum passo atual sobra");
  ok(progressoRoteiro(p).feitos === 5, "5 de 5");
}
{
  // termo assinado sem laudo não deveria existir, mas se o banco trouxer isso
  // o roteiro não pode travar num passo já cumprido mais à frente
  const p = estado({ temAnalise: true, temTermo: true, assinado: true });
  ok(porChave(p, "laudo") === "agora", "buraco no meio vira o passo atual, não some");
  ok(porChave(p, "termo") === "feito", "e o que já existe continua marcado como feito");
}

/* ────────────── estimativa do lote NÃO fecha passo (10/08/2026) ──────── */
/**
 * A trava do defeito que quebrou uma gravação: o lote por CNAE grava análise,
 * `temAnalise` virava true, e os DOIS primeiros passos nasciam riscados. A tela
 * dizia "2 de 5" sobre trabalho que ninguém fez, e apontava como próximo passo
 * justamente o único que não se deve fazer antes de conferir — emitir o laudo.
 */
{
  const p = estado({ temAnalise: true, premissasEstimadas: true });
  ok(porChave(p, "dados") === "agora", "premissa estimada NÃO fecha o passo das premissas");
  ok(porChave(p, "analise") !== "feito", "nem fecha o passo de salvar a análise");
  ok(porChave(p, "laudo") === "depois", "e o laudo continua esperando, não vira o atual");
  ok(progressoRoteiro(p).feitos === 0, "0 de 5: chute do CNAE não é progresso", progressoRoteiro(p));
}
{
  // e o texto do passo da análise muda para dizer a tarefa real
  const p = estado({ temColeta: true, temAnalise: true, premissasEstimadas: true });
  const a = p.find((x) => x.chave === "analise");
  ok(/Conferir/.test(a.titulo), "com estimativa, o passo pede CONFERIR, não só salvar", a.titulo);
  ok(/estimativa, não a sua análise/.test(a.detalhe), "e o detalhe nomeia o que a tela é");
}

/* ──────────────── os três caminhos de reunir as premissas ───────────── */
{
  const p = estado({});
  const dados = p.find((x) => x.chave === "dados");
  ok(Array.isArray(dados.acoes) && dados.acoes.length === 3, "o passo atual oferece as três portas");
  const portas = (dados.acoes ?? []).map((x) => x.caminho);
  ok(
    portas.join(",") === "coleta,estimado,direto",
    "na ordem do mais forte para o mais rápido",
    portas
  );
  ok(
    p.filter((x) => x.chave !== "dados").every((x) => x.acoes === undefined),
    "nenhum outro passo carrega ação — oferecer porta para passo que não chegou é convidar a pular a ordem"
  );
}
{
  // ações só no passo ATUAL: com o passo das premissas já feito, elas somem
  const p = estado({ temColeta: true });
  ok(p.find((x) => x.chave === "dados").acoes === undefined, "passo feito não oferece caminho");
  ok(p.find((x) => x.chave === "analise").acoes === undefined, "e o atual seguinte também não");
}
{
  const direto = ACOES_DAS_PREMISSAS.find((x) => x.caminho === "direto");
  ok(/em branco/i.test(direto.efeito), "o caminho 'direto' PROMETE formulário em branco", direto.efeito);
  const estimado = ACOES_DAS_PREMISSAS.find((x) => x.caminho === "estimado");
  ok(/estimad/i.test(estimado.efeito), "e o 'estimado' avisa que a origem fica registrada como estimada");
  ok(
    ACOES_DAS_PREMISSAS.every((x) => x.rotulo.trim() && x.efeito.trim()),
    "toda porta diz o que acontece ao ser aberta — nome de botão não é explicação"
  );
}

/* ─────────────────────────────── a leitura em reais ─────────────────── */
ok(leituraDoDinheiro(null) === null, "sem números, nenhuma frase");
ok(leituraDoDinheiro({ receita: null }) === null, "sem receita informada, nenhuma frase");
{
  const t = leituraDoDinheiro({ receita: 1_000_000, ganho_anual: 0, custo_anual: 6000, payback_meses: null, absorvido_anual: 12000 });
  ok(/não gera ganho/.test(t), "ganho zero é dito como ausência de ganho", t);
  ok(/12\.000/.test(t), "e o que ela absorveria continua na frase", t);
}
{
  const t = leituraDoDinheiro({ receita: 1_000_000, ganho_anual: 18400, custo_anual: 6000, payback_meses: 3.9, absorvido_anual: 9000 });
  ok(/a empresa chega/.test(t), "diz de quem é o dinheiro — da EMPRESA, não do escritório", t);
  ok(/3,9 meses/.test(t), "payback em português e com vírgula", t);
  ok(/se paga em/.test(t), "payback curto é apresentado como se paga", t);
  ok(/a conta se inverte/.test(t), "o risco do repasse não fica escondido", t);
  /**
   * O NÚMERO É O TETO DE UMA NEGOCIAÇÃO, E A FRASE TEM DE DIZER ISSO.
   *
   * `ganho_anual` é a faixa de negociação inteira convertida em reais — o que a
   * empresa levaria capturando TUDO o que está na mesa. "A empresa ganha cerca
   * de X por ano" afirmava o topo dessa faixa como resultado esperado, no mesmo
   * documento que declara, na seção da pressão comercial, que nada garante o
   * repasse. É a fronteira entre estimativa de cenário e promessa de resultado.
   */
  ok(/Se o repasse for aceito/.test(t), "o ganho vem condicionado ao repasse, não afirmado", t);
  ok(/teto da faixa de negociação, não o resultado esperado/.test(t),
     "e a frase nomeia o número como teto", t);
  ok(/no piso do repasse a empresa apenas não perde/.test(t),
     "com o piso à vista: sem ele, o leitor supõe que o teto é o meio da faixa", t);
  ok(!/a empresa ganha cerca de/.test(t), "e a afirmação antiga não voltou", t);
}
{
  const t = leituraDoDinheiro({ receita: 1_000_000, ganho_anual: 5000, custo_anual: 9000, payback_meses: 21.6, absorvido_anual: null });
  ok(/só se paga em 21,6 meses/.test(t), "payback longo é dito como ressalva, não como vitória", t);
}
{
  const t = leituraDoDinheiro({ receita: 500_000, ganho_anual: 8000, custo_anual: null, payback_meses: null, absorvido_anual: null });
  ok(/ainda não foi informado/.test(t), "sem custo declarado, a frase não inventa payback", t);
  ok(!/meses/.test(t), "e não fala em meses");
}

if (f) { console.log(`\n${f} FALHA(S)`); process.exit(1); }
console.log("\nroteiro: tudo passou");
