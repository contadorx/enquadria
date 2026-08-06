import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { statusDoAsaas } from "@/lib/faturas";
import { decidirSucessao, validadeFinal, type AssinaturaResumo } from "@/lib/assinatura";
import { encerrarAssinaturas } from "@/lib/assinatura-server";
import { avisarContatia, chaveDe } from "@/lib/contatia";

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
 * ═══════════════════════════════════════════════════════════════════════════
 * O DINHEIRO VOLTOU — e o acesso não voltava com ele.
 *
 * Só PAYMENT_CONFIRMED e PAYMENT_RECEIVED mexiam em `assinaturas`. Estorno,
 * chargeback e recebimento desfeito marcavam a fatura e saíam por
 * `{ ok: true, ignorado: true }`. Resultado: cliente paga o anual, abre
 * chargeback vinte dias depois, e usa o produto por mais 345 dias com o
 * dinheiro de volta no bolso dele.
 *
 * A DISTINÇÃO IMPORTA, e é por isso que são duas listas:
 *
 *   DEVOLVIDO — o dinheiro saiu em definitivo. Estorno concluído é decisão
 *   tomada (por você ou pelo cliente, com o Asaas confirmando), e recebimento
 *   em dinheiro desfeito é registro corrigido. Aqui o acesso cai.
 *
 *   CONTESTADO — chargeback ABERTO ou em disputa é acusação, não veredito.
 *   Uma parte relevante é revertida em favor do lojista. Cortar o acesso de
 *   quem talvez tenha razão do outro lado transforma uma disputa de R$ 47 num
 *   cliente perdido — e se a disputa for ganha, você cortou sem motivo.
 *   Aqui o acesso FICA e o caso vira ação de alta prioridade no painel.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const DEVOLVIDO = new Set([
  "PAYMENT_REFUNDED",
  "PAYMENT_PARTIALLY_REFUNDED",
  "PAYMENT_RECEIVED_IN_CASH_UNDONE",
  "PAYMENT_CHARGEBACK_DISPUTE_LOST",
]);
const CONTESTADO = new Set([
  "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_CHARGEBACK_DISPUTE",
  "PAYMENT_AWAITING_CHARGEBACK_REVERSAL",
]);

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
  dados: { evento?: string; assinatura?: string; aceito: boolean; motivo?: string; fatura_erro?: string }
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

/**
 * Grava (ou atualiza) a fatura correspondente ao evento.
 *
 * O tenant vem da assinatura apontada por `externalReference` — é o único
 * vínculo confiável entre o pagamento no Asaas e o escritório aqui. Sem ele,
 * a fatura não é gravada: melhor não ter a linha do que pendurá-la no
 * escritório errado.
 */
async function registrarFatura(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  evento: string,
  p: {
    id?: string;
    value?: number;
    description?: string;
    dueDate?: string;
    invoiceUrl?: string;
    bankSlipUrl?: string;
    externalReference?: string;
    confirmedDate?: string;
    paymentDate?: string;
    status?: string;
  }
) {
  try {
    if (!p.externalReference) return "pagamento sem externalReference";
    const { data: assin } = await supabase
      .from("assinaturas")
      .select("id, tenant_id, plano_id")
      .eq("id", p.externalReference)
      .maybeSingle();
    const a = assin as { id?: string; tenant_id?: string; plano_id?: string } | null;
    if (!a?.tenant_id) return `assinatura ${p.externalReference} não encontrada`;

    let planoNome: string | null = null;
    if (a.plano_id) {
      const { data: plano } = await supabase.from("planos").select("nome").eq("id", a.plano_id).maybeSingle();
      planoNome = (plano as { nome?: string } | null)?.nome ?? null;
    }

    /**
     * ═══════════════════════════════════════════════════════════════════════
     * O EVENTO MANDA, MAS O `status` DO PAGAMENTO DESEMPATA — e isto conserta
     * um bug destrutivo.
     *
     * `statusDoAsaas` devolve "pendente" para tudo que não conhece, e o Asaas
     * manda MUITO evento inócuo sobre a mesma cobrança: BANK_SLIP_VIEWED,
     * CHECKOUT_VIEWED, UPDATED, ANTICIPATED. Cada um deles caía no default e
     * era gravado POR CIMA da linha (o upsert converge por `asaas_id`),
     * derrubando uma fatura PAGA de volta para "pendente" e apagando o
     * `pago_em`.
     *
     * O caminho mais fácil de reproduzir era o próprio produto: o cliente
     * abre "Ver recibo" na central de faturas, o Asaas dispara
     * PAYMENT_CHECKOUT_VIEWED, e a fatura que ele acabou de pagar volta a
     * mostrar o botão "Pagar". O acesso continua (a assinatura não é tocada),
     * então nada denuncia a divergência — e some do caixa.
     *
     * Duas defesas, nesta ordem:
     *   1. o `status` do próprio pagamento é lido quando o evento não é
     *      conclusivo (ele vem RECEIVED no mesmo payload);
     *   2. status já LIQUIDADO (pago/estornado/cancelado) nunca regride para
     *      pendente. Dinheiro que entrou não volta a ser promessa por causa de
     *      um evento de visualização.
     * ═══════════════════════════════════════════════════════════════════════
     */
    const doEvento = statusDoAsaas(evento);
    const doPagamento = statusDoAsaas(p.status);
    const status = doEvento !== "pendente" ? doEvento : doPagamento;

    const { data: atual } = await supabase
      .from("faturas")
      .select("status, pago_em")
      .eq("asaas_id", p.id)
      .maybeSingle();
    const anterior = (atual as { status?: string; pago_em?: string | null } | null) ?? null;
    const jaLiquidada = ["pago", "estornado", "cancelado"].includes(anterior?.status ?? "");

    if (jaLiquidada && status === "pendente") {
      // evento inócuo sobre cobrança resolvida: não toca em nada
      return null;
    }

    /**
     * `pago_em` SEM PASSAR POR FUSO.
     *
     * `confirmedDate` vem como data-calendário ("2026-08-04"), e
     * `new Date("2026-08-04")` é meia-noite UTC — 21h do dia 3 em São Paulo.
     * A tela do cliente mostrava "pago em 03/08" para um pagamento de 04/08,
     * data que não bate com o comprovante do Asaas nem com o extrato. O
     * comentário três linhas abaixo, no cálculo da validade, avisa contra
     * exatamente isso: a correção tinha sido feita lá e esquecida aqui.
     */
    const pagoEm = status === "pago" ? p.confirmedDate || p.paymentDate || null : null;
    const pagoEmISO = pagoEm
      ? /^\d{4}-\d{2}-\d{2}$/.test(pagoEm)
        ? `${pagoEm}T12:00:00-03:00`
        : new Date(pagoEm).toISOString()
      : null;

    const { error } = await supabase.from("faturas").upsert(
      {
        tenant_id: a.tenant_id,
        assinatura_id: a.id ?? null,
        plano_nome: planoNome,
        asaas_id: p.id,
        valor_centavos: Math.round(Number(p.value || 0) * 100),
        status,
        vencimento: p.dueDate ?? null,
        /* estorno não apaga a data em que o dinheiro entrou: o histórico
           precisa mostrar que entrou e voltou */
        pago_em: pagoEmISO ?? anterior?.pago_em ?? null,
        link_pagamento: p.invoiceUrl ?? null,
        link_boleto: p.bankSlipUrl ?? null,
        descricao: p.description ?? null,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "asaas_id" }
    );

    /**
     * O `try/catch` NÃO BASTAVA — e foi por isso que o bug ficou invisível.
     *
     * O supabase-js não LANÇA quando o banco recusa: ele devolve `{ error }`.
     * O `catch` abaixo só pega falha de rede. Enquanto o índice de `faturas`
     * era parcial (ver 0040), todo upsert voltava 42P10 aqui dentro, o `error`
     * não era lido, e o webhook respondia 200 alegremente com a tabela vazia.
     */
    if (error) console.error("[asaas] fatura recusada pelo banco:", error.message);
    return error?.message ?? null;
  } catch (e) {
    // a fatura é histórico: nunca pode impedir a ativação do acesso
    const m = e instanceof Error ? e.message : String(e);
    console.error("[asaas] fatura não gravada:", m);
    return m;
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
    payment?: {
      id?: string;
      value?: number;
      description?: string;
      status?: string;
      invoiceUrl?: string;
      bankSlipUrl?: string;
      externalReference?: string;
      confirmedDate?: string;
      paymentDate?: string;
      dueDate?: string;
    };
  };
  try {
    evento = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  const confirmado = PAGO.has(evento.event ?? "");
  const devolvido = DEVOLVIDO.has(evento.event ?? "");
  const contestado = CONTESTADO.has(evento.event ?? "");
  const assinaturaId = evento.payment?.externalReference;

  /**
   * SEM SERVICE ROLE, O WEBHOOK PRECISA FALHAR ALTO.
   *
   * Respondendo 200 sem ter gravado nada, o Asaas marca o evento como
   * entregue e NUNCA reenvia: um pagamento confirmado se perde em silêncio, a
   * assinatura fica pendente, a fatura não nasce e nem a batida de diagnóstico
   * é gravada (ela também depende do admin). 503 faz ele reenfileirar — que é
   * o mesmo tratamento já dado ao token inválido, e pela mesma razão.
   */
  if (!admin) {
    console.error("[asaas] SUPABASE_SERVICE_ROLE_KEY ausente — devolvendo 503 para o Asaas reenviar");
    return NextResponse.json(
      { erro: "servidor sem credencial de escrita; reenvie" },
      { status: 503 }
    );
  }

  /**
   * A FATURA, antes de qualquer decisão sobre acesso.
   *
   * Todo evento de pagamento vira linha na central de faturas — inclusive os
   * que NÃO liberam acesso (criada, vencida, estornada). É justamente o
   * histórico do que não deu certo que o cliente procura quando escreve
   * "paguei e não entrou" ou "meu boleto venceu, me manda a segunda via".
   *
   * `upsert` por `asaas_id` com índice único: a criação da cobrança e este
   * webhook gravam a mesma fatura, e sem a trava as duas escritas produzem
   * duas linhas para o mesmo pagamento.
   */
  let faturaErro: string | null = null;
  if (admin && evento.payment?.id) {
    faturaErro = await registrarFatura(admin, evento.event ?? "", evento.payment);
  }

  if (admin) {
    /* a batida guarda a falha da fatura: é o que faz o painel de plataforma
       conseguir dizer "o webhook chega, mas a fatura não grava" — a pergunta
       que ficou dias sem resposta */
    await registrarBatida(admin, {
      evento: evento.event,
      assinatura: assinaturaId,
      aceito: true,
      motivo: confirmado
        ? undefined
        : devolvido
          ? "dinheiro devolvido — acesso revogado"
          : contestado
            ? "pagamento contestado — acesso mantido, virou ação no painel"
            : "evento fora dos dois que ativam acesso",
      fatura_erro: faturaErro ?? undefined,
    });
  }

  /* ───────────────────────────── dinheiro devolvido: o acesso cai junto */
  if (devolvido && assinaturaId) {
    const { error } = await admin
      .from("assinaturas")
      .update({ status: "cancelada", valido_ate: null })
      .eq("id", assinaturaId);
    if (error) console.error(`[asaas] estorno: assinatura ${assinaturaId} não foi revogada: ${error.message}`);
    return NextResponse.json({ ok: true, revogada: !error, motivo: evento.event });
  }

  /* ─────────── contestado: o acesso fica, mas isto não pode passar batido */
  if (contestado && assinaturaId) {
    console.warn(`[asaas] pagamento contestado (${evento.event}) na assinatura ${assinaturaId}`);
    return NextResponse.json({ ok: true, contestado: true, motivo: evento.event });
  }

  if (!confirmado || !assinaturaId) {
    return NextResponse.json({ ok: true, ignorado: true });
  }

  const supabase = admin;

  // quantos dias este plano concede
  const { data: assin } = await supabase
    .from("assinaturas")
    .select("id, plano_id, tenant_id")
    .eq("id", assinaturaId)
    .maybeSingle();

  let diasAcesso = DIAS_PADRAO;
  let ciclo: string | null = null;
  let planoNome = "seu plano";
  const planoId = (assin as { plano_id?: string } | null)?.plano_id;
  if (planoId) {
    const { data: plano } = await supabase
      .from("planos")
      .select("nome, dias_acesso, ciclo")
      .eq("id", planoId)
      .maybeSingle();
    const p = plano as { nome?: string | null; dias_acesso?: number | null; ciclo?: string | null } | null;
    ciclo = p?.ciclo ?? null;
    if (p?.nome) planoNome = p.nome;
    if (p?.dias_acesso) diasAcesso = Number(p.dias_acesso);
    else if (p?.ciclo === "anual") diasAcesso = 365;
  }

  /**
   * ═════════════════════════════════════════════════════════════════════════
   * A SUCESSÃO DE PLANO — o único lugar do sistema onde "pago" é verdade.
   *
   * Uma conta tem UM plano. Quem estava no mensal e comprou o anual não pode
   * perder acesso no clique (ver a rota de checkout): o plano pago segue de pé
   * até o novo ser pago. É AQUI que a troca acontece de fato.
   *
   * E os dias que sobravam do plano anterior VÊM JUNTO. Quem pagou 30 dias e
   * migrou no dia 12 tem 18 dias comprados que não podem evaporar — evaporar
   * seria cobrar duas vezes pelo mesmo período, e é o tipo de conta que o
   * cliente refaz. Somar os dias resolve sem estorno, sem nota de crédito e
   * sem ninguém precisar escrever pedindo.
   *
   * Cancelar as demais fica por conta de `encerrarAssinaturas`, que também
   * derruba no Asaas o boleto que ficou para trás — senão ele continua
   * pagável, e o próximo webhook reativaria o plano abandonado por cima deste.
   * ═════════════════════════════════════════════════════════════════════════
   */
  const tenantId = (assin as { tenant_id?: string } | null)?.tenant_id;
  let credito = 0;
  let encerradas: string[] = [];

  if (tenantId) {
    const { data: irmas } = await supabase
      .from("assinaturas")
      .select("id, plano_id, status, valido_ate")
      .eq("tenant_id", tenantId);
    const s = decidirSucessao(assinaturaId, (irmas ?? []) as AssinaturaResumo[], new Date());
    credito = s.credito_dias;
    encerradas = s.cancelar;
  }

  // conta a partir da data do pagamento, não de "agora": se o webhook chegar
  // atrasado, o cliente não perde os dias que já eram dele.
  //
  // A string CRUA do Asaas, não `new Date(string)`: "2026-08-04" vira
  // meia-noite UTC, que é 21h do dia anterior aqui — um dia de acesso a menos
  // para todo mundo que paga.
  const base = evento.payment?.confirmedDate || evento.payment?.paymentDate || evento.payment?.dueDate;
  const data = validadeFinal(base ?? new Date(), diasAcesso, credito);

  /**
   * ═════════════════════════════════════════════════════════════════════════
   * A VALIDADE NUNCA REGRIDE — o webhook precisa ser idempotente.
   *
   * O Asaas manda mais de um evento por cobrança: `PAYMENT_CONFIRMED` e, mais
   * tarde, `PAYMENT_RECEIVED` (D+1 no boleto, na liquidação do cartão). Os
   * dois chegam com o mesmo `externalReference`.
   *
   * No PRIMEIRO, `decidirSucessao` via a mensal ainda ativa e somava os 18
   * dias que sobravam; em seguida `encerrarAssinaturas` a marcava cancelada.
   * No SEGUNDO, `outras` já não encontrava nada e o crédito voltava a zero —
   * e o update regravava `valido_ate` sem os dias herdados. **Os 18 dias já
   * pagos sumiam do banco**, sem log e sem aviso, depois de a tela ter
   * prometido por escrito que eles entrariam.
   *
   * A regra é simples e cobre reprocessamento, reenvio e backlog: fica a data
   * MAIOR entre a que já está gravada e a calculada agora. Nenhum reprocesso
   * pode tirar acesso que já foi concedido.
   * ═════════════════════════════════════════════════════════════════════════
   */
  const { data: antes } = await supabase
    .from("assinaturas")
    .select("valido_ate")
    .eq("id", assinaturaId)
    .maybeSingle();
  const jaTinha = (antes as { valido_ate?: string | null } | null)?.valido_ate ?? null;
  const validade = jaTinha && jaTinha > data ? jaTinha : data;

  const pagoEmISO = base && /^\d{4}-\d{2}-\d{2}$/.test(base)
    ? `${base}T12:00:00-03:00`
    : new Date(base || Date.now()).toISOString();

  const { error } = await supabase
    .from("assinaturas")
    .update({
      status: "ativa",
      valido_ate: validade,
      vencimento: validade,
      pago_em: pagoEmISO,
    })
    .eq("id", assinaturaId);

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  /**
   * ═════════════════════════════════════════════════════════════════════════
   * AS COLUNAS DE COBRANÇA DO ESCRITÓRIO — que ninguém escrevia.
   *
   * A aba Negócio → Contas calcula MRR, ticket, churn e LTV a partir de
   * `tenants.ultimo_pagamento`, `ultimo_pagamento_valor`, `valor_mensal` e
   * `ciclo_cobranca`. Essas colunas existem desde a 0031 e NADA no sistema as
   * preenchia — só digitação manual. Resultado: a aba Visão mostrava "MRR
   * R$ 47" e a aba Contas, no mesmo painel, "MRR R$ 0,00 · 0 pagantes".
   *
   * Quem sabe que um pagamento entrou é este webhook. Era só ele contar.
   *
   * `valor_mensal` fica com o valor NORMALIZADO por mês (anual dividido por
   * 12), que é o que a tela soma — misturar R$ 470 de um anual com R$ 47 de um
   * mensal na mesma coluna produziria um MRR dez vezes maior num deles.
   */
  if (tenantId) {
    const valorPago = Math.round(Number(evento.payment?.value || 0) * 100);
    const mensalizado = ciclo === "anual" ? Math.round(valorPago / 12) : valorPago;
    const { error: eT } = await supabase
      .from("tenants")
      .update({
        ultimo_pagamento: pagoEmISO,
        ultimo_pagamento_valor: valorPago,
        valor_mensal: mensalizado,
        ciclo_cobranca: ciclo ?? "mensal",
        proximo_vencimento: validade,
      })
      .eq("id", tenantId);
    if (eT) console.error(`[asaas] tenant ${tenantId} sem os dados de cobrança: ${eT.message}`);
  }

  /* só depois de a nova estar ATIVA: se encerrássemos antes e o update acima
     falhasse, a conta ficaria sem plano nenhum — com o dinheiro já pago */
  let avisos: string[] = [];
  if (encerradas.length) {
    const r = await encerrarAssinaturas(supabase, encerradas);
    avisos = r.avisos;
    if (avisos.length) console.error("[asaas] sucessão de plano:", avisos.join(" · "));
  }

  /**
   * VIROU CLIENTE — o segundo evento que o Contatia entende.
   *
   * `cadastro_ativo` tira da prospecção; `assinatura_ativa` marca quem paga.
   * São tags diferentes de propósito: a conversa com quem testa e com quem
   * paga não é a mesma, e misturar as duas na mesma lista é o jeito mais
   * rápido de mandar pitch de conversão para quem já converteu.
   *
   * Aqui também não pode derrubar nada: o pagamento já foi processado e o
   * acesso já foi liberado quando esta linha roda.
   */
  /* o dono da conta, buscado UMA vez — o recibo e o Contatia querem o mesmo */
  let donoEmail: string | null = null;
  let tenantNome: string | null = null;
  if (tenantId) {
    try {
      const { data: t } = await supabase
        .from("tenants").select("nome").eq("id", tenantId).maybeSingle();
      const { data: p } = await supabase
        .from("profiles").select("email").eq("tenant_id", tenantId).order("email").limit(1);
      tenantNome = (t as { nome?: string } | null)?.nome ?? null;
      donoEmail = ((p ?? []) as { email?: string }[])[0]?.email ?? null;
    } catch (e) {
      console.error("[asaas] dono da conta não encontrado:", e instanceof Error ? e.message : e);
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * O RECIBO — o e-mail que faltava depois do dinheiro entrar.
   *
   * Até 06/08/2026 este webhook liberava o acesso, somava o MRR, atualizava as
   * colunas de cobrança e avisava o CRM. A única pessoa que não recebia nada
   * era quem tinha acabado de pagar. Ele pagava, olhava para a tela e não sabia
   * se tinha entrado.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * A TRAVA DE DUPLICIDADE É UM INSERT, NÃO UM `if`.
   *
   * O Asaas manda DOIS eventos por cobrança: `PAYMENT_CONFIRMED` e, depois,
   * `PAYMENT_RECEIVED` (D+1 no boleto, na liquidação do cartão). Com uma
   * checagem simples em memória, os dois virariam dois recibos do mesmo
   * pagamento — e recibo repetido de cobrança é o que faz um e-mail legítimo
   * parecer golpe.
   *
   * A chave é do PAGAMENTO (`payment.id`), não da assinatura: os dois eventos
   * trazem o mesmo `payment.id`, então sai um recibo por cobrança; e a
   * renovação do mês seguinte é outro pagamento, que merece o seu.
   *
   * `plataforma_envios.chave_unica` tem índice ÚNICO, então o insert é a
   * própria trava — atômica, sem corrida entre dois webhooks simultâneos.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * E SE O ENVIO FALHAR, A RESERVA É DESFEITA.
   *
   * Reservar e sair calado transformaria uma falha de SMTP em "este cliente
   * nunca vai receber recibo, e ninguém vai saber". Apagando a linha, o
   * `PAYMENT_RECEIVED` que chega depois tenta de novo sozinho — a segunda
   * tentativa vem de graça, embutida no jeito como o Asaas já funciona.
   *
   * NADA AQUI PODE DERRUBAR O WEBHOOK: o pagamento já foi processado e o
   * acesso já está liberado quando esta linha roda. Falha vira log.
   * ═══════════════════════════════════════════════════════════════════════════
   */
  const pagamentoId = evento.payment?.id;
  if (donoEmail && tenantId && pagamentoId) {
    const chaveRecibo = `pagamento_confirmado:${pagamentoId}`;
    try {
      /**
       * RESERVA ÓRFÃ É VARRIDA ANTES DE TENTAR.
       *
       * Se a função morrer entre a reserva e o envio — timeout, deploy no meio,
       * queda do provedor de e-mail — a linha fica presa em `enviando` e a
       * chave única passa a bloquear TODA tentativa futura. O recibo nunca
       * sairia, e ninguém saberia por quê: o log mostraria uma linha que parece
       * em andamento há três semanas.
       *
       * Dez minutos é folgado para qualquer envio real e curto o suficiente
       * para o `PAYMENT_RECEIVED` (que vem horas depois) encontrar o caminho
       * livre. Uma reserva ainda quente NÃO é varrida — é o que protege contra
       * dois webhooks simultâneos.
       */
      await supabase
        .from("plataforma_envios")
        .delete()
        .eq("chave_unica", chaveRecibo)
        .eq("status", "enviando")
        .lt("criado_em", new Date(Date.now() - 10 * 60_000).toISOString());

      const { data: reservado } = await supabase
        .from("plataforma_envios")
        .upsert(
          {
            tenant_id: tenantId,
            regra: "pagamento_confirmado",
            chave_unica: chaveRecibo,
            para: donoEmail,
            assunto: "(reservando)",
            status: "enviando",
          },
          { onConflict: "chave_unica", ignoreDuplicates: true }
        )
        .select("id");

      /* vazio = a chave já existia: o outro evento desta cobrança já cuidou */
      if (reservado?.length) {
        const { enviarEmail } = await import("@/lib/email");
        const { htmlPagamentoConfirmado, assuntoPagamentoConfirmado } = await import("@/lib/emails-cliente");

        const dBR = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR");
        const validoAteBR = dBR(validade);
        const assunto = assuntoPagamentoConfirmado(planoNome, validoAteBR);

        const r = await enviarEmail({
          para: donoEmail,
          nome: tenantNome ?? "Seu escritório",
          assunto,
          html: htmlPagamentoConfirmado({
            plano: planoNome,
            valor: (Number(evento.payment?.value || 0)).toLocaleString("pt-BR", {
              style: "currency", currency: "BRL",
            }),
            pago_em: base ? dBR(String(base)) : null,
            valido_ate: validoAteBR,
            credito_dias: credito,
            link: `${new URL(req.url).origin}/painel`,
          }),
          tag: "pagamento-confirmado",
        });

        if (r.enviado) {
          await supabase
            .from("plataforma_envios")
            .update({ status: "enviado", assunto })
            .eq("chave_unica", chaveRecibo);
        } else {
          await supabase.from("plataforma_envios").delete().eq("chave_unica", chaveRecibo);
          console.error(`[asaas] recibo não saiu (${r.motivo}) — a reserva foi desfeita, o próximo evento tenta de novo`);
        }
      }
    } catch (e) {
      /* desfaz a reserva também quando a exceção vem do meio do caminho */
      await supabase.from("plataforma_envios").delete()
        .eq("chave_unica", chaveRecibo).eq("status", "enviando");
      console.error("[asaas] recibo falhou:", e instanceof Error ? e.message : e);
    }
  }

  /**
   * VIROU CLIENTE — o segundo evento que o Contatia entende.
   *
   * `cadastro_ativo` tira da prospecção; `assinatura_ativa` marca quem paga.
   * São tags diferentes de propósito: a conversa com quem testa e com quem
   * paga não é a mesma, e misturar as duas na mesma lista é o jeito mais
   * rápido de mandar pitch de conversão para quem já converteu.
   *
   * Aqui também não pode derrubar nada: o pagamento já foi processado e o
   * acesso já foi liberado quando esta linha roda.
   */
  if (tenantId && donoEmail) {
    try {
      const r = await avisarContatia({
        evento: "assinatura_ativa",
        /* a chave inclui a ASSINATURA: renovar no mês seguinte é um fato
           novo, e o CRM deve saber que ele aconteceu de novo */
        chave: chaveDe("assinatura_ativa", assinaturaId),
        email: donoEmail,
        empresa: tenantNome,
        extra: { plano: planoId, valido_ate: validade },
      });
      if (!r.enviado) console.error(`[contatia] assinatura_ativa não avisada: ${r.motivo}`);
    } catch (e) {
      console.error("[contatia] aviso de assinatura falhou:", e instanceof Error ? e.message : e);
    }
  }

  return NextResponse.json({
    ok: true,
    dias_acesso: diasAcesso,
    credito_dias: credito,
    valido_ate: data,
    encerradas: encerradas.length,
    avisos: avisos.length ? avisos : undefined,
  });
}
