import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { criarCobranca } from "@/lib/asaas";
import { criticaDocumento, limparDocumento } from "@/lib/documento";

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
     */
    await supabase.from("faturas").upsert(
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
  });
}
