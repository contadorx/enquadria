/**
 * UMA CONTA, UM PLANO — os casos que a regra precisa acertar.
 *
 * Nasceu de um relato de uma frase só: "eu assinei o mensal e depois mudei
 * para o anual; se eu clicar novamente no plano, nova fatura". Por trás dela,
 * três decisões diferentes que a tela não distinguia — clique repetido, troca
 * com a anterior não paga, e troca com a anterior JÁ PAGA.
 *
 * A data entra como argumento em toda função testada aqui. É o que permite
 * fixar "hoje" e conferir a conta de dias sem que o teste mude de resultado
 * conforme o dia em que roda.
 */

import {
  diasRestantes,
  validadeFinal,
  decidirContratacao,
  decidirSucessao,
  fraseCredito,
} from "./assinatura.js";

let falhou = 0;
const ok = (nome, cond, detalhe) => {
  if (cond) console.log("ok:", nome);
  else {
    falhou++;
    console.log("FALHOU:", nome, detalhe === undefined ? "" : JSON.stringify(detalhe));
  }
};

const HOJE = new Date("2026-08-04T15:00:00-03:00");
const A = (id, plano_id, status, extra = {}) => ({ id, plano_id, status, ...extra });

/* ═══════════════════════════════════════════════ dias que sobram ════════ */
ok("18 dias restantes conta certo", diasRestantes("2026-08-22", HOJE) === 18, diasRestantes("2026-08-22", HOJE));
ok("vence hoje = 0", diasRestantes("2026-08-04", HOJE) === 0);
ok("já venceu NÃO devolve negativo", diasRestantes("2026-07-01", HOJE) === 0, diasRestantes("2026-07-01", HOJE));
ok("sem data (cortesia sem prazo) = 0", diasRestantes(null, HOJE) === 0);
ok("data lixo não quebra", diasRestantes("nao-e-data", HOJE) === 0);
/* O CLIQUE DAS 23H59 NÃO PODE VALER UM DIA A MENOS.
   O app roda em UTC na Vercel; o contador está em São Paulo. Contando pelo
   relógio do servidor, quem clica no fim da noite perde um dia de crédito —
   para ele ainda é hoje, para o servidor já é amanhã. */
ok("a hora do dia (no fuso do Brasil) não muda a conta",
   diasRestantes("2026-08-22", new Date("2026-08-04T23:59:00-03:00")) ===
   diasRestantes("2026-08-22", new Date("2026-08-04T00:01:00-03:00")));

/* ══════════════════════════════════════════════ validade final ═════════ */
ok("anual sem crédito = 365 dias", validadeFinal(new Date("2026-08-04T12:00:00Z"), 365, 0) === "2027-08-04",
   validadeFinal(new Date("2026-08-04T12:00:00Z"), 365, 0));
ok("anual com 18 dias de crédito empurra a data",
   validadeFinal(new Date("2026-08-04T12:00:00Z"), 365, 18) === "2027-08-22",
   validadeFinal(new Date("2026-08-04T12:00:00Z"), 365, 18));
ok("crédito negativo não encurta o plano",
   validadeFinal(new Date("2026-08-04T12:00:00Z"), 31, -50) === "2026-09-04");

/* O ASAAS MANDA DATA-CALENDÁRIO, e `new Date("2026-08-04")` é meia-noite UTC —
   21h do dia 3 no Brasil. Passar por Date ali custava um dia a quem pagou. */
ok("data crua do Asaas não perde um dia no fuso",
   validadeFinal("2026-08-04", 365, 0) === "2027-08-04",
   validadeFinal("2026-08-04", 365, 0));
ok("...e o instante equivalente dá o mesmo",
   validadeFinal(new Date("2026-08-04T10:00:00Z"), 365, 0) === "2027-08-04");

/* ═════════════════════════════════════════ clicar de novo no mesmo ═════ */
{
  const d = decidirContratacao(
    "pro_anual",
    [A("p1", "pro_anual", "pendente", { checkout_url: "https://asaas/1", asaas_id: "pay_1" })],
    HOJE
  );
  ok("clicou de novo no mesmo plano: reaproveita", d.acao === "reaproveitar", d.acao);
  ok("...e devolve a cobrança que já existia", d.reaproveitar?.id === "p1", d.reaproveitar);
  ok("...sem cancelar nada", d.cancelar.length === 0, d.cancelar);
}
{
  /* pendente SEM link é tentativa que morreu no meio: reaproveitar mandaria a
     pessoa para lugar nenhum */
  const d = decidirContratacao("pro_anual", [A("p1", "pro_anual", "pendente")], HOJE);
  ok("pendente sem link não é reaproveitada", d.acao === "nova", d.acao);
  ok("...e sai de cena", d.cancelar.includes("p1"), d.cancelar);
}
{
  /* o caso real: 14 cliques no mensal, um boleto que presta */
  const muitas = Array.from({ length: 14 }, (_, i) =>
    A(`m${i}`, "assinatura", "pendente", i === 13 ? { checkout_url: "https://asaas/ultimo" } : {})
  );
  const d = decidirContratacao("assinatura", muitas, HOJE);
  ok("14 pendentes do mesmo plano: fica UMA", d.acao === "reaproveitar" && d.cancelar.length === 13,
     { acao: d.acao, cancelar: d.cancelar.length });
  ok("...e a que fica é a que tem link", d.reaproveitar?.id === "m13", d.reaproveitar?.id);
}

/* ════════════════════════════════════ trocar de plano, anterior NÃO paga ═ */
{
  const d = decidirContratacao(
    "pro_anual",
    [A("m1", "assinatura", "pendente", { checkout_url: "https://asaas/m1", asaas_id: "pay_m1" })],
    HOJE
  );
  ok("mensal pendente + contrata anual: gera nova", d.acao === "nova", d.acao);
  ok("...e o mensal pendente é cancelado", d.cancelar.includes("m1"), d.cancelar);
  ok("...sem crédito de dias (nada foi pago)", d.credito_dias === 0, d.credito_dias);
}

/* ═══════════════════════════════════════ trocar de plano, anterior PAGA ═ */
{
  const d = decidirContratacao(
    "pro_anual",
    [A("m1", "assinatura", "ativa", { valido_ate: "2026-08-22" })],
    HOJE
  );
  ok("mensal PAGO + contrata anual: gera nova", d.acao === "nova", d.acao);
  /* o ponto que mais importa: acesso já pago não cai no clique */
  ok("...e o plano pago NÃO é cancelado agora", d.cancelar.length === 0, d.cancelar);
  ok("...os 18 dias que sobram viram crédito", d.credito_dias === 18, d.credito_dias);
  ok("...e a tela sabe qual plano está sendo substituído",
     d.ativa_atual?.plano_id === "assinatura", d.ativa_atual);
}
{
  /* renovar o MESMO plano não é troca: não há dias a herdar de si mesmo */
  const d = decidirContratacao(
    "pro_anual",
    [A("a1", "pro_anual", "ativa", { valido_ate: "2026-08-22" })],
    HOJE
  );
  ok("renovar o mesmo plano não gera crédito de si mesmo", d.credito_dias === 0, d.credito_dias);
}
{
  /* assinatura ativa VENCIDA não segura nada nem dá crédito */
  const d = decidirContratacao(
    "pro_anual",
    [A("v1", "assinatura", "ativa", { valido_ate: "2026-06-01" })],
    HOJE
  );
  ok("plano ativo já vencido não conta como atual", d.ativa_atual === undefined, d.ativa_atual);
  ok("...nem gera crédito", d.credito_dias === 0, d.credito_dias);
}

/* ══════════════════════════════════════════ a sucessão, no pagamento ════ */
{
  const s = decidirSucessao(
    "an1",
    [
      A("an1", "pro_anual", "pendente"),
      A("m1", "assinatura", "ativa", { valido_ate: "2026-08-22" }),
      A("m2", "assinatura", "pendente", { asaas_id: "pay_m2" }),
      A("x0", "assinatura", "cancelada"),
    ],
    HOJE
  );
  ok("pagou o anual: as outras saem de cena", s.cancelar.sort().join(",") === "m1,m2", s.cancelar);
  ok("...a já cancelada não é mexida de novo", !s.cancelar.includes("x0"));
  ok("...e herda os 18 dias do mensal pago", s.credito_dias === 18, s.credito_dias);
}
{
  /* pendente não gera crédito: senão bastaria clicar em "Assinar" várias vezes
     para acumular dias de acesso sem pagar nada */
  const s = decidirSucessao(
    "an1",
    [A("an1", "pro_anual", "pendente"), A("m1", "assinatura", "pendente", { valido_ate: "2026-12-31" })],
    HOJE
  );
  ok("boleto não pago NÃO vira dia de acesso", s.credito_dias === 0, s.credito_dias);
}
{
  const s = decidirSucessao("an1", [A("an1", "pro_anual", "pendente")], HOJE);
  ok("conta com uma assinatura só: nada a encerrar", s.cancelar.length === 0 && s.credito_dias === 0);
}

/* ═══════════════════════════════════════════════════════ a frase ═══════ */
ok("sem dias, nenhuma frase", fraseCredito(0) === null);
ok("1 dia no singular", (fraseCredito(1) ?? "").includes("O dia que ainda restava"), fraseCredito(1));
ok("18 dias no plural", (fraseCredito(18) ?? "").includes("18 dias"), fraseCredito(18));

console.log(falhou === 0 ? "\nTUDO PASSOU" : `\n${falhou} FALHA(S)`);
process.exit(falhou === 0 ? 0 : 1);
