import { decidir, dDASefetivo, PARAMETROS_2027 } from "./motor.js";
let s2=0,s3abs=0,tot=0, absv=[];
for (const anexo of [1,2,3,4,5]) for (const rbt12 of [400_000,900_000,1_800_000,3_000_000]) {
  const das = dDASefetivo(anexo, rbt12).das;
  const p = {...PARAMETROS_2027, das, rbt12: null};
  for (const b2b of [.2,.4,.6,.8,1]) for (const qual of [.3,.5,.7,.9,1])
    for (let cred=0; cred<=.9; cred+=.05) for (const preco of [0,1,2,3]) {
      const x = decidir({b2b,qual,cred,folha:.2,preco,conc:0,exig:0}, p);
      tot++;
      if (x.saida==="S2") s2++;
      if (x.absorcao_cabe) { s3abs++; absv.push(x.cl); }
    }
}
absv.sort((a,b)=>a-b);
console.log({tot, s2, pctS2:(s2/tot*100).toFixed(1), s3abs, pctAbs:(s3abs/tot*100).toFixed(1),
  medianaAbs:(absv[absv.length>>1]*100).toFixed(3), maxAbs:(absv.at(-1)*100).toFixed(3)});
const t = decidir({b2b:.8,qual:.9,cred:.85,folha:.2,preco:0,conc:0,exig:0}, PARAMETROS_2027);
console.log(t.saida, t.absorcao_cabe, (t.cl*100).toFixed(3), t.motivo);
