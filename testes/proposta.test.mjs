/**
 * TESTE DA PROPOSTA DE HONORÁRIOS.
 *
 * Este documento é diferente do laudo em uma coisa que muda tudo: ele vai para
 * o CLIENTE DO CONTADOR com o nome do escritório na capa, e fala de dinheiro.
 * Errar aqui não é um número torto num relatório — é uma proposta comercial
 * constrangedora, mandada para alguém que o contador atende há anos.
 *
 * O que estes testes protegem, em ordem de dano:
 *
 *  1. NÃO PROPOR O QUE NÃO EXISTE. MEI, inativa e fora do Simples não têm
 *     decisão nesta janela. Proposta para essas empresas é erro que queima
 *     relação.
 *  2. A VALIDADE NÃO PASSA DO PRAZO LEGAL. Proposta de 15 dias emitida em 25
 *     de setembro venceria dez dias depois de o serviço ser impossível.
 *  3. NENHUMA PROMESSA DE RESULTADO. O texto vende trabalho, não economia — e
 *     não entrega de graça a conta que a proposta cobra para fazer.
 *  4. O VALOR TEM LÓGICA. Base por tipo de trabalho, fator por porte,
 *     acréscimo só onde há trabalho a mais.
 */
import {
  honorarioSugerido,
  criticarProposta,
  montarProposta,
  validadeDaProposta,
  dataBR,
} from "./proposta.js";
import { JANELA } from "./janela.js";

let f = 0;
const ok = (c, m, e) => {
  if (!c) { f++; console.log("FALHOU:", m, e === undefined ? "" : JSON.stringify(e)); }
  else console.log("ok:", m);
};

const EMPRESA = { razao_social: "Metalúrgica Ponte Nova Ltda", cnpj: "50.100.002/0001-20", anexo: 1, faixa: "A" };
const base = (x = {}) => ({ empresa: EMPRESA, hoje: "2026-08-10", ...x });

/* ─────────────────── 1 · quem NÃO recebe proposta ───────────────────────── */
for (const faixa of ["MEI", "FORA"]) {
  const c = criticarProposta(base({ empresa: { ...EMPRESA, faixa } }));
  ok(c.erros.length > 0, `${faixa} não recebe proposta — é erro, não alerta`, c);
}
ok(criticarProposta(base()).erros.length === 0, "faixa A passa sem erro");
ok(criticarProposta(base({ empresa: { ...EMPRESA, razao_social: "" } })).erros.length === 1, "sem razão social trava");
ok(criticarProposta(base({ empresa: { ...EMPRESA, cnpj: " " } })).erros.length === 1, "sem CNPJ trava");
// alerta AVISA e deixa seguir — senão o contador não consegue propor nada antes
// de ter todos os dados, que é justamente quando ele quer propor
{
  const c = criticarProposta(base());
  ok(c.alertas.length === 2, "sem análise e sem RBT12 são alertas, não erros", c.alertas);
  const cheio = criticarProposta(base({ saida: "S4", rbt12: 1_200_000 }));
  ok(cheio.alertas.length === 0, "com análise e RBT12 não sobra alerta", cheio.alertas);
}

/* ─────────────────────── 2 · a validade ─────────────────────────────────── */
{
  const v = validadeDaProposta("2026-09-25", 15);
  ok(v.data === JANELA.fecha, "dentro da janela, a validade para em 30/09", v);
  ok(v.limitada === true, "e a proposta sabe que foi limitada (o texto muda)");
  const n = validadeDaProposta("2026-08-10", 15);
  ok(n.data === "2026-08-25", "longe do prazo, vale o costume de 15 dias", n);
  ok(n.limitada === false, "e não marca limitação");
  const depois = validadeDaProposta("2026-10-05", 15);
  ok(depois.data === "2026-10-20", "passada a janela, a validade volta ao normal", depois);
  ok(validadeDaProposta("2026-09-30", 15).data === JANELA.fecha, "no último dia, vence no mesmo dia");
}
ok(dataBR("2026-09-30") === "30/09/2026", "data sai como o brasileiro lê");
ok(dataBR("") === "—", "data vazia não vira 'Invalid Date' no papel");

/* ─────────────────────── 3 · o valor sugerido ───────────────────────────── */
{
  const micro = honorarioSugerido("A", 300_000);
  const peq = honorarioSugerido("A", 1_200_000);
  const teto = honorarioSugerido("A", 3_500_000);
  const acima = honorarioSugerido("A", 4_000_000);
  ok(micro.projeto < peq.projeto && peq.projeto < teto.projeto && teto.projeto < acima.projeto,
    "o valor sobe com o porte, sempre", [micro.projeto, peq.projeto, teto.projeto, acima.projeto]);
  ok(peq.projeto === 600, "porte médio fica no honorário de referência", peq.projeto);
  ok(micro.porte === "microempresa", "o porte é nomeado (vai na explicação da tela)");

  // C e D são outro serviço: laudo curto, sem simulação de decisão
  ok(honorarioSugerido("C", 1_200_000).projeto < peq.projeto, "permanência documentada custa menos que decisão");
  ok(honorarioSugerido("C", 100).projeto >= 150, "há piso: nenhum trabalho sai abaixo do piso curto");
  ok(honorarioSugerido("A", 100).projeto >= 300, "e o piso da decisão completa é maior");

  // só S4 pede renegociação com os clientes do cliente
  ok(honorarioSugerido("A", 1_200_000, "S4").projeto > peq.projeto, "S4 custa mais: exige negociação de preço");
  ok(honorarioSugerido("A", 1_200_000, "S5").projeto === peq.projeto, "S5 é optar sem negociar — não encarece");
  ok(honorarioSugerido("A", 1_200_000, "S1").projeto === peq.projeto, "não optar não encarece");

  // a recorrência é metade — é o número que transforma janela em serviço
  ok(peq.revisao === 300, "a revisão da janela seguinte é metade do projeto", peq.revisao);
  ok(honorarioSugerido("A", 1_200_000).projeto % 50 === 0, "preço arredondado em 50 — sem centavos");

  // sem RBT12 não pode virar zero nem explodir: vale porte médio, e avisa
  const semRbt = honorarioSugerido("A", null);
  ok(semRbt.projeto === 600, "sem RBT12 usa porte médio", semRbt.projeto);
  ok(semRbt.porque.some((t) => /RBT12/i.test(t)), "e a tela explica que o número está sem afinar");
  ok(honorarioSugerido("A", 0).projeto === 600, "RBT12 zerada é o mesmo que não informada");
}

/* ─────────────────────── 4 · o documento montado ────────────────────────── */
{
  const p = montarProposta(base({ saida: "S4", rbt12: 1_200_000 }));
  ok(p.destinatario.nome === EMPRESA.razao_social, "o destinatário é a empresa");
  ok(p.escopo.length === 4, "faixa A recebe o escopo completo", p.escopo.length);
  ok(p.investimento.projeto === 750, "S4 com porte médio: 600 × 1,25", p.investimento.projeto);
  ok(p.investimento.linhas.length === 2, "duas linhas: projeto e revisão");
  ok(p.investimento.linhas[1].explica.includes("apenas quando"), "a revisão é explicitamente opcional");

  const curta = montarProposta(base({ empresa: { ...EMPRESA, faixa: "C" }, rbt12: 1_200_000 }));
  ok(curta.escopo.length === 2, "faixa C recebe o escopo curto", curta.escopo.length);
  ok(curta.investimento.projeto < p.investimento.projeto, "e custa menos");

  // A REGRA MAIS IMPORTANTE DO TEXTO: nada de promessa, nada de conta de graça
  const texto = JSON.stringify(p).toLowerCase();
  for (const proibido of ["economia", "vai economizar", "garant", "redução de imposto", "blindagem"]) {
    ok(!texto.includes(proibido), `a proposta não promete: "${proibido}"`);
  }
  ok(!/r\$\s?\d/.test(p.situacao.join(" ")), "a situação não traz cifra de resultado — isso é o laudo", p.situacao);
  ok(p.situacao.some((s) => /preliminar/i.test(s)), "o resultado aparece como preliminar, nunca como conclusão");

  // premissa do contador vence a sugestão do sistema, sempre
  const meu = montarProposta(base({ saida: "S4", rbt12: 1_200_000, premissas: { projeto: 1500, revisao: 0 } }));
  ok(meu.investimento.projeto === 1500, "o valor digitado pelo contador manda");
  ok(meu.investimento.linhas.length === 1, "revisão zerada some do papel — não vira linha de R$ 0");

  // contexto muda depois da janela: quem lê em novembro não pode ler sobre setembro
  const depois = montarProposta(base({ hoje: "2026-11-10", saida: "S1", rbt12: 500_000 }));
  ok(!depois.contexto.join(" ").includes("30 de setembro"), "passada a janela, o contexto fala da transição");
  ok(depois.contexto.join(" ").includes("2033"), "e cita o horizonte da transição", depois.contexto[0].slice(0, 40));
  ok(montarProposta(base()).contexto.join(" ").includes("30 de setembro"), "dentro da janela, o prazo aparece");

  // empresa sem análise ainda produz proposta (é o caso mais comum: propor ANTES)
  const semAnalise = montarProposta(base());
  ok(semAnalise.situacao.every((s) => !/preliminar/i.test(s)), "sem análise, não inventa resultado preliminar");
  ok(semAnalise.investimento.projeto > 0, "e mesmo assim tem valor: propor antes de analisar é o normal");
}

console.log(f === 0 ? "\nTUDO OK (proposta)" : `\n${f} FALHA(S) (proposta)`);
process.exit(f === 0 ? 0 : 1);
