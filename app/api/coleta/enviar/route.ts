import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { enviarEmail } from "@/lib/email";
import { htmlPedidoColeta } from "@/lib/emails-cliente";

/**
 * ENVIAR O PEDIDO DE DADOS AO CLIENTE.
 *
 * POR QUE EXISTE. O link do formulário já podia ser copiado e mandado pelo
 * WhatsApp, e é assim que a maioria vai. Mas parte da carteira não tem WhatsApp
 * do sócio — tem o e-mail do financeiro. Para essas, a única saída era o
 * contador copiar o texto, abrir o próprio e-mail, colar e mandar. Cada passo
 * a mais é uma empresa que fica sem ser perguntada, e a janela fecha em 30/09.
 *
 * O QUE ELA NÃO FAZ: gerar o link. O token nasce em /api/coleta, que é onde
 * mora a cota do plano. Enviar não pode furar esse gate por tabela — então
 * esta rota só entrega um link que JÁ existe.
 *
 * REMETENTE: sai do Enquadria com o cabeçalho do escritório (logo, nome, CRC)
 * e `reply-to` no e-mail do contador — o texto convida a responder, e a
 * resposta precisa chegar em alguém.
 */

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });

  let corpo: { empresa_id?: string; para?: string; nome?: string };
  try {
    corpo = await req.json();
  } catch {
    corpo = {};
  }
  const empresaId = (corpo.empresa_id ?? "").trim();
  if (!empresaId) return NextResponse.json({ erro: "informe empresa_id" }, { status: 400 });

  // a leitura passa pelo cliente do USUÁRIO: é a RLS que decide se esta
  // empresa é da carteira dele. Nada aqui pode escrever para empresa alheia.
  const { data: empresa } = await supabase
    .from("empresas")
    .select("id, razao_social, contato_nome, contato_email")
    .eq("id", empresaId)
    .maybeSingle();
  if (!empresa) return NextResponse.json({ erro: "empresa não encontrada" }, { status: 404 });

  const para = (corpo.para ?? empresa.contato_email ?? "").trim();
  const nome = (corpo.nome ?? empresa.contato_nome ?? "").trim();
  if (!para) {
    return NextResponse.json(
      { erro: "Esta empresa não tem e-mail de contato. Preencha o contato ou informe um endereço." },
      { status: 400 }
    );
  }

  // Correção de destinatário é GRAVADA. Corrigir e não persistir obriga o
  // contador a corrigir de novo no próximo envio — e ele não vai lembrar.
  if (corpo.para && corpo.para.trim() !== (empresa.contato_email ?? "")) {
    await supabase
      .from("empresas")
      .update({ contato_email: para, contato_nome: nome || empresa.contato_nome })
      .eq("id", empresaId);
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { erro: "Envio indisponível: o servidor está sem a chave de serviço." },
      { status: 503 }
    );
  }

  const { data: coleta } = await admin
    .from("coletas")
    .select("token")
    .eq("empresa_id", empresaId)
    .eq("status", "aberta")
    .order("criado_em", { ascending: false })
    .maybeSingle();

  if (!coleta?.token) {
    return NextResponse.json(
      { erro: "Não há formulário aberto para esta empresa. Gere o link antes de enviar." },
      { status: 400 }
    );
  }

  const { data: perfil } = await supabase
    .from("profiles")
    .select("tenants(nome, crc, logo_url)")
    .eq("id", user.id)
    .maybeSingle();
  const t = perfil?.tenants as { nome?: string; crc?: string; logo_url?: string } | null;
  const escritorio = { nome: t?.nome || "Seu contador", crc: t?.crc, logo_url: t?.logo_url };

  const base = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
  const link = `${base}/coleta/${coleta.token}`;

  const r = await enviarEmail({
    para,
    nome: nome || undefined,
    assunto: `${empresa.razao_social}: preciso de alguns dados até 30/09`,
    html: htmlPedidoColeta({
      empresa: empresa.razao_social,
      escritorio,
      link,
    }),
    responderPara: user.email ? { email: user.email, nome: escritorio.nome } : undefined,
  });

  if (!r.enviado) {
    // o motivo real vai no log do servidor; para o contador o que importa é
    // que existe um caminho alternativo que não depende de e-mail nenhum
    return NextResponse.json(
      {
        erro: `Não consegui enviar o e-mail${r.motivo ? ` (${r.motivo})` : ""}. Copie a mensagem e mande pelo WhatsApp.`,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, enviado_para: para });
}
