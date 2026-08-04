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

import { planejar, emHorarioDeEnvio, separarFila } from "./reguas.js";

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


/* ═══════════════════════════════════════════════════════════════════════
 * A ESCADA DE COBRANÇA E A REGRA DE PARAR
 *
 * Trazidas na consolidação de 03/08, quando um segundo motor de régua foi
 * removido. São as duas famílias que ninguém cobria aqui:
 *
 *   ESCADA — só o degrau mais alto atingido sai. É o que faz um cron que
 *   falhou três dias mandar UMA cobrança, e não três.
 *
 *   PARAR — "vi que a carteira ainda não subiu" mandado para quem acabou de
 *   subir 143 empresas é o e-mail que faz a pessoa parar de ler todos os
 *   outros. E é o mais fácil de mandar por engano, porque a régua já estava
 *   agendada.
 * ═══════════════════════════════════════════════════════════════════════ */

const REGRAS_COB = [
  REGRA("cobranca_gerada"),
  REGRA("cobranca_pre_vencimento", 3),
  REGRA("cobranca_no_dia", 0),
  REGRA("cobranca_d1", 1),
  REGRA("cobranca_d5", 5),
  REGRA("cobranca_d10", 10),
];

const emDias = (n) => new Date(hoje.getTime() + n * 86400000).toISOString();

const comFatura = (venc) => ({
  ...ESCRITORIO,
  status: "pendente",
  assinatura_id: "a1",
  checkout_url: "https://pag/x",
  valor_centavos: 29700,
  vencimento: venc,
});

const chavesCob = (venc, jaEnviados = new Set()) =>
  planejar({
    regras: REGRAS_COB,
    escritorios: [comFatura(venc)],
    jaEnviados,
    config: {},
    limiteGratis: 2,
  }).map((e) => e.regra);

// o degrau do DIA do vencimento: era o único silencioso antes de 03/08
ok(chavesCob(emDias(0)).includes("cobranca_no_dia"),
   "vence hoje: o degrau do dia sai");

// escada: atraso de 7 dias manda o d5, não o d1 nem os dois
const sete = chavesCob(emDias(-7));
ok(sete.includes("cobranca_d5"), "7 dias de atraso: sai o degrau de 5");
ok(!sete.includes("cobranca_d1"), "e NÃO sai também o de 1 — só o degrau mais alto");
ok(sete.filter((c) => c.startsWith("cobranca_d")).length === 1,
   "um único e-mail de atraso por rodada, mesmo com vários degraus vencidos");

// o último degrau existe: sem ele, o corte de acesso chega sem aviso
ok(chavesCob(emDias(-12)).includes("cobranca_d10"),
   "12 dias de atraso: sai o aviso de suspensão");

// antes do vencimento, dentro da janela configurada
ok(chavesCob(emDias(2)).includes("cobranca_pre_vencimento"),
   "faltando 2 dias: sai o pré-vencimento");
ok(!chavesCob(emDias(30)).includes("cobranca_pre_vencimento"),
   "faltando 30 dias: ainda não incomoda");

// a trava: o que já saiu não sai de novo
ok(!chavesCob(emDias(-7), new Set(["cobranca_d5:a1"])).includes("cobranca_d5"),
   "degrau já enviado não repete");

/* ── a regra de parar, na ativação ───────────────────────────────────── */
const novaConta = (over) => ({
  ...ESCRITORIO,
  criado_em: diasAtras(3),
  empresas: 0,
  faixa_a: 0,
  analises: 0,
  laudos: 0,
  ultima_analise: null,
  ...over,
});
const chavesAtiv = (esc) =>
  planejar({ regras: REGRAS, escritorios: [esc], jaEnviados: new Set(), config: {}, limiteGratis: 2 })
    .map((e) => e.regra);

ok(chavesAtiv(novaConta({})).includes("ativacao_sem_carteira"),
   "conta nova sem carteira: cobra a carteira");
ok(!chavesAtiv(novaConta({ empresas: 143, faixa_a: 40 })).includes("ativacao_sem_carteira"),
   "SUBIU 143 EMPRESAS: nunca mais recebe 'vi que a carteira não subiu'");
ok(!chavesAtiv(novaConta({ empresas: 143, faixa_a: 40, analises: 5, laudos: 1 })).includes("ativacao_sem_laudo"),
   "emitiu laudo: para de cobrar o laudo");

/* ── a trava de horário do cron de hora em hora ─────────────────────── */
/**
 * O cron passou a rodar toda hora para diluir os disparos. Sem trava, "toda
 * hora" inclui a madrugada — e e-mail que chega às 3h é lido às 9h junto com
 * todos os outros: some o efeito da diluição e sobra o incômodo.
 *
 * O fuso é o detalhe que engana: o Vercel roda em UTC e o Brasil é UTC-3.
 */
const utc = (dia, hora) => new Date(Date.UTC(2026, 7, dia, hora, 0, 0)); // agosto/2026

// 3 de agosto de 2026 é uma SEGUNDA-feira
ok(emHorarioDeEnvio(utc(3, 12)), "12h UTC = 9h no Brasil: envia");
ok(emHorarioDeEnvio(utc(3, 20)), "20h UTC = 17h no Brasil: envia");
ok(!emHorarioDeEnvio(utc(3, 21)), "21h UTC = 18h no Brasil: já parou");
ok(!emHorarioDeEnvio(utc(3, 11)), "11h UTC = 8h no Brasil: ainda não");
ok(!emHorarioDeEnvio(utc(3, 6)), "6h UTC = 3h da manhã no Brasil: nunca");

// a virada de dia pelo fuso: 2h UTC de terça é 23h de segunda no Brasil
ok(!emHorarioDeEnvio(utc(4, 2)), "2h UTC de terça = 23h de segunda no Brasil: não envia");

// fim de semana: ninguém resolve boleto no sábado
ok(!emHorarioDeEnvio(utc(8, 15)), "sábado ao meio-dia: não envia");
ok(!emHorarioDeEnvio(utc(9, 15)), "domingo ao meio-dia: não envia");
ok(emHorarioDeEnvio(utc(7, 15)), "sexta ao meio-dia: envia");

// janela configurável
ok(emHorarioDeEnvio(utc(3, 11), 8, 18), "com início às 8h, 11h UTC passa a valer");

/* ═══════════════════════════════════════════════════════════════════════════
 * FONTE QUEBRADA NÃO É "NADA A ENVIAR"
 *
 * O caso real: `negocio_escritorios()` barrava a service role, o erro era
 * descartado, e o cron respondia {"planejados":0,"erros":[]}. Zero e zero — o
 * mesmo que um dia tranquilo devolve. Foi assim que o motor ficou dias mudo
 * enquanto a tela mostrava 16 na fila.
 *
 * `separarFila` existe para a outra metade do mesmo problema: o que está na
 * fila e NUNCA vai sair precisa ter nome próprio.
 * ═══════════════════════════════════════════════════════════════════════════ */
{
  const E = (para) => ({
    regra: "r", nome_regra: "R", categoria: "ativacao", tenant_id: "t",
    escritorio: "X", para, assunto: "a", corpo: "c", chave_unica: "k", motivo: "m",
  });
  const { sairao, travados } = separarFila([E("a@b.c"), E(null), E("d@e.f"), E(null)]);
  ok(sairao.length === 2, "separarFila: dois saem", sairao.length);
  ok(travados.length === 2, "separarFila: dois travados sem destinatário", travados.length);
  ok(sairao.length + travados.length === 4, "separarFila: nenhum sumiu no caminho");
  ok(sairao.every((e) => !!e.para), "separarFila: quem sai TEM endereço");
  ok(travados.every((e) => !e.para), "separarFila: quem trava NÃO tem endereço");

  const vazio = separarFila([]);
  ok(vazio.sairao.length === 0 && vazio.travados.length === 0, "separarFila: fila vazia não quebra");
}

console.log(f === 0 ? "TODOS OS TESTES PASSARAM" : `${f} FALHAS`);
process.exit(f ? 1 : 0);
