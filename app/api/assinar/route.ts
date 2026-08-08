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
import { conteudoCanonico, sha256, CLAUSULAS_CIENCIA, mascararEmail } from "@/lib/esign";
import {
  ehTipoDecisao, validarDecisao, resolverDecisao, decisaoDoSnapshot,
} from "@/lib/termo";
import { carimbar } from "@/lib/carimbo";
import { enviarEmail, htmlCodigoOtp } from "@/lib/email";
import { htmlTermoAssinadoCliente, htmlTermoAssinadoContador } from "@/lib/emails-cliente";
import { donoDoTenant } from "@/lib/dono";

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
    /**
     * A DECISÃO, escolhida por quem assina — mudança de 05/08/2026.
     *
     * Antes o contador escolhia na emissão e o termo chegava dizendo "a empresa
     * decide optar". A empresa assinava embaixo de uma decisão que nunca
     * declarou. Agora ela chega em branco e é preenchida aqui, o que é a única
     * forma de o papel provar de quem foi a decisão.
     */
    tipo_decisao?: string;
    motivo_divergencia?: string;
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
    .select(
      "id, token, decisao, assinatura_status, analise_id, hash_documento, snapshot, recomendacao, otp_hash, otp_expira, otp_tentativas, assinante_email"
    )
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

    /**
     * O CÓDIGO VAI PARA O E-MAIL DA EMISSÃO, NÃO PARA O DIGITADO — 08/08/2026.
     *
     * O termo é impresso dizendo "assinatura eletrônica AVANÇADA (com código
     * por e-mail)", sob a Lei 14.063/2020, e o documento lista "a identificação
     * do signatário" como um dos ingredientes. Só que o código era enviado para
     * `corpo.email` — o endereço que a própria pessoa acabou de digitar no
     * formulário — e nunca confrontado com `assinante_email`, que o contador
     * gravou na emissão. Quem tivesse o link digitava o e-mail que quisesse,
     * recebia o próprio código e assinava: a trilha provava apenas que o
     * signatário controla um endereço escolhido por ele mesmo.
     *
     * Quando existe endereço na emissão, é ele que recebe. Divergência não é
     * recusada em silêncio nem tratada como fraude — pode ser o sócio pedindo
     * para a contabilidade, e recusar aqui trava a assinatura de um cliente
     * legítimo. O código só não segue para um endereço que ninguém cadastrou.
     */
    const emailDaEmissao = (termo.assinante_email as string | null)?.trim() || null;
    const destino = emailDaEmissao ?? corpo.email;
    const desviado = !!emailDaEmissao && emailDaEmissao.toLowerCase() !== corpo.email.toLowerCase();

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
      para: destino,
      nome: corpo.nome,
      assunto: "Seu código para assinar o termo de ciência",
      html: htmlCodigoOtp(codigo, empresa?.razao_social),
    });

    if (!envio.enviado) {
      /* Sem e-mail não dá para exigir OTP, e a assinatura segue no método
         simples — mas isso REBAIXA o nível de prova do documento, e a tela
         precisa dizer. Cair para "simples" em silêncio é o produto entregando
         menos do que o termo impresso afirma, sem ninguém saber. */
      await supabase.from("termos").update({ otp_hash: null, otp_expira: null, otp_tentativas: 0 }).eq("id", termo.id);
      return NextResponse.json({
        ok: true,
        otp_enviado: false,
        metodo: "simples" as MetodoAssinatura,
        aviso:
          "Não foi possível enviar o código por e-mail. A assinatura segue sem código — e o termo vai registrar isso.",
      });
    }

    const expira = new Date(Date.now() + OTP_VALIDADE_MIN * 60_000).toISOString();
    await supabase
      .from("termos")
      .update({ otp_hash: hashOtp(codigo, corpo.token), otp_expira: expira, otp_tentativas: 0 })
      .eq("id", termo.id);

    return NextResponse.json({
      ok: true,
      otp_enviado: true,
      metodo: "avancada" as MetodoAssinatura,
      /* a tela precisa dizer PARA ONDE o código foi, senão a pessoa fica
         esperando numa caixa de entrada que não vai receber nada — e o endereço
         mascarado não expõe o contato de ninguém */
      enviado_para: mascararEmail(destino),
      desviado,
      ...(desviado
        ? {
            aviso:
              "O código foi enviado para o e-mail cadastrado pelo seu contador, não para o que você digitou.",
          }
        : {}),
    });
  }

  /* -------------------------------------------------------- confirmar ---- */
  if (corpo.acao === "confirmar") {
    if (!corpo.nome || !corpo.email) {
      return NextResponse.json({ erro: "nome e e-mail obrigatórios" }, { status: 400 });
    }

    /**
     * ═══════════════════════════════════════════════════════════════════════
     * A DECISÃO NASCE AQUI, e com ela o hash do documento.
     * ═══════════════════════════════════════════════════════════════════════
     *
     * O hash saiu da emissão porque um hash feito antes de a decisão existir
     * não cobre a decisão — e é ela que o termo prova. Na emissão fica selada a
     * PROPOSTA (recomendação + cláusulas, em `snapshot.hash_proposta`); aqui
     * sela-se o documento inteiro, com o que a empresa declarou.
     *
     * A recomendação vem do SNAPSHOT, nunca recalculada: o signatário decide
     * sobre a recomendação que leu, não sobre a que o motor daria hoje.
     */
    const parte = decisaoDoSnapshot(termo.snapshot);
    const recomendada = (parte.recomendacao?.decisao ??
      (termo.recomendacao === "optar" ? "optar" : "permanecer")) as "optar" | "permanecer";

    if (!ehTipoDecisao(corpo.tipo_decisao)) {
      return NextResponse.json(
        { erro: "escolha o que a empresa decidiu antes de assinar" },
        { status: 400 }
      );
    }
    const motivo = (corpo.motivo_divergencia ?? "").trim() || null;
    const decisaoFinal = resolverDecisao(corpo.tipo_decisao, {
      decisao: recomendada, saida: "S1", titulo: "", baseado_em: [],
    });
    const valida = validarDecisao({ tipo: corpo.tipo_decisao, decisao: decisaoFinal, motivo });
    if (!valida.ok) return NextResponse.json({ erro: valida.erro }, { status: 400 });

    /* o conteúdo assinado usa as cláusulas CONGELADAS na emissão — não as de
       hoje. Ver `decisaoDoSnapshot`: exibir uma lista e hashear outra foi um
       defeito real desta mesma semana. */
    const hashDocumento = sha256(
      conteudoCanonico({
        empresa: parte_empresa(termo.snapshot),
        cnpj: parte_cnpj(termo.snapshot),
        decisao: decisaoFinal,
        /* a MESMA lista que a página mostrou: congelada quando existe, a viva
           só nos termos anteriores ao snapshot — que é exatamente o que
           `/assinar` renderiza. Hashear uma lista diferente da exibida foi um
           defeito real desta semana. */
        clausulas: parte.clausulas ?? CLAUSULAS_CIENCIA,
        recomendacao: recomendada,
        tipo_decisao: corpo.tipo_decisao,
        motivo,
      })
    );

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
      hash_documento: hashDocumento,
      agora,
    });
    const carimbo = await carimbar(hashDocumento, agora);

    /**
     * A DECISÃO ENTRA NO SNAPSHOT, NÃO SÓ NAS COLUNAS — conserto de 08/08/2026.
     *
     * O `update` gravava `tipo_decisao` e `motivo_divergencia` nas colunas e
     * incluía os dois no `hash_documento`. Só que as três folhas do termo (a
     * via do contador, a do cliente e a tela de assinar) leem `decisaoDoSnapshot`
     * — e o snapshot é montado na EMISSÃO, quando ainda não há decisão. Depois
     * de assinado, `tipo_decisao` chegava sempre nulo em `FolhaTermo`, e com
     * ele sumiam as três coisas que o documento existe para registrar: o rótulo
     * "Decidir diferente da recomendação", a frase de `fraseDaDecisao` e a caixa
     * com o MOTIVO ESCRITO PELO EMPRESÁRIO.
     *
     * O efeito era o pior possível: o texto estava no hash e não estava no
     * papel. O hash cobria uma frase que nenhuma das partes conseguia imprimir,
     * e o termo de quem divergiu voltava a ser idêntico ao de quem concordou —
     * exatamente o documento que a reestruturação de 05/08 existia para
     * eliminar.
     *
     * Gravar aqui, e não passar as colunas para a folha, é de propósito: o
     * snapshot é a fonte única do que foi assinado, e é ele que o hash cobre.
     * Duas fontes para o mesmo fato é como este defeito nasceu.
     */
    const snapshotAssinado = {
      ...((termo.snapshot ?? {}) as Record<string, unknown>),
      tipo_decisao: corpo.tipo_decisao,
      motivo_divergencia: motivo,
    };

    const { error: upErr } = await supabase
      .from("termos")
      .update({
        assinatura_status: "assinado",
        assinado_em: agora,
        /* o que a EMPRESA declarou, e o selo do documento que ela assinou */
        decisao: decisaoFinal,
        tipo_decisao: corpo.tipo_decisao,
        motivo_divergencia: motivo,
        snapshot: snapshotAssinado,
        hash_documento: hashDocumento,
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

    /**
     * OS DOIS AVISOS DO FECHO DA ESTEIRA.
     *
     * O termo assinado é o fim do serviço e a prova de que ele foi entregue — e
     * acontecia em silêncio absoluto: nem quem assinou recebia comprovante, nem
     * o contador ficava sabendo. Quem clica "assinar" e não recebe nada liga
     * para o contador perguntando se deu certo, e é o contador que atende.
     *
     * NENHUM DOS DOIS PODE DERRUBAR A ASSINATURA. Ela já está gravada, com
     * carimbo de tempo e evidência. Falhar o e-mail depois disso não desfaz
     * nada, e mostrar erro ao signatário faria com que ele assinasse de novo.
     */
    try {
      /**
       * O TENANT VEM DA ANÁLISE, não do termo.
       *
       * `termos` NÃO tem coluna `tenant_id` — a migration 0020 conta termos por
       * escritório fazendo join com `analises` justamente por isso. Pedir
       * `termo.tenant_id` no select principal não daria erro de compilação:
       * daria erro do Postgres no meio da rota de ASSINATURA, derrubando o
       * fecho da esteira inteiro para acrescentar um aviso.
       */
      const { data: analiseA } = await supabase
        .from("analises")
        .select("empresa_id, tenant_id")
        .eq("id", termo.analise_id)
        .maybeSingle();
      const { data: empresaA } = analiseA
        ? await supabase
            .from("empresas")
            .select("razao_social")
            .eq("id", analiseA.empresa_id)
            .maybeSingle()
        : { data: null };

      const dono = await donoDoTenant(supabase, analiseA?.tenant_id ?? null);
      const nomeEmpresa = (empresaA as { razao_social?: string } | null)?.razao_social ?? "a empresa";
      const escritorio = dono?.escritorio ?? "Seu contador";
      const decisao = decisaoFinal;
      const base = new URL(req.url).origin;
      /**
       * O BOTÃO DO E-MAIL DIZ "guardar uma cópia do termo" — então ele precisa
       * abrir o termo, não a página de assinatura. Apontando para /assinar, o
       * cliente caía num aviso de "já assinado" com o hash e nada para guardar.
       */
      const linkTermo = termo.token ? `${base}/termo/${termo.token}` : base;

      // comprovante a quem assinou — o e-mail é o que ele acabou de digitar
      if (corpo.email) {
        const r = await enviarEmail({
          para: corpo.email,
          nome: corpo.nome,
          assunto: `${nomeEmpresa} — termo de ciência assinado`,
          html: htmlTermoAssinadoCliente({
            empresa: nomeEmpresa,
            escritorio,
            link: linkTermo,
            decisao,
          }),
          tag: "termo-assinado-cliente",
          responderPara: dono ? { email: dono.email, nome: dono.escritorio } : undefined,
        });
        if (!r.enviado) console.error(`[assinar] comprovante não saiu: ${r.motivo}`);
      }

      // e o aviso ao contador, que é quem cobra pelo serviço que acabou de fechar
      if (dono) {
        const r = await enviarEmail({
          para: dono.email,
          assunto: `${nomeEmpresa} assinou o termo de ciência`,
          html: htmlTermoAssinadoContador({
            empresa: nomeEmpresa,
            escritorio,
            link: analiseA ? `${base}/painel/empresa/${analiseA.empresa_id}` : base,
            assinante: corpo.nome ?? "O responsável",
            decisao,
          }),
          tag: "termo-assinado-contador",
        });
        if (!r.enviado) console.error(`[assinar] aviso ao contador não saiu: ${r.motivo}`);
      }
    } catch (e) {
      console.error("[assinar] falha ao avisar do termo assinado:", e instanceof Error ? e.message : e);
    }

    return NextResponse.json({
      ok: true, metodo, assinado_em: agora,
      decisao: decisaoFinal, tipo_decisao: corpo.tipo_decisao,
      hash_documento: hashDocumento,
    });
  }

  return NextResponse.json({ erro: "ação inválida" }, { status: 400 });
}

/**
 * A empresa e o CNPJ vêm do SNAPSHOT porque é o que o signatário leu na tela.
 * Buscar ao vivo faria o hash cobrir uma razão social que talvez tenha mudado
 * entre a emissão e a assinatura — e aí o documento impresso não fecharia com
 * o próprio selo.
 */
function parte_empresa(snapshot: unknown): string {
  const s = (snapshot ?? {}) as { empresa?: { razao_social?: string } };
  return s.empresa?.razao_social ?? "empresa";
}
function parte_cnpj(snapshot: unknown): string {
  const s = (snapshot ?? {}) as { empresa?: { cnpj?: string } };
  return s.empresa?.cnpj ?? "";
}
