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
import { roteiroDaEmpresa, progressoRoteiro, leituraDoDinheiro } from "./roteiro.js";

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
  ok(/a empresa ganha/.test(t), "diz de quem é o dinheiro — da EMPRESA, não do escritório", t);
  ok(/3,9 meses/.test(t), "payback em português e com vírgula", t);
  ok(/se paga em/.test(t), "payback curto é apresentado como se paga", t);
  ok(/a conta se inverte/.test(t), "o risco do repasse não fica escondido", t);
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
