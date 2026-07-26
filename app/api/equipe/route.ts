import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { emailValido } from "@/lib/csv";
import { enviarEmail } from "@/lib/brevo";

/**
 * EQUIPE — convites para o escritório.
 *
 * Quem chega com convite pendente entra no workspace existente (a lógica vive
 * no trigger de provisionamento). Aqui apenas registramos o convite e avisamos
 * a pessoa; sem serviço de e-mail, o dono copia o link de cadastro e envia.
 */

async function contexto(supabase: ReturnType<typeof createClient>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: perfil } = await supabase
    .from("profiles")
    .select("tenant_id, role, tenants(nome)")
    .eq("id", user.id)
    .maybeSingle();
  if (!perfil?.tenant_id) return null;
  const t = perfil.tenants as { nome?: string } | { nome?: string }[] | null;
  return {
    user,
    tenantId: perfil.tenant_id as string,
    role: (perfil.role as string) ?? "membro",
    escritorio: (Array.isArray(t) ? t[0]?.nome : t?.nome) || "o escritório",
  };
}

export async function POST(req: Request) {
  const supabase = createClient();
  const ctx = await contexto(supabase);
  if (!ctx) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });

  // só quem administra o escritório convida
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return NextResponse.json(
      { erro: "apenas o responsável pelo escritório pode convidar" },
      { status: 403 }
    );
  }

  let corpo: { email?: string; papel?: string };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  const email = emailValido(corpo.email);
  if (!email) return NextResponse.json({ erro: "informe um e-mail válido" }, { status: 400 });

  // já faz parte da equipe?
  const { data: jaMembro } = await supabase
    .from("profiles")
    .select("id")
    .eq("tenant_id", ctx.tenantId)
    .ilike("email", email)
    .maybeSingle();
  if (jaMembro) {
    return NextResponse.json({ erro: "essa pessoa já faz parte da equipe" }, { status: 409 });
  }

  const papel = corpo.papel === "admin" ? "admin" : "membro";

  const { data: convite, error } = await supabase
    .from("convites")
    .upsert(
      {
        tenant_id: ctx.tenantId,
        email,
        papel,
        criado_por: ctx.user.id,
        criado_em: new Date().toISOString(),
        expira_em: new Date(Date.now() + 14 * 86400_000).toISOString(),
        aceito_em: null,
        aceito_por: null,
      },
      { onConflict: "tenant_id,email" }
    )
    .select("id, email, papel, expira_em")
    .single();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  const base = new URL(req.url).origin;
  const envio = await enviarEmail({
    para: email,
    assunto: `Você foi convidado para o Enquadria de ${ctx.escritorio}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#334155">
        <div style="border-bottom:2px solid #0B1220;padding-bottom:12px;margin-bottom:20px">
          <strong style="font-size:18px;color:#0B1220">Enquadria</strong>
        </div>
        <p><strong>${ctx.escritorio}</strong> convidou você para acessar a carteira do escritório no Enquadria.</p>
        <p>Crie sua conta com <strong>este mesmo e-mail</strong> e você entrará direto no workspace do escritório — sem precisar importar nada de novo.</p>
        <p style="text-align:center;margin:26px 0">
          <a href="${base}/login" style="background:#06B6D4;color:#04212B;font-weight:bold;text-decoration:none;padding:13px 24px;border-radius:999px;display:inline-block">Criar minha conta</a>
        </p>
        <p style="font-size:12px;color:#64748B">O convite vale por 14 dias. Se você não esperava esta mensagem, pode ignorá-la.</p>
      </div>`,
  });

  return NextResponse.json({ ok: true, convite, email_enviado: envio.enviado });
}

export async function DELETE(req: Request) {
  const supabase = createClient();
  const ctx = await contexto(supabase);
  if (!ctx) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    return NextResponse.json({ erro: "sem permissão" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ erro: "id obrigatório" }, { status: 400 });

  const { error } = await supabase
    .from("convites")
    .delete()
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
