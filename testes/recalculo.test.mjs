/**
 * A ANÁLISE QUE CONTRADIZ OS PRÓPRIOS NÚMEROS.
 *
 * O CASO REAL, 05/08/2026 — Transportadora Rota Certa Ltda, vista num termo de
 * ciência já emitido:
 *
 *   rq 82,8% · ch 2,640% · das 2,6909% · cl −0,051% · re −0,062% · fc 6,109%
 *   respostas: b2b .9 · qual .92 · cred .7 · folha .12 · preco 2 · conc 1
 *   saída GRAVADA: S4 · parametros.motor: null
 *
 * Custo líquido NEGATIVO gravado como "optar CONDICIONADO A REPASSE". A árvore
 * de hoje manda esse caso para S5, "optar por vantagem direta" — a análise é de
 * antes de 26/07, quando S5 ganhou saída própria.
 *
 * O estrago no papel era duplo e visível:
 *  · o cartão dizia "condicionado a repasse" no título e "a vantagem não
 *    depende de renegociar preço com ninguém" três linhas abaixo;
 *  · os pontos pediam que "o reajuste de preço de −0,1% seja efetivamente
 *    aceito pelos clientes" — reajuste negativo não é reajuste a aceitar.
 */
import { recalcular, parametrosCongelados, camposRecalculados } from "./recalculo.js";
import { recomendacaoDoTermo, pontosAObservar } from "./termo.js";
import { condicoesDeValidade } from "./laudo.js";
import { decidir, PARAMETROS_2027 } from "./motor.js";

let f = 0;
const ok = (c, m, e) => {
  if (!c) { f++; console.log("FALHOU:", m, e === undefined ? "" : JSON.stringify(e)); }
  else console.log("ok:", m);
};

/* ═══════════ o caso real, número por número ═══════════════════════════════ */
const ROTA_CERTA = {
  id: "51d14d63-7445-4a58-bef1-7b7932ebc7b3",
  rq: 0.828, ch: 0.0264, cl: -0.00051, re: -0.00062, fc: 0.06109,
  saida: "S4", prioridade: false,
  respostas: { b2b: 0.9, qual: 0.92, cred: 0.7, folha: 0.12, preco: 2, conc: 1, exig: 0 },
  calculado_em: "2026-07-20T12:00:00Z",
  parametros: { aliquota: 0.088, das: 0.026909301492537313, motor: null },
};

{
  const rc = recalcular(ROTA_CERTA);
  ok(rc.impedimento === null, "a análise tem respostas e dDAS congelados: dá para refazer", rc.impedimento);
  ok(rc.mudou === true, "e a saída MUDA — era o defeito");
  ok(rc.de === "S4" && rc.para === "S5", "de S4 (condicionado a repasse) para S5 (vantagem direta)",
     `${rc.de}→${rc.para}`);
  ok(/lógica da decisão, não a\s+premissa|lógica da decisão, não a premissa/.test(rc.aviso.replace(/\s+/g, " ")),
     "o aviso diz que mudou a LÓGICA, não a premissa — é a diferença que o contador precisa saber");
  ok(/S4/.test(rc.aviso) && /S5/.test(rc.aviso), "e nomeia as duas saídas");
}

/* ═══════════ os parâmetros são os CONGELADOS ══════════════════════════════
 * Refazer com a alíquota de hoje misturaria duas mudanças, e o contador não
 * saberia qual delas moveu a recomendação.
 * ══════════════════════════════════════════════════════════════════════════ */
{
  const p = parametrosCongelados(ROTA_CERTA);
  ok(p.aliquota === 0.088 && p.das === 0.026909301492537313,
     "alíquota e dDAS vêm da análise, não da convenção de hoje");
  ok(p.rqMin === PARAMETROS_2027.rqMin && p.absorcaoMax === PARAMETROS_2027.absorcaoMax,
     "o que NÃO existia quando ela foi feita cai no padrão atual — é o mais próximo da verdade");

  /* prova aritmética por fora: cl = ch − das, com ch calculado pelo motor */
  const r = decidir(ROTA_CERTA.respostas, p);
  const cl = r.ch - p.das;
  ok(Math.abs(r.cl - cl) < 1e-12, "cl é ch − das, conferido fora do motor", { cl: r.cl, calc: cl });
  ok(r.cl < 0, "e é NEGATIVO — é isso que torna o caso S5");
  ok(Math.abs(r.cl - (-0.00051)) < 5e-6, "bate com o −0,051% que está no banco", r.cl);
  ok(Math.abs(r.re - r.cl / r.rq) < 1e-12, "re é cl/rq, e por isso também é negativo", r.re);
}

/* ═══════════ sem base para refazer, NÃO refaz ═════════════════════════════
 * Refazer sem o dDAS congelado trocaria a premissa que mais mexe no resultado.
 * ══════════════════════════════════════════════════════════════════════════ */
{
  const semDas = recalcular({ ...ROTA_CERTA, parametros: { aliquota: 0.088 } });
  ok(!semDas.mudou && /dDAS/.test(semDas.impedimento), "sem dDAS congelado não recalcula, e diz por quê");
  ok(parametrosCongelados({ ...ROTA_CERTA, parametros: {} }) === null, "e os parâmetros voltam nulos");

  const semRespostas = recalcular({ ...ROTA_CERTA, respostas: null });
  ok(!semRespostas.mudou && /respostas/.test(semRespostas.impedimento), "sem respostas também não");
  const incompleta = recalcular({ ...ROTA_CERTA, respostas: { b2b: 0.9, qual: 0.92 } });
  ok(!incompleta.mudou && incompleta.impedimento !== null,
     "respostas pela metade não viram análise nova — meia premissa é palpite");
}

/* ═══════════ análise em dia não é mexida ══════════════════════════════════ */
{
  const emDia = recalcular({
    ...ROTA_CERTA, saida: "S5",
    parametros: { ...ROTA_CERTA.parametros, motor: "2026.08.05" },
  });
  ok(!emDia.mudou && emDia.aviso === null,
     "saída que já bate com o motor de hoje não gera aviso — alerta que aparece sempre não é lido");
  ok(camposRecalculados(emDia, {}) === null, "e nada é regravado");
}

/* ═══════════ o que é regravado ════════════════════════════════════════════ */
{
  const rc = recalcular(ROTA_CERTA);
  const campos = camposRecalculados(rc, { aliquota: 0.088, das: 0.0269, exercicio: 2027 });
  ok(campos.saida === "S5", "a saída nova");
  ok(campos.cl < 0 && campos.re < 0, "e os números que a sustentam");
  ok(campos.parametros.motor && campos.parametros.motor !== null,
     "COM o carimbo do motor — sem ele a mesma armadilha volta em seis meses sem rastro");
  ok(campos.parametros.recalculada_de === "S4",
     "e o rastro de onde veio, para quem perguntar por que o laudo não bate com o print de julho");
  ok(campos.parametros.exercicio === 2027, "os parâmetros que já existiam são preservados");
  ok(/paga menos/.test(campos.parametros.motivo), "e o motivo passa a ser o do S5");
}

/* ═══════════ o texto para de se contradizer ═══════════════════════════════
 * Estas quatro asserções são o defeito exato que apareceu no termo impresso.
 * ══════════════════════════════════════════════════════════════════════════ */
{
  /* ANTES do conserto: a análise velha (S4) com cl negativo */
  const r = recomendacaoDoTermo(ROTA_CERTA);
  ok(!r.baseado_em.some((x) => /não depende de renegociar preço com ninguém/.test(x)),
     "gravada como S4, o fundamento NÃO usa a frase do S5 — era a contradição dentro do cartão");
  ok(!r.baseado_em.some((x) => /Repasse de preço necessário de -/.test(x)),
     "e também não anuncia repasse NEGATIVO como se fosse repasse a negociar");

  const cond = condicoesDeValidade(ROTA_CERTA);
  ok(!cond.some((x) => /reajuste de preço de -/.test(x)),
     "o laudo não pede que um reajuste negativo seja aceito pelos clientes");
  ok(!pontosAObservar(ROTA_CERTA).some((x) => /reajuste de preço de -/.test(x)),
     "nem os pontos a observar do termo");

  /* DEPOIS de refeita: S5, e aí a frase do custo negativo é a certa */
  const nova = { ...ROTA_CERTA, saida: "S5" };
  ok(recomendacaoDoTermo(nova).baseado_em.some((x) => /paga MENOS/.test(x)),
     "já como S5, o fundamento é o custo negativo — a frase certa no caso certo");
  ok(!condicoesDeValidade(nova).some((x) => /reajuste de preço/.test(x)),
     "e continua sem condição de repasse, porque não há repasse a negociar");
}

/* ═══════════ repasse positivo continua aparecendo ═════════════════════════
 * O conserto não pode ter emudecido a condição no caso normal.
 * ══════════════════════════════════════════════════════════════════════════ */
{
  const normal = {
    ...ROTA_CERTA, saida: "S4", cl: 0.0321, re: 0.0446, fc: 0.0629,
    respostas: { ...ROTA_CERTA.respostas, preco: 3, conc: 0 },
  };
  ok(condicoesDeValidade(normal).some((x) => /reajuste de preço de 4,5%/.test(x)),
     "com repasse POSITIVO a condição volta — o filtro é sobre o sinal, não sobre a saída");
  ok(recomendacaoDoTermo(normal).baseado_em.some((x) => /Repasse de preço necessário de 4,5%/.test(x)),
     "e o fundamento do S4 fala de repasse, como sempre falou");
}

console.log(f === 0 ? "\nOK" : `\n${f} FALHA(S)`);
process.exit(f === 0 ? 0 : 1);
