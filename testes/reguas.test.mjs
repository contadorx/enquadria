/**
 * TESTE DAS RÉGUAS — o único código deste projeto que MANDA E-MAIL SOZINHO.
 *
 * Erro aqui não aparece na tela de ninguém: aparece na caixa de entrada de um
 * contador que virou cliente, e não tem como desfazer. As duas formas de errar
 * são simétricas e igualmente caras:
 *   · mandar o que não devia (ruído, descadastro, reputação do domínio);
 *   · não mandar o que devia (o funil vaza em silêncio).
 *
 * Rodado pelo testes/rodar-tudo.mjs junto das demais suítes puras.
 */

import { planejar } from "./reguas.js";

let f = 0;
const ok = (c, m, e) => {
  if (!c) { f++; console.log("FALHOU:", m, e === undefined ? "" : JSON.stringify(e)); }
  else console.log("ok:", m);
};

const hoje = new Date();
const diasAtras = (n) => new Date(hoje.getTime() - n * 86400000).toISOString();

const REGRA = (chave, dias = 0) => ({
  chave,
  nome: chave,
  categoria: "ativacao",
  descricao: null,
  ativa: true,
  dias,
  assunto: `assunto ${chave}`,
  corpo: "Olá, {{nome}}. Laudos: {{laudos}}. Link: {{link_carteira}}",
  ordem: 0,
});

const REGRAS = [
  REGRA("ativacao_boas_vindas"),
  REGRA("ativacao_sem_carteira", 1),
  REGRA("ativacao_triagem_parada", 2),
  REGRA("ativacao_sem_laudo", 4),
  REGRA("uso_laudo_sem_termo", 2),
  REGRA("conversao_um_laudo"),
  REGRA("conversao_limite"),
  REGRA("janela_fechou", 1),
  REGRA("pos_janela_revisao"),
  REGRA("proxima_janela"),
];

const ESCRITORIO = {
  id: "t1",
  nome: "Escritório Teste",
  email: "contador@exemplo.com.br",
  criado_em: diasAtras(200), // conta velha: fora da janela de ativação
  status: "gratis",
  plano_id: null,
  plano_nome: null,
  plano_ciclo: null,
  valor_centavos: null,
  vencimento: null,
  assinatura_id: null,
  checkout_url: null,
  empresas: 40,
  faixa_a: 12,
  analises: 12,
  laudos: 2,
  termos: 0,
  assinados: 0,
  ultima_analise: diasAtras(3),
};

const CTX = (over = {}, jaEnviados = []) => ({
  escritorios: [{ ...ESCRITORIO, ...over }],
  regras: REGRAS,
  jaEnviados: new Set(jaEnviados),
  limiteGratis: 2,
  config: {
    ativas: true,
    limite_por_execucao: 100,
    janela_dias: 30,
    aviso_pre_vencimento_dias: 3,
    dias_renovacao: 7,
    janela: { abre: "2026-09-01", fecha: "2026-09-30" },
  },
});

const chaves = (ctx) => planejar(ctx).map((e) => e.regra);

/* ─────────────────────────── laudo sem termo (a regra nova) ─────────── */

ok(chaves(CTX()).includes("uso_laudo_sem_termo"),
   "laudo emitido e nenhum termo dispara o toque");

ok(!chaves(CTX({ termos: 1 })).includes("uso_laudo_sem_termo"),
   "quem já gerou termo NÃO recebe");

ok(!chaves(CTX({ laudos: 0, termos: 0 })).includes("uso_laudo_sem_termo"),
   "sem laudo nenhum não há termo a cobrar");

// conta velha: a regra é de USO, não de calendário — precisa disparar mesmo
// muito depois do cadastro
ok(chaves(CTX({ criado_em: diasAtras(400) })).includes("uso_laudo_sem_termo"),
   "conta de um ano ainda recebe: o gatilho é fato de uso, não idade");

/* ─────────────────────────── a chave de dedupe ───────────────────────── */

ok(!chaves(CTX({}, ["uso_laudo_sem_termo:t1:2"])).includes("uso_laudo_sem_termo"),
   "já enviado com 2 laudos não repete");

ok(chaves(CTX({ laudos: 5 }, ["uso_laudo_sem_termo:t1:2"])).includes("uso_laudo_sem_termo"),
   "emitiu mais laudos e continua sem termo: situação nova, toque novo");

/* ─────────────────────────── não quebrei o resto ─────────────────────── */

const novo = CTX({ criado_em: diasAtras(5), empresas: 0, analises: 0, laudos: 0, faixa_a: 0 });
const k = chaves(novo);
ok(k.includes("ativacao_boas_vindas"), "conta nova ainda recebe boas-vindas");
ok(k.includes("ativacao_sem_carteira"), "conta nova sem carteira ainda é cobrada");
ok(!k.includes("uso_laudo_sem_termo"), "conta nova sem laudo não recebe o do termo");

// escritório sem o campo termos (RPC antiga, campo opcional) não pode explodir
// nem inventar envio — o padrão é 0, e 0 com laudo>0 dispara, que é o certo
const semCampo = CTX();
delete semCampo.escritorios[0].termos;
ok(chaves(semCampo).includes("uso_laudo_sem_termo"),
   "campo termos ausente cai em 0 sem quebrar");

// regra desligada no banco não manda nada
const desligada = CTX();
desligada.regras = REGRAS.map((r) =>
  r.chave === "uso_laudo_sem_termo" ? { ...r, ativa: false } : r
);
ok(!chaves(desligada).includes("uso_laudo_sem_termo"),
   "regra desativada no banco não dispara");

/* ─────────────────────────── o pós-janela ───────────────────────────── */

// planejar() lê a data real do relógio para saber a fase. Como os testes rodam
// em qualquer dia, verifico o CONTRATO: fora da fase, nenhuma das duas dispara;
// e nenhuma delas jamais vai para quem não emitiu laudo.
const semLaudo = chaves(CTX({ laudos: 0, termos: 0 }));
ok(!semLaudo.includes("pos_janela_revisao"),
   "sem laudo emitido, nunca oferece revisão — seria propaganda do que a pessoa não fez");

const semCarteira = chaves(CTX({ empresas: 0, laudos: 0, analises: 0, faixa_a: 0 }));
ok(!semCarteira.includes("proxima_janela"),
   "sem carteira, não avisa da próxima janela");

// as duas são exclusivas entre si: são fases diferentes do calendário
const todas = chaves(CTX());
ok(!(todas.includes("pos_janela_revisao") && todas.includes("proxima_janela")),
   "revisão e próxima janela nunca saem no mesmo dia");

console.log(f === 0 ? "TODOS OS TESTES PASSARAM" : `${f} FALHAS`);
process.exit(f ? 1 : 0);
