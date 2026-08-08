/**
 * O FUNIL — onde as pessoas param.
 *
 * POR QUE TEM TESTE. Métrica de funil errada não quebra tela: ela faz decidir
 * na direção errada. O defeito clássico é contar cada etapa isoladamente —
 * "40 importaram, 12 analisaram" — e ler que 28 estão importando agora. Não
 * estão: pararam. Cada escritório precisa entrar em UM degrau só, o mais
 * avançado que alcançou, senão o número mente ao ser somado.
 */
import { degrauDe, montarFunil, gargalo, paradosEm } from "./funil.js";

let f = 0;
const ok = (c, m, e) => {
  if (!c) { f++; console.log("FALHOU:", m, e === undefined ? "" : JSON.stringify(e)); }
  else console.log("ok:", m);
};

const esc = (id, o = {}) => ({
  tenant_id: id, nome: `Escritório ${id}`, criado_em: "2026-08-01T10:00:00Z",
  empresas: 0, analises: 0, laudos: 0, termos: 0, assinados: 0, ...o,
});

/* ═══════════ 1 · o degrau é o MAIS AVANÇADO, nunca a soma ══════════════ */
{
  ok(degrauDe(esc("a")) === "criou", "conta sem carteira parou em 'criou'");
  ok(degrauDe(esc("b", { empresas: 12 })) === "importou", "com carteira e sem análise: importou");
  ok(degrauDe(esc("c", { empresas: 12, analises: 3 })) === "analisou", "analisou");
  ok(degrauDe(esc("d", { empresas: 12, analises: 3, laudos: 1 })) === "emitiu", "emitiu");
  ok(degrauDe(esc("e", { empresas: 12, analises: 3, laudos: 1, termos: 1 })) === "enviou", "enviou o termo");
  ok(degrauDe(esc("f", { empresas: 12, analises: 3, laudos: 1, termos: 1, assinados: 1 })) === "fechou",
     "assinatura colhida fecha a esteira");

  /* quem tem laudo mas nenhuma análise gravada (importou por lote antigo) não
     pode voltar para trás: o degrau é o mais avançado, não o primeiro furo */
  ok(degrauDe(esc("g", { empresas: 5, analises: 0, laudos: 2 })) === "emitiu",
     "buraco no meio não rebaixa quem já emitiu");
}

/* ═══════════ 2 · chegaram × pararam ═══════════════════════════════════ */
{
  const base = [
    esc("1"), esc("2"), esc("3"),                                   // pararam em criou
    esc("4", { empresas: 10 }), esc("5", { empresas: 4 }),          // pararam em importou
    esc("6", { empresas: 9, analises: 2 }),                         // parou em analisou
    esc("7", { empresas: 9, analises: 2, laudos: 1, termos: 1, assinados: 1 }), // fechou
  ];
  const fun = montarFunil(base);
  const por = Object.fromEntries(fun.map((l) => [l.chave, l]));

  ok(por.criou.chegaram === 7, "todo mundo passou pelo primeiro degrau", por.criou.chegaram);
  ok(por.criou.pararam === 3, "três pararam na conta criada");
  ok(por.importou.chegaram === 4, "quatro chegaram a importar", por.importou.chegaram);
  ok(por.importou.pararam === 2, "dois pararam com carteira e sem análise");
  ok(por.fechou.chegaram === 1 && por.fechou.pararam === 1, "um foi até o fim");

  const soma = fun.reduce((a, l) => a + l.pararam, 0);
  ok(soma === base.length, "a soma dos 'pararam' é o total de escritórios — ninguém contado duas vezes", soma);

  /* a passagem é sobre quem chegou ao degrau ANTERIOR */
  ok(por.importou.passagem === 57.1, "4 de 7 passaram do primeiro degrau", por.importou.passagem);
  ok(por.criou.passagem === null, "o primeiro degrau não tem passagem — não existe anterior");
}

/* ═══════════ 3 · o gargalo é onde a passagem despenca ════════════════
 * E não onde há mais gente parada: o primeiro degrau quase sempre acumula
 * mais em número absoluto, porque todo mundo passa por ele. */
{
  const base = [
    ...Array.from({ length: 6 }, (_, i) => esc(`i${i}`, { empresas: 8 })),      // travam em importou
    ...Array.from({ length: 6 }, (_, i) => esc(`c${i}`)),                        // travam em criou
    esc("z", { empresas: 8, analises: 4, laudos: 2, termos: 2, assinados: 1 }),
  ];
  const fun = montarFunil(base);
  const g = gargalo(fun);
  ok(g?.chave === "analisou",
     "o gargalo é a análise: 7 chegaram a importar e só 1 passou", g && [g.chave, g.passagem]);

  /* base pequena não vira diagnóstico */
  const poucos = montarFunil([esc("a"), esc("b", { empresas: 3 })]);
  ok(gargalo(poucos) === null, "com dois escritórios não se aponta gargalo — seria ruído");
}

/* ═══════════ 4 · a lista de quem contactar ══════════════════════════ */
{
  const base = [
    esc("velho", { empresas: 5, criado_em: "2026-07-01T10:00:00Z" }),
    esc("novo", { empresas: 2, criado_em: "2026-08-05T10:00:00Z" }),
    esc("outro", { empresas: 1, analises: 1 }),
  ];
  const parados = paradosEm(base, "importou", "2026-08-07T10:00:00Z");
  ok(parados.length === 2, "só quem parou naquele degrau entra na lista");
  ok(parados[0].tenant_id === "velho", "o mais antigo parado vem primeiro — é quem esfria");
  ok(parados[0].diasParado === 37 && parados[1].diasParado === 2, "os dias batem", parados.map((p) => p.diasParado));
  ok(paradosEm(base, "fechou", "2026-08-07T10:00:00Z").length === 0,
     "degrau sem ninguém devolve lista vazia, não erro");
}

console.log(f ? `\n${f} FALHA(S)` : "\ntudo ok");
process.exit(f ? 1 : 0);
