import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { COLUNAS_ESCRITORIO, type Escritorio } from "@/lib/escritorio";
import { responsavelDoTenant } from "@/lib/escritorio-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { conteudoDaProposta, sha256, novoToken, CLAUSULAS_CIENCIA } from "@/lib/esign";
import { enviarEmail, htmlConviteAssinatura } from "@/lib/email";
import { blocoDoTermo } from "@/lib/termo";
import { garantirAnaliseCoerente } from "@/lib/recalculo-server";
import type { AnaliseGravada } from "@/lib/laudo";
import { erroDeBanco } from "@/lib/erro-banco";

/**
 * TEMPO DE FUNÇÃO — declarado em 08/08/2026.
 *
 * Nenhuma rota de lote declarava `maxDuration`: rodavam no default da
 * plataforma, enquanto os crons — que ninguém espera na frente da tela — já
 * pediam 60 s. Esta rota trabalha por item (RPC, gravação, e às vezes um
 * e-mail que pode levar segundos), e estourar no meio não é uma tela lenta: é
 * documento criado e e-mail já enviado, com "falha de rede" escrito para o
 * contador. Sessenta segundos não resolvem uma carteira de 400 de uma vez —
 * resolvem a maioria dos lotes reais, e o que passa disso agora é interrompido
 * com aviso honesto em vez de silêncio.
 */
export const maxDuration = 60;


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
    nome?: string;
    email?: string;
    empresa?: string;
    /** default true — só o teste e a reemissão silenciosa passam false */
    enviar_email?: boolean;
    /**
     * A fila do cockpit não conhece o e-mail do contato: a `Linha` carrega só
     * `tem_contato`, porque contato não é dado de decisão. Com esta marca, o
     * signatário vem do cadastro da empresa — o mesmo lugar onde o Dossiê o
     * grava. Ver a nota de `signatario` abaixo.
     */
    usar_contato?: boolean;
  };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }
  if (!corpo.analise_id) {
    return NextResponse.json({ erro: "analise_id obrigatório" }, { status: 400 });
  }
  if (!corpo.usar_contato && (!corpo.nome || !corpo.email)) {
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
    ? await supabase
        .from("empresas")
        .select("razao_social, cnpj, contato_nome, contato_email")
        .eq("id", analise.empresa_id)
        .maybeSingle()
    : { data: null };

  /**
   * QUEM ASSINA, quando quem pede é a fila — 08/08/2026.
   *
   * A ação "Enviar termo" da linha do cockpit passou a chamar esta rota (antes
   * chamava a de lote com um id só, e por isso o termo saía sem conferência de
   * coerência e sem registro em `envios_cliente`). A fila, porém, não carrega
   * o e-mail do contato: `Linha` tem `tem_contato`, e só. O signatário vem
   * então do cadastro da empresa, que é o mesmo campo que o Dossiê grava e o
   * mesmo que a rota devolve corrigido mais abaixo.
   *
   * Sem contato não há termo: mandar convite para endereço vazio produziria um
   * documento sem quem assine e um envio que falha em silêncio.
   */
  const signatario = {
    nome: (corpo.usar_contato ? empresa?.contato_nome : corpo.nome) ?? corpo.nome ?? "",
    email: (corpo.usar_contato ? empresa?.contato_email : corpo.email) ?? corpo.email ?? "",
  };
  if (!signatario.nome || !signatario.email) {
    return NextResponse.json(
      {
        erro:
          "esta empresa ainda não tem nome e e-mail do responsável — cadastre no Dossiê antes de gerar o termo",
        sem_contato: true,
      },
      { status: 409 }
    );
  }

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
   * A EMISSÃO CONGELA A RECOMENDAÇÃO. NÃO A DECISÃO.
   * ═════════════════════════════════════════════════════════════════════════
   *
   * Até 05/08/2026 esta rota recebia o tipo da decisão escolhido pelo CONTADOR
   * e o termo chegava ao cliente já dizendo "a empresa decide optar". A empresa
   * assinava embaixo de uma decisão que nunca declarou — e o papel voltava a
   * não distinguir quem decidiu o quê, que é o defeito inteiro que o termo
   * existe para resolver.
   *
   * Agora quem escolhe entre seguir, divergir e adiar é o SIGNATÁRIO, em
   * `/api/assinar`. Aqui a decisão nasce como `sem_decisao` — o valor que o
   * enum `decisao_empresa` já previa e que nunca tinha sido usado.
   *
   * E POR ISSO O HASH DO DOCUMENTO NÃO É CALCULADO AQUI. Um hash feito antes
   * de a decisão existir não cobre a decisão, e é ela que o termo prova. O que
   * se sela na emissão é a PROPOSTA — a recomendação e as cláusulas —, para que
   * ninguém possa alegar depois que a recomendação era outra.
   */
  const bloco = blocoDoTermo(analise as unknown as AnaliseGravada, "seguir");

  /* o laudo que embasa — o termo cita o número e linka a memória de cálculo */
  // schema-ok: laudos.token é criado pela migration 0028 (alter dinâmico)
  const { data: laudo } = await supabase
    .from("laudos")
    .select("token, numero")
    .eq("analise_id", corpo.analise_id)
    .maybeSingle();

  const hashProposta = sha256(
    conteudoDaProposta({
      empresa: empresa?.razao_social ?? corpo.empresa ?? "empresa",
      cnpj: empresa?.cnpj ?? "",
      recomendacao: bloco.recomendacao.decisao,
      saida: bloco.recomendacao.saida,
      clausulas: CLAUSULAS_CIENCIA,
    })
  );
  const token = novoToken();

  // cria a linha base pela RPC existente (tenant/numeração), sem assinatura externa
  const { data: termoId, error } = await supabase.rpc("registrar_termo", {
    p_analise: corpo.analise_id,
    p_decisao: "sem_decisao",
    p_nome: signatario.nome,
    p_email: signatario.email,
    p_assinatura_url: null,
    p_assinatura_ref: null,
  });
  if (error) return NextResponse.json({ erro: erroDeBanco(error, "termo") }, { status: 500 });

  // prepara a assinatura própria: token público, hash congelado, status pendente
  const { error: upErr } = await supabase
    .from("termos")
    .update({
      token,
      /* hash_documento fica NULO até a assinatura: é lá que a decisão entra no
         conteúdo, e um hash que não cobre a decisão não prova o termo */
      assinatura_status: "pendente",
      assinante_email: signatario.email,
      /* tipo_decisao NULO = ainda não decidido. A coluna existe desde a 0052 e
         é preenchida por quem assina, não por quem emite. */
      tipo_decisao: null,
      motivo_divergencia: null,
      recomendacao: bloco.recomendacao.decisao,
      recomendacao_saida: bloco.recomendacao.saida,
      // congela a apresentação: o documento não muda se a análise for revisada
      snapshot: {
        congelado_em: new Date().toISOString(),
        /* o selo da PROPOSTA: prova que a recomendação e as cláusulas de hoje
           são estas, mesmo que a decisão só apareça semanas depois */
        hash_proposta: hashProposta,
        clausulas: CLAUSULAS_CIENCIA,
        /* o texto inteiro da recomendação e dos pontos, como saiu HOJE. Guardar
           só a saída obrigaria a página a recalcular na hora de imprimir — e aí
           o termo de agosto mudaria de conteúdo quando o motor mudasse. */
        recomendacao: bloco.recomendacao,
        pontos: bloco.pontos,
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
  /* só volta o que o contador DIGITOU: quando o signatário veio do próprio
     cadastro (`usar_contato`), regravá-lo seria escrever por cima do mesmo
     valor e sujar o histórico de alteração da empresa sem nenhum ganho */
  if (!corpo.usar_contato) {
    if (corpo.nome && corpo.nome !== contatoAtual?.contato_nome) patch.contato_nome = corpo.nome;
    if (corpo.email && corpo.email !== contatoAtual?.contato_email) patch.contato_email = corpo.email;
  }
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
      para: signatario.email,
      nome: signatario.nome,
      assunto: `${empresa?.razao_social ?? corpo.empresa ?? "Sua empresa"} — decisão de IBS/CBS até 30 de setembro`,
      html: htmlConviteAssinatura({
        empresa: empresa?.razao_social ?? corpo.empresa ?? "sua empresa",
        escritorio,
        link: `${base}/assinar/${token}`,
        /* o convite anuncia a RECOMENDAÇÃO — a decisão ainda não existe, e
           anunciá-la seria dizer ao cliente o que ele vai decidir */
        decisao: bloco.recomendacao.decisao,
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
        para: signatario.email,
        nome: signatario.nome,
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
