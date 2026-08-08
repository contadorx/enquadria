/**
 * APONTAMENTOS — o radar com memória.
 *
 * O que esta suíte protege, em ordem de importância:
 *
 *  1. que o diff NÃO desfaz decisão de gente — "não se aplica" marcado na terça
 *     sobrevive à varredura de quarta;
 *  2. que superar não é apagar, e que superado REABRE em vez de duplicar;
 *  3. que a mesma varredura rodada duas vezes no mesmo dia não cria nada na
 *     segunda — é um cron diário, e cron que duplica vira dívida em uma semana;
 *  4. que "o que apareceu desde a última visita" nunca devolve a lista inteira.
 */
import { planejarGeracao, abertosPorEmpresa, novosDesde, estaAberto } from "./apontamentos.js";

let f = 0;
const ok = (c, m, e) => {
  if (!c) { f++; console.log("FALHOU:", m, e === undefined ? "" : JSON.stringify(e)); }
  else console.log("ok:", m);
};

const item = (id, criterio) => ({
  id, titulo: "", resumo: "", o_que_fazer: null, fonte: null,
  publicado_em: "2026-03-01", vigencia_em: null, severidade: "media", criterio,
});
const emp = (id, x = {}) => ({
  id, razao_social: "", cnpj: "", cnae_principal: "4711-3/02",
  anexo: 1, faixa: "A", saida: "S1", tem_analise: true, ...x,
});

/* ═════════ 1 · o casamento vira registro ═══════════════════════════════ */
{
  const itens = [item("i1", { anexos: [1] })];
  const carteira = [emp("e1"), emp("e2", { anexo: 3 })];
  const p = planejarGeracao(itens, carteira, []);
  ok(p.criar.length === 1 && p.criar[0].empresa_id === "e1",
     "só quem casa com o critério vira apontamento", p.criar);
  ok(p.criar[0].criterio && p.criar[0].criterio.anexos[0] === 1,
     "o critério viaja junto — é ele que responde 'por que fui apontado'");
  ok(p.superar.length === 0 && p.reabrir.length === 0, "nada a superar na primeira varredura");
}

/* ═════════ 2 · rodar duas vezes não duplica ════════════════════════════ */
{
  const itens = [item("i1", { anexos: [1] })];
  const carteira = [emp("e1")];
  const existentes = [{ item_id: "i1", empresa_id: "e1", status: "novo" }];
  const p = planejarGeracao(itens, carteira, existentes);
  ok(p.criar.length === 0, "a segunda varredura do dia não cria nada de novo", p);
  ok(p.superar.length === 0, "e não supera o que continua casando");
}

/* ═════════ 3 · DECISÃO DE GENTE NÃO SE DESFAZ ══════════════════════════
 * O teste mais importante do arquivo. O contador marcou "não se aplica"; a
 * empresa depois deixou de casar. A varredura NÃO pode mexer — superar uma
 * decisão dele seria o sistema opinando por cima de quem assina. */
{
  const itens = [item("i1", { anexos: [1] })];
  const carteira = [emp("e1", { anexo: 3 })]; // não casa mais
  const casos = [
    ["nao_se_aplica", "o contador disse que não se aplica"],
    ["virou_servico", "o apontamento já virou serviço cobrado"],
  ];
  for (const [status, desc] of casos) {
    const p = planejarGeracao(itens, carteira, [{ item_id: "i1", empresa_id: "e1", status }]);
    ok(p.superar.length === 0, `a varredura não mexe quando ${desc}`, p.superar);
  }
  const p2 = planejarGeracao(itens, carteira, [{ item_id: "i1", empresa_id: "e1", status: "novo" }]);
  ok(p2.superar.length === 1, "mas supera o que estava só aberto e deixou de casar");
  const p3 = planejarGeracao(itens, carteira, [{ item_id: "i1", empresa_id: "e1", status: "tratado" }]);
  ok(p3.superar.length === 1, "e supera também o que estava tratado — o fato mudou");
}

/* ═════════ 4 · superado REABRE, não duplica ════════════════════════════ */
{
  const itens = [item("i1", { anexos: [1] })];
  const carteira = [emp("e1")]; // voltou a casar
  const p = planejarGeracao(itens, carteira, [{ item_id: "i1", empresa_id: "e1", status: "superado" }]);
  ok(p.criar.length === 0, "não nasce um segundo registro do mesmo fato", p.criar);
  ok(p.reabrir.length === 1, "o que estava superado volta a abrir");
}

/* ═════════ 5 · empresa nova herda o passado ════════════════════════════
 * A razão de a varredura ser DIÁRIA e não semanal: a carteira muda todo dia,
 * mesmo quando a lei não muda. Quem importou hoje precisa dos apontamentos de
 * março. */
{
  const itens = [item("i1", { anexos: [1] }), item("i2", { faixas: ["A"] })];
  const antes = [emp("e1")];
  const jaGravados = planejarGeracao(itens, antes, []).criar
    .map((c) => ({ item_id: c.item_id, empresa_id: c.empresa_id, status: "novo" }));
  const depois = [...antes, emp("e2")];
  const p = planejarGeracao(itens, depois, jaGravados);
  ok(p.criar.length === 2 && p.criar.every((c) => c.empresa_id === "e2"),
     "empresa importada hoje herda as duas normas de março", p.criar);
}

/* ═════════ 6 · critério que exige análise ══════════════════════════════ */
{
  const itens = [item("i1", { somente_com_analise: true })];
  const p1 = planejarGeracao(itens, [emp("e1", { tem_analise: false, saida: null })], []);
  ok(p1.criar.length === 0, "sem análise, o critério que a exige não aponta");
  const p2 = planejarGeracao(itens, [emp("e1")], []);
  ok(p2.criar.length === 1, "salvar a análise faz a empresa entrar no apontamento");
}

/* ═════════ 7 · o selo da linha e a lista de novidades ══════════════════ */
{
  const lista = [
    { empresa_id: "e1", status: "novo" },
    { empresa_id: "e1", status: "novo" },
    { empresa_id: "e1", status: "tratado" },
    { empresa_id: "e2", status: "superado" },
    { empresa_id: "e3", status: "nao_se_aplica" },
  ];
  const mapa = abertosPorEmpresa(lista);
  ok(mapa.e1 === 2, "o selo conta só o que ainda pede trabalho", mapa);
  ok(mapa.e2 === undefined && mapa.e3 === undefined,
     "superado e 'não se aplica' não voltam a cobrar atenção", mapa);

  ok(!estaAberto({ status: "nao_se_aplica" }),
     "decidir que não se aplica JÁ é o trabalho — não continua aberto");

  const hist = [
    { criado_em: "2026-03-01", status: "novo" },
    { criado_em: "2026-08-07", status: "novo" },
    { criado_em: "2026-08-07", status: "tratado" },
  ];
  ok(novosDesde(hist, "2026-08-01").length === 1,
     "desde a última visita: só o que nasceu depois E ainda está aberto");
  ok(novosDesde(hist, null).length === 2,
     "sem data de referência, os abertos — nunca a lista inteira como novidade");
}

console.log(f === 0 ? "\nOK" : `\n${f} FALHA(S)`);
process.exit(f === 0 ? 0 : 1);
