/**
 * TESTE DO ESTUDO DE ABERTURA.
 *
 * Este motor tem uma característica perigosa: ele responde uma pergunta que o
 * cliente vai SEGUIR. "Abra no Anexo III" e "abra no Presumido" mudam a vida
 * fiscal de uma empresa por anos, e o erro só aparece meses depois, quando já
 * não dá para desfazer sem custo.
 *
 * Por isso os testes aqui não conferem só se a função devolve algo: conferem o
 * SENTIDO das respostas — que o fator R deixe de compensar quando o
 * pró-labore necessário cresce demais, que o alerta do Anexo IV apareça para
 * construção, que o teto do Simples seja avisado antes de a empresa bater nele.
 *
 * Rodado pelo testes/rodar-tudo.mjs junto das demais suítes puras.
 */
import {
  ENTRADA_PADRAO,
  CENARIOS,
  FATOR_R_LIMITE,
  anexoDeAbertura,
  entradaAnual,
  estudarFatorR,
  estudarAbertura,
  conclusaoDaAbertura,
} from "./abertura.js";
import { PREMISSAS_PADRAO, premissasDoSetor, TETOS } from "./comparativo.js";

let f = 0;
const ok = (c, m, e) => {
  if (!c) { f++; console.log("FALHOU:", m, e === undefined ? "" : JSON.stringify(e)); }
  else console.log("ok:", m);
};

const com = (x) => ({ ...ENTRADA_PADRAO, ...x });

/* ───────────────────────────── o anexo de partida ───────────────────────── */
// serviço com folha magra cai no V; com folha gorda, no III. É a regra que
// decide o imposto de um escritório inteiro de prestadores.
ok(anexoDeAbertura("servicos", 360000, 36000) === 5, "serviço com folha de 10% nasce no Anexo V");
ok(anexoDeAbertura("servicos", 360000, 120000) === 3, "serviço com folha de 33% nasce no Anexo III");
ok(anexoDeAbertura("servicos", 360000, 360000 * FATOR_R_LIMITE) === 3, "exatamente 28% já é Anexo III");
ok(anexoDeAbertura("comercio", 360000, 0) === 1, "comércio não depende de folha");
ok(anexoDeAbertura("construcao", 360000, 999999) === 4, "construção vai para o IV mesmo com folha alta");

/* ───────────────────────────── mensal → anual ───────────────────────────── */
{
  const a = entradaAnual(com({ receita_mensal: 30000, folha_mensal: 2000, prolabore_mensal: 3000 }));
  ok(a.receita === 360000, "receita mensal vira anual", a.receita);
  ok(a.folha === 60000, "folha ANUAL soma salários e pró-labore", a.folha);
  const alto = entradaAnual(com({ receita_mensal: 30000 }), 1.5);
  ok(alto.receita === 540000, "o fator do cenário multiplica só a receita", alto.receita);
}

/* ───────────────────────────── fator R: a conta que decide ──────────────── */
{
  // serviço com pró-labore baixo: subir até 28% costuma valer muito
  const e = com({ setor: "servicos", receita_mensal: 30000, folha_mensal: 0, prolabore_mensal: 2000 });
  const r = estudarFatorR(e, premissasDoSetor("servicos"));
  ok(r.aplicavel === true, "fator R se aplica a serviço");
  ok(r.prolabore_extra_mensal > 0, "diz quanto falta de pró-labore por mês", r.prolabore_extra_mensal);
  ok(Math.abs(r.folha_alvo_anual - 360000 * FATOR_R_LIMITE) < 1, "o alvo é 28% da receita anual");
  ok(r.economia_anual > 0, "sair do V para o III economiza DAS", r.economia_anual);
  ok(r.vale === r.economia_anual > r.custo_extra_anual, "a recomendação segue a conta, não a torcida");
  ok(/pró-labore/.test(r.frase), "a frase explica o que fazer");
}
{
  // já acima dos 28%: nada a fazer, e o aviso é de MANTER
  const e = com({ setor: "servicos", receita_mensal: 10000, folha_mensal: 0, prolabore_mensal: 4000 });
  const r = estudarFatorR(e, premissasDoSetor("servicos"));
  ok(r.prolabore_extra_mensal === 0, "quem já está no III não precisa subir nada");
  ok(r.vale === true && /Mantenha|garantido/.test(r.frase), "e é avisado de que a folha sustenta o enquadramento", r.frase);
}
{
  // comércio não tem essa escolha — e prometer que tem seria mentira
  const r = estudarFatorR(com({ setor: "comercio" }), PREMISSAS_PADRAO);
  ok(r.aplicavel === false, "fora do serviço, o fator R não se aplica");
  ok(r.prolabore_extra_mensal === 0 && r.economia_anual === 0, "e não inventa números");
}

/* ───────────────────────────── os três cenários ─────────────────────────── */
{
  const est = estudarAbertura(com({ receita_mensal: 30000 }));
  ok(est.cenarios.length === CENARIOS.length, "um resultado por cenário");
  ok(est.cenarios[0].receita_anual < est.cenarios[1].receita_anual, "o cenário baixo é menor que o base");
  ok(est.cenarios[2].receita_anual > est.cenarios[1].receita_anual, "e o alto é maior");
  ok(est.recomendado !== undefined, "há um regime recomendado no cenário base");
  ok(est.cenarios.every((c) => c.comparativo.regimes.length === 4), "os quatro regimes em cada cenário");
  ok(typeof est.estavel === "boolean", "diz se a resposta é estável entre cenários");
  ok(/regime de menor carga/.test(conclusaoDaAbertura(est)), "a conclusão vem em português", conclusaoDaAbertura(est));
}

/* ───────────────────────────── os alertas ───────────────────────────────── */
{
  const est = estudarAbertura(com({ setor: "construcao", receita_mensal: 50000, folha_mensal: 20000 }));
  ok(est.alertas.some((a) => /Anexo IV/.test(a)), "construção é avisada da patronal fora do DAS", est.alertas);
}
{
  // 300k/mês = 3,6mi/ano; no cenário alto passa do teto de 4,8mi
  const est = estudarAbertura(com({ setor: "comercio", receita_mensal: 300000 }));
  ok(est.cenarios[2].receita_anual > TETOS.simples, "o cenário alto realmente estoura o teto");
  ok(est.alertas.some((a) => /teto do Simples/.test(a)), "e o estouro é avisado antes de acontecer", est.alertas);
}
{
  const pj = estudarAbertura(com({ vende_para_pj: true, setor: "comercio", receita_mensal: 20000 }));
  const pf = estudarAbertura(com({ vende_para_pj: false, setor: "comercio", receita_mensal: 20000 }));
  const temCredito = (e) => e.alertas.some((a) => /crédito/.test(a));
  ok(temCredito(pj) && temCredito(pf), "os dois casos falam de crédito — em sentidos opostos");
  ok(pf.alertas.some((a) => /consumidor final/.test(a)), "quem vende a PF é dispensado da preocupação");
  ok(!pf.alertas.some((a) => /pressão por desconto/.test(a)), "e não recebe o alerta de competitividade");
}
{
  const est = estudarAbertura(com({ margem_lucro: 0.03 }));
  ok(est.alertas.some((a) => /Lucro Real/.test(a)), "margem esmagada manda olhar o Lucro Real");
}

/* ───────────────────────── o número não pode ser absurdo ────────────────── */
{
  // trava de sanidade: carga de qualquer regime entre 0% e 60% da receita
  const est = estudarAbertura(com({ receita_mensal: 80000, folha_mensal: 20000 }));
  const todas = est.cenarios.flatMap((c) => c.comparativo.regimes);
  ok(todas.every((r) => r.sobre_receita >= 0 && r.sobre_receita < 0.6),
     "nenhuma carga sai fora da faixa plausível",
     todas.map((r) => [r.regime, Number((r.sobre_receita * 100).toFixed(1))]));
  ok(est.recomendado && todas.filter((r) => !r.impedimento).every((r) => r.total >= 0),
     "e nenhum total é negativo");
}

if (f) { console.log(`\n${f} FALHA(S)`); process.exit(1); }
console.log("\nabertura: tudo passou");
