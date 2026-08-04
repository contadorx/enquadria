import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { enviarEmail } from "@/lib/email";
import { htmlConviteIndicacao } from "@/lib/emails-cliente";
import { limparIndicados } from "@/lib/nps";
import { comoChamar } from "@/lib/escritorio";

/**
 * MANDA OS CONVITES das indicações — uma vez cada.
 *
 * O convite sai do Enquadria, não do escritório de quem indicou: ele escreveu
 * o nome de um colega, não autorizou a própria marca a virar remetente.
 *
 * UM CONVITE POR E-MAIL, PARA SEMPRE. Se dois contadores indicarem a mesma
 * pessoa, ela recebe uma vez. Indicação que vira enxurrada queima o canal
 * inteiro — e o canal é o mais barato que este produto tem.
 */

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });

  let corpo: { indicados?: { nome: string; email: string }[]; nps_id?: string | null };
  try {
    corpo = await req.json();
  } catch {
    corpo = {};
  }

  const limpos = limparIndicados(corpo.indicados ?? [], user.email ?? undefined);
  if (limpos.length === 0) {
    return NextResponse.json({ erro: "Nenhum e-mail válido na lista." }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ erro: "sem chave de serviço" }, { status: 503 });

  const { data: perfil } = await supabase
    .from("profiles")
    .select("tenant_id, nome, tenants(nome)")
    .eq("id", user.id)
    .maybeSingle();
  const t = perfil?.tenants as { nome?: string } | null;
  /**
   * QUEM INDICOU — a pessoa, depois o escritório, nunca o e-mail.
   *
   * Duas correções vivem nesta linha. A primeira: o e-mail de quem indica
   * estava vazando para dentro da mensagem ("fulano@gmail.com indicou você"),
   * o que expõe o endereço sem ele ter combinado isso e faz a mensagem
   * parecer disparo automático.
   *
   * A segunda: a correção anterior mandava o nome do ESCRITÓRIO nos dois
   * campos do template, e o convite saía "Contabilidade X, do Contabilidade X,
   * indicou você". Agora `quem` é a pessoa e `casa` é o escritório — e quando
   * só existe um dos dois, o template não inventa o outro.
   */
  const { quem: quemIndicou, casa } = comoChamar({
    nome: t?.nome ?? null,
    responsavel: (perfil?.nome as string | null) ?? null,
  });
  const escritorio = t?.nome?.trim() || quemIndicou;

  const base = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;

  // quem JÁ foi convidado alguma vez não recebe de novo, venha de quem vier
  const { data: jaConvidados } = await admin
    .from("indicacoes")
    .select("email")
    .in("email", limpos.map((i) => i.email));
  const jaTem = new Set((jaConvidados ?? []).map((r) => (r.email as string).toLowerCase()));

  let enviados = 0;
  let repetidos = 0;
  const falhas: string[] = [];

  for (const ind of limpos) {
    if (jaTem.has(ind.email)) {
      repetidos++;
      continue;
    }

    const { data: linha } = await admin
      .from("indicacoes")
      .insert({
        user_id: user.id,
        tenant_id: (perfil?.tenant_id as string) ?? null,
        nps_id: corpo.nps_id ?? null,
        nome: ind.nome,
        email: ind.email,
        status: "convidado",
      })
      .select("id")
      .maybeSingle();

    const r = await enviarEmail({
      para: ind.email,
      nome: ind.nome,
      assunto: `${escritorio} indicou o Enquadria para você`,
      html: htmlConviteIndicacao({
        indicado: ind.nome,
        quemIndicou,
        escritorio: casa,
        link: `${base}/?ref=indicacao`,
      }),
    });

    if (r.enviado) enviados++;
    else {
      falhas.push(ind.email);
      // convite que não saiu não pode ficar registrado como convidado: a
      // pessoa nunca soube, e a trava impediria a segunda tentativa
      if (linha?.id) await admin.from("indicacoes").delete().eq("id", linha.id);
    }
  }

  return NextResponse.json({ ok: true, enviados, repetidos, falhas });
}
