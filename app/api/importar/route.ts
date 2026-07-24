import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { triar, resumir, type EmpresaBruta } from "@/lib/triagem";
import { enriquecer, fundir } from "@/lib/receita";
import type { LinhaCarteira } from "@/lib/csv";

/**
 * Recebe as linhas já parseadas no navegador, enriquece contra a Receita,
 * roda a triagem e grava tudo em lote. O parse fica no cliente (papaparse no
 * browser aguenta arquivo grande sem estourar o payload); aqui roda o que
 * precisa de segredo: o token da Receita e o service-role implícito da sessão.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
  }

  const { data: perfil } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();
  const tenantId = perfil?.tenant_id;
  if (!tenantId) {
    return NextResponse.json({ erro: "workspace não encontrado" }, { status: 400 });
  }

  let corpo: { linhas: LinhaCarteira[]; arquivo?: string; stats?: Record<string, number> };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  const linhas = corpo.linhas ?? [];
  if (linhas.length === 0) {
    return NextResponse.json({ erro: "nenhuma linha válida" }, { status: 400 });
  }
  if (linhas.length > 5000) {
    return NextResponse.json({ erro: "limite de 5000 empresas por importação" }, { status: 400 });
  }

  const { dados, ativo } = await enriquecer(linhas.map((l) => l.cnpj));

  const registros = linhas.map((l) => {
    const enriquecido = fundir(l, dados[l.cnpj]);
    const bruta: EmpresaBruta = {
      cnpj: enriquecido.cnpj,
      razao_social: enriquecido.razao_social,
      cnae_principal: enriquecido.cnae_principal ?? null,
      cnaes_secundarios: enriquecido.cnaes_secundarios ?? null,
      porte: enriquecido.porte ?? null,
      situacao: enriquecido.situacao ?? null,
      regime: enriquecido.regime ?? null,
      faturamento_faixa: enriquecido.faturamento_faixa ?? null,
    };
    const t = triar(bruta);
    const veioDaReceita = ativo && !!dados[l.cnpj];
    return {
      tenant_id: tenantId,
      cnpj: enriquecido.cnpj,
      razao_social: enriquecido.razao_social,
      cnae_principal: enriquecido.cnae_principal ?? null,
      cnaes_secundarios: enriquecido.cnaes_secundarios ?? null,
      anexo: enriquecido.anexo ?? null,
      porte: enriquecido.porte ?? null,
      situacao: enriquecido.situacao ?? null,
      regime: enriquecido.regime ?? null,
      faturamento_faixa: enriquecido.faturamento_faixa ?? null,
      faixa: t.faixa,
      motivo_triagem: t.motivo,
      prioridade_maxima: t.prioridade_maxima,
      fonte_dados: veioDaReceita ? "receita" : "csv",
    };
  });

  const resumo = resumir(
    registros.map((r) => ({
      faixa: r.faixa,
      motivo: r.motivo_triagem,
      prioridade_maxima: r.prioridade_maxima,
    }))
  );
  const enriquecidas = registros.filter((r) => r.fonte_dados === "receita").length;

  const { data: imp, error: impErr } = await supabase
    .from("importacoes")
    .insert({
      tenant_id: tenantId,
      arquivo: corpo.arquivo ?? null,
      total_lidas: corpo.stats?.total_lidas ?? linhas.length,
      gravadas: registros.length,
      descartadas: corpo.stats?.descartadas ?? 0,
      duplicadas: corpo.stats?.duplicadas ?? 0,
      enriquecidas,
      receita_ativa: ativo,
      resumo_faixas: resumo,
    })
    .select("id")
    .single();

  if (impErr) {
    return NextResponse.json({ erro: impErr.message }, { status: 500 });
  }

  const comLote = registros.map((r) => ({ ...r, importacao_id: imp.id }));

  const { error: upErr } = await supabase
    .from("empresas")
    .upsert(comLote, { onConflict: "tenant_id,cnpj" });

  if (upErr) {
    return NextResponse.json({ erro: upErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    gravadas: registros.length,
    enriquecidas,
    receita_ativa: ativo,
    resumo,
  });
}
