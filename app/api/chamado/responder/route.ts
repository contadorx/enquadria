import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { enviarEmail } from "@/lib/email";
import { htmlRespostaChamado } from "@/lib/emails-cliente";

/**
 * RESPONDER UM CHAMADO — grava e AVISA.
 *
 * As duas coisas juntas de propósito. Gravar sem avisar deixa a resposta
 * esperando dentro do app que a pessoa talvez só abra semana que vem, e o
 * assistente já prometeu que ela receberia por e-mail.
 *
 * SÓ SUPERADMIN responde. A checagem é feita aqui e não confiada à tela: uma
 * rota que escreve em chamado alheio não pode depender de o botão estar
 * escondido.
 */

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });

  const { data: perfil } = await supabase
    .from("profiles")
    .select("is_superadmin")
    .eq("id", user.id)
    .maybeSingle();
  if (!perfil?.is_superadmin) {
    return NextResponse.json({ erro: "só o suporte responde chamados" }, { status: 403 });
  }

  let corpo: { chamado_id?: string; resposta?: string; resolver?: boolean };
  try { corpo = await req.json(); } catch { corpo = {}; }

  const chamadoId = (corpo.chamado_id ?? "").trim();
  const resposta = (corpo.resposta ?? "").trim();
  if (!chamadoId || !resposta) {
    return NextResponse.json({ erro: "informe chamado_id e resposta" }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ erro: "sem chave de serviço" }, { status: 503 });

  const { data: chamado } = await admin
    .from("chamados")
    .select("id, user_id, assunto")
    .eq("id", chamadoId)
    .maybeSingle();
  if (!chamado) return NextResponse.json({ erro: "chamado não encontrado" }, { status: 404 });

  const { data: msg } = await admin
    .from("chamado_mensagens")
    .insert({ chamado_id: chamadoId, autor: "suporte", corpo: resposta })
    .select("id")
    .maybeSingle();

  await admin
    .from("chamados")
    .update({
      status: corpo.resolver ? "resolvido" : "respondido",
      respondido_em: new Date().toISOString(),
      ...(corpo.resolver ? { resolvido_em: new Date().toISOString() } : {}),
    })
    .eq("id", chamadoId);

  // o destinatário é quem abriu o chamado
  const { data: dono } = await admin
    .from("profiles")
    .select("email")
    .eq("id", chamado.user_id)
    .maybeSingle();
  const para = (dono?.email as string) ?? "";

  let avisado = false;
  let motivo: string | null = null;

  if (para) {
    const base = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
    const env = await enviarEmail({
      para,
      assunto: `Resposta: ${chamado.assunto}`,
      html: htmlRespostaChamado({
        assunto: chamado.assunto,
        resposta,
        link: `${base}/painel/chamados`,
      }),
      responderPara: user.email ? { email: user.email, nome: "Enquadria" } : undefined,
    });
    avisado = env.enviado;
    motivo = env.enviado ? null : (env.motivo ?? "falha desconhecida");

    // `notificado_em` só é preenchido quando o e-mail SAIU. Marcar antes faria
    // "respondi e ele não viu" desaparecer do painel — que é justamente o caso
    // em que alguém precisa agir.
    if (env.enviado && msg?.id) {
      await admin
        .from("chamado_mensagens")
        .update({ notificado_em: new Date().toISOString() })
        .eq("id", msg.id);
    }
  } else {
    motivo = "usuário sem e-mail cadastrado";
  }

  return NextResponse.json({ ok: true, avisado, motivo });
}
