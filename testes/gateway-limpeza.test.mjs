/**
 * APAGAR AQUI NÃO APAGA LÁ — e o "lá" cobra cartão de crédito.
 *
 * `excluir_conta()` apagava o tenant e cascateava tudo sem tocar no Asaas. Em
 * 05/08/2026 isso era inofensivo por acaso: a única cobrança viva da base era
 * AVULSA (`pay_…`). Uma assinatura recorrente (`sub_…`) esquecida cobra o
 * cartão todo mês, e depois do delete não sobra uma linha no banco que explique
 * de onde veio — o tenant não existe mais. O prejuízo aparece como reclamação,
 * não como erro.
 *
 * Esta suíte guarda três decisões, em ordem de importância:
 *
 *  1. cobrança PAGA impede a exclusão (estorno é decisão de gente);
 *  2. FALHA DE REDE também impede — "não consegui falar com o Asaas" não é
 *     "não havia nada lá", e tratar os dois igual é como o dinheiro escapa;
 *  3. a ordem: cancela primeiro, apaga depois.
 */
import {
  planejarLimpeza, limparNoGateway, podeApagar, resumoDoPlano,
} from "./gateway-limpeza.js";

let f = 0;
const ok = (c, m, e) => {
  if (!c) { f++; console.log("FALHOU:", m, e === undefined ? "" : JSON.stringify(e)); }
  else console.log("ok:", m);
};

const cob = (x = {}) => ({
  assinatura_id: "s1", asaas_id: "pay_abc", status: "pendente",
  valor_centavos: 4700, vencimento: "2026-09-04", ...x,
});

/* ═══════════ 1 · o plano, decidido sem tocar na rede ═══════════════════ */
{
  const p = planejarLimpeza([
    cob({ assinatura_id: "1", status: "pendente" }),
    cob({ assinatura_id: "2", status: "vencida" }),
    cob({ assinatura_id: "3", status: "cancelada" }),
    cob({ assinatura_id: "4", status: "paga" }),
    cob({ assinatura_id: "5", asaas_id: null }),
    cob({ assinatura_id: "6", asaas_id: "sub_xyz", status: "ativa" }),
  ]);
  const d = p.map((x) => x.destino);
  ok(d[0] === "cancelar" && d[1] === "cancelar", "pendente e vencida vão para cancelamento");
  ok(d[2] === "ja_encerrada", "cancelada já está encerrada lá — não gasta chamada de rede");
  ok(d[3] === "impede", "PAGA impede: cancelar não desfaz pagamento");
  ok(d[4] === "ja_encerrada", "sem asaas_id nunca chegou a existir no gateway");
  ok(d[5] === "cancelar", "assinatura recorrente também é cancelada");
  ok(/RECORRENTE/.test(p[5].motivo) && /todo mês/.test(p[5].motivo),
     "e ela ganha aviso próprio — um `pay_` esquecido gera um boleto, um `sub_` gera doze", p[5].motivo);
  ok(!/RECORRENTE/.test(p[0].motivo), "a avulsa não recebe esse aviso: alarme igual para tudo vira ruído");
}
/* os rótulos do gateway variam; o teste anda com a variação, não contra ela */
for (const s of ["paga", "pago", "recebida", "RECEBIDO", "Confirmada"]) {
  ok(planejarLimpeza([cob({ status: s })])[0].destino === "impede",
     `"${s}" é dinheiro que trocou de mãos: impede`);
}

/* ═══════════ 2 · a execução ════════════════════════════════════════════ */
{
  const chamados = [];
  const r = await limparNoGateway(
    planejarLimpeza([
      cob({ assinatura_id: "1", asaas_id: "pay_1" }),
      cob({ assinatura_id: "2", asaas_id: "sub_2", status: "ativa" }),
      cob({ assinatura_id: "3", status: "cancelada" }),
      cob({ assinatura_id: "4", status: "paga", asaas_id: "pay_4" }),
    ]),
    async (id) => { chamados.push(id); return { cancelada: true }; }
  );
  ok(r.canceladas === 2 && r.ja_encerradas === 1 && r.impedimentos.length === 1,
     "cancela o que dá, pula o encerrado, separa o impedimento", r);
  ok(chamados.join(",") === "pay_1,sub_2",
     "e NÃO chama o gateway para o que já está encerrado nem para o pago", chamados);
  ok(podeApagar(r).pode === false, "com um impedimento, não apaga");
  ok(/PAGA/.test(podeApagar(r).motivo), "e o motivo diz qual é", podeApagar(r).motivo);
}

/**
 * A ASSERÇÃO MAIS IMPORTANTE DO ARQUIVO. Falha de rede tem de bloquear.
 *
 * O caminho fácil seria "tentei cancelar, não deu, segue o delete" — e é
 * exatamente esse caminho que deixa cobrança viva sem dono. O teste existe
 * porque a versão errada é a mais confortável de escrever.
 */
{
  const r = await limparNoGateway(
    planejarLimpeza([cob({ asaas_id: "sub_9", status: "ativa" })]),
    async () => ({ cancelada: false, erro: "ECONNRESET" })
  );
  ok(r.falhas.length === 1 && r.canceladas === 0, "falha de rede é registrada, não engolida");
  const v = podeApagar(r);
  ok(v.pode === false, "e ela BLOQUEIA a exclusão");
  ok(/NÃO foi apagada/.test(v.motivo) && /sem dono/.test(v.motivo),
     "com o motivo dizendo por quê — quem lê precisa entender que parar foi de propósito", v.motivo);
  ok(/ECONNRESET/.test(v.motivo), "e o erro do gateway aparece, para dar o que consertar");
}
{
  const r = await limparNoGateway(planejarLimpeza([cob(), cob({ assinatura_id: "2" })]),
                                  async () => ({ cancelada: true }));
  ok(podeApagar(r).pode === true, "tudo cancelado: pode apagar");
  ok(podeApagar({ canceladas: 0, ja_encerradas: 0, impedimentos: [], falhas: [] }).pode === true,
     "conta sem cobrança nenhuma também pode");
}
/* o gateway que responde "não cancelei" sem erro nenhum é falha, não sucesso */
{
  const r = await limparNoGateway(planejarLimpeza([cob()]), async () => ({ cancelada: false }));
  ok(r.falhas.length === 1 && podeApagar(r).pode === false,
     "resposta ambígua do gateway conta como falha — o padrão seguro é não apagar");
}

/* ═══════════ 3 · o resumo que a prévia mostra ══════════════════════════ */
{
  ok(/Nenhuma cobrança/.test(resumoDoPlano([])), "conta sem cobrança diz isso");
  const txt = resumoDoPlano(planejarLimpeza([
    cob({ assinatura_id: "1" }),
    cob({ assinatura_id: "2", asaas_id: "sub_2", status: "ativa" }),
    cob({ assinatura_id: "3", status: "cancelada" }),
    cob({ assinatura_id: "4", status: "paga" }),
  ]));
  ok(/2 cobrança\(s\) serão CANCELADAS/.test(txt), "diz quantas serão canceladas", txt);
  ok(/1 assinatura\(s\) recorrente\(s\)/.test(txt), "destacando a recorrente");
  ok(/1 IMPEDEM/.test(txt), "e quantas impedem — antes do clique, não depois");
}

/* ═══════════ 4 · a função é pura até a hora de agir ════════════════════ */
{
  const entrada = [cob(), cob({ assinatura_id: "2", status: "paga" })];
  const copia = JSON.parse(JSON.stringify(entrada));
  planejarLimpeza(entrada);
  ok(JSON.stringify(entrada) === JSON.stringify(copia), "planejar não altera as cobranças de entrada");
}
{
  let chamou = false;
  planejarLimpeza([cob()]);
  ok(!chamou, "e planejar não toca na rede: a prévia pode rodar quantas vezes quiser");
}

console.log(f === 0 ? "\nOK" : `\n${f} FALHA(S)`);
process.exit(f === 0 ? 0 : 1);
