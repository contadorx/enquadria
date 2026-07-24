import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { decidir, PARAMETROS_2027, type Respostas } from "@/lib/motor";

/**
 * Persiste uma análise: recebe empresa + respostas, recalcula o motor NO
 * SERVIDOR (nunca confia no número que veio do cliente) e grava congelando
 * os parâmetros usados. Congelar é o que impede um laudo de agosto virar
 * mentira quando a alíquota mudar em outubro.
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

  let corpo: { empresa_id: string; janela_id?: string; respostas: Respostas };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }
  if (!corpo.empresa_id || !corpo.respostas) {
    return NextResponse.json({ erro: "empresa_id e respostas obrigatórios" }, { status: 400 });
  }

  // parâmetros vigentes do exercício (fonte da verdade é o banco)
  const { data: param } = await supabase
    .from("parametros_exercicio")
    .select("aliquota_cbs, aliquota_ibs, das_por_anexo, corte_s1, fronteira_min, fronteira_max")
    .eq("exercicio", 2027)
    .maybeSingle();

  // anexo da empresa afina o dDAS (faixa de faturamento entra na fatia futura)
  const { data: empresa } = await supabase
    .from("empresas")
    .select("anexo")
    .eq("id", corpo.empresa_id)
    .maybeSingle();

  let parametros = PARAMETROS_2027;
  if (param) {
    const anexo = empresa?.anexo ?? 1;
    const faixaFat = 3; // padrão conservador até derivar da RBT12
    const dasMap = (param.das_por_anexo ?? {}) as Record<string, Record<string, number> | number>;
    const doAnexo = dasMap[String(anexo)];
    let das = PARAMETROS_2027.das;
    if (typeof doAnexo === "number") {
      das = doAnexo; // formato antigo (só anexo)
    } else if (doAnexo && typeof doAnexo === "object") {
      das = doAnexo[String(faixaFat)] ?? doAnexo["3"] ?? PARAMETROS_2027.das;
    }
    parametros = {
      aliquota: Number(param.aliquota_cbs) + Number(param.aliquota_ibs),
      das,
      corteS1: Number(param.corte_s1),
      fronteiraMin: Number(param.fronteira_min),
      fronteiraMax: Number(param.fronteira_max),
    };
  }

  const r = decidir(corpo.respostas, parametros);

  const registro = {
    tenant_id: tenantId,
    empresa_id: corpo.empresa_id,
    janela_id: corpo.janela_id ?? null,
    status: "laudo_emitido" as const,
    respostas: corpo.respostas,
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

  const { data, error } = await supabase
    .from("analises")
    .upsert(registro, { onConflict: "empresa_id,janela_id" })
    .select("id")
    .single();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, analise_id: data.id, resultado: r });
}
