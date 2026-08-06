/**
 * O RECIBO DE PAGAMENTO — o e-mail que não existia.
 *
 * O BURACO, medido em 06/08/2026: o webhook do Asaas liberava o acesso, somava
 * o MRR, atualizava as colunas de cobrança do escritório e avisava o CRM. A
 * única pessoa que não recebia nada era quem tinha acabado de pagar.
 *
 * Estas asserções travam as três coisas que fazem este e-mail valer alguma
 * coisa: a DATA DE VALIDADE no assunto (é o que ele vai procurar em três
 * semanas), os dias herdados POR ESCRITO (a tela promete e nunca repetia), e o
 * escape do que vem de fora.
 */
import { htmlPagamentoConfirmado, assuntoPagamentoConfirmado } from "./emails-cliente.js";

let f = 0;
const ok = (c, m, e) => {
  if (!c) { f++; console.log("FALHOU:", m, e === undefined ? "" : JSON.stringify(e)); }
  else console.log("ok:", m);
};

const base = (x = {}) => ({
  plano: "Profissional",
  valor: "R$ 197,00",
  pago_em: "04/08/2026",
  valido_ate: "04/09/2026",
  credito_dias: 0,
  link: "https://app.enquadria.com.br/painel",
  ...x,
});

/* ═══════════ 1 · o assunto responde sem abrir ═══════════════════════════ */
{
  const a = assuntoPagamentoConfirmado("Profissional", "04/09/2026");
  ok(a.includes("04/09/2026"),
     "a DATA está no assunto — 'Pagamento confirmado' sozinho não responde 'até quando eu paguei'", a);
  ok(a.includes("Profissional"), "e o plano também, porque a conta pode trocar de plano", a);
}

/* ═══════════ 2 · o corpo carrega o que foi comprado ═════════════════════ */
{
  const h = htmlPagamentoConfirmado(base());
  ok(h.includes("R$ 197,00"), "o valor pago está no corpo");
  ok(h.includes("Profissional"), "o plano está no corpo");
  ok(h.includes("04/09/2026"), "a validade está no corpo");
  ok(h.includes("04/08/2026"), "a data do pagamento está no corpo");
  ok(h.includes("Minhas\n    faturas") || h.includes("Minhas") && h.includes("faturas"),
     "e diz onde o comprovante fica guardado");
  ok(/Enquadria/.test(h),
     "aqui a marca É a Enquadria: neste e-mail nós somos o fornecedor, e esconder isso seria mentir sobre quem cobrou");
}

/* ═══════════ 3 · sem data de pagamento, sem linha vazia ═════════════════ */
{
  const h = htmlPagamentoConfirmado(base({ pago_em: null }));
  ok(!h.includes("Pago em"), "sem a data, a linha inteira some — não fica rótulo órfão", h.includes("Pago em"));
  ok(h.includes("Acesso até"), "e o resto da tabela continua de pé");
}

/* ═══════════ 4 · os dias herdados, que a tela promete ═══════════════════
 * A tela de Planos promete, na troca de plano, que os dias que sobravam vêm
 * junto. Promessa feita na tela e nunca repetida é promessa que o cliente não
 * consegue conferir — e conferir é o que ele faz quando desconfia.
 * ══════════════════════════════════════════════════════════════════════════ */
{
  const semTroca = htmlPagamentoConfirmado(base({ credito_dias: 0 }));
  ok(!/sobravam do seu plano anterior/.test(semTroca),
     "sem troca de plano, nada sobre crédito — não se explica o que não aconteceu");

  const comTroca = htmlPagamentoConfirmado(base({ credito_dias: 18 }));
  ok(/18 dias/.test(comTroca), "com troca, os dias herdados aparecem por escrito", comTroca.includes("18"));
  ok(/sobravam do seu plano anterior/.test(comTroca), "e a frase explica de onde vieram");

  const umDia = htmlPagamentoConfirmado(base({ credito_dias: 1 }));
  ok(/1 dia<\/strong>/.test(umDia), "singular certo: '1 dia', não '1 dias'", umDia.match(/1 dias?/g));

  const semCampo = htmlPagamentoConfirmado({ ...base(), credito_dias: undefined });
  ok(!/plano anterior/.test(semCampo), "campo ausente é tratado como zero, não como NaN");
}

/* ═══════════ 5 · o que vem de fora é escapado ═══════════════════════════ */
{
  const h = htmlPagamentoConfirmado(base({ plano: 'Pro <script>alert("x")</script>' }));
  ok(!h.includes("<script>"), "nome de plano não vira HTML no e-mail");
  ok(h.includes("&lt;script&gt;"), "e sai escapado, não some");
}

/* ═══════════ 6 · uma chamada só ═════════════════════════════════════════
 * Regra da casa para os e-mails do fluxo: um botão. O segundo disputa com o
 * primeiro e os dois perdem.
 * ══════════════════════════════════════════════════════════════════════════ */
{
  const h = htmlPagamentoConfirmado(base({ credito_dias: 18 }));
  const botoes = (h.match(/border-radius:999px/g) || []).length;
  ok(botoes === 1, "exatamente um botão no e-mail", botoes);
}

console.log(f ? `\n${f} FALHA(S)` : "\ntudo ok");
process.exit(f ? 1 : 0);
