import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * Webhook do Asaas — chega SEM sessão de usuário, então usa service role
 * (a RLS bloquearia um update anônimo). Ativa a assinatura na confirmação.
 *
 * CORRIGIDO NA 0020: antes, QUALQUER pagamento confirmado dava 365 dias de
 * acesso — inclusive o PRO mensal de R$ 47. Um pagamento de um mês liberava um
 * ano. Agora o prazo vem de `planos.dias_acesso` (mensal 31, anual 365), e o
 * fallback é conservador: 31 dias, não 365. Errar para menos é um cliente que
 * escreve reclamando; errar para mais é receita que some sem ninguém notar.
 */

const PAGO = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]);
const DIAS_PADRAO = 31;

export async function POST(req: Request) {
  let evento: {
    event?: string;
    payment?: { externalReference?: string; confirmedDate?: string; paymentDate?: string; dueDate?: string };
  };
  try {
    evento = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  const confirmado = PAGO.has(evento.event ?? "");
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

  // quantos dias este plano concede
  const { data: assin } = await supabase
    .from("assinaturas")
    .select("id, plano_id")
    .eq("id", assinaturaId)
    .maybeSingle();

  let diasAcesso = DIAS_PADRAO;
  const planoId = (assin as { plano_id?: string } | null)?.plano_id;
  if (planoId) {
    const { data: plano } = await supabase
      .from("planos")
      .select("dias_acesso, ciclo")
      .eq("id", planoId)
      .maybeSingle();
    const p = plano as { dias_acesso?: number | null; ciclo?: string | null } | null;
    if (p?.dias_acesso) diasAcesso = Number(p.dias_acesso);
    else if (p?.ciclo === "anual") diasAcesso = 365;
  }

  // conta a partir da data do pagamento, não de "agora": se o webhook chegar
  // atrasado, o cliente não perde os dias que já eram dele.
  const base = evento.payment?.confirmedDate || evento.payment?.paymentDate || evento.payment?.dueDate;
  const validoAte = base ? new Date(base) : new Date();
  validoAte.setDate(validoAte.getDate() + diasAcesso);
  const data = validoAte.toISOString().slice(0, 10);

  const { error } = await supabase
    .from("assinaturas")
    .update({
      status: "ativa",
      valido_ate: data,
      vencimento: data,
      pago_em: new Date(base || Date.now()).toISOString(),
    })
    .eq("id", assinaturaId);

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, dias_acesso: diasAcesso, valido_ate: data });
}
