/* Confere cada número citado no deck do módulo 2 contra o motor. */
import {decidir,PARAMETROS_2027,dDASefetivo,dDASsegregado,aliquotaEfetivaSimples} from './motor.js';
const RBT=1200000, P=PARAMETROS_2027;
const r2=(x,c=2)=>Number(x.toFixed(c));
const A=[];
const ok=(cond,msg)=>{A.push([cond,msg]); };

ok(r2(aliquotaEfetivaSimples(1,RBT)*100,3)===8.825,'efetiva A1 = 8,825%');
const d1=dDASefetivo(1,RBT), d5=dDASefetivo(5,RBT);
ok(r2(d1.das*100)===1.37,'dDAS A1 = 1,37%');
ok(r2(d5.das*100)===3.65,'dDAS A5 = 3,65%');
ok(r2(aliquotaEfetivaSimples(5,RBT)*100,3)===19.075,'efetiva A5 = 19,075%');
const mix=dDASsegregado([{anexo:1,share:.5},{anexo:5,share:.5}],RBT);
ok(r2(mix.das*100)===2.51,'dDAS mix = 2,51%');
ok(r2((d1.das-mix.das)/mix.das*100,1)===-45.5,'erro de −45,5% (mesma base da planilha)');

const resp={b2b:.8,qual:.9,cred:.35,preco:2,conc:0,exig:0};
const errado=decidir(resp,{...P,das:d1.das,rbt12:RBT});
const certo =decidir(resp,{...P,das:mix.das,rbt12:RBT});
ok(r2(errado.re*100)===6.04 && errado.saida==='S3','só A1: repasse 6,04% e S3');
ok(r2(errado.fc*100)===7.43,'só A1: ganho 7,43%');
ok(r2(certo.rq*100,1)===72.0,'rq 72,0%');
ok(r2(certo.ch*100)===5.72,'ch 5,72%');
ok(r2(certo.cl*100)===3.21,'cl 3,21%');
ok(Math.round(RBT*certo.cl)===38516,'cl R$ 38.516/ano');
ok(Math.round(RBT*certo.rq)===864000,'qualificada R$ 864.000');
ok(r2(certo.re*100)===4.46 && certo.saida==='S4','segregado: repasse 4,46% e S4');
ok(r2(certo.fc*100)===6.29,'ganho 6,29%');
ok(r2(certo.folga*100)===1.83,'folga 1,83 p.p.');
ok(Math.round(RBT*certo.rq*certo.folga/100)*100>=15800-200,'folga ~R$ 15.800/ano');

const alt=decidir(resp,{...P,aliquota:.094,das:mix.das,rbt12:RBT});
ok(r2(alt.re*100)===5.00 && alt.saida==='S4','9,4%: repasse 5,00% e S4');
ok(r2(alt.fc*100)===6.89,'9,4%: ganho 6,89%');

for (const [c,re_,sa] of [[.45,3.24,'S4'],[.35,4.46,'S4'],[.25,5.68,'S3']]){
  const x=decidir({...resp,cred:c},{...P,das:mix.das,rbt12:RBT});
  ok(r2(x.re*100)===re_ && x.saida===sa, `crédito ${c*100}% → repasse ${re_}% e ${sa}`);
}
ok(decidir(resp,{...P,das:mix.das,rbt12:3500000}).banda_sublimite===true,'banda do sublimite acende em 3,5 mi');
ok(P.sublimite*0.95===3420000 && P.sublimite*1.05===3780000,'banda 3,42 mi a 3,78 mi');

let mau=0;
for (const [c,m] of A){ if(!c){mau++; console.log('  ✗',m);} }
console.log(`${A.length-mau}/${A.length} números do deck conferem com o motor`);
process.exit(mau?1:0);
