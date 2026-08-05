import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { COLUNAS_ESCRITORIO, type Escritorio } from "@/lib/escritorio";
import { responsavelDoTenant } from "@/lib/escritorio-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { conteudoCanonico, sha256, novoToken, CLAUSULAS_CIENCIA } from "@/lib/esign";
import { enviarEmail, htmlConviteAssinatura } from "@/lib/email";
import { blocoDoTermo, ehTipoDecisao, validarDecisao } from "@/lib/termo";
import { garantirAnaliseCoerente } from "@/lib/recalculo-server";
import type { AnaliseGravada } from "@/lib/laudo";

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
    /**
     * LEGADO. A decisão passou a ser DERIVADA do tipo (`seguir` segue a
     * recomendação, `divergir` inverte, `adiar` fica no tradicional). Receber
     * o resultado pronto era o que permitia gravar "permanecer" num caso em
     * que a análise recomendava optar, sem nada no papel registrando que houve
     * divergência. Só é usado quando `tipo_decisao` não vem.
     */
    decisao?: "optar" | "permanecer";
    tipo_decisao?: string;
    motivo_divergencia?: string;
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

  /**
   * A ANÁLISE INTEIRA, não só a saída.
   *
   * Antes vinham cinco colunas, porque o termo só imprimia "Decisão: X". Agora
   * ele imprime a RECOMENDAÇÃO e os PONTOS A OBSERVAR, e os dois saem dos
   * números congelados na análise — `respostas` e `parametros` inclusive. Sem
   * eles a recomendação sairia sem o "baseado em", que é a parte que sustenta o
   * documento.
   */
  /* mesma conferência do laudo, e ANTES da leitura: o termo congela a
     recomendação, e congelar a de um motor aposentado é o defeito que a
     Transportadora Rota Certa expôs em 05/08 */
  const recalculada = await garantirAnaliseCoerente(supabase, corpo.analise_id);

  const { data: analise } = await supabase
    .from("analises")
    .select(
      "id, empresa_id, saida, rq, ch, cl, re, fc, prioridade, respostas, calculado_em, parametros, janela_id"
    )
    .eq("id", corpo.analise_id)
    .maybeSingle();
  if (!analise) return NextResponse.json({ erro: "análise não encontrada" }, { status: 404 });
  const { data: empresa } = analise
    ? await supabase.from("empresas").select("razao_social, cnpj").eq("id", analise.empresa_id).maybeSingle()
    : { data: null };

  const { data: perfilT } = await supabase
    .from("profiles")
    .select(`nome, tenants(${COLUNAS_ESCRITORIO})`)
    .eq("id", user.id)
    .maybeSingle();
  const tt = perfilT?.tenants as Escritorio | null;
  /* o termo é congelado na emissão — inclusive quem assina por ele */
  const responsavel = await responsavelDoTenant(supabase);
  const { data: janela } = analise?.janela_id
    ? await supabase.from("janelas").select("nome").eq("id", analise.janela_id).maybeSingle()
    : { data: null };

  /**
   * ═════════════════════════════════════════════════════════════════════════
   * O BLOCO CONGELADO — recomendação, pontos, tipo e o que a decisão resolve.
   * ═════════════════════════════════════════════════════════════════════════
   *
   * `blocoDoTermo()` é a ÚNICA fonte: a rota não decide nada, só passa o tipo
   * que o contador escolheu na tela. A decisão vem DERIVADA — receber
   * "permanecer" pronto era o que permitia gravar o contrário da recomendação
   * sem que o papel registrasse que houve divergência.
   *
   * O `corpo.decisao` legado ainda serve de rede: sem `tipo_decisao`, o tipo é
   * inferido comparando com a recomendação. Quem manda a decisão contrária sem
   * dizer o motivo cai na validação abaixo, e é assim que deve ser.
   */
  const bruta = analise as unknown as AnaliseGravada;
  const tipoPedido = ehTipoDecisao(corpo.tipo_decisao) ? corpo.tipo_decisao : null;
  const provisorio = blocoDoTermo(bruta, "seguir");
  const tipo =
    tipoPedido ??
    (corpo.decisao && corpo.decisao !== provisorio.recomendacao.decisao ? "divergir" : "seguir");

  const bloco = blocoDoTermo(bruta, tipo, corpo.motivo_divergencia);
  const valida = validarDecisao({
    tipo: bloco.tipo_decisao,
    decisao: bloco.decisao,
    motivo: bloco.motivo_divergencia,
  });
  if (!valida.ok) return NextResponse.json({ erro: valida.erro }, { status: 400 });

  /* o laudo que embasa — o termo cita o número e linka a memória de cálculo */
  // schema-ok: laudos.token é criado pela migration 0028 (alter dinâmico)
  const { data: laudo } = await supabase
    .from("laudos")
    .select("token, numero")
    .eq("analise_id", corpo.analise_id)
    .maybeSingle();

  const hash = sha256(
    conteudoCanonico({
      empresa: empresa?.razao_social ?? corpo.empresa ?? "empresa",
      cnpj: empresa?.cnpj ?? "",
      decisao: bloco.decisao,
      clausulas: CLAUSULAS_CIENCIA,
      recomendacao: bloco.recomendacao.decisao,
      tipo_decisao: bloco.tipo_decisao,
      motivo: bloco.motivo_divergencia,
    })
  );
  const token = novoToken();

  // cria a linha base pela RPC existente (tenant/numeração), sem assinatura externa
  const { data: termoId, error } = await supabase.rpc("registrar_termo", {
    p_analise: corpo.analise_id,
    p_decisao: bloco.decisao,
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
      /* as colunas da 0052 — consultáveis (a fila de divergentes de março sai
         de um índice, não de varredura em JSON) */
      tipo_decisao: bloco.tipo_decisao,
      motivo_divergencia: bloco.motivo_divergencia,
      recomendacao: bloco.recomendacao.decisao,
      recomendacao_saida: bloco.recomendacao.saida,
      // congela a apresentação: o documento não muda se a análise for revisada
      snapshot: {
        congelado_em: new Date().toISOString(),
        decisao: bloco.decisao,
        clausulas: CLAUSULAS_CIENCIA,
        /* o texto inteiro da recomendação e dos pontos, como saiu HOJE. Guardar
           só a saída obrigaria a página a recalcular na hora de imprimir — e aí
           o termo de agosto mudaria de conteúdo quando o motor mudasse. */
        recomendacao: bloco.recomendacao,
        pontos: bloco.pontos,
        tipo_decisao: bloco.tipo_decisao,
        motivo_divergencia: bloco.motivo_divergencia,
        laudo: laudo?.token ? { token: laudo.token, numero: laudo.numero } : null,
        empresa: {
          razao_social: empresa?.razao_social ?? corpo.empresa ?? "empresa",
          cnpj: empresa?.cnpj ?? "",
        },
        escritorio: { ...(tt ?? {}), responsavel },
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
        /* o convite anuncia o que está no papel, não o que foi pedido */
        decisao: bloco.decisao,
      }),
      tag: "termo-convite",
      responderPara: user.email ? { email: user.email, nome: tt?.nome ?? undefined } : undefined,
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
    /* NUNCA silencioso: se a recomendação mudou entre o clique e o papel, quem
       assina o laudo precisa saber antes de mandar o link ao cliente */
    recalculada,
    // o link continua vindo mesmo com o e-mail enviado: sem chave configurada,
    // ou com o e-mail recusado, copiar o link é o caminho que sobra
    enviado,
    motivo_envio: motivoEnvio,
  });
}
