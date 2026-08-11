/**
 * DE QUEM É A PREMISSA — a suíte da proveniência.
 *
 * Esta é a afirmação mais cara do laudo. "Respondida pelo cliente no
 * formulário" é o que o contador leva para uma discussão em 2027; "informada
 * pelo contador" é o que ele assume. Errar de lado não é erro de rótulo — é
 * dar a alguém uma defesa que ele não tem, ou tirar a que ele tem.
 *
 * Os dois defeitos que originaram esta suíte saíram de laudos impressos, não de
 * teste nenhum: a regra vivia dentro de um componente de 1.300 linhas.
 */
import {
  resolverOrigem,
  premissaFraca,
  origemValida,
  ORIGENS,
  CHAVES_DE_PREMISSA,
} from "./origem-premissa.js";

let f = 0;
const ok = (c, m, e) => {
  if (!c) { f++; console.log("FALHOU:", m, e === undefined ? "" : JSON.stringify(e)); }
  else console.log("ok:", m);
};

const nada = {
  tocada: false,
  daColetaAgora: false,
  gravada: null,
  doLoteCnae: false,
  temRespostasIniciais: false,
};
const est = (x = {}) => resolverOrigem({ ...nada, ...x });

/* ───────────────────────── os casos limpos ──────────────────────────── */
ok(est({}) === "padrao", "sem nada, a premissa é padrão do sistema");
ok(est({ tocada: true }) === "informada", "o contador mexeu: a premissa é dele");
ok(est({ daColetaAgora: true }) === "coleta", "o cliente acabou de responder: é dele");
ok(est({ doLoteCnae: true }) === "estimada", "ninguém respondeu e o lote chutou: estimada");
ok(est({ temRespostasIniciais: true }) === "informada",
   "análise antiga sem origem registrada: o palpite honesto é o escritório");

/* ───────────────── a precedência, uma a uma ─────────────────────────── */
ok(est({ tocada: true, daColetaAgora: true }) === "informada",
   "corrigir a resposta do cliente transfere a premissa para quem corrigiu");
ok(est({ tocada: true, gravada: "coleta" }) === "informada",
   "...e isso vale por cima do que estava gravado");
ok(est({ daColetaAgora: true, gravada: "informada" }) === "coleta",
   "coleta recém-aplicada vence o que estava gravado: é mais recente e mais forte");
ok(est({ gravada: "coleta", doLoteCnae: true }) === "coleta",
   "o gravado vence o lote — foi decidido com informação que esta sessão não tem");
ok(est({ gravada: "estimada", temRespostasIniciais: true }) === "estimada",
   "e vence o palpite de 'tem resposta na tela, logo alguém informou'");

/* ═══ A REGRESSÃO QUE ISTO EXISTE PARA IMPEDIR ═════════════════════════════
   Reabrir uma análise e salvar de novo APAGAVA a proveniência. `tocada` nasce
   falso a cada abertura e `daColetaAgora` só é verdadeiro no instante em que as
   respostas do cliente são aplicadas — então tudo caía no último ramo e virava
   "informada". As seis respostas que o CLIENTE preencheu viravam declaração do
   escritório num segundo clique em salvar, sem nada mudar na tela.

   É o pior tipo de defeito deste produto: destrói informação que não pode ser
   reconstruída, e é invisível enquanto acontece. ══════════════════════════ */
{
  const reabertura = { temRespostasIniciais: true, tocada: false, daColetaAgora: false };
  ok(est({ ...reabertura, gravada: "coleta" }) === "coleta",
     "reabrir e salvar NÃO rebaixa a resposta do cliente");
  ok(est({ ...reabertura, gravada: "estimada" }) === "estimada",
     "...nem promove um chute do CNAE a declaração do escritório");
  ok(est({ ...reabertura, gravada: "padrao" }) === "padrao",
     "...nem transforma o padrão do sistema em premissa de alguém");
  /* sem origem gravada não há o que preservar: aí sim o último ramo vale */
  ok(est({ ...reabertura, gravada: null }) === "informada",
     "e uma análise anterior ao registro de origem continua caindo em informada");
}

/* ───────────────── lixo gravado não vira proveniência ───────────────── */
for (const ruim of ["", "cliente", "CONTADOR", "informado", null, undefined, 7, {}]) {
  ok(est({ gravada: ruim, doLoteCnae: true }) === "estimada",
     `origem gravada inválida é ignorada, não promovida: ${JSON.stringify(ruim)}`);
}
ok(origemValida("coleta") && !origemValida("Coleta"),
   "a validação é exata — meio-acerto no banco não vira grau de proveniência");

/* ───────────────── o que o documento destaca ────────────────────────── */
ok(premissaFraca("estimada") && premissaFraca("padrao"),
   "as duas que ninguém escolheu são as fracas");
ok(!premissaFraca("coleta") && !premissaFraca("informada"),
   "e as duas que alguém assumiu não são destacadas como frágeis");

/* ───────────────── as listas que a tela e o laudo compartilham ──────── */
ok(CHAVES_DE_PREMISSA.length === 7, "sete premissas viajam no salvamento", CHAVES_DE_PREMISSA.length);
ok(ORIGENS.join(",") === "coleta,informada,estimada,padrao",
   "e as origens vêm da mais forte para a mais fraca — é a ordem em que o resumo é lido");
/* toda origem tem de ser resolvível a partir de algum estado real; uma origem
   que nenhum caminho produz é rótulo morto no laudo */
{
  const alcancaveis = new Set([
    est({ tocada: true }),
    est({ daColetaAgora: true }),
    est({ doLoteCnae: true }),
    est({}),
  ]);
  ok(alcancaveis.size === 4, "os quatro graus são alcançáveis por algum caminho real", [...alcancaveis]);
}

if (f) { console.log(`\n${f} FALHA(S)`); process.exit(1); }
console.log("\norigem-premissa: tudo passou");
