import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { criarCobranca } from "@/lib/asaas";

/** cria a assinatura pendente e a cobrança Asaas para um plano */
export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });

  const { data: perfil } = await supabase
    .from("profiles")
    .select("tenant_id, email, tenants(nome)")
    .eq("id", user.id)
    .maybeSingle();
  const tenantId = perfil?.tenant_id;
  if (!tenantId) return NextResponse.json({ erro: "workspace não encontrado" }, { status: 400 });

  let corpo: { plano_id: string };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  const { data: plano } = await supabase
    .from("planos")
    .select("id, nome, preco_centavos")
    .eq("id", corpo.plano_id)
    .maybeSingle();
  if (!plano) return NextResponse.json({ erro: "plano inválido" }, { status: 400 });

  const { data: assinatura, error: aErr } = await supabase
    .from("assinaturas")
    .insert({ tenant_id: tenantId, plano_id: plano.id, status: "pendente" })
    .select("id")
    .single();
  if (aErr) return NextResponse.json({ erro: aErr.message }, { status: 500 });

  const t = perfil?.tenants as { nome?: string } | { nome?: string }[] | null;
  const nome = (Array.isArray(t) ? t[0]?.nome : t?.nome) ?? "Escritório";

  const cobranca = await criarCobranca({
    nome,
    email: perfil?.email ?? user.email ?? "",
    valor_centavos: plano.preco_centavos,
    descricao: `Enquadria — ${plano.nome}`,
    externo: assinatura.id,
  });

  if (cobranca.asaas_id || cobranca.checkout_url) {
    await supabase
      .from("assinaturas")
      .update({ asaas_id: cobranca.asaas_id ?? null, checkout_url: cobranca.checkout_url ?? null })
      .eq("id", assinatura.id);
  }

  return NextResponse.json({
    ok: true,
    assinatura_id: assinatura.id,
    asaas_ativo: cobranca.ativo,
    checkout_url: cobranca.checkout_url ?? null,
  });
}
