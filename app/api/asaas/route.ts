import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * Webhook do Asaas — chega SEM sessão de usuário, então usa service role
 * (a RLS bloquearia um update anônimo). Ativa a assinatura na confirmação.
 */
export async function POST(req: Request) {
  let evento: { event?: string; payment?: { externalReference?: string } };
  try {
    evento = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  const confirmado = ["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"].includes(evento.event ?? "");
  const assinaturaId = evento.payment?.externalReference;
  if (!confirmado || !assinaturaId) {
    return NextResponse.json({ ok: true, ignorado: true });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    // sem service role: aceita o evento para não gerar reenvio, mas avisa no log
    console.warn("[asaas] SUPABASE_SERVICE_ROLE_KEY ausente — assinatura não ativada:", assinaturaId);
    return NextResponse.json({ ok: true, pendente: true });
  }

  const validoAte = new Date();
  validoAte.setDate(validoAte.getDate() + 365);

  const { error } = await supabase
    .from("assinaturas")
    .update({ status: "ativa", valido_ate: validoAte.toISOString().slice(0, 10) })
    .eq("id", assinaturaId);

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
