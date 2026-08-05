/**
 * A DERIVA — o que mudar o motor faz com o que já está salvo.
 *
 * ESTA SUÍTE EXISTE POR UMA PERGUNTA DO DONO: "mexi no motor, isso muda a
 * análise salva do cliente?". A resposta tem duas metades, e as duas precisam
 * de trava:
 *
 *   NÃO muda o que está GRAVADO — ninguém reprocessa, e não existe botão que
 *   reprocesse. Se um dia existir, este arquivo tem de ficar vermelho.
 *
 *   MUDA o que é DERIVADO ao renderizar: a folga impressa passou de `fc − re`
 *   para `fc − re_liquido`, e é isso que faz o contador ligar dizendo que o
 *   número mudou sozinho.
 *
 * O GABARITO É A BASE REAL, medida em 05/08/2026 (43 análises em produção):
 * 7 mudariam de saída, 6 delas com laudo emitido, e a transição dominante é
 * S1 → S3 — quatro empresas que estavam em "não optar" por causa da comparação
 * com o repasse cheio.
 */
import { derivaDe, resumirDeriva, leituraDaDeriva } from "./deriva.js";
import { PARAMETROS_2027 } from "./motor.js";

let f = 0;
const ok = (c, m, e) => {
  if (!c) { f++; console.log("FALHOU:", m, e === undefined ? "" : JSON.stringify(e)); }
  else console.log("ok:", m);
};
const A = PARAMETROS_2027.aliquota;

const crua = (x = {}) => ({
  id: "a1", tenant_id: "t1", tenant_nome: "Escritório X", empresa_id: "e1",
  empresa_nome: "Empresa Y", calculado_em: "2026-07-20T12:00:00Z",
  saida: "S4", rq: 0.72, ch: 0.0572, cl: 0.0321, re: 0.0446, fc: 0.0629,
  respostas: { b2b: .8, qual: .9, cred: .35, folha: .2, preco: 2, conc: 0, exig: 0 },
  parametros: { aliquota: A, das: 0.0251 },
  tem_laudo: false, laudo_numero: null, laudo_emitido_em: null, termo_assinado: false,
  ...x,
});

/* ═══════════ 1 · a linha, e o que ela recusa fazer ══════════════════════ */
{
  const d = derivaDe(crua());
  ok(d.sem_base === null && d.recalculada != null, "com parâmetro congelado, recalcula", d.sem_base);
  ok(d.recalculada === "S4" && !d.muda, "e este caso não muda de saída");
  ok(Math.abs(d.folga_antes - (0.0629 - 0.0446)) < 1e-12, "a folga ANTES é fc − re (o repasse cheio)");
  ok(Math.abs(d.folga_agora - (0.0629 - 0.0446 * (1 - A))) < 1e-12, "a folga HOJE é fc − re líquido");
  ok(d.folga_agora > d.folga_antes, "e é maior — parte do reajuste volta ao comprador como crédito");
}

/**
 * A RECUSA É A FEATURE. Recalcular uma análise antiga com a alíquota de HOJE
 * mediria duas mudanças (o motor e o parâmetro) e atribuiria as duas ao motor —
 * o relatório existe justamente para separar isso.
 */
ok(derivaDe(crua({ parametros: {} })).sem_base === "sem alíquota/dDAS congelados",
   "sem alíquota congelada, NÃO recalcula: diz que não sabe");
ok(derivaDe(crua({ parametros: { aliquota: A } })).sem_base != null,
   "sem dDAS congelado, idem — meia base é base nenhuma");
ok(derivaDe(crua({ respostas: { b2b: .8, qual: .9 } })).sem_base === "premissas incompletas",
   "sem as premissas obrigatórias, também não");
ok(derivaDe(crua({ parametros: {} })).recalculada === null,
   "e a linha sem base não inventa uma saída recalculada");
/* "não sei" não pode virar "não mudou" no resumo */
{
  const r = resumirDeriva([derivaDe(crua({ parametros: {} })), derivaDe(crua())]);
  ok(r.sem_base === 1 && r.recalculadas === 1 && r.mudam === 0,
     "no resumo, a linha sem base é contada à parte — não entra como 'não mudou'", r);
}

/* ═══════════ 2 · a transição que a base real produziu ═══════════════════
 * C7: comparar o LÍQUIDO em vez do cheio tira casos de S1.
 *
 * ESTES NÚMEROS SÃO DE UMA ANÁLISE DE PRODUÇÃO, copiada do banco em 05/08/2026
 * — com laudo emitido. A primeira versão deste teste usou outra linha real, e
 * a asserção aritmética abaixo (que confere o caso SEM chamar a função testada)
 * derrubou a suíte: naquela linha o líquido também estourava, e o caso mudava
 * por outro motivo. Uma asserção que confere o gabarito por fora vale mais que
 * dez que confiam nele.
 *
 *   re cheio 8,917% > 1,2 × 6,944% = 8,333%   → antes dava S1
 *   re líq   8,917 × 0,912 = 8,133% ≤ 8,333%  → hoje cabe
 *   e 8,133% ≥ 0,8 × 6,944% = 5,555%          → cai na banda: S3
 * ══════════════════════════════════════════════════════════════════════════ */
const REAL_S1_S3 = {
  saida: "S1", rq: 0.68, ch: 0.0792, cl: 0.06064, re: 0.08917, fc: 0.06944,
  respostas: { b2b: .85, qual: .8, cred: .1, folha: .18, preco: 2, conc: 1, exig: 0 },
  parametros: { aliquota: A, das: 0.018565081081081083 },
};
{
  const d = derivaDe(crua({ ...REAL_S1_S3, tem_laudo: true, laudo_numero: 12 }));
  ok(d.muda && d.gravada === "S1" && d.recalculada === "S3",
     "o caso real de S1 → S3: o repasse cheio estourava, o líquido cabe", { de: d.gravada, para: d.recalculada });
  ok(d.critica === true, "e ele é CRÍTICO, porque o laudo já saiu");
  ok(0.08917 > 1.2 * 0.06944, "…conferido por fora: o cheio estourava o teto da banda");
  ok(0.08917 * (1 - A) <= 1.2 * 0.06944 && 0.08917 * (1 - A) >= 0.8 * 0.06944,
     "…e o líquido cai DENTRO da banda, que é o que produz S3 e não S4");
}

/* crítico = mudou E virou documento. As quatro combinações. */
{
  const muda = REAL_S1_S3;
  ok(derivaDe(crua({ ...muda, tem_laudo: false, termo_assinado: false })).critica === false,
     "mudou sem documento: não é crítico — dá para refazer sem conversa");
  ok(derivaDe(crua({ ...muda, tem_laudo: true })).critica === true, "mudou com laudo: crítico");
  ok(derivaDe(crua({ ...muda, termo_assinado: true })).critica === true,
     "mudou com termo assinado: crítico mesmo sem laudo — o cliente assinou a decisão");
  ok(derivaDe(crua({ tem_laudo: true, termo_assinado: true })).critica === false,
     "não mudou, com documento: não é crítico. Documento não é problema; divergência é");
}

/* ═══════════ 3 · o resumo, e a frase que ele produz ═════════════════════ */
{
  const muda = REAL_S1_S3;
  const linhas = [
    derivaDe(crua({ ...muda, id: "1", tem_laudo: true })),
    derivaDe(crua({ ...muda, id: "2", tem_laudo: true })),
    derivaDe(crua({ ...muda, id: "3" })),
    derivaDe(crua({ id: "4" })),
    derivaDe(crua({ id: "5" })),
  ];
  const r = resumirDeriva(linhas);
  ok(r.total === 5 && r.mudam === 3 && r.criticas === 2, "o resumo conta certo", r);
  ok(r.transicoes.length === 1 && r.transicoes[0].de === "S1" && r.transicoes[0].para === "S3"
     && r.transicoes[0].n === 3 && r.transicoes[0].comDocumento === 2,
     "e agrupa a transição com a contagem de quantas já viraram documento", r.transicoes);
  ok(r.maior_diferenca_folga > 0, "a maior diferença de folga é medida", r.maior_diferenca_folga);

  const txt = leituraDaDeriva(r);
  ok(/3 de 5/.test(txt) && /60%/.test(txt), "a frase traz o número e o percentual", txt);
  ok(/2 delas já têm laudo emitido ou termo assinado/.test(txt),
     "e destaca as que já viraram documento — é a parte que exige telefone");
  ok(/decisão caso a caso/.test(txt), "…dizendo o que fazer, não só o que aconteceu");
  ok(/continua o que era/.test(txt),
     "e afirma que o documento entregue NÃO foi reescrito — é a dúvida imediata de quem lê");
}
{
  const r = resumirDeriva([derivaDe(crua()), derivaDe(crua({ id: "b" }))]);
  ok(/Nenhuma das 2/.test(leituraDaDeriva(r)), "sem deriva, a frase diz isso claramente");
  ok(resumirDeriva([]).total === 0 && /Não há análises/.test(leituraDaDeriva(resumirDeriva([]))),
     "e base vazia não vira 'nenhuma mudaria', que soaria como boa notícia");
}
{
  /* mudou, mas nenhuma virou documento: a frase precisa mudar de tom */
  const txt = leituraDaDeriva(resumirDeriva([derivaDe(crua(REAL_S1_S3))]));
  ok(/Nenhuma delas virou documento/.test(txt), "sem documento emitido, a frase alivia — e é verdade");
  ok(!/termo assinado/.test(txt), "sem prometer conversa que não precisa acontecer");
}

/* ═══════════ 4 · a deriva NÃO grava nada ═══════════════════════════════
 * A garantia mais importante do arquivo, e a mais fácil de perder numa
 * refatoração: `derivaDe` é pura. Se alguém acrescentar um `supabase.update`
 * "só para manter sincronizado", isto fica vermelho.
 * ══════════════════════════════════════════════════════════════════════════ */
{
  const entrada = crua();
  const copia = JSON.parse(JSON.stringify(entrada));
  derivaDe(entrada);
  ok(JSON.stringify(entrada) === JSON.stringify(copia),
     "recalcular não altera nem o objeto de entrada — muito menos o banco");
}
{
  const fonte = await import("node:fs").then((fs) => fs.readFileSync("./deriva.js", "utf8"));
  ok(!/supabase|createClient|update\(|upsert\(|insert\(/.test(fonte),
     "e o módulo não importa banco nenhum: não existe caminho para gravar daqui");
}

console.log(f === 0 ? "\nOK" : `\n${f} FALHA(S)`);
process.exit(f === 0 ? 0 : 1);
