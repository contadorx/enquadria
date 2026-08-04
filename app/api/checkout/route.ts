import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { criarCobranca } from "@/lib/asaas";
import { criticaDocumento, limparDocumento } from "@/lib/documento";
import { enviarEmail } from "@/lib/email";
import { htmlCobrancaGerada } from "@/lib/emails-cliente";

/** cria a assinatura pendente e a cobrança Asaas para um plano */
export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });

  const { data: perfil } = await supabase
    .from("profiles")
    .select("tenant_id, email, tenants(nome, cpf_cnpj)")
    .eq("id", user.id)
    .maybeSingle();
  const tenantId = perfil?.tenant_id;
  if (!tenantId) return NextResponse.json({ erro: "workspace não encontrado" }, { status: 400 });

  let corpo: { plano_id: string; cpf_cnpj?: string };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  /**
   * O DOCUMENTO DO PAGADOR — o campo que faltava e travava tudo.
   *
   * O Asaas não cria cliente sem CPF/CNPJ. Vem do que a pessoa acabou de
   * digitar ou do que já está no escritório; sem nenhum dos dois, a resposta
   * diz exatamente isso, em vez de deixar o botão sem efeito.
   */
  const tCad = perfil?.tenants as { nome?: string; cpf_cnpj?: string } | { nome?: string; cpf_cnpj?: string }[] | null;
  const cad = Array.isArray(tCad) ? tCad[0] : tCad;
  const documento = limparDocumento(corpo.cpf_cnpj || cad?.cpf_cnpj || "");
  const critica = criticaDocumento(documento);
  if (critica) {
    return NextResponse.json({ erro: critica, falta_documento: true }, { status: 400 });
  }

  const { data: plano } = await supabase
    .from("planos")
    .select("id, nome, preco_centavos")
    .eq("id", corpo.plano_id)
    .maybeSingle();
  if (!plano) return NextResponse.json({ erro: "plano inválido" }, { status: 400 });

  const { data: assinatura, error: aErr } = await supabase
    .from("assinaturas")
    .insert({ tenant_id: tenantId, plano_id: plano.id, status: "pendente" })
    .select("id")
    .single();
  if (aErr) return NextResponse.json({ erro: aErr.message }, { status: 500 });

  const nome = cad?.nome ?? "Escritório";

  // guarda para a próxima cobrança: pedir o mesmo dado duas vezes é atrito
  if (documento !== cad?.cpf_cnpj) {
    await supabase.from("tenants").update({ cpf_cnpj: documento }).eq("id", tenantId);
  }

  const cobranca = await criarCobranca({
    nome,
    email: perfil?.email ?? user.email ?? "",
    cpf_cnpj: documento,
    valor_centavos: plano.preco_centavos,
    descricao: `Enquadria — ${plano.nome}`,
    externo: assinatura.id,
  });

  /**
   * O QUE ACONTECEU COM A FATURA sobe na resposta.
   *
   * Enquanto isto era só `console.error`, o bug do índice parcial (0040) durou
   * dias: a cobrança nascia, o e-mail saía, a fatura não gravava e a única
   * pista morava num log que ninguém abre. Falha silenciosa é falha que dura.
   */
  let faturaErro: string | null = null;

  if (cobranca.asaas_id || cobranca.checkout_url) {
    await supabase
      .from("assinaturas")
      .update({ asaas_id: cobranca.asaas_id ?? null, checkout_url: cobranca.checkout_url ?? null })
      .eq("id", assinatura.id);

    /**
     * A FATURA NASCE AQUI, não no webhook.
     *
     * O `PAYMENT_CREATED` chega em segundos — mas "em segundos" é depois de a
     * pessoa voltar para a tela. Sem esta linha, quem acabou de gerar a
     * cobrança abre a central de faturas e não vê nada, o que parece falha.
     *
     * O `upsert` por `asaas_id` (índice único na 0039) faz esta escrita e a do
     * webhook convergirem para a MESMA linha, não importa qual chegue antes.
     *
     * ─────────────────────────────────────────────────────────────────────
     * ESCREVE COM O CLIENTE DE SERVIÇO, e isto é a correção de um bug meu.
     *
     * A RLS de `faturas` dá ao escritório apenas SELECT — de propósito: se o
     * usuário pudesse escrever na própria tabela de faturas, poderia inserir
     * uma linha "paga" e liberar acesso sem pagar. Quem escreve fatura é o
     * servidor, a partir do que o Asaas confirma.
     *
     * Só que este trecho estava usando o cliente da SESSÃO. A RLS recusava a
     * escrita, o supabase-js devolve `{ error }` em vez de lançar, o código
     * ignorava, e o resultado era exatamente o relatado: o e-mail da cobrança
     * saía (ele vem depois) e a fatura não aparecia em lugar nenhum.
     * ─────────────────────────────────────────────────────────────────────
     */
    const admin = createAdminClient();
    const { error: eF } = await (admin ?? supabase).from("faturas").upsert(
      {
        tenant_id: tenantId,
        assinatura_id: assinatura.id,
        plano_nome: plano.nome,
        asaas_id: cobranca.asaas_id ?? null,
        valor_centavos: plano.preco_centavos,
        status: "pendente",
        vencimento: cobranca.vencimento ?? null,
        link_pagamento: cobranca.checkout_url ?? null,
        link_boleto: cobranca.boleto_url ?? null,
        descricao: `Enquadria — ${plano.nome}`,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "asaas_id" }
    );

    /* erro engolido foi a causa do bug; agora ele vai para o log E para a tela */
    if (eF) {
      faturaErro =
        eF.message + (admin ? "" : " — SUPABASE_SERVICE_ROLE_KEY ausente, a escrita foi tentada com a sessão e a RLS recusa");
      console.error(`[checkout] fatura NÃO registrada (assinatura ${assinatura.id}): ${faturaErro}`);
    }

    /**
     * O E-MAIL COM O LINK, AGORA — sem depender de webhook.
     *
     * Era o elo que faltava: a cobrança nascia e o contador ficava sem nada na
     * mão. Falha aqui não desfaz a contratação (o link já está na tela e na
     * central de faturas), então o erro só vai para o log.
     */
    const paraEmail = perfil?.email ?? user.email;
    if (paraEmail && cobranca.checkout_url) {
      try {
        const r = await enviarEmail({
          para: paraEmail,
          nome,
          assunto: `Sua cobrança do ${plano.nome} — Enquadria`,
          html: htmlCobrancaGerada({
            escritorio: { nome: "Enquadria" },
            plano: plano.nome,
            valor: (plano.preco_centavos / 100).toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            }),
            vencimento: cobranca.vencimento
              ? new Date(`${cobranca.vencimento}T12:00:00`).toLocaleDateString("pt-BR")
              : null,
            link: cobranca.checkout_url,
          }),
          tag: "cobranca-gerada",
        });
        if (!r.enviado) console.error(`[checkout] e-mail da cobrança não saiu: ${r.motivo}`);
      } catch (e) {
        console.error("[checkout] e-mail da cobrança falhou:", e instanceof Error ? e.message : e);
      }
    }
  }

  /**
   * O TERCEIRO CASO, que a tela não cobria: Asaas LIGADO e sem link.
   *
   * Era aqui que o clique morria. Agora o motivo do Asaas sobe junto e vira
   * mensagem — a assinatura fica registrada como pendente de qualquer forma,
   * então nada se perde.
   */
  if (cobranca.ativo && !cobranca.checkout_url) {
    return NextResponse.json(
      {
        erro:
          cobranca.erro ??
          "A cobrança não foi gerada pelo Asaas e a assinatura ficou pendente. Tente de novo em instantes.",
        assinatura_id: assinatura.id,
        asaas_ativo: true,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    assinatura_id: assinatura.id,
    asaas_ativo: cobranca.ativo,
    checkout_url: cobranca.checkout_url ?? null,
    fatura_registrada: !faturaErro,
    fatura_erro: faturaErro,
  });
}
