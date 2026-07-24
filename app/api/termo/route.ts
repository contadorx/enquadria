import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { criarEnvelope } from "@/lib/zapsign";

/** registra o termo de ciência e, se ZapSign estiver ligado, cria o envelope */
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

  const envelope = await criarEnvelope({
    titulo: `Termo de ciência — ${corpo.empresa ?? "empresa"}`,
    signatario_nome: corpo.nome,
    signatario_email: corpo.email,
  });

  const { data, error } = await supabase.rpc("registrar_termo", {
    p_analise: corpo.analise_id,
    p_decisao: corpo.decisao,
    p_nome: corpo.nome,
    p_email: corpo.email,
    p_assinatura_url: envelope.assinatura_url ?? null,
    p_assinatura_ref: envelope.assinatura_ref ?? null,
  });

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    termo_id: data,
    zapsign_ativo: envelope.ativo,
    assinatura_url: envelope.assinatura_url ?? null,
  });
}
