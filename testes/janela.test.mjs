/**
 * TESTE DAS FASES DA JANELA.
 *
 * O selo do cockpit e as réguas de e-mail leem daqui. Errar a fase significa
 * dizer ao contador que o serviço acabou quando ele começou, ou anunciar um
 * prazo de cancelamento que já passou.
 */
import { faseDaJanela, MARCOS } from "./janela.js";

let f = 0;
const ok = (c, m, e) => {
  if (!c) { f++; console.log("FALHOU:", m, e === undefined ? "" : JSON.stringify(e)); }
  else console.log("ok:", m);
};
const em = (iso) => new Date(iso + "T12:00:00Z").getTime();

ok(faseDaJanela(em("2026-08-15")).fase === "antes", "agosto: ainda não abriu");
ok(faseDaJanela(em("2026-09-01")).fase === "aberta", "1º de setembro: aberta");
ok(faseDaJanela(em("2026-09-30")).fase === "aberta", "30 de setembro ainda é dentro");
ok(faseDaJanela(em("2026-10-01")).fase === "aliquota", "1º de outubro: fase da alíquota");
ok(faseDaJanela(em("2026-10-31")).fase === "aliquota", "31/10 ainda é o prazo da alíquota");
ok(faseDaJanela(em("2026-11-01")).fase === "cancelamento", "novembro: prazo de cancelamento");
ok(faseDaJanela(em("2026-11-30")).fase === "cancelamento", "30/11 é o último dia de cancelar");
ok(faseDaJanela(em("2026-12-01")).fase === "efeito", "dezembro: regime rodando");
ok(faseDaJanela(em("2027-02-20")).fase === "efeito", "fevereiro ainda aponta para março");
ok(faseDaJanela(em("2027-04-01")).fase === "proxima", "depois de março: nova janela");

// o defeito que este arquivo existe para impedir
const nenhum = ["2026-10-05", "2026-11-10", "2027-01-15", "2027-05-01"]
  .map((d) => faseDaJanela(em(d)).selo)
  .filter((s) => /encerrad/i.test(s));
ok(nenhum.length === 0, "nunca diz 'encerrada' depois de 30/09", nenhum);

// toda fase tem selo e chamada — selo vazio some da tela sem avisar
const datas = ["2026-08-01","2026-09-15","2026-10-15","2026-11-15","2027-01-01","2027-06-01"];
ok(datas.every((d) => {
  const x = faseDaJanela(em(d));
  return x.selo.length > 3 && x.chamada.length > 20;
}), "toda fase tem selo e chamada");

// contagem regressiva sempre positiva e coerente
const out = faseDaJanela(em("2026-10-20"));
ok(out.dias === 11, "20/10 → faltam 11 dias para 31/10", out.dias);
const nov = faseDaJanela(em("2026-11-25"));
ok(nov.dias === 5, "25/11 → faltam 5 dias para 30/11", nov.dias);

// no dia do marco, 0 dias — e o selo precisa dizer isso em palavras
const ultimo = faseDaJanela(em("2026-11-30"));
ok(ultimo.dias === 0, "30/11 → 0 dias", ultimo.dias);
ok(/último dia/i.test(ultimo.selo), "no dia do marco o selo diz 'último dia'", ultimo.selo);
ok(/hoje/i.test(faseDaJanela(em("2026-10-31")).selo), "31/10 → 'alíquota sai hoje'",
   faseDaJanela(em("2026-10-31")).selo);

// a próxima janela é PREVISÃO e o produto precisa dizer isso
ok(MARCOS.proxima_confirmada === false, "a próxima janela está marcada como não confirmada");
ok(faseDaJanela(em("2027-01-10")).previsto === true, "a fase de efeito avisa que a data é prevista");
ok(faseDaJanela(em("2026-09-15")).previsto === false, "a janela publicada NÃO é marcada como prevista");

console.log(f === 0 ? "TODOS OS TESTES PASSARAM" : `${f} FALHAS`);
process.exit(f ? 1 : 0);
