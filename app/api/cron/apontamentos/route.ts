import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { ordenar, type EmpresaRadar, type ItemRadar } from "@/lib/radar";
import { planejarGeracao, type ResultadoVarredura } from "@/lib/apontamentos";

export const dynamic = "force-dynamic";
/* a varredura percorre todos os tenants; o padrão de 10s da Vercel não cobre */
export const maxDuration = 60;

/**
 * A VARREDURA DIÁRIA — o monitor de verdade.
 *
 * ---------------------------------------------------------------------------
 * TRÊS CADÊNCIAS DIFERENTES, E CONFUNDI-LAS É O ERRO QUE MATA O CANAL
 *
 *   1. A VARREDURA é DIÁRIA — este cron. Barata, silenciosa, e roda mesmo nos
 *      dias em que não há nada novo. É o que garante que nada fica descoberto.
 *   2. A PUBLICAÇÃO é quando houver norma. Alguns dias nenhuma; noutros três.
 *      Publicar por calendário é como escrever para preencher espaço.
 *   3. O AVISO é por RELEVÂNCIA, nunca por dia. E-mail diário para contador é
 *      e-mail que vira regra de caixa em duas semanas — e este domínio já
 *      pagou o preço de disparo demais uma vez. Quem decide se avisa é a
 *      severidade e o alcance, não o relógio.
 *
 * Este arquivo faz só a primeira. As outras duas continuam onde estão.
 *
 * O HORÁRIO: `0 8 * * *` no `vercel.json` — o cron da Vercel roda em UTC, e
 * 08h UTC são **05h em São Paulo**. Antes de o escritório abrir, para que a
 * primeira coisa que o contador veja ao entrar já esteja com a carteira do dia
 * varrida. No horário de verão, se voltar a existir, isto vira 09h UTC.
 *
 * ---------------------------------------------------------------------------
 * POR QUE VARRER TODO DIA SE A NORMA SAI TODA SEMANA
 *
 * Porque a carteira muda todo dia, mesmo quando a lei não muda. Empresa
 * importada hoje precisa herdar os apontamentos das normas de março. Análise
 * salva hoje faz a empresa passar a casar com critérios que exigem `saida`.
 * CNAE corrigido hoje muda o alcance de tudo. A varredura não existe só para
 * pegar norma nova: existe para pegar CARTEIRA nova.
 */
export async function POST(req: Request) {
  return varrer(req);
}
export async function GET(req: Request) {
  return varrer(req);
}

async function varrer(req: Request) {
  const segredo = process.env.CRON_SECRET;
  const autorizacao = req.headers.get("authorization");
  if (segredo && autorizacao !== `Bearer ${segredo}`) {
    return NextResponse.json(
      { erro: "não autorizado — configure CRON_SECRET e envie o segredo" },
      { status: 401 }
    );
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ erro: "sem credencial de serviço" }, { status: 500 });
  }

  /* as matérias ativas, uma vez, para todos os tenants: o radar é conteúdo
     nosso, igual para todo mundo — o que muda por escritório é a carteira */
  // schema-ok: radar_itens é criada pela migration 0053 e ampliada pela 0056
  const { data: itensCru, error: erroItens } = await supabase
    .from("radar_itens")
    .select("id, titulo, resumo, o_que_fazer, fonte, publicado_em, vigencia_em, severidade, criterio")
    .eq("ativo", true);
  if (erroItens) return NextResponse.json({ erro: erroItens.message }, { status: 500 });

  const itens = ordenar((itensCru ?? []) as ItemRadar[], new Date().toISOString());
  if (itens.length === 0) {
    return NextResponse.json({ ok: true, tenants: 0, nada: "nenhuma matéria ativa" });
  }

  // schema-ok: profiles.tenant_id existe desde a 0002
  const { data: tenants } = await supabase.from("tenants").select("id");

  const total: ResultadoVarredura = {
    itens: itens.length,
    empresas: 0,
    criados: 0,
    superados: 0,
    reabertos: 0,
  };

  for (const t of tenants ?? []) {
    /* ARQUIVADA NÃO ENTRA. A empresa que o contador tirou da carteira não pode
       voltar por uma norma nova — seria o produto desarquivando por conta
       própria o que alguém decidiu esconder. */
    // schema-ok: empresas.arquivada_em é criada pela migration 0035
    const { data: empresasCru } = await supabase
      .from("empresas")
      .select("id, cnae_principal, anexo, faixa, arquivada_em")
      .eq("tenant_id", t.id)
      .is("arquivada_em", null);
    if (!empresasCru?.length) continue;

    /* a saída da análise mais recente entra no casamento: é o critério mais
       valioso que existe aqui, porque nenhum concorrente tem a resposta */
    // schema-ok: analises.saida existe desde a 0006
    const { data: analises } = await supabase
      .from("analises")
      .select("empresa_id, saida, calculado_em")
      .eq("tenant_id", t.id)
      .order("calculado_em", { ascending: false });

    const saidaDe = new Map<string, string>();
    for (const a of analises ?? []) {
      if (!saidaDe.has(a.empresa_id)) saidaDe.set(a.empresa_id, a.saida as string);
    }

    const carteira: EmpresaRadar[] = empresasCru.map((e) => ({
      id: e.id,
      razao_social: "",
      cnpj: "",
      cnae_principal: e.cnae_principal,
      anexo: e.anexo,
      faixa: e.faixa,
      saida: saidaDe.get(e.id) ?? null,
      tem_analise: saidaDe.has(e.id),
    }));

    // schema-ok: apontamentos é criada pela migration 0063
    const { data: existentes } = await supabase
      .from("apontamentos")
      .select("id, item_id, empresa_id, status")
      .eq("tenant_id", t.id);

    const plano = planejarGeracao(itens, carteira, existentes ?? []);
    const porChave = new Map(
      (existentes ?? []).map((a) => [`${a.item_id}|${a.empresa_id}`, a.id as string])
    );

    if (plano.criar.length) {
      /* `upsert` com ignoreDuplicates e não `insert`: duas varreduras
         concorrentes (o cron e uma publicação manual no mesmo minuto) não podem
         derrubar uma à outra por causa do índice único. */
      await supabase.from("apontamentos").upsert(
        plano.criar.map((c) => ({
          tenant_id: t.id,
          item_id: c.item_id,
          empresa_id: c.empresa_id,
          criterio_no_momento: c.criterio,
          status: "novo",
        })),
        { onConflict: "item_id,empresa_id", ignoreDuplicates: true }
      );
      total.criados += plano.criar.length;
    }

    const ids = (chaves: string[]) => chaves.map((k) => porChave.get(k)).filter(Boolean) as string[];

    const paraSuperar = ids(plano.superar);
    if (paraSuperar.length) {
      await supabase.from("apontamentos").update({ status: "superado" }).in("id", paraSuperar);
      total.superados += paraSuperar.length;
    }

    const paraReabrir = ids(plano.reabrir);
    if (paraReabrir.length) {
      await supabase.from("apontamentos").update({ status: "novo" }).in("id", paraReabrir);
      total.reabertos += paraReabrir.length;
    }

    total.empresas += carteira.length;
  }

  return NextResponse.json({ ok: true, tenants: (tenants ?? []).length, ...total });
}
