import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

/**
 * Webhook do Asaas. Ativa a assinatura quando a cobrança é confirmada.
 * A validação forte (token do webhook) fica a cargo do painel do Asaas +
 * checagem do header; aqui tratamos o essencial do ciclo.
 */
export async function POST(req: Request) {
  let evento: {
    event?: string;
    payment?: { id?: string; externalReference?: string };
  };
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

  // service role: o webhook não tem sessão de usuário
  const supabase = createClient();
  const validoAte = new Date();
  validoAte.setDate(validoAte.getDate() + 365);

  await supabase
    .from("assinaturas")
    .update({ status: "ativa", valido_ate: validoAte.toISOString().slice(0, 10) })
    .eq("id", assinaturaId);

  return NextResponse.json({ ok: true });
}
