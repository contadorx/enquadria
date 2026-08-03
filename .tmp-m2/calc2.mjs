import {decidir,PARAMETROS_2027,dDASsegregado,dDASefetivo,pct,moeda} from './motor.js';
const RBT=1200000;
const mix=dDASsegregado([{anexo:1,share:0.5},{anexo:5,share:0.5}],RBT);
const resp={b2b:0.8,qual:0.9,cred:0.35,preco:2,conc:0,exig:0};
const r=decidir(resp,{...PARAMETROS_2027,das:mix.das,rbt12:RBT});
const rqReais=RBT*r.rq;
console.log('dDAS mix exato', (mix.das*100).toFixed(2));
console.log('receita qualificada R$', moeda(rqReais));
console.log('cl em reais sobre receita total', moeda(RBT*r.cl));
console.log('repasse em reais sobre receita qualificada', moeda(rqReais*r.re));
console.log('folga em reais', moeda(rqReais*r.folga));
// sublimite
const sub=decidir(resp,{...PARAMETROS_2027,das:mix.das,rbt12:3500000});
console.log('rbt12 3.5M ->', sub.saida, sub.banda_sublimite);
// S1 por rq baixa
const s1=decidir({...resp,b2b:0.3,qual:0.6},{...PARAMETROS_2027,das:mix.das,rbt12:RBT});
console.log('b2b 30% qual 60% ->', s1.saida, pct(s1.rq));
// S2
const s2=decidir({...resp,preco:1},{...PARAMETROS_2027,das:mix.das,rbt12:RBT});
console.log('sem poder de preco ->', s2.saida);
// S5
const s5=decidir({...resp,cred:0.75},{...PARAMETROS_2027,das:mix.das,rbt12:RBT});
console.log('cred 75% ->', s5.saida, 'cl', pct(s5.cl,2));
