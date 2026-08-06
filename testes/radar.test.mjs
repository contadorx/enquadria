/**
 * O RADAR — a porta que faltava, e o que impede o item ruim de sair por ela.
 *
 * O DIAGNÓSTICO, medido no banco em 05/08/2026: `radar_itens` tinha QUATRO
 * linhas, todas de 24/04. Cento e quatro dias parado — não por falta de
 * assunto, por falta de porta: a tabela nasceu com uma política de leitura e
 * nada mais, e os quatro entraram por INSERT no Supabase de produção.
 *
 * Com a tela, o gargalo muda de lugar. Publicar fica fácil, e aí o risco passa
 * a ser o item que SAI e não diz nada. Isso não dá erro: o item ocupa o topo da
 * tela do contador, ele não entende o que fazer, e na semana seguinte não abre.
 * É assim que a feature morre — não por bug.
 */
import {
  validar, bloqueado, descreverCriterio, limparCriterio, divisoesDe, SEVERIDADES,
} from "./radar-form.js";
import { afeta, atingidas, ordenar, diasPara } from "./radar.js";

let f = 0;
const ok = (c, m, e) => {
  if (!c) { f++; console.log("FALHOU:", m, e === undefined ? "" : JSON.stringify(e)); }
  else console.log("ok:", m);
};

const base = (x = {}) => ({
  titulo: "Resolução CGSN fixa a janela de setembro",
  resumo: "A opção por apurar IBS/CBS fora do DAS vai de 1º a 30 de setembro de 2026.",
  o_que_fazer: "Abra a carteira e separe quem vende para PJ antes do dia 30.",
  fonte: "https://www.gov.br/receitafederal",
  publicado_em: "2026-08-05", vigencia_em: "2026-09-01",
  severidade: "alta", criterio: {}, ativo: true, ...x,
});

/* ═══════════ 1 · o item precisa SERVIR, não só existir ══════════════════ */
ok(validar(base()).length === 0, "um item bem escrito não gera problema nenhum", validar(base()));
ok(bloqueado(validar(base({ titulo: "curto" }))), "título de 5 caracteres bloqueia");
ok(bloqueado(validar(base({ resumo: "mudou" }))), "resumo de uma palavra bloqueia — é o resumo que o contador lê");
ok(bloqueado(validar(base({ publicado_em: "" }))), "sem data de publicação não sai");

/* ═══════════ 2 · a regra que dá sentido à severidade ════════════════════
 * Alta severidade quer dizer "isto muda o seu trabalho". Se muda o trabalho,
 * existe uma ação. Sem ação, ou a severidade está errada ou o item não foi
 * pensado até o fim — e nos dois casos ele não deve sair assim.
 * ══════════════════════════════════════════════════════════════════════════ */
{
  const semAcao = validar(base({ o_que_fazer: "" }));
  ok(bloqueado(semAcao), "severidade ALTA sem 'o que fazer' é bloqueada");
  ok(semAcao.some((p) => /manchete/.test(p.texto)),
     "e o erro diz por quê: é manchete, não item de radar");
  ok(!bloqueado(validar(base({ severidade: "baixa", o_que_fazer: "", vigencia_em: "" }))),
     "informativo SEM ação passa — nem toda notícia pede ato");
  ok(!bloqueado(validar(base({ severidade: "media", o_que_fazer: "" }))),
     "média sem ação também passa — a exigência é só da alta");
}

/* ═══════════ 3 · conselho não é ação ════════════════════════════════════ */
for (const frase of ["Fique atento", "acompanhe", "Aguarde.", "nada a fazer"]) {
  ok(bloqueado(validar(base({ o_que_fazer: frase }))),
     `"${frase}" é recusado — o contador precisa saber o que ABRIR ou CONFERIR`);
}
ok(!bloqueado(validar(base({ o_que_fazer: "Acompanhe a lei do seu estado e revise as doações antes de dezembro." }))),
   "mas 'acompanhe' DENTRO de uma frase com ação passa — o corte é da frase inteira, não da palavra");

/* ═══════════ 4 · os avisos que não bloqueiam ════════════════════════════
 * Nem todo problema é impeditivo. Um aviso que bloqueia demais faz a pessoa
 * desistir de publicar — que é exatamente o estado de onde estamos saindo.
 * ══════════════════════════════════════════════════════════════════════════ */
{
  const semFonte = validar(base({ fonte: "" }));
  ok(semFonte.length === 1 && !semFonte[0].bloqueia, "sem fonte AVISA e não bloqueia", semFonte);
  ok(/boato com sua marca/.test(semFonte[0].texto), "e o aviso diz o que está em jogo");

  const semVigencia = validar(base({ vigencia_em: "" }));
  ok(semVigencia.length === 1 && !semVigencia[0].bloqueia, "alta sem vigência avisa e não bloqueia");

  const invertida = validar(base({ vigencia_em: "2026-07-01" }));
  ok(invertida.some((p) => /anterior à publicação/.test(p.texto)), "vigência antes da publicação avisa");
  ok(!bloqueado(invertida), "…e não bloqueia: norma retroativa existe");

  const longo = validar(base({ titulo: "T".repeat(95) }));
  ok(longo.some((p) => !p.bloqueia && /três linhas no celular/.test(p.texto)),
     "título muito longo avisa sobre o celular, sem impedir");
}

/* ═══════════ 5 · o critério, que é onde o escopo se perde ═══════════════ */
{
  ok(descreverCriterio({}) === "Alcança TODAS as empresas de todos os escritórios.",
     "critério vazio diz, em português, que alcança todo mundo");
  ok(descreverCriterio(null).includes("TODAS"), "nulo também");
  ok(/Anexo 3, 4/.test(descreverCriterio({ anexos: [3, 4] })), "e nomeia os anexos");
  ok(/só quem já tem análise/.test(descreverCriterio({ somente_com_analise: true })), "e o filtro de análise");

  /* chave vazia é chave AUSENTE: `anexos: []` restringiria a NADA */
  const limpo = limparCriterio({ anexos: [], faixas: ["A"], divisoes_cnae: [], somente_com_analise: false });
  ok(!("anexos" in limpo) && !("divisoes_cnae" in limpo) && !("somente_com_analise" in limpo),
     "lista vazia sai do critério — senão ela restringiria a nada", limpo);
  ok(limpo.faixas.length === 1, "e o que tem valor fica");

  const e = { id: "1", razao_social: "X", cnpj: "1", anexo: 3, faixa: "A", cnae_principal: "6201501" };
  ok(afeta(limparCriterio({ anexos: [] }), e), "critério que ficou vazio alcança a empresa");
  ok(afeta({ anexos: [3] }, e) && !afeta({ anexos: [1] }, e), "e o filtro de anexo funciona nos dois sentidos");
}

/* ═══════════ 6 · o CNAE como a pessoa digita ════════════════════════════
 * Quem redige tem o CNAE completo na frente, não a divisão. Exigir que ele
 * corte os dois primeiros dígitos de cabeça é a fricção que deixa o campo vazio.
 * ══════════════════════════════════════════════════════════════════════════ */
ok(divisoesDe("47, 62").join(",") === "47,62", "aceita a divisão digitada direto");
ok(divisoesDe("4711-3/02").join(",") === "47", "e aceita o CNAE inteiro, cortando");
ok(divisoesDe("4711302 6201501 4120400").join(",") === "41,47,62", "vários, em qualquer separador, ordenados");
ok(divisoesDe("47, 4711302, 47").join(",") === "47", "sem repetir");
ok(divisoesDe("").length === 0 && divisoesDe("abc").length === 0, "lixo não vira divisão");
ok(divisoesDe("4").length === 0, "e um dígito só também não — divisão tem dois");

/* ═══════════ 7 · a ordem em que o contador lê ═══════════════════════════ */
{
  const it = (id, sev, vig, pub) => ({ id, titulo: id, resumo: "r", o_que_fazer: null, fonte: null,
    publicado_em: pub, vigencia_em: vig, severidade: sev, criterio: null });
  const hoje = "2026-08-05";
  const ord = ordenar([
    it("passado", "alta", "2026-01-01", "2026-01-01"),
    it("futuro-longe", "alta", "2027-01-01", "2026-08-01"),
    it("futuro-perto", "baixa", "2026-09-01", "2026-08-01"),
  ], hoje);
  ok(ord[0].id === "futuro-perto", "o que está prestes a valer vem primeiro, mesmo sendo informativo", ord.map(x=>x.id));
  ok(ord[2].id === "passado", "e o que já passou vai para o fim");
  ok(diasPara("2026-09-01", hoje) === 27, "a contagem de dias bate", diasPara("2026-09-01", hoje));
  ok(diasPara(null, hoje) === null, "sem vigência não há contagem");
}

/* ═══════════ 8 · as três severidades, com o quando ══════════════════════ */
ok(SEVERIDADES.length === 3, "são três severidades");
ok(SEVERIDADES.every((s) => s.quando && s.quando.length > 20),
   "e cada uma explica QUANDO usar — senão vira tudo alta e a cor perde sentido");

/* ═══════════ 9 · o casamento com a carteira ═════════════════════════════ */
{
  const empresas = [
    { id: "1", razao_social: "A", cnpj: "1", anexo: 3, faixa: "A", cnae_principal: "6201501", tem_analise: true, saida: "S4" },
    { id: "2", razao_social: "B", cnpj: "2", anexo: 1, faixa: "B", cnae_principal: "4711302", tem_analise: false },
    { id: "3", razao_social: "C", cnpj: "3", anexo: 3, faixa: "C", cnae_principal: "6202300", tem_analise: true, saida: "S1" },
  ];
  const item = (c) => ({ id: "i", titulo: "t", resumo: "r", o_que_fazer: null, fonte: null,
    publicado_em: "2026-08-05", vigencia_em: null, severidade: "alta", criterio: c });
  ok(atingidas(item(null), empresas).length === 3, "sem critério, atinge as três");
  ok(atingidas(item({ anexos: [3] }), empresas).length === 2, "anexo 3 atinge duas");
  ok(atingidas(item({ anexos: [3], saidas: ["S4"] }), empresas).length === 1,
     "anexo E saída é E lógico — atinge uma");
  ok(atingidas(item({ somente_com_analise: true }), empresas).length === 2, "só com análise atinge duas");
  ok(atingidas(item({ divisoes_cnae: ["62"] }), empresas).length === 2, "a divisão de CNAE atinge as duas de TI");
  ok(atingidas(item({ anexos: [9] }), empresas).length === 0,
     "e um critério que não alcança ninguém devolve zero — é o silêncio que a tela precisa mostrar ANTES de publicar");
}

console.log(f === 0 ? "\nOK" : `\n${f} FALHA(S)`);
process.exit(f === 0 ? 0 : 1);
