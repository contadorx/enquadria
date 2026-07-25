import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { decidir, dDASefetivo, PARAMETROS_2027, type Respostas } from "@/lib/motor";
import { anexoPorCnae } from "@/lib/triagem";

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

  let corpo: { empresa_id: string; janela_id?: string; respostas: Respostas; rbt12?: number | null };
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
    .select("aliquota_cbs, aliquota_ibs, corte_s1, fronteira_min, fronteira_max")
    .eq("exercicio", 2027)
    .maybeSingle();

  // anexo + RBT12 da empresa sustentam a alíquota EFETIVA do dDAS
  const { data: empresa } = await supabase
    .from("empresas")
    .select("anexo, rbt12, cnae_principal")
    .eq("id", corpo.empresa_id)
    .maybeSingle();

  // RBT12 informado na tela tem prioridade; persiste para reuso e para o laudo
  const rbt12Informado =
    corpo.rbt12 != null && Number.isFinite(corpo.rbt12) && Number(corpo.rbt12) > 0
      ? Number(corpo.rbt12)
      : null;
  if (rbt12Informado != null && rbt12Informado !== Number(empresa?.rbt12 ?? 0)) {
    await supabase.from("empresas").update({ rbt12: rbt12Informado }).eq("id", corpo.empresa_id);
  }

  const anexoEfetivo = empresa?.anexo ?? anexoPorCnae(empresa?.cnae_principal) ?? 1;
  const rbt12Efetivo = rbt12Informado ?? (empresa?.rbt12 != null ? Number(empresa.rbt12) : null);

  // dDAS EFETIVO por empresa: com RBT12 usa a alíquota efetiva; sem, topo da faixa
  const ddas = dDASefetivo(anexoEfetivo, rbt12Efetivo);

  const aliquota = param
    ? Number(param.aliquota_cbs) + Number(param.aliquota_ibs)
    : PARAMETROS_2027.aliquota;

  const parametros = {
    aliquota,
    das: ddas.das,
    corteS1: param ? Number(param.corte_s1) : PARAMETROS_2027.corteS1,
    fronteiraMin: param ? Number(param.fronteira_min) : PARAMETROS_2027.fronteiraMin,
    fronteiraMax: param ? Number(param.fronteira_max) : PARAMETROS_2027.fronteiraMax,
    // rastreabilidade da premissa do dDAS, congelada com a análise
    ddas,
  };

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
