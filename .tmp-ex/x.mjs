import { decidir, dDASefetivo, PARAMETROS_2027 } from "./motor.js";
let achados=[];
for (const anexo of [1,2,3,4,5]) for (const rbt12 of [300_000,700_000,1_500_000,2_500_000,3_400_000])
 for (const b2b of [.4,.6,.8,1]) for (const qual of [.5,.7,.9,1]) for (let cred=0;cred<=.8;cred+=.1) for (const preco of [0,2,3]) {
  const r={b2b,qual,cred,folha:.2,preco,conc:0,exig:0};
  const s=[2027,2029,2031,2033].map(a=>decidir(r,{...PARAMETROS_2027,das:dDASefetivo(anexo,rbt12,null,a).das,rbt12}).saida);
  if (new Set(s).size>1) achados.push({anexo,rbt12,b2b,qual,cred:+cred.toFixed(2),preco,s});
}
console.log("casos que mudam:", achados.length);
console.log(achados.slice(0,6));
