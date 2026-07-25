import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { conteudoCanonico, sha256, novoToken, CLAUSULAS_CIENCIA } from "@/lib/esign";

/**
 * Registra o termo de ciência e prepara a ASSINATURA PRÓPRIA (sem ZapSign):
 * gera um token público, congela o hash do conteúdo canônico e devolve o link
 * de assinatura /assinar/{token} para o contador enviar ao cliente.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });

  let corpo: {
    analise_id: string;
    decisao: "optar" | "permanecer";
    nome: string;
    email: string;
    empresa?: string;
  };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }
  if (!corpo.analise_id || !corpo.nome || !corpo.email) {
    return NextResponse.json({ erro: "analise_id, nome e email obrigatórios" }, { status: 400 });
  }

  // empresa da análise — alimenta o conteúdo canônico que será "assinado"
  const { data: analise } = await supabase
    .from("analises")
    .select("empresa_id")
    .eq("id", corpo.analise_id)
    .maybeSingle();
  const { data: empresa } = analise
    ? await supabase.from("empresas").select("razao_social, cnpj").eq("id", analise.empresa_id).maybeSingle()
    : { data: null };

  const hash = sha256(
    conteudoCanonico({
      empresa: empresa?.razao_social ?? corpo.empresa ?? "empresa",
      cnpj: empresa?.cnpj ?? "",
      decisao: corpo.decisao,
      clausulas: CLAUSULAS_CIENCIA,
    })
  );
  const token = novoToken();

  // cria a linha base pela RPC existente (tenant/numeração), sem assinatura externa
  const { data: termoId, error } = await supabase.rpc("registrar_termo", {
    p_analise: corpo.analise_id,
    p_decisao: corpo.decisao,
    p_nome: corpo.nome,
    p_email: corpo.email,
    p_assinatura_url: null,
    p_assinatura_ref: null,
  });
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  // prepara a assinatura própria: token público, hash congelado, status pendente
  const { error: upErr } = await supabase
    .from("termos")
    .update({
      token,
      hash_documento: hash,
      status: "pendente",
      assinante_email: corpo.email,
    })
    .eq("id", termoId);
  if (upErr) return NextResponse.json({ erro: upErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    termo_id: termoId,
    token,
    link_assinatura: `/assinar/${token}`,
  });
}
