import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import {
  gerarOtp,
  hashOtp,
  otpConfere,
  montarEvidencia,
  OTP_VALIDADE_MIN,
  OTP_MAX_TENTATIVAS,
  type MetodoAssinatura,
} from "@/lib/esign";
import { carimbar } from "@/lib/carimbo";
import { enviarEmail, htmlCodigoOtp } from "@/lib/brevo";

/**
 * Página pública de assinatura — sem sessão, opera pelo service role (como o
 * webhook). Duas ações:
 *   solicitar-otp → gera e envia o código por e-mail (assinatura AVANÇADA).
 *                   Sem Brevo configurado, o front cai para a SIMPLES.
 *   confirmar     → valida o código (se houver), captura ip/user-agent, carimba
 *                   o tempo, congela a evidência e marca o termo assinado.
 */
export async function POST(req: Request) {
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json(
      { erro: "assinatura indisponível: SUPABASE_SERVICE_ROLE_KEY não configurada" },
      { status: 503 }
    );
  }

  let corpo: {
    token: string;
    acao: "solicitar-otp" | "confirmar";
    nome?: string;
    cpf?: string;
    email?: string;
    codigo?: string;
  };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }
  if (!corpo.token || !corpo.acao) {
    return NextResponse.json({ erro: "token e ação obrigatórios" }, { status: 400 });
  }

  const { data: termo } = await supabase
    .from("termos")
    .select("id, assinatura_status, analise_id, hash_documento, otp_hash, otp_expira, otp_tentativas")
    .eq("token", corpo.token)
    .maybeSingle();

  if (!termo) return NextResponse.json({ erro: "termo não encontrado" }, { status: 404 });
  if (termo.assinatura_status === "assinado") {
    return NextResponse.json({ erro: "este termo já foi assinado" }, { status: 409 });
  }

  const agora = new Date().toISOString();

  /* ---------------------------------------------------- solicitar-otp ---- */
  if (corpo.acao === "solicitar-otp") {
    if (!corpo.nome || !corpo.email) {
      return NextResponse.json({ erro: "nome e e-mail obrigatórios" }, { status: 400 });
    }

    // nome da empresa para o e-mail (best-effort)
    const { data: analise } = await supabase
      .from("analises")
      .select("empresa_id")
      .eq("id", termo.analise_id)
      .maybeSingle();
    const { data: empresa } = analise
      ? await supabase.from("empresas").select("razao_social").eq("id", analise.empresa_id).maybeSingle()
      : { data: null };

    const codigo = gerarOtp();
    const envio = await enviarEmail({
      para: corpo.email,
      nome: corpo.nome,
      assunto: "Seu código para assinar o termo de ciência",
      html: htmlCodigoOtp(codigo, empresa?.razao_social),
    });

    if (!envio.enviado) {
      // sem e-mail, não dá para exigir OTP — segue no método simples
      await supabase.from("termos").update({ otp_hash: null, otp_expira: null, otp_tentativas: 0 }).eq("id", termo.id);
      return NextResponse.json({ ok: true, otp_enviado: false, metodo: "simples" as MetodoAssinatura });
    }

    const expira = new Date(Date.now() + OTP_VALIDADE_MIN * 60_000).toISOString();
    await supabase
      .from("termos")
      .update({ otp_hash: hashOtp(codigo, corpo.token), otp_expira: expira, otp_tentativas: 0 })
      .eq("id", termo.id);

    return NextResponse.json({ ok: true, otp_enviado: true, metodo: "avancada" as MetodoAssinatura });
  }

  /* -------------------------------------------------------- confirmar ---- */
  if (corpo.acao === "confirmar") {
    if (!corpo.nome || !corpo.email) {
      return NextResponse.json({ erro: "nome e e-mail obrigatórios" }, { status: 400 });
    }

    let metodo: MetodoAssinatura = "simples";
    let otpVerificado = false;

    if (termo.otp_hash) {
      // OTP foi emitido → é obrigatório e precisa conferir
      if (!corpo.codigo) return NextResponse.json({ erro: "código obrigatório" }, { status: 400 });
      if (termo.otp_expira && new Date(termo.otp_expira).getTime() < Date.now()) {
        return NextResponse.json({ erro: "código expirado — solicite um novo" }, { status: 400 });
      }
      if ((termo.otp_tentativas ?? 0) >= OTP_MAX_TENTATIVAS) {
        return NextResponse.json({ erro: "muitas tentativas — solicite um novo código" }, { status: 429 });
      }
      if (!otpConfere(corpo.codigo, corpo.token, termo.otp_hash)) {
        await supabase
          .from("termos")
          .update({ otp_tentativas: (termo.otp_tentativas ?? 0) + 1 })
          .eq("id", termo.id);
        return NextResponse.json({ erro: "código incorreto" }, { status: 400 });
      }
      metodo = "avancada";
      otpVerificado = true;
    }

    const evidencia = montarEvidencia({
      headers: req.headers,
      metodo,
      otp_verificado: otpVerificado,
      hash_documento: termo.hash_documento ?? "",
      agora,
    });
    const carimbo = await carimbar(termo.hash_documento ?? "", agora);

    const { error: upErr } = await supabase
      .from("termos")
      .update({
        assinatura_status: "assinado",
        assinado_em: agora,
        assinante_nome: corpo.nome,
        assinante_cpf: corpo.cpf ?? null,
        assinante_email: corpo.email,
        metodo,
        evidencia,
        carimbo,
        otp_hash: null,
        otp_expira: null,
      })
      .eq("id", termo.id);
    if (upErr) return NextResponse.json({ erro: upErr.message }, { status: 500 });

    await supabase.from("analises").update({ status: "decidida" }).eq("id", termo.analise_id);

    return NextResponse.json({ ok: true, metodo, assinado_em: agora });
  }

  return NextResponse.json({ erro: "ação inválida" }, { status: 400 });
}
