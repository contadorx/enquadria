import {decidir,PARAMETROS_2027,dDASefetivo,dDASsegregado,aliquotaEfetivaSimples,ANEXOS_SIMPLES,pct} from './motor.js';

const RBT=1200000;
console.log('--- ALIQUOTA EFETIVA Anexo I, RBT12 1.200.000');
const f=ANEXOS_SIMPLES[1][3];
console.log('faixa 4 nominal',f.nominal,'deduzir',f.deduzir,'sharePC',f.sharePC);
console.log('efetiva =',aliquotaEfetivaSimples(1,RBT));
const d1=dDASefetivo(1,RBT); console.log('dDAS A1', d1.das, pct(d1.das,2));
const d5=dDASefetivo(5,RBT); console.log('dDAS A5', d5.das, pct(d5.das,2), 'efetiva', d5.aliquota);
const mix=dDASsegregado([{anexo:1,share:0.5},{anexo:5,share:0.5}],RBT);
console.log('dDAS mix 50/50', mix.das, pct(mix.das,2));
console.log('erro de usar A1 sozinho:', ((mix.das-d1.das)/d1.das*100).toFixed(1)+'%');

const resp={b2b:0.8,qual:0.9,cred:0.35,preco:2,conc:0,exig:0};
for (const [nome,das] of [['só Anexo I',d1.das],['segregado 50/50',mix.das]]){
  const r=decidir(resp,{...PARAMETROS_2027,das,rbt12:RBT});
  console.log(nome,'| rq',pct(r.rq),'ch',pct(r.ch,2),'cl',pct(r.cl,2),'re',pct(r.re,2),'fc',pct(r.fc,2),'folga',pct(r.folga,2),'->',r.saida);
}
console.log('\n--- cenario alternativo 9,4%');
for (const a of [0.088,0.094]){
  const r=decidir(resp,{...PARAMETROS_2027,aliquota:a,das:mix.das,rbt12:RBT});
  console.log('aliq',a,'ch',pct(r.ch,2),'cl',pct(r.cl,2),'re',pct(r.re,2),'fc',pct(r.fc,2),'->',r.saida);
}
console.log('\n--- sensibilidade cred');
for (const c of [0.25,0.35,0.45]){
  const r=decidir({...resp,cred:c},{...PARAMETROS_2027,das:mix.das,rbt12:RBT});
  console.log('cred',c,'re',pct(r.re,2),'fc',pct(r.fc,2),'->',r.saida);
}
console.log('\nparams: aliquota',PARAMETROS_2027.aliquota,'das padrao',PARAMETROS_2027.das);
