import fs from 'node:fs';
import { parsearCarteira } from './csv.js';
import { triar } from './triagem.js';
import { calcularPotencial } from './potencial.js';

const texto = fs.readFileSync('/root/work/Enquadria_Massa_Demo_143.csv','utf8');
const r = parsearCarteira(texto);
console.log(`lidas ${r.total_lidas} · importadas ${r.linhas.length} · duplicadas ${r.duplicadas} · descartadas ${r.descartadas}`);
console.log('colunas reconhecidas:', Object.keys(r.colunas_reconhecidas).join(', '));
console.log('colunas ignoradas:', r.colunas_ignoradas.length ? r.colunas_ignoradas.join(', ') : '(nenhuma)');

const c = {A:0,B:0,C:0,D:0,MEI:0,FORA:0};
let prio = 0;
for (const l of r.linhas) {
  const t = triar({cnpj:l.cnpj, razao_social:l.razao_social, cnae_principal:l.cnae_principal,
                   porte:l.porte, situacao:l.situacao, regime:l.regime,
                   faturamento_faixa:l.faturamento_faixa});
  c[t.faixa]++;
  if (t.prioridade_maxima) prio++;
}
console.log('\nfaixas do motor:', JSON.stringify(c));
console.log(`\nTELA DA HOME:\n  ${r.linhas.length} clientes lidos`);
console.log(`  Urgente ${c.A} · Avaliar ${c.B} · Baixo risco ${c.C} · MEI/descarte ${c.D+c.MEI+c.FORA}`);
console.log(`  prioridade máxima: ${prio}`);
const p = calcularPotencial(c);
console.log(`\npotencial calculado pelo app: R$ ${p.valor_total.toLocaleString('pt-BR')}`);
console.log(`  ${p.analises} análises × R$ 600 = R$ ${p.valor_analises.toLocaleString('pt-BR')}`);
console.log(`  ${p.curtos} laudos curtos × R$ 150 = R$ ${p.valor_curtos.toLocaleString('pt-BR')}`);
console.log(`  triagem eliminou ${(p.pct_eliminado*100).toFixed(0)}% do trabalho`);

const alvo = {lidas:143, imp:143, A:19, B:27, C:36, resto:61};
const ok = r.total_lidas===143 && r.linhas.length===143 && r.duplicadas===0 && r.descartadas===0
        && c.A===19 && c.B===27 && c.C===36 && (c.D+c.MEI+c.FORA)===61;
console.log(ok ? '\n✓ BATE COM A HOME' : '\n✗ NÃO BATE');
process.exit(ok?0:1);
