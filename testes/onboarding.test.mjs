/**
 * A régua de onboarding. A regra que mais importa aqui é a de PARAR:
 * "vi que a carteira ainda não subiu" mandado para quem acabou de subir 143
 * empresas é o e-mail que faz a pessoa parar de ler todos os outros.
 */
import { onboardingDevido, aindaFazSentido, elegivelOnboarding, ancora } from "./onboarding.js";

let falhas = 0;
const ok = (c, m) => { if (c) console.log("ok:", m); else { console.log("FALHOU:", m); falhas++; } };

const P = (chave, evento, dias) => ({ chave, evento, dias, assunto: "a", corpo: "b", ativo: true });
const PASSOS = [
  P("boas_vindas", "cadastro", 0),
  P("sem_carteira_2d", "sem_carteira", 2),
  P("sem_analise_3d", "sem_analise", 3),
  P("sem_laudo_5d", "sem_laudo", 5),
  P("primeiro_laudo", "primeiro_laudo", 0),
];
const NOVA = {
  id: "t1", criado_em: "2026-08-01", is_teste: false, emails_optout: false, status: "ativa",
  empresas: 0, analises: 0, laudos: 0, primeiro_laudo_em: null,
};
const V = new Set();
const chaves = (c, hoje, ja = V) => onboardingDevido(c, PASSOS, hoje, ja).map((e) => e.passo_chave);

/* ── a sequência normal ──────────────────────────────────────────────── */
ok(chaves(NOVA, "2026-08-01").includes("boas_vindas"), "boas-vindas sai no dia do cadastro");
ok(chaves(NOVA, "2026-08-03").includes("sem_carteira_2d"), "dois dias sem carteira, cobra a carteira");
ok(!chaves(NOVA, "2026-08-03").includes("sem_analise_3d"),
   "não cobra análise de quem nem carteira tem — o passo anterior é que se aplica");

const comCarteira = { ...NOVA, empresas: 143 };
ok(!chaves(comCarteira, "2026-08-10").includes("sem_carteira_2d"),
   "SUBIU A CARTEIRA: nunca mais recebe 'vi que a carteira não subiu'");
ok(chaves(comCarteira, "2026-08-05").includes("sem_analise_3d"), "agora sim cobra a análise");

const comAnalise = { ...comCarteira, analises: 4 };
ok(!chaves(comAnalise, "2026-08-10").includes("sem_analise_3d"), "analisou: para de cobrar análise");
ok(chaves(comAnalise, "2026-08-07").includes("sem_laudo_5d"), "e passa a cobrar o laudo");

const comLaudo = { ...comAnalise, laudos: 1, primeiro_laudo_em: "2026-08-09" };
ok(!chaves(comLaudo, "2026-08-12").includes("sem_laudo_5d"), "emitiu: para de cobrar laudo");
ok(chaves(comLaudo, "2026-08-09").includes("primeiro_laudo"), "e recebe o do primeiro laudo");

/* ── não repete ──────────────────────────────────────────────────────── */
ok(!chaves(NOVA, "2026-08-01", new Set(["t1|boas_vindas"])).includes("boas_vindas"),
   "passo já enviado não sai de novo — onboarding acontece uma vez só");

/* ── tolerância a cron que falhou ────────────────────────────────────── */
ok(chaves(NOVA, "2026-08-09").includes("sem_carteira_2d"),
   "se o cron falhou no dia certo, o passo ainda sai depois — não some para sempre");

/* ── quem não recebe nada ────────────────────────────────────────────── */
for (const [campo, valor, nome] of [
  ["is_teste", true, "conta de teste"],
  ["emails_optout", true, "quem pediu para não receber"],
]) {
  ok(!elegivelOnboarding({ ...NOVA, [campo]: valor }), `${nome} não é elegível`);
  ok(chaves({ ...NOVA, [campo]: valor }, "2026-08-01").length === 0, `${nome} não recebe nada`);
}
for (const st of ["cancelada", "suspensa"]) {
  ok(chaves({ ...NOVA, status: st }, "2026-08-01").length === 0, `conta ${st} não recebe onboarding`);
}

/* ── as âncoras ──────────────────────────────────────────────────────── */
ok(ancora(P("x", "cadastro", 0), NOVA) === "2026-08-01", "eventos de entrada ancoram no cadastro");
ok(ancora(P("x", "primeiro_laudo", 0), NOVA) === null,
   "sem laudo, o passo do primeiro laudo não tem âncora — e não sai");
ok(ancora(P("x", "primeiro_laudo", 0), comLaudo) === "2026-08-09",
   "com laudo, ancora na data do laudo, não na do cadastro");

/* ── a pergunta separada: ainda é verdade? ───────────────────────────── */
ok(aindaFazSentido(P("x", "sem_carteira", 2), NOVA), "sem empresa, o passo faz sentido");
ok(!aindaFazSentido(P("x", "sem_carteira", 2), comCarteira), "com empresa, não faz mais");
ok(aindaFazSentido(P("x", "cadastro", 0), comLaudo), "boas-vindas vale sempre, em qualquer estado");

process.exit(falhas ? 1 : 0);
