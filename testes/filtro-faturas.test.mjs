/**
 * OS FILTROS DO EXTRATO — e a regra que os torna seguros.
 *
 * A tela mostrava as 30 faturas mais recentes, sem filtro. Filtrar é fácil; o
 * que esta suíte guarda é a parte que costuma faltar:
 *
 *  1. campo VAZIO não filtra, e `0` filtra — porque `valorMin = 0` é "acima de
 *     zero" e `null` é "não filtrei". Confundir os dois esconde as cortesias;
 *  2. o TOTAL é das linhas filtradas, e o filtro aparece escrito ao lado. Um
 *     total sem o recorte é como o número errado entra numa decisão;
 *  3. quando a lista bate no teto de carregamento, a tela DIZ — em vez de
 *     deixar o silêncio sugerir que aquilo é o histórico inteiro.
 */
import {
  filtrar, totalizar, descreverFiltro, temFiltro, avisoDeTamanho, opcoesDe, LIMITE_SEGURO,
} from "./filtro-faturas.js";

let f = 0;
const ok = (c, m, e) => {
  if (!c) { f++; console.log("FALHOU:", m, e === undefined ? "" : JSON.stringify(e)); }
  else console.log("ok:", m);
};
const HOJE = new Date("2026-08-05T12:00:00Z");

const fat = (x = {}) => ({
  id: "f1", tenant_id: "t1", plano_nome: "Profissional", descricao: "Mensalidade",
  valor_centavos: 29700, status: "pendente", vencimento: "2026-08-10", pago_em: null,
  ...x,
});

const BASE = [
  fat({ id: "1", tenant_id: "t1", status: "pago", valor_centavos: 29700, vencimento: "2026-07-10", pago_em: "2026-07-09" }),
  fat({ id: "2", tenant_id: "t1", status: "pendente", valor_centavos: 29700, vencimento: "2026-08-10" }),
  fat({ id: "3", tenant_id: "t2", status: "pendente", valor_centavos: 19700, vencimento: "2026-07-01", plano_nome: "Essencial" }),
  fat({ id: "4", tenant_id: "t2", status: "pago", valor_centavos: 49700, vencimento: "2026-06-15", pago_em: "2026-06-14", plano_nome: "Family Office" }),
  fat({ id: "5", tenant_id: "t3", status: "pendente", valor_centavos: 0, vencimento: "2026-08-01", plano_nome: "Cortesia", descricao: "Cortesia do curso" }),
];

/* ═══════════ 1 · sem filtro, nada sai ══════════════════════════════════ */
ok(filtrar(BASE, {}, HOJE).length === 5, "filtro vazio devolve tudo");
ok(descreverFiltro({}) === "sem filtro — o extrato inteiro", "e diz que não filtrou");
ok(temFiltro({}) === false && temFiltro({ plano: "Essencial" }) === true, "temFiltro acompanha");

/* ═══════════ 2 · cada filtro, isolado ══════════════════════════════════ */
ok(filtrar(BASE, { contratante: "t1" }, HOJE).map((x) => x.id).join() === "1,2", "por contratante");
ok(filtrar(BASE, { plano: "Essencial" }, HOJE).map((x) => x.id).join() === "3", "por plano");
ok(filtrar(BASE, { status: "pago" }, HOJE).map((x) => x.id).join() === "1,4", "por status");
ok(filtrar(BASE, { busca: "cortesia" }, HOJE).map((x) => x.id).join() === "5", "busca livre na descrição");
ok(filtrar(BASE, { busca: "CORTESIA" }, HOJE).length === 1, "busca ignora caixa");
ok(filtrar(BASE, { busca: "mensalidade" }, HOJE).length === 4, "e acha pelo texto comum");

/* status EFETIVO, não o rótulo gravado: um "pendente" com vencimento passado é
   vencido, e é assim que a lista tem de responder */
{
  const vencida = fat({ id: "v", status: "pendente", vencimento: "2026-07-01" });
  ok(filtrar([vencida], { status: "vencido" }, HOJE).length === 1,
     "pendente com vencimento passado filtra como VENCIDO — o status é a data, não o rótulo");
  ok(filtrar([vencida], { status: "pendente" }, HOJE).length === 0,
     "…e não aparece em 'pendente', senão a mesma fatura estaria em dois filtros");
}

/* ═══════════ 3 · datas ═════════════════════════════════════════════════ */
ok(filtrar(BASE, { de: "2026-07-01", ate: "2026-07-31" }, HOJE).map((x) => x.id).join() === "1,3",
   "intervalo por vencimento");
ok(filtrar(BASE, { campoData: "pago_em", de: "2026-07-01" }, HOJE).map((x) => x.id).join() === "1",
   "o mesmo intervalo por data de PAGAMENTO devolve outra coisa — e é o ponto de ter os dois campos");
ok(filtrar(BASE, { campoData: "pago_em", de: "2026-01-01" }, HOJE).length === 2,
   "só as pagas entram no filtro por pagamento: quem não pagou não tem data");
ok(filtrar(BASE, { ate: "2026-06-30" }, HOJE).map((x) => x.id).join() === "4", "só o limite superior");
ok(filtrar(BASE, { de: "2026-08-01" }, HOJE).map((x) => x.id).join() === "2,5", "só o inferior");

/* ═══════════ 4 · valor, e o zero que não pode sumir ════════════════════ */
ok(filtrar(BASE, { valorMin: 200 }, HOJE).map((x) => x.id).join() === "1,2,4", "valor mínimo em REAIS");
ok(filtrar(BASE, { valorMax: 200 }, HOJE).map((x) => x.id).join() === "3,5", "valor máximo");
ok(filtrar(BASE, { valorMin: 197, valorMax: 297 }, HOJE).map((x) => x.id).join() === "1,2,3", "faixa");
/**
 * A ASSERÇÃO QUE JUSTIFICA O `!= null` NO CÓDIGO. Com `if (f.valorMin)`, um
 * mínimo de zero seria ignorado — o que por acaso dá o mesmo resultado — mas o
 * campo em branco viraria `0` e passaria a esconder as faturas de valor zero,
 * que são justamente as cortesias.
 */
ok(filtrar(BASE, { valorMin: 0 }, HOJE).length === 5, "mínimo ZERO é um filtro válido e mantém a cortesia");
ok(filtrar(BASE, { valorMin: null, valorMax: null }, HOJE).length === 5, "null é 'não filtrei'");
ok(filtrar(BASE, { valorMax: 0 }, HOJE).map((x) => x.id).join() === "5", "máximo zero devolve só a cortesia");

/* ═══════════ 5 · combinação ════════════════════════════════════════════ */
ok(filtrar(BASE, { contratante: "t2", status: "pago" }, HOJE).map((x) => x.id).join() === "4",
   "os filtros se somam (E, não OU)");
ok(filtrar(BASE, { contratante: "t1", plano: "Essencial" }, HOJE).length === 0,
   "combinação impossível devolve vazio, não tudo");

/* ═══════════ 6 · o total é do que está na tela ═════════════════════════ */
{
  const t = totalizar(filtrar(BASE, {}, HOJE), HOJE);
  ok(t.linhas === 5 && t.total_centavos === 128800, "total geral", t);
  ok(t.pago_centavos === 79400, "somando as pagas", t.pago_centavos);
  ok(t.vencido_centavos === 19700, "as vencidas pela DATA (a 3 venceu em julho)", t.vencido_centavos);
  ok(t.aberto_centavos === 29700, "e as em aberto de verdade", t.aberto_centavos);
  ok(t.pago_centavos + t.vencido_centavos + t.aberto_centavos === t.total_centavos,
     "as três partes fecham o total — sem fatura em duas caixas nem fora de todas");
}
{
  const t = totalizar(filtrar(BASE, { contratante: "t1" }, HOJE), HOJE);
  ok(t.linhas === 2 && t.total_centavos === 59400,
     "e com filtro o total é SÓ do filtro — é assim que o número errado NÃO entra na decisão", t);
}

/* ═══════════ 7 · o filtro dito em português ════════════════════════════ */
{
  const txt = descreverFiltro(
    { contratante: "t1", plano: "Profissional", de: "2026-07-01", ate: "2026-07-31", valorMin: 100 },
    (id) => (id === "t1" ? "Contabify" : undefined)
  );
  ok(/Contabify/.test(txt), "usa o NOME do contratante, não o uuid — uuid em relatório não é informação", txt);
  ok(/vencimento de 01\/07\/2026 a 31\/07\/2026/.test(txt), "data em português");
  ok(/valor a partir de R\$ 100/.test(txt), "e a faixa de valor");
  ok(descreverFiltro({ campoData: "pago_em", de: "2026-07-01" }).includes("pagamento"),
     "e diz QUAL data está filtrando — vencimento e pagamento dão respostas diferentes");
}
ok(descreverFiltro({ contratante: "t9" }) === "um contratante",
   "sem o nome à mão, não imprime o uuid: prefere a palavra genérica");

/* ═══════════ 8 · o teto do filtro no cliente ═══════════════════════════ */
ok(avisoDeTamanho(30) === null, "lista pequena não avisa nada");
ok(avisoDeTamanho(LIMITE_SEGURO) !== null, "no teto, avisa");
ok(/não sobre o histórico inteiro/.test(avisoDeTamanho(LIMITE_SEGURO)),
   "…e o aviso diz exatamente o que o silêncio faria alguém concluir errado");

/* ═══════════ 9 · as opções dos seletores ═══════════════════════════════ */
{
  const o = opcoesDe(BASE);
  ok(o.planos.join() === "Cortesia,Essencial,Family Office,Profissional", "planos únicos e ordenados", o.planos);
  ok(o.contratantes.length === 3, "contratantes únicos", o.contratantes);
}

/* ═══════════ 10 · filtrar não altera a lista ═══════════════════════════ */
{
  const copia = JSON.stringify(BASE);
  filtrar(BASE, { contratante: "t1" }, HOJE);
  totalizar(BASE, HOJE);
  ok(JSON.stringify(BASE) === copia, "nem filtrar nem totalizar mexem na lista original");
}

console.log(f === 0 ? "\nOK" : `\n${f} FALHA(S)`);
process.exit(f === 0 ? 0 : 1);
