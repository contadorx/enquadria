import { decidir, pressaoComercial, PARAMETROS_2027 } from "./motor.js";
const p = { ...PARAMETROS_2027, das: 0.0251, rbt12: 1_200_000 };
const r = { b2b:.8, qual:.9, cred:.35, folha:.2, preco:3, conc:0, exig:0 };
const d = decidir(r, p);
const q = pressaoComercial(d, p);
const f = (x)=> (x*100).toFixed(2).replace(".",",")+"%";
console.log({rq:f(d.rq), ch:f(d.ch), cl:f(d.cl), re:f(d.re), re_liq:f(d.re_liquido), fc:f(d.fc),
  folga_pp:(d.folga*100).toFixed(2), folga_reais: Math.round(d.folga*d.rq*1_200_000),
  re_unico:f(d.re_unico), saida:d.saida});
console.log({piso:f(q.piso), teto:f(q.teto), excedente:f(q.excedente), parte:f(q.parte_minima), nivel:q.nivel});
