import { parsearCarteira } from './csv.js';
const t = `cnpj
90.000.000/0001-84
90.000.137/0001-39
90.000.274/0001-73`;
const r = parsearCarteira(t);
console.log('lidas',r.total_lidas,'importadas',r.linhas.length,'descartadas',r.descartadas);
console.log(r.linhas[0]);
