/**
 * C6 — RBT12 PROJETADA.
 *
 * A opção se exerce em setembro de 2026 e vale de janeiro a junho de 2027. O
 * motor calculava a parcela que sai do DAS com a RBT12 de HOJE — e para uma
 * empresa que cresce, o número que o laudo afirma já não vale no período em que
 * ele é aplicado.
 *
 * O que esta suíte protege, em ordem de importância:
 *
 *  1. que a projeção RECUSA projetar sem base (crescimento chutado é pior que
 *     seção nenhuma);
 *  2. que a divergência entre as duas contas vira S3 — decisão do empresário —
 *     e não um desempate do motor;
 *  3. que os dois cruzamentos (sublimite e teto do Simples) aparecem, porque são
 *     os dois eventos que mudam a natureza da conta, não só o valor dela;
 *  4. que a camada é ADITIVA: sem projeção, nada muda.
 */
import { decidir, dDASefetivo, PARAMETROS_2027 } from "./motor.js";
import {
  projetarRBT12, decidirComProjecao, SUBLIMITE, TETO_SIMPLES, MESES_ATE_FIM_DO_EFEITO,
  rbt12AnteriorPorCrescimento, crescimentoPorRBT12Anterior,
} from "./projecao.js";

let f = 0;
const ok = (c, m, e) => {
  if (!c) { f++; console.log("FALHOU:", m, e === undefined ? "" : JSON.stringify(e)); }
  else console.log("ok:", m);
};
const perto = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
const resp = (x = {}) => ({ b2b: .8, qual: .9, cred: .35, folha: .2, preco: 3, conc: 0, exig: 0, ...x });

/* ═════════════ 1 · sem base, não projeta — e isso é a feature ═══════════ */
ok(projetarRBT12({ rbt12: 1_000_000, anexo: 1 }) === null,
   "sem RBT12 anterior e sem crescimento informado, devolve null em vez de projetar com 0%");
ok(projetarRBT12({ rbt12: 0, rbt12_anterior: 900_000, anexo: 1 }) === null,
   "sem RBT12 de hoje não há de onde partir");
ok(projetarRBT12({ rbt12: 1_000_000, rbt12_anterior: 0, crescimento: 0.2, anexo: 1 })?.origem === "informado",
   "RBT12 anterior zerada não vale como medição — cai para o informado");
{
  const p = projetarRBT12({ rbt12: 1_000_000, rbt12_anterior: 800_000, crescimento: 0.9, anexo: 1 });
  ok(p.origem === "medido" && perto(p.crescimento, 0.25),
     "com os dois, o MEDIDO ganha do informado — o que a empresa fez vence a expectativa", p.crescimento);
}

/* ═════════════ 2 · a aritmética ═════════════════════════════════════════ */
{
  const p = projetarRBT12({ rbt12: 1_000_000, rbt12_anterior: 800_000, anexo: 1 });
  ok(p.meses === MESES_ATE_FIM_DO_EFEITO && p.meses === 9,
     "o horizonte padrão é de 9 meses: setembro/2026 até o fim do efeito, junho/2027");
  /* composto, não linear: 1,25^0,75 = 1,18114… — o linear daria 1,1875 */
  ok(perto(p.rbt12_projetado, 1_000_000 * Math.pow(1.25, 0.75), 1e-6),
     "a projeção é COMPOSTA — (1+g)^(m/12), que é o que 'ao ano' significa", p.rbt12_projetado);
  ok(p.rbt12_projetado < 1_000_000 * (1 + 0.25 * 0.75),
     "…e por isso é menor que a linear: projetar por cima não é conservador, é errado");
}
{
  /* queda também projeta, e o piso impede receita negativa */
  const q = projetarRBT12({ rbt12: 1_000_000, crescimento: -0.4, anexo: 1 });
  ok(q.rbt12_projetado < 1_000_000 && q.rbt12_projetado > 0, "crescimento negativo encolhe a RBT12", q.rbt12_projetado);
  const abismo = projetarRBT12({ rbt12: 1_000_000, crescimento: -5, anexo: 1 });
  ok(abismo.rbt12_projetado >= 0 && isFinite(abismo.rbt12_projetado),
     "e −500% não produz receita negativa nem NaN", abismo.rbt12_projetado);
}

/* ═════════════ 3 · faixa, sublimite e teto ══════════════════════════════ */
{
  /* faixa 3 do Anexo I termina em 720.000; partindo de 700.000 com 25% a.a. a
     projeção passa disso */
  const p = projetarRBT12({ rbt12: 700_000, rbt12_anterior: 560_000, anexo: 1 });
  ok(p.faixa === 3 && p.faixa_projetada > 3, "a mudança de faixa é detectada", { de: p.faixa, para: p.faixa_projetada });
  ok(p.muda_faixa === true, "e marcada");
  ok(p.das_projetado > p.das, "a parcela que sai do DAS sobe com a faixa — é o número da conta", { das: p.das, proj: p.das_projetado });
}
{
  const p = projetarRBT12({ rbt12: 3_400_000, crescimento: 0.3, anexo: 1 });
  ok(p.rbt12_projetado > SUBLIMITE, "a projeção passa do sublimite", p.rbt12_projetado);
  ok(p.cruza_sublimite === true, "e o cruzamento é marcado");
  ok(p.cruza_teto === false, "sem confundir com o teto do Simples");
}
{
  const p = projetarRBT12({ rbt12: 4_600_000, crescimento: 0.3, anexo: 1 });
  ok(p.cruza_teto === true, "o teto do Simples também é vigiado", p.rbt12_projetado);
}
{
  /* quem já está do outro lado não CRUZA nada — está lá */
  const p = projetarRBT12({ rbt12: 5_000_000, crescimento: 0.1, anexo: 1 });
  ok(p.cruza_teto === false && p.acima_do_teto_hoje === true,
     "quem já está acima do teto hoje não 'cruza' — e o laudo precisa dizer outra coisa");
  const q = projetarRBT12({ rbt12: 3_800_000, crescimento: 0.1, anexo: 1 });
  ok(q.cruza_sublimite === false, "idem para quem já passou do sublimite");
}
{
  /* a banda do sublimite é ±5% em torno de 3,6 mi (3,42 a 3,78). Uma empresa em
     3,2 mi está FORA dela e mesmo assim atravessa a linha no período — este é
     exatamente o caso que só a projeção enxerga. */
  const rbt12 = 3_200_000;
  const dentroDaBanda = Math.abs(rbt12 - SUBLIMITE) <= SUBLIMITE * 0.05;
  ok(!dentroDaBanda, "3,2 mi está fora da banda do sublimite que o motor já vigiava");
  const p = projetarRBT12({ rbt12, crescimento: 0.25, anexo: 1 });
  ok(p.cruza_sublimite, "mas a projeção acusa o cruzamento — é este o buraco que C6 fecha");
}

/* ═════════════ 4 · a decisão: divergência vira S3 ═══════════════════════ */
{
  const p = projetarRBT12({ rbt12: 700_000, rbt12_anterior: 560_000, anexo: 1 });
  const d = decidirComProjecao(resp(), { ...PARAMETROS_2027, das: p.das }, p);
  ok(d.hoje && d.projetado, "as duas contas saem, e as duas ficam à vista");
  ok(d.saida === (d.divergem ? "S3" : d.hoje.saida),
     "a saída é a de hoje quando concordam, e S3 quando discordam", { divergem: d.divergem, saida: d.saida });
  ok(d.linhas.length >= 3, "com pelo menos três frases para o laudo", d.linhas.length);
}
{
  /* uma divergência construída: das muda o bastante para trocar a saída */
  let achou = null;
  for (let g = 0; g <= 3 && !achou; g += 0.05) {
    for (const rbt12 of [200_000, 500_000, 900_000, 1_500_000, 2_500_000, 3_300_000]) {
      for (const anexo of [1, 2, 3, 4, 5]) {
        const p = projetarRBT12({ rbt12, crescimento: g, anexo });
        if (!p) continue;
        for (const cred of [0, .2, .4, .6]) {
          const d = decidirComProjecao(resp({ cred }), { ...PARAMETROS_2027, das: p.das }, p);
          if (d.divergem) { achou = d; break; }
        }
        if (achou) break;
      }
      if (achou) break;
    }
  }
  ok(achou != null, "existe divergência real na grade — a camada não é decorativa");
  ok(achou.saida === "S3", "e ela vira S3", achou.saida);
  ok(/depende do faturamento de 2027/.test(achou.motivo),
     "com o motivo dizendo POR QUE o motor não decide — é o que devolve a decisão a quem tem o número");
  ok(achou.linhas.some((l) => /monótona/.test(l)) === false,
     "e a frase de 'vale para todo o período' NÃO aparece quando as contas discordam");
}
{
  /* concordância: a frase da monotonicidade aparece, e é o que autoriza olhar
     só dois pontos em vez de doze */
  const p = projetarRBT12({ rbt12: 1_000_000, crescimento: 0.02, anexo: 1 });
  const d = decidirComProjecao(resp(), { ...PARAMETROS_2027, das: p.das }, p);
  ok(!d.divergem && d.linhas.some((l) => /monótona/.test(l)),
     "concordando, o laudo explica por que dois pontos bastam");
}

/* ═════════════ 5 · os alertas, no texto ═════════════════════════════════ */
{
  const p = projetarRBT12({ rbt12: 3_400_000, crescimento: 0.3, anexo: 1 });
  const d = decidirComProjecao(resp(), { ...PARAMETROS_2027, das: p.das }, p);
  ok(d.linhas.some((l) => /ALERTA/.test(l) && /sublimite/.test(l)), "o cruzamento do sublimite vira ALERTA no texto");
  ok(d.linhas.some((l) => /ICMS e ISS saem/.test(l)), "e explica o que muda, não só que muda");
}
{
  const p = projetarRBT12({ rbt12: 4_600_000, crescimento: 0.3, anexo: 1 });
  const d = decidirComProjecao(resp(), { ...PARAMETROS_2027, das: p.das }, p);
  ok(d.linhas.some((l) => /perde objeto/.test(l)),
     "ultrapassar o TETO não é um agravante da conta: a opção perde objeto, e o laudo diz isso");
}
{
  const p = projetarRBT12({ rbt12: 5_000_000, crescimento: 0.1, anexo: 1 });
  const d = decidirComProjecao(resp(), { ...PARAMETROS_2027, das: p.das }, p);
  ok(d.linhas.some((l) => /não há decisão de setembro a tomar/i.test(l)),
     "e quem já está acima do teto é avisado de que não há decisão a tomar");
  ok(!d.linhas.some((l) => /perde objeto/.test(l)),
     "sem receber TAMBÉM o alerta de cruzamento — os dois juntos se contradizem");
}

/* ═════════════ 6 · a camada é ADITIVA ═══════════════════════════════════ */
{
  let mudou = 0, n = 0;
  for (const anexo of [1, 3, 5]) for (const rbt12 of [600_000, 2_000_000, 4_000_000]) {
    const das = dDASefetivo(anexo, rbt12).das;
    const p = { ...PARAMETROS_2027, das, rbt12 };
    for (const b2b of [.4, .7, 1]) for (const qual of [.5, .8, 1]) for (let cred = 0; cred <= .8; cred += .1) {
      const r = resp({ b2b, qual, cred });
      const antes = decidir(r, p).saida;
      const proj = projetarRBT12({ rbt12, crescimento: 0.25, anexo });
      decidirComProjecao(r, p, proj);              // calcular não pode alterar nada
      n++; if (decidir(r, p).saida !== antes) mudou++;
    }
  }
  ok(mudou === 0, `sem a projeção, a árvore de sempre continua igual (${n} casos)`, mudou);
}
/* ═════════ 7 · a ponte crescimento ⇄ RBT12 anterior ══════════════════════
 * O formulário passou a perguntar o CRESCIMENTO (08/08/2026) porque a RBT12 de
 * doze meses atrás obrigava o contador a abrir outro relatório no meio do
 * trabalho — e campo caro fica em branco, o que custava a projeção inteira.
 *
 * A troca só é legítima se a ponte for EXATA: o motor continua medindo o
 * crescimento a partir do valor anterior, e é isso que sustenta a palavra
 * "medido" no laudo. Se estas contas divergirem, o laudo passa a afirmar um
 * crescimento diferente do que o contador respondeu. */
{
  const rbt12 = 1_000_000;

  ok(perto(rbt12AnteriorPorCrescimento(rbt12, 0.25), 800_000, 1e-6),
     "crescer 25% partindo de 800 mil chega em 1 milhão — a volta dá 800 mil");

  ok(perto(rbt12AnteriorPorCrescimento(rbt12, 0), 1_000_000, 1e-6),
     "crescimento zero devolve o mesmo valor");

  ok(perto(rbt12AnteriorPorCrescimento(rbt12, -0.2), 1_250_000, 1e-6),
     "queda de 20% significa que o ano anterior foi MAIOR");

  for (const g of [-0.35, -0.1, 0, 0.07, 0.25, 0.9]) {
    const ant = rbt12AnteriorPorCrescimento(rbt12, g);
    ok(perto(crescimentoPorRBT12Anterior(rbt12, ant), g, 1e-9),
       `ida e volta preservam ${(g * 100).toFixed(0)}%`);
    const p = projetarRBT12({ rbt12, rbt12_anterior: ant, anexo: 1 });
    ok(p && perto(p.crescimento, g, 1e-9) && p.origem === "medido",
       `o motor mede ${(g * 100).toFixed(0)}% de volta, e como MEDIDO`);
  }

  ok(rbt12AnteriorPorCrescimento(rbt12, -1) === null,
     "queda de 100% não tem valor anterior — devolve null em vez de dividir por zero");
  ok(rbt12AnteriorPorCrescimento(null, 0.25) === null,
     "sem RBT12 não há o que reconstruir");
  ok(rbt12AnteriorPorCrescimento(rbt12, null) === null,
     "sem crescimento respondido, nada é inventado");
  ok(crescimentoPorRBT12Anterior(rbt12, 0) === null,
     "valor anterior zero não vira crescimento infinito");
}

ok(TETO_SIMPLES === 4_800_000 && SUBLIMITE === 3_600_000, "os dois limites legais estão escritos, não embutidos");

console.log(f === 0 ? "\nOK" : `\n${f} FALHA(S)`);
process.exit(f === 0 ? 0 : 1);
