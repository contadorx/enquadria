import { decidir, PARAMETROS_2027 } from "./motor.js";
import fs from "fs";
const dados = JSON.parse(fs.readFileSync("/tmp/analises.json","utf8"));
let mudou = 0, folgaMudou = 0, comLaudo = 0, mudouComLaudo = 0, ganhoMudou = 0;
const linhas = [];
for (const a of dados) {
  const p = { ...PARAMETROS_2027, aliquota: a.aliquota, das: a.das, rbt12: a.rbt12 };
  const r = { b2b:a.respostas.b2b, qual:a.respostas.qual, cred:a.respostas.cred,
              folha:a.respostas.folha, preco:a.respostas.preco, conc:a.respostas.conc, exig:a.respostas.exig ?? 0 };
  const novo = decidir(r, p);
  const folgaAntiga = a.fc - a.re;
  const folgaNova = a.fc - (a.re * (1 - a.aliquota));
  const dif = Math.abs(folgaNova - folgaAntiga);
  if (a.tem_laudo) comLaudo++;
  if (novo.saida !== a.saida) { mudou++; if (a.tem_laudo) mudouComLaudo++;
    linhas.push(`  ${a.saida} → ${novo.saida}  ${a.tem_laudo?"COM LAUDO":"sem laudo"}  ${a.calculado_em.slice(0,10)}  ${novo.absorcao_cabe?"(absorção)":""}`); }
  if (dif > 1e-6) folgaMudou++;
  if (a.dinheiro_ganho != null && a.rbt12) {
    const novoGanho = novo.folga * novo.rq * a.rbt12;
    if (Math.abs(novoGanho - a.dinheiro_ganho) > 1) ganhoMudou++;
  }
}
console.log(`análises: ${dados.length} · com laudo emitido: ${comLaudo}`);
console.log(`SAÍDA muda se recalcular: ${mudou} (${(mudou/dados.length*100).toFixed(0)}%) — ${mudouComLaudo} delas já têm laudo`);
console.log(linhas.join("\n"));
console.log(`FOLGA impressa muda: ${folgaMudou} de ${dados.length}`);
console.log(`GANHO em R$ divergiria do congelado: ${ganhoMudou}`);
