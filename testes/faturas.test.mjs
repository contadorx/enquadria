/**
 * TESTE DA CENTRAL DE FATURAS.
 *
 * Aqui o erro custa dinheiro nos dois sentidos: uma fatura estornada que
 * aparece como paga libera acesso que ninguém pagou; uma paga que aparece como
 * vencida faz um cliente adimplente receber cobrança — e esse escreve, ou
 * cancela.
 *
 * A data entra como ARGUMENTO em tudo. Sem isso, "vencida" seria uma função do
 * dia em que o teste roda: passaria em agosto e falharia em setembro, sem
 * nenhuma linha de código ter mudado.
 *
 * Rodado pelo testes/rodar-tudo.mjs junto das demais suítes puras.
 */
import {
  statusDoAsaas,
  statusEfetivo,
  podePagar,
  resumirFaturas,
  ordenarFaturas,
  moedaCentavos,
} from "./faturas.js";

let f = 0;
const ok = (c, m, e) => {
  if (!c) { f++; console.log("FALHOU:", m, e === undefined ? "" : JSON.stringify(e)); }
  else console.log("ok:", m);
};

const HOJE = new Date("2026-08-04T12:00:00Z");
const fat = (x) => ({ id: "f1", valor_centavos: 4700, status: "pendente", ...x });

/* ───────────────────────── o de-para com o Asaas ────────────────────── */
ok(statusDoAsaas("RECEIVED") === "pago", "RECEIVED é pago");
ok(statusDoAsaas("CONFIRMED") === "pago", "CONFIRMED é pago");
ok(statusDoAsaas("PAYMENT_RECEIVED") === "pago", "o nome do EVENTO também é entendido");
ok(statusDoAsaas("RECEIVED_IN_CASH") === "pago", "recebido em dinheiro é pago");
ok(statusDoAsaas("OVERDUE") === "vencido", "OVERDUE é vencida");
ok(statusDoAsaas("REFUNDED") === "estornado", "estorno não é pagamento");
ok(statusDoAsaas("CHARGEBACK_REQUESTED") === "estornado", "chargeback também sai de pago");
ok(statusDoAsaas("PAYMENT_DELETED") === "cancelado", "cobrança apagada é cancelada");
ok(statusDoAsaas("PENDING") === "pendente", "PENDING é pendente");
// a regra que protege a receita: desconhecido nunca vira pago
ok(statusDoAsaas("ALGO_QUE_O_ASAAS_INVENTOU") === "pendente",
   "status desconhecido cai em pendente, NUNCA em pago");
ok(statusDoAsaas(null) === "pendente", "sem status, pendente");

/* ───────────────────────── vencida sem depender do evento ───────────── */
ok(statusEfetivo(fat({ vencimento: "2026-07-01" }), HOJE) === "vencido",
   "pendente com data no passado é vencida, mesmo sem o evento OVERDUE chegar");
ok(statusEfetivo(fat({ vencimento: "2026-08-04" }), HOJE) === "pendente",
   "vence hoje ainda não está vencida — o dia inteiro é do cliente");
ok(statusEfetivo(fat({ vencimento: "2026-09-01" }), HOJE) === "pendente", "vencimento futuro é pendente");
ok(statusEfetivo(fat({ status: "pago", vencimento: "2026-01-01" }), HOJE) === "pago",
   "paga não vira vencida por causa da data");
ok(statusEfetivo(fat({ status: "estornado", vencimento: "2026-01-01" }), HOJE) === "estornado",
   "estornada continua estornada");
ok(statusEfetivo(fat({ vencimento: null }), HOJE) === "pendente", "sem vencimento, pendente");

/* ───────────────────────── o botão de pagar ─────────────────────────── */
ok(podePagar(fat({ vencimento: "2026-07-01", link_pagamento: "https://x" }), HOJE),
   "vencida com link oferece pagar — é o caso que mais salva assinatura");
ok(podePagar(fat({ vencimento: "2026-09-01", link_boleto: "https://x" }), HOJE),
   "pendente com boleto também");
ok(!podePagar(fat({ vencimento: "2026-07-01" }), HOJE),
   "sem link não promete botão que não leva a lugar nenhum");
ok(!podePagar(fat({ status: "pago", link_pagamento: "https://x" }), HOJE),
   "paga não oferece pagar de novo");
ok(!podePagar(fat({ status: "cancelado", link_pagamento: "https://x" }), HOJE),
   "cancelada não pode ser paga");

/* ───────────────────────── o resumo ─────────────────────────────────── */
{
  const lista = [
    fat({ id: "a", status: "pago", valor_centavos: 47000, pago_em: "2026-01-10" }),
    fat({ id: "b", status: "pago", valor_centavos: 4700 }),
    fat({ id: "c", vencimento: "2026-07-01", valor_centavos: 4700 }),   // vencida
    fat({ id: "d", vencimento: "2026-09-10", valor_centavos: 4700 }),   // a vencer
    fat({ id: "e", vencimento: "2026-09-01", valor_centavos: 4700 }),   // a vencer, antes
    fat({ id: "x", status: "cancelado", valor_centavos: 99900 }),
  ];
  const r = resumirFaturas(lista, HOJE);
  ok(r.pago_centavos === 51700, "soma só o que foi pago", r.pago_centavos);
  ok(r.aberto_centavos === 14100, "em aberto soma pendentes E vencidas", r.aberto_centavos);
  ok(r.pago_centavos + r.aberto_centavos !== 99900 + 51700 + 14100,
     "cancelada não entra em soma nenhuma");
  ok(r.proxima?.id === "e", "a próxima é a de vencimento mais perto", r.proxima?.id);
  ok(r.atrasada?.id === "c", "a atrasada é a vencida mais antiga", r.atrasada?.id);
  ok(r.total === 6, "conta todas");

  const ordem = ordenarFaturas(lista, HOJE).map((x) => x.id);
  ok(ordem[0] === "c", "a vencida vai para o topo — é o que a pessoa veio resolver", ordem);
  ok(ordem[1] === "d" || ordem[1] === "e", "depois as em aberto", ordem);
  ok(ordem.indexOf("x") === ordem.length - 1, "cancelada por último", ordem);
  ok(ordenarFaturas(lista, HOJE).length === lista.length && lista[0].id === "a",
     "ordenar não mexe no array original");
}

{
  const r = resumirFaturas([], HOJE);
  ok(r.total === 0 && r.proxima === null && r.atrasada === null,
     "lista vazia não inventa próxima nem atrasada");
}

/* ───────────────────────── a cifra ──────────────────────────────────── */
ok(moedaCentavos(4700).includes("47,00"), "centavos viram reais", moedaCentavos(4700));
ok(moedaCentavos(0).includes("0,00"), "zero é zero");

if (f) { console.log(`\n${f} FALHA(S)`); process.exit(1); }
console.log("\nfaturas: tudo passou");
