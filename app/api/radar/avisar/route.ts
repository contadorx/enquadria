import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { enviarEmail } from "@/lib/email";
import type { EmpresaRadar } from "@/lib/radar";
import {
  diagnosticarAviso, assuntoAviso, htmlAviso,
  type CarteiraDeTenant, type ItemPublicado,
} from "@/lib/radar-aviso";

/**
 * AVISAR OS ESCRITÓRIOS SOBRE UM ITEM DO RADAR.
 *
 * Esta rota é a única do radar que NÃO pode usar só a sessão: ela precisa ler
 * a carteira de TODOS os escritórios para saber quantas empresas de cada um o
 * item atinge, e a RLS — corretamente — impede isso. Então o desenho é o de
 * sempre quando o service role é inevitável: a autorização vem primeiro, pela
 * sessão, e só depois o cliente admin entra em cena.
 *
 * `?teste=1` devolve exatamente quem receberia e com que assunto, sem enviar
 * nada. Use sempre antes do envio de verdade: e-mail não tem CTRL+Z.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });

  const { data: perfil } = await supabase
    .from("profiles").select("is_superadmin").eq("id", user.id).maybeSingle();
  if (!(perfil as { is_superadmin?: boolean } | null)?.is_superadmin) {
    return NextResponse.json({ erro: "acesso restrito ao dono da plataforma" }, { status: 403 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { erro: "SUPABASE_SERVICE_ROLE_KEY ausente — sem ela não dá para medir a carteira dos outros escritórios" },
      { status: 503 }
    );
  }

  let corpo: { item_id?: string };
  try { corpo = await req.json(); } catch { return NextResponse.json({ erro: "corpo inválido" }, { status: 400 }); }
  if (!corpo.item_id) return NextResponse.json({ erro: "item_id obrigatório" }, { status: 400 });

  const apenasTeste = new URL(req.url).searchParams.get("teste") === "1";
  const hoje = new Date().toISOString().slice(0, 10);
  const base = new URL(req.url).origin;

  const { data: item } = await admin
    .from("radar_itens")
    .select("id, titulo, resumo, o_que_fazer, fonte, publicado_em, vigencia_em, severidade, criterio, ativo")
    .eq("id", corpo.item_id)
    .maybeSingle();
  if (!item) return NextResponse.json({ erro: "item não encontrado" }, { status: 404 });

  /* ── as carteiras, por escritório ─────────────────────────────────────── */
  const { data: perfis } = await admin
    .from("profiles").select("tenant_id, email, tenants(nome)").not("email", "is", null);

  const donos = new Map<string, { email: string; nome: string }>();
  for (const p of perfis ?? []) {
    if (!p.tenant_id || !p.email || donos.has(p.tenant_id)) continue;
    const t = p.tenants as { nome?: string } | { nome?: string }[] | null;
    donos.set(p.tenant_id, {
      email: p.email as string,
      nome: (Array.isArray(t) ? t[0]?.nome : t?.nome) || "Seu escritório",
    });
  }

  const { data: empresas } = await admin
    .from("empresas").select("id, tenant_id, razao_social, cnpj, anexo, faixa, cnae_principal");
  const { data: analises } = await admin.from("analises").select("empresa_id, saida");
  const saidaDe = new Map((analises ?? []).map((a) => [a.empresa_id as string, a.saida as string | null]));

  const porTenant = new Map<string, EmpresaRadar[]>();
  for (const e of empresas ?? []) {
    const t = e.tenant_id as string;
    if (!t) continue;
    if (!porTenant.has(t)) porTenant.set(t, []);
    porTenant.get(t)!.push({
      id: e.id as string,
      razao_social: e.razao_social as string,
      cnpj: e.cnpj as string,
      anexo: e.anexo as number | null,
      faixa: e.faixa as string | null,
      cnae_principal: e.cnae_principal as string | null,
      saida: saidaDe.get(e.id as string) ?? null,
      tem_analise: saidaDe.has(e.id as string),
    });
  }

  const carteiras: CarteiraDeTenant[] = Array.from(porTenant.entries()).map(([tenant_id, emps]) => ({
    tenant_id,
    escritorio: donos.get(tenant_id)?.nome ?? "Escritório",
    email: donos.get(tenant_id)?.email ?? null,
    empresas: emps,
  }));

  const { data: jaFoi } = await admin
    .from("radar_avisos").select("tenant_id").eq("item_id", item.id);

  const dx = diagnosticarAviso(
    item as unknown as ItemPublicado,
    carteiras,
    (jaFoi ?? []).map((x) => x.tenant_id as string)
  );

  if (dx.bloqueio) {
    return NextResponse.json({ erro: dx.bloqueio, ...dx }, { status: 400 });
  }

  if (apenasTeste) {
    return NextResponse.json({
      ok: true, teste: true, ...dx,
      previa: dx.alvos.map((a) => ({
        para: a.email, escritorio: a.escritorio, empresas: a.empresas,
        assunto: assuntoAviso(item as unknown as ItemPublicado, a.empresas, hoje),
      })),
    });
  }

  let enviados = 0;
  const falhas: { escritorio: string; motivo?: string }[] = [];

  for (const alvo of dx.alvos) {
    const envio = await enviarEmail({
      para: alvo.email,
      nome: alvo.escritorio,
      assunto: assuntoAviso(item as unknown as ItemPublicado, alvo.empresas, hoje),
      html: htmlAviso(item as unknown as ItemPublicado, alvo, base, hoje),
      tag: "radar",
    });

    if (!envio.enviado) { falhas.push({ escritorio: alvo.escritorio, motivo: envio.motivo }); continue; }

    /* O REGISTRO SÓ ENTRA DEPOIS DO ENVIO CONFIRMADO.
       Gravar antes seria mais simples e criaria o pior dos mundos: e-mail que
       não saiu, marcado como avisado, e o escritório nunca mais recebe. */
    await admin.from("radar_avisos").insert({
      item_id: item.id, tenant_id: alvo.tenant_id, canal: "imediato", empresas: alvo.empresas,
    });
    enviados++;
  }

  return NextResponse.json({ ok: true, enviados, falhas, ...dx });
}
