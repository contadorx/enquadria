import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

/** emite o laudo de uma análise (RPC atômica que numera por tenant) */
export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });

  let corpo: { analise_id: string };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }
  if (!corpo.analise_id) {
    return NextResponse.json({ erro: "analise_id obrigatório" }, { status: 400 });
  }

  const { data, error } = await supabase
    .rpc("emitir_laudo", { p_analise: corpo.analise_id })
    .single();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  const laudo = data as { id: string; numero: number };
  return NextResponse.json({ ok: true, laudo_id: laudo.id, numero: laudo.numero });
}
