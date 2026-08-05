/**
 * O TERMO — recomendação de um lado, decisão do outro.
 *
 * O DEFEITO QUE ISTO CORRIGE: o termo dizia "Decisão: Permanecer" e mais nada.
 * O caso em que todos concordaram e o caso em que o contador recomendou optar e
 * o empresário decidiu o contrário produziam o MESMO documento. A divergência
 * ciente é a única coisa que um termo de ciência precisa capturar, e era
 * exatamente a que faltava.
 *
 * O que esta suíte guarda, em ordem de dano:
 *
 *  1. S5 é recomendação de OPTAR. A função antiga (`decisaoSugerida`) devolvia
 *     "optar" só para S4, e S5 — custo líquido NEGATIVO — voltava como
 *     "permanecer". Era o caso mais forte de optar do produto inteiro.
 *  2. divergir SEM motivo é recusado. Um termo que documenta o conflito e não
 *     a razão é pior que o termo antigo.
 *  3. os pontos a observar são DERIVADOS. Lista genérica em todo termo não é
 *     lida, e a assinatura embaixo dela deixa de significar algo.
 *  4. o cadeado do art. 41 § 5º está na ciência dos efeitos — o termo é o que
 *     se assina.
 */
import {
  recomendacaoDoTermo, pontosAObservar, resolverDecisao, validarDecisao,
  fraseDaDecisao, CIENCIA_DOS_EFEITOS, ROTULO_TIPO,
  nomeCorrompido, AVISO_NOME_CORROMPIDO,
} from "./termo.js";
import { PARAMETROS_2027, ehOptar } from "./motor.js";

let f = 0;
const ok = (c, m, e) => {
  if (!c) { f++; console.log("FALHOU:", m, e === undefined ? "" : JSON.stringify(e)); }
  else console.log("ok:", m);
};
const A = PARAMETROS_2027.aliquota;

const analise = (x = {}) => ({
  id: "a1", rq: 0.72, ch: 0.0572, cl: 0.0321, re: 0.0446, fc: 0.0629,
  saida: "S4", prioridade: false,
  respostas: { b2b: .8, qual: .9, cred: .35, folha: .2, preco: 3, conc: 0, exig: 0 },
  calculado_em: "2026-08-05T12:00:00Z",
  parametros: { aliquota: A, das: 0.0251, motivo: "Repasse de 4,5% com folga de 2,2 pontos." },
  ...x,
});

/* ═══════════ 1 · a recomendação, e o S5 que voltava errado ═════════════ */
ok(recomendacaoDoTermo(analise({ saida: "S4" })).decisao === "optar", "S4 recomenda optar");
/**
 * A ASSERÇÃO QUE JUSTIFICA TER APAGADO A OUTRA FUNÇÃO. `decisaoSugerida()`
 * devolvia "optar" só para S4 — S5 voltava como "permanecer". S5 é custo
 * líquido NEGATIVO: a empresa paga menos no regime regular sem depender de
 * negociar com ninguém. É o caso mais forte de optar que existe.
 */
ok(recomendacaoDoTermo(analise({ saida: "S5", cl: -0.0093 })).decisao === "optar",
   "S5 TAMBÉM recomenda optar — era o bug da função antiga");
for (const s of ["S1", "S2", "S3"]) {
  ok(recomendacaoDoTermo(analise({ saida: s })).decisao === "permanecer", `${s} recomenda permanecer`);
}
/* a recomendação e o motor não podem discordar sobre o que é "optar" */
for (const s of ["S1", "S2", "S3", "S4", "S5"]) {
  ok((recomendacaoDoTermo(analise({ saida: s })).decisao === "optar") === ehOptar(s),
     `${s}: o termo e o ehOptar() do motor concordam — uma fonte só`);
}

/* ═══════════ 2 · o "baseado em" ════════════════════════════════════════ */
{
  const r = recomendacaoDoTermo(analise());
  ok(r.baseado_em.length >= 2, "a recomendação vem com os fatos que a sustentam", r.baseado_em.length);
  ok(r.baseado_em.some((x) => /Receita qualificada de 72,0%/.test(x)), "com a receita qualificada", r.baseado_em[0]);
  ok(r.baseado_em.some((x) => /Repasse de preço necessário de 4,5%/.test(x)), "e o repasse contra o crédito");
  ok(r.baseado_em.some((x) => /folga de 2,2 pontos/.test(x)),
     "o motivo congelado na análise entra: é a frase mais específica que existe");
  ok(r.titulo.length > 0, "e o título da saída");
}
{
  /* S5 fala de custo negativo, não de repasse — são conversas diferentes */
  const r = recomendacaoDoTermo(analise({ saida: "S5", cl: -0.0093 }));
  ok(r.baseado_em.some((x) => /paga MENOS/.test(x)), "S5: o baseado-em fala do custo negativo");
  ok(!r.baseado_em.some((x) => /Repasse de preço necessário/.test(x)),
     "…e NÃO fala em repasse, que é justamente o que S5 não precisa");
}

/* ═══════════ 3 · os pontos a observar são DERIVADOS ═══════════════════ */
{
  const semPoder = pontosAObservar(analise({ respostas: { ...analise().respostas, preco: 0 } }));
  ok(semPoder.some((x) => /poder de renegociar preço foi declarado como baixo/.test(x)),
     "sem poder de preço, o ponto aparece");
  const comPoder = pontosAObservar(analise());
  ok(!comPoder.some((x) => /declarado como baixo/.test(x)),
     "com poder de preço, NÃO aparece — lista igual em todo termo não é lida");
}
{
  const comConc = pontosAObservar(analise({ respostas: { ...analise().respostas, conc: 1 } }));
  ok(comConc.some((x) => /não cria vantagem — reduz uma desvantagem/.test(x)),
     "concorrente fora do Simples vira ponto, e com a leitura certa");
}
{
  const p = pontosAObservar(analise());
  ok(p.some((x) => /receita vendida a quem aproveita crédito/i.test(x)),
     "as condições de validade do LAUDO entram aqui — uma fonte só, sem chance de divergir");
}
{
  /* faturamento entra quando ele é o que pode virar a resposta */
  const comProj = pontosAObservar(analise({
    parametros: { ...analise().parametros, projecao: { divergem: false, muda_faixa: true, faixa: 3, faixa_projetada: 4, cruza_teto: false } },
  }));
  ok(comProj.some((x) => /da faixa 3 para a 4/.test(x)), "mudança de faixa projetada vira ponto");
  const teto = pontosAObservar(analise({
    parametros: { ...analise().parametros, projecao: { divergem: false, muda_faixa: false, cruza_teto: true } },
  }));
  ok(teto.some((x) => /perde objeto/.test(x)),
     "e cruzar o teto do Simples diz que a decisão perde objeto — não é agravante, é outra conversa");
}

/* ═══════════ 4 · os três estados ═══════════════════════════════════════ */
{
  const rOptar = recomendacaoDoTermo(analise({ saida: "S4" }));
  const rFicar = recomendacaoDoTermo(analise({ saida: "S1" }));
  ok(resolverDecisao("seguir", rOptar) === "optar", "seguir + recomendação de optar = optar");
  ok(resolverDecisao("seguir", rFicar) === "permanecer", "seguir + recomendação de ficar = permanecer");
  ok(resolverDecisao("divergir", rOptar) === "permanecer", "divergir inverte a recomendação");
  ok(resolverDecisao("divergir", rFicar) === "optar", "…nos dois sentidos");
  /**
   * `adiar` resolve para permanecer porque é o que a LEI faz com quem não opta.
   * Mas o tipo fica gravado: no papel os dois dão o mesmo regime; na conversa de
   * março, não dão a mesma conversa.
   */
  ok(resolverDecisao("adiar", rOptar) === "permanecer", "adiar resolve para permanecer — é o que a lei faz");
  ok(resolverDecisao("adiar", rFicar) === "permanecer", "…independentemente do que foi recomendado");
  ok(Object.keys(ROTULO_TIPO).length === 3, "são três estados, e os três têm rótulo");
}

/* ═══════════ 5 · o motivo obrigatório na divergência ══════════════════ */
ok(validarDecisao({ tipo: "seguir", decisao: "optar" }).ok, "seguir não pede motivo");
ok(validarDecisao({ tipo: "adiar", decisao: "permanecer" }).ok, "adiar não exige motivo — mas aceita");
{
  const v = validarDecisao({ tipo: "divergir", decisao: "permanecer" });
  ok(!v.ok, "divergir SEM motivo é recusado");
  ok(/palavras de quem decidiu, não com as suas/.test(v.erro),
     "e o erro diz de quem têm de ser as palavras — é a razão de o campo existir", v.erro);
}
ok(!validarDecisao({ tipo: "divergir", decisao: "permanecer", motivo: "   " }).ok,
   "espaço em branco não é motivo");
ok(!validarDecisao({ tipo: "divergir", decisao: "permanecer", motivo: "não quis" }).ok,
   "e um motivo curto demais também não — ponto final não explica nada");
ok(validarDecisao({ tipo: "divergir", decisao: "permanecer",
                    motivo: "Vamos vender a empresa em 2027 e o comprador pediu para não mexer no regime." }).ok,
   "com uma frase inteira, passa");

/* ═══════════ 6 · a frase do termo ══════════════════════════════════════ */
{
  const rOptar = recomendacaoDoTermo(analise({ saida: "S4" }));
  ok(/acompanha a recomendação/.test(fraseDaDecisao({ tipo: "seguir", decisao: "optar" }, rOptar)),
     "seguir: a frase é simples");
  const div = fraseDaDecisao({ tipo: "divergir", decisao: "permanecer", motivo: "x" }, rOptar);
  ok(/A recomendação técnica foi optar/.test(div), "divergir: a frase registra o que foi recomendado", div);
  ok(/ciente disso, decide permanecer/.test(div), "…e o que foi decidido");
  ok(/O motivo é da empresa/.test(div), "declarando de quem é a razão");
  ok(!/errad|contra a orientação|apesar/i.test(div),
     "e NÃO julga a decisão — termo que soa como reprovação não é assinado");
  const ad = fraseDaDecisao({ tipo: "adiar", decisao: "permanecer" }, rOptar);
  ok(/escolha registrada, e não\s+uma omissão/.test(ad.replace(/\s+/g, " ")) || /não\s*uma omissão/.test(ad),
     "adiar: a frase separa escolha de esquecimento — era o estado que não deixava rastro", ad);
}

/* ═══════════ 7 · a ciência dos efeitos, com o cadeado ═════════════════ */
{
  const txt = CIENCIA_DOS_EFEITOS.join(" ");
  ok(/art\. 41, § 5º/.test(txt), "o cadeado do ressarcimento está no TERMO, não só no laudo");
  ok(/mão única/.test(txt), "dito de forma que quem lê entenda o efeito, não só o dispositivo");
  ok(/crédito integral passa ao cliente AUTOMATICAMENTE/.test(txt), "a regra de sequência está lá");
  ok(/Negocie o reajuste ANTES de optar/.test(txt), "com a instrução, não só o diagnóstico");
  ok(/responsabilidade técnica do profissional/.test(txt) && /decisão e risco da empresa/.test(txt),
     "e a fronteira entre a conta e a negociação");
  ok(/31\/10\/2026/.test(txt), "mais a data em que a alíquota é fixada — depois desta janela");
  ok(CIENCIA_DOS_EFEITOS.length >= 6, "a lista não encolheu ao ser movida para o módulo", CIENCIA_DOS_EFEITOS.length);
}

/* ═══════════ 8 · nada aqui recalcula ══════════════════════════════════ */
{
  const entrada = analise();
  const copia = JSON.stringify(entrada);
  recomendacaoDoTermo(entrada);
  pontosAObservar(entrada);
  ok(JSON.stringify(entrada) === copia, "montar o termo não altera a análise");
}
{
  /* análise antiga, sem os campos novos, não pode derrubar a folha */
  const velha = { id: "x", rq: null, ch: null, cl: null, re: null, fc: null, saida: null,
                  prioridade: false, respostas: null, calculado_em: null };
  const r = recomendacaoDoTermo(velha);
  ok(r.decisao === "permanecer" && Array.isArray(r.baseado_em),
     "análise sem nada devolve recomendação conservadora e lista vazia, sem lançar");
  ok(Array.isArray(pontosAObservar(velha)), "e os pontos também");
}

/* ═══════════ 9 · o nome corrompido ════════════════════════════════════
 * Encontrado em produção: 6 de 95 empresas com "Ribeir\uFFFDo" no lugar de
 * "Ribeirão". O nome entra no conteúdo que é HASHEADO e assinado — a assinatura
 * garante que ninguém mexeu depois, não que estava certo.
 * ══════════════════════════════════════════════════════════════════════════ */
ok(nomeCorrompido("Cabos e Condutores Ribeir\uFFFDo Ltda"), "pega o caractere de substituição");
ok(nomeCorrompido("Gr\u00C3\u00A1fica Ipiranga"), "e o UTF-8 lido como latin-1 (Ã seguido de alto)");
ok(!nomeCorrompido("Cabos e Condutores Ribeirão Ltda"), "acento CORRETO não é acusado — falso positivo aqui seria pior");
ok(!nomeCorrompido("Padaria Pão da Vila Ltda") && !nomeCorrompido("Gráfica Ipiranga Indústria Ltda"),
   "nem ã, á, ú, ç — a empresa brasileira tem acento e isso é normal");
ok(!nomeCorrompido("") && !nomeCorrompido(null) && !nomeCorrompido(undefined),
   "vazio e nulo não são corrupção");
ok(/entra no conteúdo que é\s+assinado/.test(AVISO_NOME_CORROMPIDO.replace(/\s+/g, " ")) ||
   /entra no conteúdo que é assinado/.test(AVISO_NOME_CORROMPIDO),
   "o aviso diz POR QUE importa — sem isso vira mais um alerta ignorado");
ok(/não que ele estava certo/.test(AVISO_NOME_CORROMPIDO),
   "e desfaz a ilusão de que a assinatura conserta o conteúdo");

console.log(f === 0 ? "\nOK" : `\n${f} FALHA(S)`);
process.exit(f === 0 ? 0 : 1);
