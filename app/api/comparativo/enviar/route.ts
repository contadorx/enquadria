import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { enviarEmail } from "@/lib/email";
import { htmlComparativoCliente } from "@/lib/emails-cliente";
import type { ResultadoComparativo } from "@/lib/comparativo";

/**
 * ENVIAR O COMPARATIVO AO CLIENTE.
 *
 * Dos dois documentos, este é o que mais precisava sair. O laudo é a PROVA — o
 * cliente lê depois de decidir. O comparativo é o documento de VENDA: é ele que
 * mostra por que a conversa vale a pena, ANTES de o cliente pagar. Ele estava
 * preso no painel do contador desde sempre.
 *
 * O comparativo pode ser AVULSO (sem empresa vinculada) — o contador simula um
 * cenário para prospectar. Nesse caso não há para quem mandar automaticamente,
 * e a rota aceita um destinatário explícito.
 */

interface Corpo {
  comparativo_ids: string[];
  /**
   * Serve a dois casos: o comparativo AVULSO (sem empresa vinculada, usado para
   * prospectar) e a CORREÇÃO do destinatário na hora do envio. No segundo caso
   * o endereço é gravado na empresa — corrigir sem persistir é o vazamento que
   * já existia no termo, com o contador corrigindo o mesmo e-mail toda vez.
   */
  para?: string;
  nome?: string;
}

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });

  let corpo: Corpo;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }
  if (!corpo?.comparativo_ids?.length) {
    return NextResponse.json({ erro: "informe comparativo_ids" }, { status: 400 });
  }

  const { data: perfil } = await supabase
    .from("profiles")
    .select("tenant_id, tenants(nome, crc, logo_url)")
    .eq("id", user.id)
    .maybeSingle();
  const t = perfil?.tenants as { nome?: string; crc?: string; logo_url?: string } | null;
  const escritorio = { nome: t?.nome || "Seu contador", crc: t?.crc, logo_url: t?.logo_url };
  // o cliente responde ao comparativo pedindo reunião — tem de cair no contador
  const responderPara = user.email ? { email: user.email, nome: escritorio.nome } : undefined;

  const { data: docs, error } = await supabase
    .from("comparativos")
    // schema-ok: comparativos.token é criado pela migration 0028 (alter dinâmico)
    .select("id, numero, token, empresa_id, resultado, escritorio")
    .in("id", corpo.comparativo_ids)
    .limit(200);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  if (!docs?.length) {
    return NextResponse.json({ ok: true, enviados: 0, sem_contato: 0, falhas: [] });
  }

  const idsEmpresa = docs.map((d) => d.empresa_id).filter(Boolean) as string[];
  const { data: empresas } = idsEmpresa.length
    ? await supabase
        .from("empresas")
        .select("id, razao_social, contato_nome, contato_email")
        .in("id", idsEmpresa)
    : { data: [] as { id: string; razao_social: string; contato_nome: string | null; contato_email: string | null }[] };
  const mapaEmpresa = new Map((empresas ?? []).map((e) => [e.id, e]));

  const admin = createAdminClient();
  const base = new URL(req.url).origin;

  let enviados = 0;
  let semContato = 0;
  const falhas: { empresa: string; erro: string }[] = [];

  // como no laudo: a correção só é confiável quando é um documento só
  const umSo = docs.length === 1;
  const paraManual = umSo && corpo.para?.trim() ? corpo.para.trim() : null;
  const nomeManual = umSo && corpo.nome?.trim() ? corpo.nome.trim() : null;

  for (const d of docs) {
    const e = d.empresa_id ? mapaEmpresa.get(d.empresa_id) : null;
    // o digitado tem precedência: quem está na tela sabe mais que o CSV
    const para = paraManual || e?.contato_email || corpo.para || null;
    const nome = nomeManual || e?.contato_nome || corpo.nome || null;
    const rotulo = e?.razao_social || "Cenário avulso";

    if (e && paraManual && paraManual !== e.contato_email) {
      const patch: { contato_email: string; contato_nome?: string } = { contato_email: paraManual };
      if (nomeManual && nomeManual !== e.contato_nome) patch.contato_nome = nomeManual;
      await supabase.from("empresas").update(patch).eq("id", e.id);
    }

    if (!para) {
      semContato++;
      continue;
    }
    if (!d.token) {
      falhas.push({ empresa: rotulo, erro: "comparativo sem endereço público (rode a migration 0028)" });
      continue;
    }

    /**
     * CARIMBA A MARCA DO ESCRITÓRIO NO DOCUMENTO, uma vez só.
     *
     * A página pública não tem sessão de onde tirar nome, CRC e logotipo. Se
     * fosse buscar "o primeiro perfil", carimbaria o comparativo com o nome de
     * outro escritório — o pior defeito possível num documento entregue ao
     * cliente. Quem grava é quem envia, e só quem é dono do documento chega
     * aqui (a RLS de `comparativos` já filtrou acima).
     *
     * Não sobrescreve o que já existe: o documento é retrato de uma data, e a
     * marca faz parte do retrato.
     */
    if (!d.escritorio && t) {
      await supabase
        .from("comparativos")
        .update({ escritorio: { nome: t.nome, crc: t.crc, logo_url: t.logo_url } })
        .eq("id", d.id);
    }

    const r = d.resultado as unknown as ResultadoComparativo | null;

    const envio = await enviarEmail({
      para,
      nome: nome ?? undefined,
      assunto: `${rotulo} — comparativo de regimes nº ${String(d.numero).padStart(4, "0")}`,
      html: htmlComparativoCliente({
        empresa: rotulo,
        escritorio,
        link: `${base}/comparativo/${d.token}`,
        numero: d.numero,
        menor: r?.menor?.nome ?? null,
      }),
      tag: "comparativo-cliente",
      responderPara,
    });

    if (envio.enviado) enviados++;
    else falhas.push({ empresa: rotulo, erro: envio.motivo ?? "envio recusado" });

    // sem empresa vinculada não há dossiê onde o registro apareceria
    if (admin && d.empresa_id) {
      await admin.from("envios_cliente").insert({
        tenant_id: perfil?.tenant_id ?? null,
        empresa_id: d.empresa_id,
        tipo: "comparativo",
        documento_id: d.id,
        para,
        nome,
        assunto: `comparativo nº ${String(d.numero).padStart(4, "0")}`,
        status: envio.enviado ? "enviado" : "erro",
        erro: envio.enviado ? null : (envio.motivo ?? "envio recusado").slice(0, 300),
        caminho: envio.caminho,
      });
    }
  }

  return NextResponse.json({ ok: true, enviados, sem_contato: semContato, falhas });
}
