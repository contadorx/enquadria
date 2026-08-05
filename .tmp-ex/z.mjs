import { decidir, dDASefetivo, PARAMETROS_2027 } from "./motor.js";
const CASOS = [
 [2027,.8,.9,.35,2,[[1,.5],[5,.5]],1_200_000],
 [2031,.8,.9,.35,2,[[1,.5],[5,.5]],1_200_000],
 [2033,.8,.9,.35,2,[[1,1]],1_200_000],
 [2029,.8,.9,.35,2,[[5,1]],3_000_000],
 [2027,.8,.9,.80,0,[[1,1]],1_200_000],
 [2027,.8,.9,.20,0,[[1,1]],1_200_000],
 [2027,.4,.5,.35,2,[[1,1]],1_200_000],
 [2027,.8,.9,.95,2,[[1,1]],1_200_000],
];
for (const [ex,b2b,qual,cred,preco,segs,rbt] of CASOS) {
  const das = segs.reduce((s,[a,w])=> s + w*dDASefetivo(a, rbt, null, ex).das, 0);
  const d = decidir({b2b,qual,cred,folha:.2,preco,conc:0,exig:0}, {...PARAMETROS_2027, das, rbt12: rbt});
  console.log(ex, "das", das.toFixed(10), "cl", d.cl.toFixed(8), "re", d.re.toFixed(8), "reliq", d.re_liquido.toFixed(8), "fc", d.fc.toFixed(8), "→", d.saida, d.absorcao_cabe?"(absorção)":"");
}
