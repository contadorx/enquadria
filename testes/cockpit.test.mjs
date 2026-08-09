/**
 * TESTE DO NÚCLEO DO COCKPIT — funções puras, sem banco, sem React.
 *
 * A regra "em que pé está esta empresa e qual é a próxima ação" é a única coisa
 * que o cockpit inteiro consulta. Se ela quebrar, a fila, a linha de produção e
 * os avisos mentem juntos — e mentem em documento assinado por contador.
 *
 * Como rodar (o projeto não tem runner; isto é TypeScript compilado na hora):
 *
 *   npx tsc lib/cockpit.ts lib/triagem.ts lib/motor.ts lib/premissas-padrao.ts \
 *     --outDir .tmp-testes --module esnext --target es2020 \
 *     --moduleResolution bundler --skipLibCheck
 *   node --input-type=module -e "
 *     import('./testes/cockpit.test.mjs')" # ou: copie este arquivo para .tmp-testes
 *
 * Mais simples, do jeito que foi validado:
 *   npx tsc ... --outDir .tmp-testes   (linha acima)
 *   cp testes/cockpit.test.mjs .tmp-testes/ && cd .tmp-testes
 *   sed -i 's|"./cockpit.js"|"./cockpit.js"|' cockpit.test.mjs && node cockpit.test.mjs
 */

import {
  montarFila,
  contarEsteira,
  estadoDaColeta,
  ordenarFila,
  naMesa,
  filtrarPorEtapa,
  buscar,
  proximoEmpurrao,
  porOndeComecar,
} from "./cockpit.js";

const empresas = [
  { id: "1", cnpj: "11222333000181", razao_social: "Alfa Atacado Ltda", cnae_principal: "4611-7/00", faixa: "A", motivo_triagem: "B2B", prioridade_maxima: true, rbt12: 1200000, anexo: 1, contato_nome: "Ana", contato_email: "a@a.com" },
  { id: "2", cnpj: "22333444000192", razao_social: "Beta Serviços ME", cnae_principal: "6201-5/01", faixa: "B", motivo_triagem: "misto", prioridade_maxima: false, rbt12: null, anexo: 3, contato_nome: null, contato_email: null },
  { id: "3", cnpj: "33444555000103", razao_social: "Gama Padaria", cnae_principal: "5611-2/01", faixa: "D", motivo_triagem: "B2C", prioridade_maxima: false, rbt12: null, anexo: 1, contato_nome: null, contato_email: null },
  { id: "4", cnpj: "44555666000114", razao_social: "Delta MEI", cnae_principal: "4711-3/02", faixa: "MEI", motivo_triagem: "MEI", prioridade_maxima: false, rbt12: null, anexo: 1, contato_nome: null, contato_email: null },
];
const analises = [
  { id: "an1", empresa_id: "1", saida: "S4", re: 0.06, prioridade: true, parametros: {}, calculado_em: "2026-07-20T10:00:00Z" },
  { id: "an2", empresa_id: "2", saida: "S1", re: 0.2, prioridade: false, parametros: { origem_premissas: "lote_cnae" }, calculado_em: "2026-07-21T10:00:00Z" },
];
const laudos = [{ id: "l1", analise_id: "an1", numero: 7 }];
const termos = [];

const linhas = montarFila(empresas, analises, laudos, termos);
const por = Object.fromEntries(linhas.map((l) => [l.id, l]));

let falhas = 0;
const ok = (cond, msg) => {
  if (!cond) {
    falhas++;
    console.log("FALHOU:", msg);
  } else console.log("ok:", msg);
};

ok(por["1"].acao === "termo", "empresa com laudo e contato -> enviar termo");
ok(por["2"].acao === "confirmar", "análise de lote não emite laudo sem confirmar premissas");
ok(por["3"].acao === "analisar", "faixa D sem análise -> analisar");
ok(por["4"].acao === "fora", "MEI fica fora da janela");
ok(por["1"].laudo_numero === 7, "laudo casado por analise_id");
ok(por["2"].estimada === true, "premissa estimada detectada");

const e = contarEsteira(linhas);
ok(
  e.importadas === 4 && e.decidem === 2 && e.analisadas === 2 && e.laudos === 1 && e.assinados === 0,
  "esteira: " + JSON.stringify(e)
);

/* ── O QUE ESTÁ NA MESA passou a ser a carteira inteira (08/08/2026) ────────
   A regra antiga era "faixa A sem laudo". O mapa de risco da PRIMEIRA tela
   sempre prometeu as quatro faixas — (A+B) × honorário mais (C+D) × honorário
   curto — e a partir do segundo dia o cockpit mostrava um número que ignorava
   a faixa B inteira e a metade da carteira que gera laudo curto. Prometer numa
   tela e esconder na seguinte é pior do que não prometer.
   A massa tem: 1 empresa A (com laudo), 1 B (sem), 1 D (sem), 1 MEI. */
const mesaCheia = naMesa(linhas, 600, 150);
ok(mesaCheia.completos === 1, "faixa A já com laudo sai da mesa; a B sem laudo fica");
ok(mesaCheia.curtos === 1, "a faixa D entra na mesa como laudo curto");
ok(mesaCheia.valor === 600 + 150, "a mesa soma os dois honorários: " + mesaCheia.valor);
ok(naMesa(linhas, 600, 150).empresas === 2, "MEI nunca entra na mesa");

const mesaSemLaudo = naMesa(montarFila(empresas, analises, [], []), 600, 150);
ok(mesaSemLaudo.completos === 2 && mesaSemLaudo.valor === 1200 + 150,
   "sem nenhum laudo emitido, A e B entram como completos: " + JSON.stringify(mesaSemLaudo));

/* a esteira ganhou a coluna que faltava: quem tem permanência a documentar */
const esteiraCheia = contarEsteira(linhas);
ok(esteiraCheia.permanencia === 1 && esteiraCheia.permanencia_pendentes === 1,
   "esteira conta a permanência a documentar: " + JSON.stringify(esteiraCheia));
ok(filtrarPorEtapa(linhas, "permanencia").length === 1,
   "o clique na coluna nova filtra as faixas C e D");
/* e a faixa D sem análise deixou de cair no degrau de "acabou de entrar" */
ok(por["3"].etapa === "decide", "faixa D sem análise está na esteira, não em 'importada'");

ok(ordenarFila(linhas)[0].id === "1", "prioridade máxima no topo");
ok(filtrarPorEtapa(linhas, "laudos").length === 1, "filtro por etapa laudo");
ok(buscar(linhas, "gama").length === 1, "busca por nome sem acento");
ok(buscar(linhas, "22333444").length === 1, "busca por CNPJ");
ok(buscar(linhas, "6201").length === 1, "busca por CNAE");

const antes = linhas.map((l) => l.id).join();
ordenarFila(linhas);
ok(antes === linhas.map((l) => l.id).join(), "ordenarFila não muta a lista original");

/* ─────────────────────────── O EMPURRÃO (conserto 3 e 5 do funil) ────── */

// A fixture do topo já tem laudo na empresa 1, então o empurrão dela é o
// termo. Para testar o primeiro degrau, monto uma carteira SEM laudo nenhum.
const semLaudo = montarFila(empresas, analises, [], []);
const e1 = proximoEmpurrao(semLaudo);
ok(e1?.tipo === "emitir_primeiro", "carteira analisada e sem laudo pede o primeiro laudo");
ok(e1?.alvo?.razao_social === "Alfa Atacado Ltda", "aponta a empresa, não só a ação");

// a empresa 2 tem premissas ESTIMADAS (origem lote_cnae) — não pode ser
// escolhida para o primeiro laudo, porque laudo em cima de chute é o erro
// que não tem conserto
ok(porOndeComecar(semLaudo)?.id === "1", "não sugere empresa com premissa estimada");

// entre duas candidatas boas, ganha a de menor repasse exigido
const duas = montarFila(
  [empresas[0], { ...empresas[1], id: "9", faixa: "A", prioridade_maxima: true }],
  [
    { id: "anA", empresa_id: "1", saida: "S4", re: 0.09, prioridade: true, parametros: {}, calculado_em: "2026-07-20T10:00:00Z" },
    { id: "anB", empresa_id: "9", saida: "S4", re: 0.03, prioridade: true, parametros: {}, calculado_em: "2026-07-20T10:00:00Z" },
  ],
  [], []
);
ok(porOndeComecar(duas)?.id === "9", "empatadas em prioridade, ganha a de menor repasse");

// com laudo emitido e contato, o empurrão vira o termo
const e2 = proximoEmpurrao(linhas);
ok(e2?.tipo === "termo_pendente", "laudo emitido sem termo vira o empurrão do termo");
ok(e2?.quantidade === 1, "conta quantos estão sem termo");

// laudo emitido para quem NÃO tem contato não vira cobrança de termo:
// não dá para pedir assinatura de quem não tem e-mail
const semContato = montarFila(
  [{ ...empresas[0], contato_nome: null, contato_email: null }],
  [{ id: "an1", empresa_id: "1", saida: "S4", re: 0.06, prioridade: true, parametros: {}, calculado_em: "2026-07-20T10:00:00Z" }],
  [{ id: "l1", analise_id: "an1", numero: 7 }],
  []
);
ok(proximoEmpurrao(semContato) === null, "sem contato não cobra termo — cobraria o impossível");

// carteira só com MEI e descarte não tem o que empurrar
const soFora = montarFila([empresas[3]], [], [], []);
ok(proximoEmpurrao(soFora) === null, "silêncio quando não há nada a fazer");

ok(proximoEmpurrao([]) === null, "carteira vazia não inventa empurrão");


/* ══════════════════ O ESTADO DO FORMULÁRIO E O QUE AINDA ESTÁ DE PÉ ══════
 *
 * Duas informações que o contador só conseguia obtendo empresa por empresa —
 * e que erram em silêncio: uma fila que diz "aguardando" para quem já
 * respondeu faz o contador ligar cobrando quem já entregou.
 */

ok(estadoDaColeta(null) === "nao", "sem coleta, nunca foi pedido");
ok(estadoDaColeta({ empresa_id: "1", status: "cancelada", respondido_em: null, aplicada_em: null }) === "nao",
   "coleta cancelada volta a ser 'nunca pedi'");
ok(estadoDaColeta({ empresa_id: "1", status: "aberta", respondido_em: null, aplicada_em: null }) === "aguardando",
   "enviada e sem resposta é aguardando");
ok(estadoDaColeta({ empresa_id: "1", status: "respondida", respondido_em: "2026-08-01T10:00:00Z", aplicada_em: null }) === "respondida",
   "respondida e não aplicada é o que pede ação");
ok(estadoDaColeta({ empresa_id: "1", status: "respondida", respondido_em: "2026-08-01T10:00:00Z", aplicada_em: "2026-08-02T10:00:00Z" }) === "usada",
   "aplicada na análise não pede mais nada");
// status ainda 'aberta' mas com data de resposta: o banco pode chegar assim
ok(estadoDaColeta({ empresa_id: "1", status: "aberta", respondido_em: "2026-08-01T10:00:00Z", aplicada_em: null }) === "respondida",
   "a data de resposta vale mais que o status pendurado");

{
  // pedir de novo não pode apagar da tela a resposta que já chegou
  const comColeta = montarFila(empresas, [], [], [], [
    { empresa_id: "1", status: "aberta", respondido_em: null, aplicada_em: null },
    { empresa_id: "1", status: "respondida", respondido_em: "2026-08-01T10:00:00Z", aplicada_em: null },
    { empresa_id: "2", status: "aberta", respondido_em: null, aplicada_em: null },
  ]);
  const de = (id) => comColeta.find((l) => l.id === id).coleta;
  ok(de("1") === "respondida", "duas coletas na mesma empresa: vence a mais avançada", de("1"));
  ok(de("2") === "aguardando", "quem só tem pedido aberto continua aguardando");
  ok(de("3") === "nao", "quem nunca recebeu formulário não ganha selo");
}

{
  // o número de "precisam decidir" é universo; o pendente é o que sobra de pé
  const est = contarEsteira(linhas);
  ok(est.decidem >= est.decidem_pendentes, "pendentes nunca passam do universo", est);
  const todasComLaudo = montarFila(
    empresas,
    [{ id: "an1", empresa_id: "1", saida: "S4", re: 0.06, prioridade: true, parametros: {}, calculado_em: "2026-07-20T10:00:00Z" },
     { id: "an2", empresa_id: "2", saida: "S1", re: 0.2, prioridade: false, parametros: {}, calculado_em: "2026-07-21T10:00:00Z" }],
    [{ id: "l1", analise_id: "an1", numero: 1 }, { id: "l2", analise_id: "an2", numero: 2 }],
    []
  );
  const e2 = contarEsteira(todasComLaudo);
  ok(e2.decidem === 2 && e2.decidem_pendentes === 0,
     "com laudo em todas, o universo continua 2 e o pendente zera", e2);
  ok(filtrarPorEtapa(todasComLaudo, "decidem_pendentes").length === 0,
     "e o recorte das pendentes fica vazio");
  ok(filtrarPorEtapa(linhas, "decidem_pendentes").every((l) => !l.laudo_id),
     "o recorte das pendentes nunca traz empresa com laudo");
}


console.log(falhas === 0 ? "\nTODOS OS TESTES PASSARAM" : `\n${falhas} FALHAS`);
process.exit(falhas ? 1 : 0);
