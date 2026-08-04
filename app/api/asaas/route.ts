import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * Webhook do Asaas — chega SEM sessão de usuário, então usa service role
 * (a RLS bloquearia um update anônimo). Ativa a assinatura na confirmação.
 *
 * CORRIGIDO NA 0020: antes, QUALQUER pagamento confirmado dava 365 dias de
 * acesso — inclusive o PRO mensal de R$ 47. Um pagamento de um mês liberava um
 * ano. Agora o prazo vem de `planos.dias_acesso` (mensal 31, anual 365), e o
 * fallback é conservador: 31 dias, não 365. Errar para menos é um cliente que
 * escreve reclamando; errar para mais é receita que some sem ninguém notar.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * AUTENTICAÇÃO — o buraco que este endpoint tinha.
 *
 * Esta rota é pública por natureza (o Asaas precisa alcançá-la) e aceitava
 * QUALQUER POST. Quem soubesse o id de uma assinatura conseguiria mandar um
 * `PAYMENT_CONFIRMED` forjado e liberar acesso pago sem pagar. O id é um UUID
 * — difícil de adivinhar, e "difícil de adivinhar" não é controle de acesso:
 * ele vaza em log, em print de suporte, em URL de teste.
 *
 * O Asaas resolve isso com um token próprio: no cadastro do webhook existe o
 * campo "Token de autenticação", e o valor volta em TODA chamada, no cabeçalho
 * `asaas-access-token`. Basta comparar.
 *
 * A verificação só EXIGE o token quando `ASAAS_WEBHOOK_TOKEN` está no
 * ambiente. Sem a variável, o comportamento continua o de antes e o painel de
 * planos mostra o aviso — travar aqui derrubaria a ativação de quem já paga,
 * para corrigir um risco que a variável resolve em dois minutos.
 * ─────────────────────────────────────────────────────────────────────────
 */

const PAGO = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]);
const DIAS_PADRAO = 31;

/**
 * Guarda o último evento recebido.
 *
 * É a única forma de o painel dizer se o webhook está mesmo cadastrado do
 * lado do Asaas. Sem isto, a configuração só se prova errada quando um cliente
 * escreve dizendo que pagou e não entrou — que é tarde demais.
 */
async function registrarBatida(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  dados: { evento?: string; assinatura?: string; aceito: boolean; motivo?: string }
) {
  try {
    await supabase.from("plataforma_config").upsert(
      {
        chave: "asaas_webhook",
        valor: { ...dados, em: new Date().toISOString() },
        descricao: "Último evento recebido do Asaas — diagnóstico do painel de planos.",
      },
      { onConflict: "chave" }
    );
  } catch {
    /* diagnóstico nunca pode derrubar a ativação de um pagamento */
  }
}

export async function POST(req: Request) {
  const esperado = process.env.ASAAS_WEBHOOK_TOKEN;
  const recebido = req.headers.get("asaas-access-token");
  const admin = createAdminClient();

  if (esperado && recebido !== esperado) {
    // 401 faz o Asaas reenfileirar e tentar de novo — o certo para o caso de o
    // token ter sido trocado de um lado só
    if (admin) await registrarBatida(admin, { aceito: false, motivo: "token do webhook não confere" });
    console.warn("[asaas] webhook recusado: token não confere");
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  let evento: {
    event?: string;
    payment?: { externalReference?: string; confirmedDate?: string; paymentDate?: string; dueDate?: string };
  };
  try {
    evento = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  const confirmado = PAGO.has(evento.event ?? "");
  const assinaturaId = evento.payment?.externalReference;

  if (admin) {
    await registrarBatida(admin, {
      evento: evento.event,
      assinatura: assinaturaId,
      aceito: true,
      motivo: confirmado ? undefined : "evento fora dos dois que ativam acesso",
    });
  }

  if (!confirmado || !assinaturaId) {
    return NextResponse.json({ ok: true, ignorado: true });
  }

  const supabase = admin;
  if (!supabase) {
    // sem service role: aceita o evento para não gerar reenvio, mas avisa no log
    console.warn("[asaas] SUPABASE_SERVICE_ROLE_KEY ausente — assinatura não ativada:", assinaturaId);
    return NextResponse.json({ ok: true, pendente: true });
  }

  // quantos dias este plano concede
  const { data: assin } = await supabase
    .from("assinaturas")
    .select("id, plano_id")
    .eq("id", assinaturaId)
    .maybeSingle();

  let diasAcesso = DIAS_PADRAO;
  const planoId = (assin as { plano_id?: string } | null)?.plano_id;
  if (planoId) {
    const { data: plano } = await supabase
      .from("planos")
      .select("dias_acesso, ciclo")
      .eq("id", planoId)
      .maybeSingle();
    const p = plano as { dias_acesso?: number | null; ciclo?: string | null } | null;
    if (p?.dias_acesso) diasAcesso = Number(p.dias_acesso);
    else if (p?.ciclo === "anual") diasAcesso = 365;
  }

  // conta a partir da data do pagamento, não de "agora": se o webhook chegar
  // atrasado, o cliente não perde os dias que já eram dele.
  const base = evento.payment?.confirmedDate || evento.payment?.paymentDate || evento.payment?.dueDate;
  const validoAte = base ? new Date(base) : new Date();
  validoAte.setDate(validoAte.getDate() + diasAcesso);
  const data = validoAte.toISOString().slice(0, 10);

  const { error } = await supabase
    .from("assinaturas")
    .update({
      status: "ativa",
      valido_ate: data,
      vencimento: data,
      pago_em: new Date(base || Date.now()).toISOString(),
    })
    .eq("id", assinaturaId);

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, dias_acesso: diasAcesso, valido_ate: data });
}
