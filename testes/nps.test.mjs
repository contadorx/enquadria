/**
 * NPS → indicação. A regra que mais importa aqui é NEGATIVA: detrator nunca
 * recebe pedido de indicação. Pedir indicação a quem acabou de dar nota 3
 * transforma pesquisa em ofensa, e é o tipo de coisa que alguém "simplifica"
 * um dia sem perceber o que quebrou.
 */
import { perfilDaNota, desfecho, limparIndicados, emailPlausivel, calcularNps } from "./nps.js";

let falhas = 0;
const ok = (c, m) => { if (c) console.log("ok:", m); else { console.log("FALHOU:", m); falhas++; } };

/* ── faixas do NPS ───────────────────────────────────────────────────── */
ok(perfilDaNota(10) === "promotor" && perfilDaNota(9) === "promotor", "9 e 10 são promotores");
ok(perfilDaNota(8) === "neutro" && perfilDaNota(7) === "neutro", "7 e 8 são neutros");
ok(perfilDaNota(6) === "detrator" && perfilDaNota(0) === "detrator", "6 para baixo é detrator");

/* ── a regra negativa, testada nota por nota ─────────────────────────── */
for (let n = 0; n <= 8; n++) {
  ok(!desfecho(n).pedeIndicacao, `nota ${n} NÃO pede indicação`);
}
for (const n of [9, 10]) {
  ok(desfecho(n).pedeIndicacao, `nota ${n} pede indicação`);
  ok(desfecho(n).acao === "indicar", `nota ${n} leva para indicar`);
}
ok(desfecho(3).acao === "conversar", "detrator vai para conversa");
ok(desfecho(7).acao === "melhorar", "neutro vai para pedido de melhoria");
ok(desfecho(2).titulo.length > 0 && desfecho(2).texto.length > 0, "detrator recebe texto, não silêncio");

/* ── limpeza da lista de indicados ───────────────────────────────────── */
const lista = limparIndicados([
  { nome: "Ana", email: "ana@x.com.br" },
  { nome: "", email: "ANA@X.COM.BR" },
  { nome: "Bruno", email: "bruno@y.com" },
  { nome: "Vazio", email: "" },
  { nome: "Torto", email: "isso-nao-e-email" },
  { nome: "Eu", email: "leandro@meu.com" },
], "leandro@meu.com");

ok(lista.length === 2, "some vazio, inválido, repetido e o próprio e-mail");
ok(lista[0].email === "ana@x.com.br", "normaliza caixa antes de comparar");
ok(lista.every((i) => i.nome), "indicado sem nome ganha um derivado do e-mail");
ok(limparIndicados([{ nome: "", email: "so@email.com" }])[0].nome === "so",
   "e o derivado é a parte antes do @");

ok(emailPlausivel("a@b.co"), "e-mail curto e válido passa");
ok(!emailPlausivel("a@b"), "sem ponto no domínio não passa");
ok(!emailPlausivel(""), "vazio não passa");

/* ── o cálculo do NPS ────────────────────────────────────────────────── */
ok(calcularNps([]) === null, "sem respostas, não há NPS — e null não é zero");
ok(calcularNps([10, 10, 10]) === 100, "só promotores dá 100");
ok(calcularNps([0, 0]) === -100, "só detratores dá -100");
ok(calcularNps([10, 7, 0]) === 0, "um de cada se anula");
ok(calcularNps([9, 9, 8, 8, 6]) === 20, "conta certa com neutros no meio");

process.exit(falhas ? 1 : 0);
