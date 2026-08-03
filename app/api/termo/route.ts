import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { conteudoCanonico, sha256, novoToken, CLAUSULAS_CIENCIA } from "@/lib/esign";
import { enviarEmail, htmlConviteAssinatura } from "@/lib/email";

/**
 * Registra o termo de ciência e prepara a ASSINATURA PRÓPRIA (sem ZapSign):
 * gera um token público, congela o hash do conteúdo canônico e devolve o link
 * de assinatura /assinar/{token}.
 *
 * ESTA ROTA PASSOU A ENVIAR O CONVITE. Antes não enviava, e `/api/termo/lote`
 * enviava — o MESMO artefato chegava ou não ao cliente dependendo de qual botão
 * o contador tivesse usado (a gaveta não mandava; o cockpit mandava). O Cockpit
 * chegou a contornar isso chamando a rota de lote com um id só. Duas rotas para
 * o mesmo ato produzem duas regras, e a diferença aparece meses depois como
 * "o termo daquele cliente nunca chegou".
 *
 * E GRAVA O CONTATO CORRIGIDO NA EMPRESA. O contador digita nome e e-mail aqui
 * na hora de gerar o termo, frequentemente corrigindo o que veio do CSV. Essa
 * correção ia só para `termos.assinante_email` e nunca voltava para
 * `empresas.contato_email` — de modo que o próximo envio em lote usava o
 * endereço velho, ou contava a empresa como "sem contato". O contador corrigia
 * de novo, e de novo.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });

  let corpo: {
    analise_id: string;
    decisao: "optar" | "permanecer";
    nome: string;
    email: string;
    empresa?: string;
    /** default true — só o teste e a reemissão silenciosa passam false */
    enviar_email?: boolean;
  };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }
  if (!corpo.analise_id || !corpo.nome || !corpo.email) {
    return NextResponse.json({ erro: "analise_id, nome e email obrigatórios" }, { status: 400 });
  }

  // empresa da análise — alimenta o conteúdo canônico que será "assinado"
  const { data: analise } = await supabase
    .from("analises")
    .select("empresa_id, saida, re, fc, janela_id")
    .eq("id", corpo.analise_id)
    .maybeSingle();
  const { data: empresa } = analise
    ? await supabase.from("empresas").select("razao_social, cnpj").eq("id", analise.empresa_id).maybeSingle()
    : { data: null };

  const { data: perfilT } = await supabase
    .from("profiles")
    .select("tenants(nome, crc, logo_url)")
    .eq("id", user.id)
    .maybeSingle();
  const tt = perfilT?.tenants as { nome?: string; crc?: string; logo_url?: string } | null;
  const { data: janela } = analise?.janela_id
    ? await supabase.from("janelas").select("nome").eq("id", analise.janela_id).maybeSingle()
    : { data: null };

  const hash = sha256(
    conteudoCanonico({
      empresa: empresa?.razao_social ?? corpo.empresa ?? "empresa",
      cnpj: empresa?.cnpj ?? "",
      decisao: corpo.decisao,
      clausulas: CLAUSULAS_CIENCIA,
    })
  );
  const token = novoToken();

  // cria a linha base pela RPC existente (tenant/numeração), sem assinatura externa
  const { data: termoId, error } = await supabase.rpc("registrar_termo", {
    p_analise: corpo.analise_id,
    p_decisao: corpo.decisao,
    p_nome: corpo.nome,
    p_email: corpo.email,
    p_assinatura_url: null,
    p_assinatura_ref: null,
  });
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  // prepara a assinatura própria: token público, hash congelado, status pendente
  const { error: upErr } = await supabase
    .from("termos")
    .update({
      token,
      hash_documento: hash,
      assinatura_status: "pendente",
      assinante_email: corpo.email,
      // congela a apresentação: o documento não muda se a análise for revisada
      snapshot: {
        congelado_em: new Date().toISOString(),
        decisao: corpo.decisao,
        clausulas: CLAUSULAS_CIENCIA,
        empresa: {
          razao_social: empresa?.razao_social ?? corpo.empresa ?? "empresa",
          cnpj: empresa?.cnpj ?? "",
        },
        escritorio: { nome: tt?.nome, crc: tt?.crc, logo_url: tt?.logo_url },
        analise: { saida: analise?.saida, re: analise?.re, fc: analise?.fc },
        janela: janela?.nome ?? null,
      },
    })
    .eq("id", termoId);
  if (upErr) return NextResponse.json({ erro: upErr.message }, { status: 500 });

  /**
   * O CONTATO CORRIGIDO VOLTA PARA A EMPRESA — e só quando mudou de verdade.
   * Um update por termo gerado sujaria o histórico da linha sem motivo.
   */
  const { data: contatoAtual } = analise
    ? await supabase
        .from("empresas")
        .select("contato_nome, contato_email")
        .eq("id", analise.empresa_id)
        .maybeSingle()
    : { data: null };

  const patch: { contato_nome?: string; contato_email?: string } = {};
  if (corpo.nome && corpo.nome !== contatoAtual?.contato_nome) patch.contato_nome = corpo.nome;
  if (corpo.email && corpo.email !== contatoAtual?.contato_email) patch.contato_email = corpo.email;
  if (analise && Object.keys(patch).length) {
    await supabase.from("empresas").update(patch).eq("id", analise.empresa_id);
  }

  // ── o convite, pela mesma regra da rota de lote
  const base = new URL(req.url).origin;
  const escritorio = tt?.nome || "Seu contador";
  let enviado = false;
  let motivoEnvio: string | null = null;

  if (corpo.enviar_email !== false) {
    const envio = await enviarEmail({
      para: corpo.email,
      nome: corpo.nome,
      assunto: `${empresa?.razao_social ?? corpo.empresa ?? "Sua empresa"} — decisão de IBS/CBS até 30 de setembro`,
      html: htmlConviteAssinatura({
        empresa: empresa?.razao_social ?? corpo.empresa ?? "sua empresa",
        escritorio,
        link: `${base}/assinar/${token}`,
        decisao: corpo.decisao,
      }),
      tag: "termo-convite",
      responderPara: user.email ? { email: user.email, nome: tt?.nome } : undefined,
    });
    enviado = envio.enviado;
    motivoEnvio = envio.enviado ? null : envio.motivo ?? "envio recusado";

    const admin = createAdminClient();
    if (admin && analise) {
      const { data: perfilT2 } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("id", user.id)
        .maybeSingle();
      await admin.from("envios_cliente").insert({
        tenant_id: perfilT2?.tenant_id ?? null,
        empresa_id: analise.empresa_id,
        tipo: "termo",
        documento_id: termoId,
        para: corpo.email,
        nome: corpo.nome,
        assunto: "convite de assinatura do termo",
        status: enviado ? "enviado" : "erro",
        erro: enviado ? null : (motivoEnvio ?? "").slice(0, 300),
        caminho: envio.caminho,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    termo_id: termoId,
    token,
    link_assinatura: `/assinar/${token}`,
    // o link continua vindo mesmo com o e-mail enviado: sem chave configurada,
    // ou com o e-mail recusado, copiar o link é o caminho que sobra
    enviado,
    motivo_envio: motivoEnvio,
  });
}
