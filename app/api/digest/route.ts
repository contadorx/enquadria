import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { montarDigest, htmlDigest, type DadosDigest } from "@/lib/digest";
import { atingidas, ordenar, type ItemRadar, type EmpresaRadar } from "@/lib/radar";
import { enviarEmail } from "@/lib/email";
import { HONORARIO_PADRAO } from "@/lib/potencial";

/**
 * DIGEST MENSAL — roda pelo agendador, sem sessão de usuário.
 *
 * Protegida por CRON_SECRET: aceita o header do Vercel Cron (Authorization:
 * Bearer <CRON_SECRET>) ou o mesmo valor em ?segredo=. Sem o segredo
 * configurado, a rota se recusa a rodar — não existe digest "aberto".
 *
 * Use ?teste=1 para ver o que SERIA enviado, sem enviar nada.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FIM_JANELA = "2026-09-30";

function autorizado(req: Request): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return false;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${segredo}`) return true;
  const url = new URL(req.url);
  return url.searchParams.get("segredo") === segredo;
}

export async function GET(req: Request) {
  if (!autorizado(req)) {
    return NextResponse.json(
      { erro: "não autorizado — configure CRON_SECRET e envie o segredo" },
      { status: 401 }
    );
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json(
      { erro: "SUPABASE_SERVICE_ROLE_KEY ausente — o digest precisa dela para ler todos os workspaces" },
      { status: 503 }
    );
  }

  const url = new URL(req.url);
  const apenasTeste = url.searchParams.get("teste") === "1";
  const base = url.origin;
  const hoje = new Date().toISOString().slice(0, 10);
  const diasJanela = Math.ceil(
    (new Date(FIM_JANELA).getTime() - new Date(hoje).getTime()) / 86_400_000
  );

  // catálogo do radar é global — carrega uma vez
  const { data: itensRadar } = await supabase
    .from("radar_itens")
    .select("id, titulo, resumo, o_que_fazer, fonte, publicado_em, vigencia_em, severidade, criterio")
    .eq("ativo", true);
  const radarOrdenado = ordenar((itensRadar ?? []) as unknown as ItemRadar[], hoje);

  // escritórios com pelo menos um dono cadastrado
  const { data: perfis } = await supabase
    .from("profiles")
    .select("tenant_id, email, tenants(nome)")
    .not("email", "is", null);

  const porTenant = new Map<string, { email: string; nome: string }>();
  for (const p of perfis ?? []) {
    if (!p.tenant_id || !p.email || porTenant.has(p.tenant_id)) continue;
    const t = p.tenants as { nome?: string } | { nome?: string }[] | null;
    const nome = (Array.isArray(t) ? t[0]?.nome : t?.nome) || "Seu escritório";
    porTenant.set(p.tenant_id, { email: p.email, nome });
  }

  const relatorio: unknown[] = [];
  let enviados = 0;
  let pulados = 0;

  for (const [tenantId, dono] of Array.from(porTenant.entries())) {
    const { data: empresas } = await supabase
      .from("empresas")
      .select("id, razao_social, cnpj, anexo, faixa, cnae_principal")
      .eq("tenant_id", tenantId);
    if (!empresas?.length) {
      pulados++;
      continue;
    }

    const { data: analises } = await supabase
      .from("analises")
      .select("id, empresa_id, saida")
      .eq("tenant_id", tenantId);
    const ids = (analises ?? []).map((a) => a.id);

    const { count: laudos } = await supabase
      .from("laudos")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    const { data: termos } = ids.length
      ? await supabase.from("termos").select("assinatura_status, assinado_em").in("analise_id", ids)
      : { data: [] as { assinatura_status: string | null; assinado_em: string | null }[] };

    const porEmpresa = new Map((analises ?? []).map((a) => [a.empresa_id, a.saida]));
    const paraRadar: EmpresaRadar[] = empresas.map((e) => ({
      id: e.id,
      razao_social: e.razao_social,
      cnpj: e.cnpj,
      anexo: e.anexo,
      faixa: e.faixa,
      cnae_principal: e.cnae_principal,
      saida: porEmpresa.get(e.id) ?? null,
      tem_analise: porEmpresa.has(e.id),
    }));

    const afetados = new Set<string>();
    let marcos = 0;
    let tituloRadar: string | null = null;
    for (const item of radarOrdenado) {
      const alvo = atingidas(item, paraRadar);
      if (alvo.length) {
        marcos++;
        if (!tituloRadar) tituloRadar = item.titulo;
        alvo.forEach((x) => afetados.add(x.id));
      }
    }

    const dados: DadosDigest = {
      escritorio: dono.nome,
      fila: empresas.filter((e) => e.faixa === "A" || e.faixa === "B").length,
      analisadas: analises?.length ?? 0,
      laudos: laudos ?? 0,
      termos: (termos ?? []).length,
      assinados: (termos ?? []).filter((t) => t.assinatura_status === "assinado" || t.assinado_em).length,
      honorario: HONORARIO_PADRAO,
      radar_marcos: marcos,
      radar_clientes: afetados.size,
      radar_titulo: tituloRadar,
      dias_janela: diasJanela,
    };

    const digest = montarDigest(dados);
    if (!digest.vale_enviar) {
      pulados++;
      relatorio.push({ escritorio: dono.nome, enviado: false, motivo: digest.motivo_nao_enviar });
      continue;
    }

    if (apenasTeste) {
      relatorio.push({ escritorio: dono.nome, para: dono.email, assunto: digest.assunto, destaques: digest.destaques });
      continue;
    }

    const envio = await enviarEmail({
      para: dono.email,
      nome: dono.nome,
      assunto: digest.assunto,
      html: htmlDigest(digest, dono.nome, base),
    });
    if (envio.enviado) enviados++;
    relatorio.push({
      escritorio: dono.nome,
      enviado: envio.enviado,
      motivo: envio.motivo,
      assunto: digest.assunto,
    });
  }

  return NextResponse.json({
    ok: true,
    modo: apenasTeste ? "teste (nada foi enviado)" : "envio",
    escritorios: porTenant.size,
    enviados,
    pulados,
    relatorio,
  });
}
