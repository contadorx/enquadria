import { NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * O DESCADASTRO — rota pública, e a única do app que grava sem sessão.
 *
 * A defesa é o token assinado: sem ele, qualquer pessoa poderia remover o
 * e-mail de qualquer contador. Com ele, só quem recebeu a mensagem consegue —
 * a assinatura vai no link do rodapé e é derivada do próprio endereço.
 *
 * É POST de propósito. Antivírus e pré-visualização de e-mail seguem todos os
 * links da mensagem; se um GET removesse o endereço, a base sairia sozinha.
 */

export const dynamic = "force-dynamic";

function assinar(email: string): string {
  const segredo = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return crypto.createHmac("sha256", segredo).update(email.trim().toLowerCase())
    .digest("base64url").slice(0, 20);
}

export async function POST(req: Request) {
  let corpo: { email?: string; token?: string; motivo?: string };
  try { corpo = await req.json(); } catch { return NextResponse.json({ erro: "corpo inválido" }, { status: 400 }); }

  const email = (corpo.email ?? "").trim().toLowerCase();
  const token = (corpo.token ?? "").trim();
  if (!email || !token) return NextResponse.json({ erro: "link incompleto" }, { status: 400 });

  /* comparação em tempo constante: token é segredo, e comparar com === abre
     uma brecha de temporização que não custa nada fechar */
  const esperado = assinar(email);
  const a = Buffer.from(token);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return NextResponse.json({ erro: "este link não confere. Responda ao e-mail que eu removo na mão." }, { status: 403 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ erro: "indisponível agora" }, { status: 503 });

  /* upsert: clicar duas vezes não pode virar erro na cara de quem só quer sair */
  const { error } = await admin
    .from("plataforma_descadastros")
    .upsert(
      { email, motivo: (corpo.motivo ?? "").trim().slice(0, 300) || null },
      { onConflict: "email" }
    );

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
