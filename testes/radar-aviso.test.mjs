/**
 * O RADAR AVISA — e o digest para de repetir.
 *
 * O DEFEITO, medido no banco em 06/08/2026:
 *
 *   o item "NFS-e nacional passa a ser obrigatória para prestadores do
 *   Simples" foi publicado com severidade ALTA, vigência 01/09 e alcance de
 *   55 empresas em 5 escritórios. E ninguém seria avisado: publicar não
 *   dispara nada, e o único e-mail que fala de radar é o digest do dia 1º.
 *   O aviso de uma obrigação que começa em 01/09 chegaria EM 01/09.
 *
 *   Junto, um segundo defeito: o digest contava TODOS os itens ativos todo
 *   mês. Mesmo assunto, mesmo número, sempre — e o item inédito não se
 *   destacava de nada.
 *
 * Estas suítes travam os dois.
 */
import {
  diagnosticarAviso, assuntoAviso, htmlAviso, novosParaTenant,
} from "./radar-aviso.js";
import { montarDigest } from "./digest.js";

let f = 0;
const ok = (c, m, e) => {
  if (!c) { f++; console.log("FALHOU:", m, e === undefined ? "" : JSON.stringify(e)); }
  else console.log("ok:", m);
};

/* ─────────────────────────────────────────────────────── massa ─────────── */

const NFSE = {
  id: "item-nfse",
  titulo: "NFS-e nacional passa a ser obrigatória para prestadores do Simples",
  resumo: "A Resolução CGSN 189/2026 tornou obrigatória a emissão pelo Emissor Nacional a partir de 1º de setembro de 2026.",
  o_que_fazer: "Liste os prestadores e confira por onde cada um emite hoje.",
  fonte: "Resolução CGSN nº 189/2026",
  publicado_em: "2026-08-06",
  vigencia_em: "2026-09-01",
  severidade: "alta",
  criterio: { anexos: [3, 4, 5] },
  ativo: true,
};

const emp = (id, anexo) => ({
  id, razao_social: `Empresa ${id}`, cnpj: "00000000000000",
  anexo, faixa: "A", cnae_principal: "6201500", saida: null, tem_analise: false,
});

const carteiras = [
  { tenant_id: "t1", escritorio: "Escritório Um", email: "um@ex.com",
    empresas: [emp("a", 3), emp("b", 4), emp("c", 1)] },          // 2 atingidas
  { tenant_id: "t2", escritorio: "Escritório Dois", email: "dois@ex.com",
    empresas: [emp("d", 5)] },                                     // 1 atingida
  { tenant_id: "t3", escritorio: "Só Comércio", email: "tres@ex.com",
    empresas: [emp("e", 1), emp("f", 2)] },                        // 0 atingidas
  { tenant_id: "t4", escritorio: "Sem E-mail", email: null,
    empresas: [emp("g", 3)] },                                     // 1, mas sem e-mail
];

/* ═══════════ 1 · quem recebe ════════════════════════════════════════════ */
{
  const d = diagnosticarAviso(NFSE, carteiras, []);
  ok(d.alvos.length === 2, "só os escritórios COM empresa atingida recebem", d.alvos);
  ok(d.alvos[0].tenant_id === "t1" && d.alvos[0].empresas === 2,
     "ordenado pelo tamanho do impacto — quem tem mais clientes atingidos primeiro", d.alvos);
  ok(d.alvos[1].empresas === 1, "e o segundo com 1 empresa", d.alvos);
  ok(!d.alvos.some((a) => a.tenant_id === "t3"),
     "escritório sem NENHUMA empresa atingida NÃO recebe 'para seu conhecimento' — é assim que se perde um remetente");
  ok(d.sem_email === 1, "escritório alcançado mas sem e-mail é contado, não silenciado", d);
  ok(d.alcancados === 3, "alcançados conta t1, t2 e t4 (não o t3)", d);
  ok(d.bloqueio === null, "nada bloqueia este envio", d.bloqueio);
}

/* ═══════════ 2 · não avisa duas vezes ═══════════════════════════════════ */
{
  const d = diagnosticarAviso(NFSE, carteiras, ["t1"]);
  ok(d.alvos.length === 1 && d.alvos[0].tenant_id === "t2",
     "quem já foi avisado sai da lista", d.alvos);
  ok(d.repetidos === 1, "e é contado como repetido", d);

  const todos = diagnosticarAviso(NFSE, carteiras, ["t1", "t2", "t4"]);
  ok(todos.alvos.length === 0 && !!todos.bloqueio,
     "com todos já avisados, o envio é BLOQUEADO — não é 'enviou zero', é 'não envie'", todos);
  ok(/já foram avisados/i.test(todos.bloqueio), "e a mensagem diz por quê", todos.bloqueio);
}

/* ═══════════ 3 · o bloqueio que mais importa: item fora do ar ═══════════
 * Mandar e-mail sobre uma norma que o contador não encontra na aba Reforma
 * queima o e-mail E a aba de uma vez. Publicado e visível primeiro.
 * ═══════════════════════════════════════════════════════════════════════ */
{
  const d = diagnosticarAviso({ ...NFSE, ativo: false }, carteiras, []);
  ok(!!d.bloqueio && /FORA DO AR/i.test(d.bloqueio),
     "item fora do ar NÃO pode ser avisado", d.bloqueio);
}

/* ═══════════ 4 · critério que não pega ninguém ══════════════════════════ */
{
  const d = diagnosticarAviso({ ...NFSE, criterio: { anexos: [9] } }, carteiras, []);
  ok(!!d.bloqueio && /Nenhum escritório/i.test(d.bloqueio),
     "critério sem alcance bloqueia antes de sair — o erro do radar é de escopo, e escopo errado é silencioso",
     d.bloqueio);
}

/* ═══════════ 5 · o assunto carrega o número, não a norma ════════════════ */
{
  const a = assuntoAviso(NFSE, 12, "2026-08-06");
  ok(a.startsWith("12 clientes seus"),
     "o assunto abre com a carteira DELE — 'saiu a Resolução X' é indistinguível de newsletter", a);
  ok(a.includes("26 dias"), "e traz o prazo quando ele existe e é curto", a);

  const um = assuntoAviso(NFSE, 1, "2026-08-06");
  ok(um.startsWith("1 cliente seu e 26 dias"), "singular certo", um);

  const semPrazo = assuntoAviso({ ...NFSE, vigencia_em: null }, 3, "2026-08-06");
  ok(!/dias/.test(semPrazo), "sem vigência, sem contagem inventada", semPrazo);

  const longe = assuntoAviso({ ...NFSE, vigencia_em: "2029-01-01" }, 3, "2026-08-06");
  ok(!/dias/.test(longe), "vigência a três anos não vira urgência falsa no assunto", longe);
}

/* ═══════════ 6 · o corpo do e-mail ══════════════════════════════════════ */
{
  const html = htmlAviso(NFSE, { tenant_id: "t1", escritorio: "Escritório Um", email: "um@ex.com", empresas: 12 },
                         "https://app.enquadria.com.br", "2026-08-06");
  ok(html.includes("atinge 12 clientes seus"), "o número da carteira dele está no corpo");
  ok(html.includes("faltam 26 dias"), "o prazo está no corpo");
  ok(html.includes("O QUE FAZER"), "a ação vem destacada");
  ok(html.includes("https://app.enquadria.com.br/painel"), "e existe um caminho para ver QUAIS");
  ok(!html.includes("Empresa a") && !html.includes("Empresa b"),
     "o e-mail NÃO lista nomes de clientes — e-mail se encaminha; os nomes ficam no app");

  const vencido = htmlAviso({ ...NFSE, vigencia_em: "2026-07-01" },
                            { tenant_id: "t1", escritorio: "X", email: "x@ex.com", empresas: 2 },
                            "https://app", "2026-08-06");
  ok(/Já está valendo/.test(vencido), "vigência passada não vira 'faltam -36 dias'", vencido.slice(0, 0));

  const injecao = htmlAviso({ ...NFSE, titulo: 'A <script>alert("x")</script> B' },
                            { tenant_id: "t", escritorio: "E", email: "e@ex.com", empresas: 1 },
                            "https://app", "2026-08-06");
  ok(!injecao.includes("<script>"), "o título é escapado — texto do radar não vira HTML no e-mail");
}

/* ═══════════ 7 · o que é NOVO para um escritório ════════════════════════ */
{
  const itens = [NFSE, { ...NFSE, id: "item-velho", titulo: "Janela de opção" , criterio: {} }];
  const minhas = [emp("a", 3), emp("b", 1)];

  const zero = novosParaTenant(itens, minhas, []);
  ok(zero.novos.length === 2, "sem nenhum aviso registrado, os dois são novos", zero.novos.map((i) => i.id));
  ok(zero.empresasAfetadas.size === 2, "e as duas empresas contam como afetadas", zero.empresasAfetadas.size);

  const um = novosParaTenant(itens, minhas, ["item-nfse"]);
  ok(um.novos.length === 1 && um.novos[0].id === "item-velho",
     "item já comunicado deixa de ser novidade", um.novos);
  ok(um.empresasAfetadas.size === 2,
     "mas ele continua contando no total de empresas afetadas — deixou de ser notícia, não deixou de valer");

  const nenhum = novosParaTenant(itens, minhas, ["item-nfse", "item-velho"]);
  ok(nenhum.novos.length === 0 && nenhum.titulo === null, "e com tudo comunicado, nada é novo", nenhum);
}

/* ═══════════ 8 · o digest para de repetir ═══════════════════════════════
 * ESTA É A ASSERÇÃO QUE MUDA COMPORTAMENTO: marco já comunicado NÃO é mais
 * motivo de envio. Antes, `radar_clientes > 0` bastava — e bastava para
 * sempre, todo mês, com o mesmo assunto.
 * ═══════════════════════════════════════════════════════════════════════ */
const dBase = {
  escritorio: "Teste", fila: 0, analisadas: 0, laudos: 0, termos: 0, assinados: 0,
  honorario: 1500, radar_marcos: 0, radar_clientes: 0, radar_titulo: null,
  radar_novos: 0, radar_novo_titulo: null, dias_janela: 55,
};

{
  const repetido = montarDigest({ ...dBase, radar_marcos: 4, radar_clientes: 30, radar_titulo: "Velho" });
  ok(!repetido.vale_enviar,
     "carteira em dia + só marcos JÁ comunicados = NÃO envia. Era esta a repetição mensal.", repetido);

  const novo = montarDigest({
    ...dBase, radar_marcos: 4, radar_clientes: 30, radar_titulo: "Velho",
    radar_novos: 1, radar_novo_titulo: "NFS-e nacional",
  });
  ok(novo.vale_enviar, "um item novo, sozinho, justifica o envio", novo);
  ok(/30 clientes seus/.test(novo.assunto), "o assunto usa o tamanho do impacto", novo.assunto);
  ok(/A mais urgente: NFS-e nacional/.test(novo.destaques[0]),
     "e o destaque nomeia o item NOVO, não o mais antigo", novo.destaques);
  ok(novo.destaques.some((t) => /3 marcos já comunicados/.test(t)),
     "os 3 antigos viram CONTEXTO no fim — some-los seria pior que repeti-los", novo.destaques);
}

{
  /* quando o envio é motivado por outra coisa, o radar antigo ainda aparece */
  const porFila = montarDigest({ ...dBase, fila: 10, radar_marcos: 2, radar_clientes: 7 });
  ok(porFila.vale_enviar, "fila sem análise continua gerando envio");
  ok(porFila.destaques.some((t) => /2 marcos já comunicados/.test(t)),
     "e aí o marco antigo entra como contexto", porFila.destaques);
  ok(!/reforma/i.test(porFila.assunto), "mas não sequestra o assunto", porFila.assunto);
}

{
  const nada = montarDigest(dBase);
  ok(!nada.vale_enviar && !!nada.motivo_nao_enviar, "nada concreto = nada de e-mail", nada);
}

console.log(f ? `\n${f} FALHA(S)` : "\ntudo ok");
process.exit(f ? 1 : 0);
