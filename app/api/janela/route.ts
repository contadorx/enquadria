import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { decidir, dDASefetivo, PARAMETROS_2027, type Respostas } from "@/lib/motor";
import { anexoPorCnae } from "@/lib/triagem";

/**
 * NOVA RODADA DE JANELA — o que torna a perenidade real.
 *
 * A opção de IBS/CBS vale por semestre: quando o período seguinte abre, o
 * contador precisa decidir de novo — SEM perder o que decidiu antes. Aqui a
 * gente cria uma análise NOVA por empresa, vinculada à nova janela, partindo
 * das respostas anteriores e recalculando com os parâmetros vigentes.
 *
 * O histórico fica intacto: as análises antigas continuam lá, e os laudos já
 * emitidos seguem congelados no snapshot da emissão.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });

  const { data: perfil } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();
  const tenantId = perfil?.tenant_id;
  if (!tenantId) return NextResponse.json({ erro: "workspace não encontrado" }, { status: 400 });

  let corpo: { janela_codigo?: string; nome?: string; abre?: string; fecha?: string; exercicio?: number };
  try {
    corpo = await req.json();
  } catch {
    corpo = {};
  }
  if (!corpo.janela_codigo || !corpo.nome) {
    return NextResponse.json({ erro: "informe o código e o nome da janela" }, { status: 400 });
  }

  // cria a janela se ainda não existir (o catálogo é global)
  const { data: existente } = await supabase
    .from("janelas")
    .select("id")
    .eq("codigo", corpo.janela_codigo)
    .maybeSingle();

  let janelaId = existente?.id as string | undefined;
  if (!janelaId) {
    const { data: nova, error: errJ } = await supabase
      .from("janelas")
      .insert({
        codigo: corpo.janela_codigo,
        nome: corpo.nome,
        abre: corpo.abre ?? null,
        fecha: corpo.fecha ?? null,
        exercicio: corpo.exercicio ?? null,
        ativa: false,
      })
      .select("id")
      .single();
    if (errJ) return NextResponse.json({ erro: errJ.message }, { status: 500 });
    janelaId = nova.id;
  }

  // análises da rodada anterior que servirão de ponto de partida
  const { data: anteriores } = await supabase
    .from("analises")
    .select("empresa_id, respostas, janela_id")
    .neq("janela_id", janelaId)
    .limit(1000);

  if (!anteriores?.length) {
    return NextResponse.json({ ok: true, janela_id: janelaId, criadas: 0, ja_existiam: 0 });
  }

  // o que já foi criado nesta janela não é tocado
  const { data: jaNaJanela } = await supabase
    .from("analises")
    .select("empresa_id")
    .eq("janela_id", janelaId);
  const existentes = new Set((jaNaJanela ?? []).map((a) => a.empresa_id));

  // uma entrada por empresa (a mais recente já sobreviveu ao índice único)
  const porEmpresa = new Map<string, { respostas: unknown }>();
  for (const a of anteriores) {
    if (!existentes.has(a.empresa_id)) porEmpresa.set(a.empresa_id, { respostas: a.respostas });
  }
  if (porEmpresa.size === 0) {
    return NextResponse.json({
      ok: true,
      janela_id: janelaId,
      criadas: 0,
      ja_existiam: existentes.size,
    });
  }

  const { data: empresas } = await supabase
    .from("empresas")
    .select("id, anexo, rbt12, cnae_principal")
    .in("id", Array.from(porEmpresa.keys()));
  const mapaEmpresa = new Map((empresas ?? []).map((e) => [e.id, e]));

  const { data: param } = await supabase
    .from("parametros_exercicio")
    .select("aliquota_cbs, aliquota_ibs, corte_s1, fronteira_min, fronteira_max")
    .eq("exercicio", corpo.exercicio ?? 2027)
    .maybeSingle();
  const aliquota = param
    ? Number(param.aliquota_cbs) + Number(param.aliquota_ibs)
    : PARAMETROS_2027.aliquota;

  const registros = Array.from(porEmpresa.entries())
    .map(([empresaId, dados]) => {
      const e = mapaEmpresa.get(empresaId);
      if (!e || !dados.respostas) return null;
      const anexo = e.anexo ?? anexoPorCnae(e.cnae_principal) ?? 1;
      const ddas = dDASefetivo(anexo, e.rbt12 != null ? Number(e.rbt12) : null);
      const parametros = {
        aliquota,
        das: ddas.das,
        corteS1: param ? Number(param.corte_s1) : PARAMETROS_2027.corteS1,
        fronteiraMin: param ? Number(param.fronteira_min) : PARAMETROS_2027.fronteiraMin,
        fronteiraMax: param ? Number(param.fronteira_max) : PARAMETROS_2027.fronteiraMax,
        ddas,
        origem_premissas: "rodada_anterior",
      };
      const r = decidir(dados.respostas as Respostas, parametros);
      return {
        tenant_id: tenantId,
        empresa_id: empresaId,
        janela_id: janelaId,
        status: "em_analise" as const,
        respostas: dados.respostas,
        rq: r.rq,
        ch: r.ch,
        cl: r.cl,
        re: isFinite(r.re) ? r.re : null,
        fc: r.fc,
        saida: r.saida,
        prioridade: r.prioridade,
        parametros,
        calculado_em: new Date().toISOString(),
      };
    })
    .filter(Boolean) as Record<string, unknown>[];

  if (registros.length === 0) {
    return NextResponse.json({ ok: true, janela_id: janelaId, criadas: 0, ja_existiam: existentes.size });
  }

  const { error } = await supabase.from("analises").insert(registros);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    janela_id: janelaId,
    criadas: registros.length,
    ja_existiam: existentes.size,
  });
}
