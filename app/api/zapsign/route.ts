import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * Webhook do ZapSign — sem sessão de usuário, usa service role. Marca o termo
 * assinado e avança a análise para "decidida".
 */
export async function POST(req: Request) {
  let evento: { status?: string; token?: string };
  try {
    evento = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  const assinado = (evento.status ?? "").toLowerCase() === "signed";
  const ref = evento.token;
  if (!assinado || !ref) return NextResponse.json({ ok: true, ignorado: true });

  const supabase = createAdminClient();
  if (!supabase) {
    console.warn("[zapsign] SUPABASE_SERVICE_ROLE_KEY ausente — termo não marcado:", ref);
    return NextResponse.json({ ok: true, pendente: true });
  }

  const { data: termo } = await supabase
    .from("termos")
    .select("id, analise_id")
    .eq("assinatura_ref", ref)
    .maybeSingle();

  if (termo) {
    await supabase.from("termos").update({ assinado_em: new Date().toISOString() }).eq("id", termo.id);
    await supabase.from("analises").update({ status: "decidida" }).eq("id", termo.analise_id);
  }

  return NextResponse.json({ ok: true });
}
