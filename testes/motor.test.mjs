/**
 * TESTE DO MOTOR E DO LAUDO — funções puras, sem banco e sem React.
 *
 * Cobre o que a fatia 5 e a fatia 7 acrescentaram: os dois cenários de alíquota,
 * a conversão em reais, a sensibilidade, a banda do sublimite, o alerta de fator
 * R, a partilha por exercício e a memória de cálculo do laudo.
 *
 * Por que isto existe: número errado aqui vira número errado num documento
 * assinado por contador, e esse é o único erro desta série que não tem conserto.
 *
 * Como rodar:
 *   npx tsc lib/motor.ts lib/laudo.ts lib/triagem.ts lib/cockpit.ts \
 *     lib/premissas-padrao.ts --outDir .tmp-testes --module esnext \
 *     --target es2020 --moduleResolution bundler --skipLibCheck
 *   cd .tmp-testes && sed -i 's|from "\./\([a-z-]*\)"|from "./\1.js"|g' *.js
 *   cp ../testes/motor.test.mjs . && node motor.test.mjs
 */

import {
  decidir,
  cenarios,
  emReais,
  sensibilidade,
  alertaFatorR,
  sharePCDe,
  derivarQual,
  derivarCred,
  carimboAliquota,
  dDASefetivo,
  PARAMETROS_2027,
  ALIQUOTA_ALTERNATIVA,
  dDASsegregado,
  ehSegregado,
  fatorRSegregado,
  somaSegmentos,
  segmentosFechados,
  ANEXOS_SIMPLES,
} from "./motor.js";
import {
  memoriaDeCalculo,
  quadroComparativo,
  condicoesDeValidade,
  riscosELimites,
  tabelaDoAnexo,
  ehLaudoCurto,
  premissasComOrigem,
} from "./laudo.js";

let f = 0;
const ok = (c, m) => {
  if (!c) {
    f++;
    console.log("FALHOU:", m);
  } else console.log("ok:", m);
};

const R = { b2b: 0.9, qual: 0.92, cred: 0.7, folha: 0.12, preco: 2, conc: 1, exig: 0 };
const ddas = dDASefetivo(1, 1200000);
const P = { ...PARAMETROS_2027, das: ddas.das, rbt12: 1200000 };

// ------------------------------------------------------------ dois cenários
const c = cenarios(R, P);
ok(c.length === 2, "dois cenários");
ok(c[0].aliquota === 0.088 && c[1].aliquota === ALIQUOTA_ALTERNATIVA, "8,8% e 9,4%");
ok(c[1].resultado.re > c[0].resultado.re, "alíquota maior exige repasse maior");

const carimbo = carimboAliquota(0.088, "2026-07-29T12:00:00Z");
ok(carimbo.fixada === false && carimbo.fixacao_ate === "31/10/2026", "o carimbo diz que a alíquota não está fixada");
ok(carimbo.fonte.includes("Resolução do Senado"), "o carimbo cita a fonte");

// ------------------------------------------------------------------- reais
const base = decidir(R, P);
const d = emReais(base, 1200000, 3600);
const esperado = base.folga * base.rq * 1200000;
ok(Math.abs(d.ganho_anual - esperado) < 0.01, "ganho = folga × receita qualificada × receita");
ok(Math.abs(d.payback_meses - (3600 / esperado) * 12) < 0.01, "payback em meses");
ok(Math.abs(d.absorvido_anual - base.cl * 1200000) < 0.01, "absorvido = custo líquido × receita");
ok(emReais(base, null, 3600).ganho_anual === null, "sem RBT12 não inventa reais");
ok(emReais(base, 1200000, null).payback_meses === null, "sem custo declarado não há payback");

// ----------------------------------------------------------- sensibilidade
const s = sensibilidade(R, P, d);
ok(s.length === 3, "três linhas de sensibilidade");
ok(s[0].titulo.includes("10 pontos") && s[2].titulo.includes("9,4"), "as três linhas certas");

// --------------------------------------------------- banda do sublimite
const naBanda = decidir(R, { ...P, rbt12: 3600000, das: dDASefetivo(1, 3600000).das });
ok(naBanda.saida === "S3" && naBanda.banda_sublimite === true, "RBT12 no sublimite leva a decisão ao empresário");
ok(!decidir(R, { ...P, rbt12: 1200000 }).banda_sublimite, "longe do sublimite não força nada");
ok(
  decidir({ ...R, b2b: 0.12, qual: 0.1 }, { ...P, rbt12: 3600000 }).saida === "S1",
  "o sublimite não cria decisão onde não há receita qualificada"
);

// ------------------------------------------------------------- fator R
ok(alertaFatorR(5, 0.37) !== null, "Anexo V com folha alta alerta");
ok(alertaFatorR(3, 0.12) !== null, "Anexo III com folha baixa alerta");
ok(alertaFatorR(3, 0.37) === null, "Anexo III com folha alta não alerta");
ok(alertaFatorR(1, 0.12) === null, "Anexo I não entra no fator R");

// ------------------------------------------------- partilha por exercício
ok(sharePCDe(1, 3, 2027).valor === 0.155, "partilha de 2027 existe");
ok(sharePCDe(1, 3, 2030).valor === null, "2030 recusa calcular em vez de projetar");
ok(sharePCDe(1, 3, 2030).motivo.includes("não está parametrizada"), "e diz por quê");

// --------------------------------------------------------- derivações
ok(Math.abs(derivarQual({ fora_simples: 0.65, sem_aproveitamento: 0.2 }) - 0.52) < 1e-9, "qual = fora × (1 − sem aproveitamento)");
ok(Math.abs(derivarCred({ insumos: 0.27, servicos: 0.07, outros: 0.03 }) - 0.37) < 1e-9, "cred = soma das três");
ok(derivarCred({ insumos: 0.9, servicos: 0.5, outros: 0.5 }) === 1, "cred não passa de 100%");

// -------------------------------------------------------------- o laudo
const analise = {
  id: "a1",
  rq: base.rq,
  ch: base.ch,
  cl: base.cl,
  re: base.re,
  fc: base.fc,
  saida: base.saida,
  prioridade: base.prioridade,
  respostas: R,
  calculado_em: "2026-07-29",
  parametros: {
    exercicio: 2027,
    aliquota: 0.088,
    das: ddas.das,
    rbt12: 1200000,
    anexo: 1,
    ddas,
    carimbo,
    cenarios: c,
    dinheiro: d,
    sensibilidade: s,
    motivo: base.motivo,
    detalhes: {
      qual: { fora_simples: 0.92, sem_aproveitamento: 0 },
      cred: { insumos: 0.45, servicos: 0.15, outros: 0.1 },
    },
    origens: { b2b: "informada", qual: "estimada", cred: "informada" },
  },
};

const mem = memoriaDeCalculo(analise);
ok(mem.length === 8, `memória de cálculo com 8 passos (veio ${mem.length})`);
ok(mem.every((x) => x.formula && x.substituicao && x.resultado), "todo passo tem fórmula, substituição e resultado");
ok(mem[0].substituicao.includes("R$"), "o passo 1 substitui a RBT12 real");
ok(quadroComparativo(analise).length === 4, "quadro comparativo com quatro linhas");
ok(quadroComparativo(analise)[1].dentro.includes("R$"), "quadro em % e em R$");
ok(condicoesDeValidade(analise).length >= 4, "o que precisa continuar verdadeiro");
ok(riscosELimites(analise).length >= 4, "riscos e limites");
ok(tabelaDoAnexo(analise).linhas.length === 6, "anexo com as seis faixas");
ok(tabelaDoAnexo(analise).faixaAtual === ddas.faixa, "faixa da empresa destacada");
ok(ehLaudoCurto("D") && ehLaudoCurto("MEI") && !ehLaudoCurto("A"), "laudo curto só para C, D, MEI e FORA");
const pr = premissasComOrigem(analise);
ok(pr.find((x) => x.pergunta.includes("aproveitam")).origem === "estimada", "origem estimada marcada");
ok(pr.find((x) => x.pergunta.includes("aproveitam")).composicao.includes("fora do Simples"), "composição da premissa desdobrada");

// ------------------------------------------- retrocompatibilidade
const antiga = {
  id: "v",
  rq: 0.5,
  ch: 0.05,
  cl: 0.03,
  re: 0.06,
  fc: 0.07,
  saida: "S4",
  prioridade: false,
  respostas: R,
  calculado_em: null,
  parametros: null,
};
ok(memoriaDeCalculo(antiga).length >= 3, "análise antiga ainda gera memória parcial");
ok(quadroComparativo(antiga).length === 0, "sem dDAS congelado, o quadro não inventa");
ok(riscosELimites(antiga).length >= 4, "riscos valem para análise antiga");


/* ======================================================================
   RECEITA SEGREGADA POR ANEXO

   O caso da empresa de serviço que também vende, e do serviço que fica no
   III ou no V conforme o fator R. Cada anexo tem a sua partilha de
   PIS/Cofins, e `das` É essa partilha — logo, tratar empresa mista por um
   anexo só erra exatamente o número que decide.
   ====================================================================== */
const RBT = 1200000;

// 1) um segmento só tem de devolver o MESMO que o caminho antigo, senão a
//    mudança reescreveria em silêncio o resultado das análises já emitidas
for (const a of [1, 2, 3, 4, 5]) {
  const antigo = dDASefetivo(a, RBT);
  const novo = dDASsegregado([{ anexo: a, share: 1 }], RBT);
  ok(novo.das === antigo.das && novo.faixa === antigo.faixa,
     `anexo ${a} sozinho: segregado devolve o mesmo das de sempre`);
  ok(!ehSegregado(novo), `anexo ${a} sozinho não se declara segregado`);
}
ok(dDASsegregado([], RBT).das === dDASefetivo(null, RBT).das, "lista vazia cai no caminho antigo");
ok(dDASsegregado(null, RBT).das === dDASefetivo(null, RBT).das, "null cai no caminho antigo");

// 2) a conta ponderada — conferida contra a soma feita à mão
const meioMeio = dDASsegregado([{ anexo: 1, share: 0.5 }, { anexo: 5, share: 0.5 }], RBT);
const soI = dDASefetivo(1, RBT);
const soV = dDASefetivo(5, RBT);
const dasEsperado = soI.das * 0.5 + soV.das * 0.5;
ok(Math.abs(meioMeio.das - dasEsperado) < 1e-12, "50% comércio + 50% Anexo V: das é a média ponderada");
ok(ehSegregado(meioMeio), "dois segmentos se declaram segregados");
ok(meioMeio.segmentos.length === 2, "guarda os dois segmentos para o laudo imprimir");
ok(Math.abs(meioMeio.segmentos.reduce((t, s) => t + s.contribuicao, 0) - meioMeio.das) < 1e-12,
   "as contribuições somam o das final");

// 3) E O ERRO QUE ISTO CORRIGE: pelo anexo dominante, quanto se erraria?
//    Registrado como número para que ninguém trate a segregação como detalhe.
const erroRelativo = Math.abs(soI.das - meioMeio.das) / meioMeio.das;
ok(erroRelativo > 0.2,
   `tratar a mista pelo Anexo I erraria o das em ${(erroRelativo * 100).toFixed(1)}% — por isso a segregação existe`);
ok(soV.das > soI.das, "Anexo V tem partilha de PIS/Cofins maior que o Anexo I (premissa do teste acima)");

// 4) o das segregado fica ENTRE os extremos: não inventa número fora do
//    intervalo dos anexos que o compõem
ok(meioMeio.das > Math.min(soI.das, soV.das) && meioMeio.das < Math.max(soI.das, soV.das),
   "das ponderado fica entre o menor e o maior dos anexos");

// 5) participação inválida não entra na conta
const comLixo = dDASsegregado(
  [{ anexo: 1, share: 0.5 }, { anexo: 5, share: 0.5 }, { anexo: 9, share: 0.3 }, { anexo: 2, share: 0 }],
  RBT
);
ok(Math.abs(comLixo.das - meioMeio.das) < 1e-12, "anexo inexistente e participação zero são descartados");

// 6) soma fora de 100% normaliza E AVISA — o laudo precisa poder dizer isso
const torto = dDASsegregado([{ anexo: 1, share: 0.4 }, { anexo: 5, share: 0.4 }], RBT);
ok(ehSegregado(torto) && torto.normalizado, "soma de 80% é marcada como normalizada");
ok(Math.abs(torto.somaInformada - 0.8) < 1e-12, "guarda a soma informada, não a corrigida");
ok(Math.abs(torto.das - meioMeio.das) < 1e-12, "normalizada, 40/40 dá o mesmo que 50/50");
ok(!ehSegregado(meioMeio) || !meioMeio.normalizado, "soma de 100% não é marcada como normalizada");

// 7) o anexo dominante é rótulo, não conta
const dominante = dDASsegregado([{ anexo: 1, share: 0.2 }, { anexo: 5, share: 0.8 }], RBT);
ok(dominante.anexo === 5, "anexo dominante é o de maior receita");
ok(Math.abs(dominante.das - (soI.das * 0.2 + soV.das * 0.8)) < 1e-12, "mas o das continua sendo a soma ponderada");

// 8) acima do teto contamina o conjunto: se um segmento estoura, a empresa
//    estourou — ela é uma só
const acima = dDASsegregado([{ anexo: 1, share: 0.5 }, { anexo: 3, share: 0.5 }], 5000000);
ok(acima.acimaDoTeto === true, "RBT12 acima do teto marca o conjunto");

// 9) sem RBT12 o conjunto inteiro é conservador
const semRbt = dDASsegregado([{ anexo: 1, share: 0.5 }, { anexo: 3, share: 0.5 }], null);
ok(semRbt.fonte === "conservador", "sem RBT12, fonte conservadora");

// 10) FATOR R na composição — a pergunta muda de "o anexo está certo" para
//     "a receita de serviço está no anexo certo"
const segServico = [{ anexo: 1, share: 0.6 }, { anexo: 5, share: 0.4 }];
const alertaAlta = fatorRSegregado(segServico, 0.35);
ok(alertaAlta !== null && alertaAlta.deveriaSer === 3, "folha em 35%: serviço no V deveria ser III");
ok(fatorRSegregado(segServico, 0.15) === null, "folha em 15%: serviço no V está certo, sem alerta");
const segIII = [{ anexo: 1, share: 0.6 }, { anexo: 3, share: 0.4 }];
ok(fatorRSegregado(segIII, 0.35) === null, "folha em 35%: serviço no III está certo");
ok(fatorRSegregado(segIII, 0.15)?.deveriaSer === 5, "folha em 15%: serviço no III deveria ser V");
ok(fatorRSegregado([{ anexo: 1, share: 1 }], 0.15) === null, "sem serviço na composição, não há alerta de fator R");
ok(fatorRSegregado([{ anexo: 4, share: 1 }], 0.15) === null, "Anexo IV não entra na regra do fator R");
ok(fatorRSegregado(segServico, null) === null, "sem folha informada, não inventa alerta");

// 11) a trava da tela
ok(segmentosFechados([{ anexo: 1, share: 0.5 }, { anexo: 5, share: 0.5 }]), "50+50 fecha");
ok(!segmentosFechados([{ anexo: 1, share: 0.5 }, { anexo: 5, share: 0.4 }]), "50+40 não fecha");
ok(Math.abs(somaSegmentos([{ anexo: 1, share: 0.3 }, { anexo: 5, share: 0.45 }]) - 0.75) < 1e-12, "soma das participações");

// 12) a decisão MUDA com a segregação — é o ponto todo
const respMista = { b2b: 0.8, qual: 0.9, cred: 0.35, folha: 0.15, preco: 2, conc: 1, exig: 0 };
const soComercio = decidir(respMista, { ...PARAMETROS_2027, das: soI.das, rbt12: RBT });
const segregada = decidir(respMista, { ...PARAMETROS_2027, das: meioMeio.das, rbt12: RBT });
ok(soComercio.cl !== segregada.cl, "o custo líquido muda quando a receita é segregada");
console.log(`   (mesma empresa: cl ${(soComercio.cl * 100).toFixed(2)}% pelo Anexo I sozinho contra ${(segregada.cl * 100).toFixed(2)}% segregada, saídas ${soComercio.saida}/${segregada.saida})`);

console.log(f === 0 ? "\nTODOS OS TESTES PASSARAM" : `\n${f} FALHAS`);
process.exit(f ? 1 : 0);
