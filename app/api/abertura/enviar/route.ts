import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { enviarEmail } from "@/lib/email";
import { htmlAberturaCliente } from "@/lib/emails-cliente";
import { emailValido } from "@/lib/csv";
import { COLUNAS_ESCRITORIO, type Escritorio } from "@/lib/escritorio";
import type { EstudoAbertura } from "@/lib/abertura";

/**
 * MANDA O ESTUDO A QUEM PEDIU.
 *
 * O destinatário aqui não é cliente do escritório — é um prospecto. Duas
 * consequências práticas:
 *
 *  · O `responderPara` é o e-mail do contador, sempre. Uma resposta a este
 *    e-mail é uma oportunidade comercial, e ela não pode cair numa caixa que
 *    ninguém lê.
 *
 *  · O e-mail digitado na tela MANDA. Não existe cadastro de onde tirar o
 *    endereço, e adivinhar seria pior que perguntar.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });

  let corpo: { abertura_id?: string; para?: string; nome?: string };
  try {
    corpo = await req.json();
  } catch {
    corpo = {};
  }

  const id = (corpo.abertura_id ?? "").trim();
  if (!id) return NextResponse.json({ erro: "informe o estudo" }, { status: 400 });

  // a RLS de `aberturas` decide se este estudo é deste escritório
  const { data: doc } = await supabase
    .from("aberturas")
    .select("id, numero, token, nome_negocio, responsavel, email, resultado")
    .eq("id", id)
    .maybeSingle();
  if (!doc) return NextResponse.json({ erro: "estudo não encontrado" }, { status: 404 });

  const para = emailValido(corpo.para ?? (doc.email as string | null) ?? "");
  if (!para) {
    return NextResponse.json(
      { erro: "informe o e-mail de quem vai receber o estudo" },
      { status: 400 }
    );
  }

  const { data: perfil } = await supabase
    .from("profiles")
    .select(`tenants(${COLUNAS_ESCRITORIO})`)
    .eq("id", user.id)
    .maybeSingle();
  const t = (perfil?.tenants as Escritorio | null) ?? null;
  const escritorio = {
    nome: t?.nome || "Seu contador",
    crc: t?.crc ?? undefined,
    logo_url: t?.logo_url ?? undefined,
  };

  const estudo = doc.resultado as unknown as EstudoAbertura | null;
  const base = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;

  const envio = await enviarEmail({
    para,
    nome: corpo.nome || (doc.responsavel as string | null) || undefined,
    assunto: `${doc.nome_negocio as string} — estudo de abertura nº ${String(doc.numero as number).padStart(4, "0")}`,
    html: htmlAberturaCliente({
      negocio: doc.nome_negocio as string,
      escritorio,
      link: `${base}/abertura/${doc.token as string}`,
      numero: doc.numero as number,
      regime: estudo?.recomendado?.nome ?? null,
    }),
    tag: "abertura-cliente",
    // resposta de prospecto vai direto para quem pode fechar o negócio
    responderPara: user.email ? { email: user.email, nome: escritorio.nome } : undefined,
  });

  if (!envio.enviado) {
    return NextResponse.json(
      { erro: `Não consegui enviar: ${envio.motivo ?? "recusado pelo servidor de e-mail"}` },
      { status: 502 }
    );
  }

  // guarda o endereço usado: o próximo envio já vem preenchido
  if (para !== doc.email) await supabase.from("aberturas").update({ email: para }).eq("id", id);

  return NextResponse.json({ ok: true, para });
}
