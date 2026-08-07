import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { normalizarEvento } from "@/lib/email-eventos";
import { confirmarPorMensagemId, confirmarPorEmail } from "@/lib/entrega-server";

/**
 * O WEBHOOK DE ABERTURA E CLIQUE — Postal e Brevo entram pela mesma porta.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * POR QUE UMA PORTA SÓ. Os dois provedores mandam JSON com nomes diferentes
 * para a mesma coisa, e o app já troca de provedor sozinho quando o Postal
 * recusa (ver `lib/email.ts`). Dois endpoints significariam duas normalizações
 * que divergem — e a divergência apareceria como "a campanha X não tem
 * abertura nenhuma", que se parece com campanha ruim.
 *
 * A tradução mora em `lib/email-eventos.ts`, sem banco, e é testada lá.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * O SEGREDO. `EMAIL_WEBHOOK_SEGREDO` no ambiente e `?s=` na URL cadastrada no
 * provedor. Sem ele configurado, a rota RECUSA — não é uma rota que aceita
 * qualquer POST enquanto ninguém configurou nada. Dado de engajamento é dado
 * de cliente, e escrever no banco a partir de um POST anônimo é como uma base
 * de métricas vira lixo (ou pior, vetor).
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const segredo = process.env.EMAIL_WEBHOOK_SEGREDO;
  if (!segredo) {
    return NextResponse.json(
      { erro: "EMAIL_WEBHOOK_SEGREDO não está no ambiente; a rota fica fechada até estar." },
      { status: 503 }
    );
  }
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== segredo) {
    return NextResponse.json({ erro: "segredo inválido" }, { status: 401 });
  }

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  /* o provedor manda um evento ou um lote; os dois caem no mesmo laço */
  const itens = Array.isArray(corpo) ? corpo : [corpo];
  const eventos = itens
    .map((x) => normalizarEvento(x as Record<string, unknown>))
    .filter((x): x is NonNullable<typeof x> => x != null);

  if (!eventos.length) {
    /**
     * 200 E NÃO 400, de propósito. Evento que não interessa (entregue, envio
     * agendado) não é erro do provedor — e provedor que recebe 4xx desativa o
     * webhook depois de N falhas. Perder o canal inteiro por causa de um tipo
     * de evento que a gente ignora seria uma falha silenciosa e definitiva.
     */
    return NextResponse.json({ ok: true, ignorados: itens.length });
  }

  /* SEM SERVICE ROLE NÃO GRAVA — e diz isso. A tabela é escrita só pelo
     webhook; sem a chave, `createAdminClient()` devolve null e um `?.` aqui
     transformaria "não configurado" em "recebido e ignorado", que é a falha
     silenciosa que este arquivo inteiro existe para evitar. */
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json(
      { erro: "SUPABASE_SERVICE_ROLE_KEY ausente: o evento chegou mas não pôde ser gravado." },
      { status: 503 }
    );
  }

  /* liga cada evento ao envio pelo e-mail + regra, quando existir. Não achar o
     envio NÃO impede gravar: o evento vale por si, e um vínculo inventado
     valeria menos que nenhum. */
  const linhas = [];
  for (const e of eventos) {
    const { data: envio } = await supabase
      .from("plataforma_envios")
      .select("id, tenant_id, regra")
      .eq("para", e.para)
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    linhas.push({
      envio_id: envio?.id ?? null,
      tenant_id: envio?.tenant_id ?? null,
      para: e.para,
      regra: e.regra ?? envio?.regra ?? null,
      evento: e.evento,
      url: e.url ?? null,
      provedor: e.provedor,
      mensagem_id: e.mensagem_id ?? null,
      ocorreu_em: e.ocorreu_em,
    });
  }

  /* ─────────────────────────────────────── A CONFIRMAÇÃO DE ENTREGA ──────
   * Esta é a metade da garantia que fecha o ciclo: o envio grava a mensagem
   * como ACEITA (o Postal responde "success" quando ela entra na fila dele,
   * não quando o destino recebe) e é aqui que ela vira ENTREGUE de verdade.
   *
   * Sem este trecho, toda mensagem ficaria eternamente "aceita" e a varredura
   * reenviaria a base inteira pela Brevo de 15 em 15 minutos.
   *
   * Bounce e recusa marcam FALHOU — e falhou não se reenvia: caixa que não
   * existe pelo Postal também não existe pela Brevo, e insistir queima o
   * segundo caminho.
   *
   * Falha aqui não derruba o webhook: o evento já está para ser gravado, e
   * provedor que recebe 5xx desativa o webhook depois de N tentativas. */
  for (const e of eventos) {
    const status =
      e.evento === "entregue" ? "entregue" : e.evento === "bounce" || e.evento === "spam" || e.evento === "recusado" ? "falhou" : null;
    if (!status) continue;
    try {
      const casou = e.mensagem_id
        ? await confirmarPorMensagemId(e.mensagem_id, status)
        : false;
      /* a Brevo não devolve um id que dê para casar no envio — cai no
         destinatário mais recente ainda em aberto */
      if (!casou) await confirmarPorEmail(e.para, status);
    } catch (err) {
      console.error("[email-evento] confirmação não gravou:", err instanceof Error ? err.message : err);
    }
  }

  const { error } = await supabase.from("email_eventos").insert(linhas);
  if (error) {
    /* duplicata do mesmo webhook é esperada (retry do provedor) e não é falha */
    if (/duplicate key/i.test(error.message)) {
      return NextResponse.json({ ok: true, duplicados: linhas.length });
    }
    console.error("[email-evento] falha ao gravar:", error.message);
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, gravados: linhas.length });
}
