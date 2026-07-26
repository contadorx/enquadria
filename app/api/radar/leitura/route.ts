import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

/** marca (ou desmarca) um item do radar como lido por este escritório */
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

  let corpo: { item_id?: string; lido?: boolean };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }
  if (!corpo.item_id) {
    return NextResponse.json({ erro: "item_id obrigatório" }, { status: 400 });
  }

  if (corpo.lido === false) {
    const { error } = await supabase
      .from("radar_leituras")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("item_id", corpo.item_id);
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, lido: false });
  }

  const { error } = await supabase
    .from("radar_leituras")
    .upsert(
      { tenant_id: tenantId, item_id: corpo.item_id, lido_em: new Date().toISOString() },
      { onConflict: "tenant_id,item_id" }
    );
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, lido: true });
}
