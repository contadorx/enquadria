import { createAdminClient } from "@/lib/supabase-admin";
import { enviarEmail } from "@/lib/email";
import { preencher } from "@/lib/cobranca";
import { onboardingDevido, type PassoOnboarding, type EstadoConta } from "@/lib/onboarding";

/**
 * A EXECUÇÃO DA RÉGUA DE ONBOARDING.
 *
 * Monta o retrato de cada conta (quantas empresas, análises e laudos) e deixa
 * a decisão para lib/onboarding, que é pura e testada.
 *
 * O RETRATO É MONTADO EM TRÊS CONSULTAS, não em três por conta. Com cem contas
 * a diferença é entre 3 e 300 idas ao banco num job que roda todo dia.
 */

export interface ResultadoOnboarding {
  hoje: string;
  simulacao: boolean;
  planejado: { conta: string; passo: string; para: string }[];
  enviados: number;
  falhas: number;
  erro?: string;
}

export async function executarOnboarding(
  hoje: string,
  simular: boolean
): Promise<ResultadoOnboarding> {
  const base: ResultadoOnboarding = { hoje, simulacao: simular, planejado: [], enviados: 0, falhas: 0 };

  const admin = createAdminClient();
  if (!admin) return { ...base, erro: "sem chave de serviço" };

  const { data: passosRaw } = await admin
    .from("onboarding_passos")
    .select("chave, evento, dias, assunto, corpo, ativo")
    .order("ordem");
  const passos = (passosRaw ?? []) as unknown as PassoOnboarding[];
  if (passos.length === 0) return { ...base, erro: "nenhum passo configurado" };

  const { data: contasRaw } = await admin
    .from("tenants")
    .select("id, nome, criado_em, is_teste, emails_optout, status");
  const contas = (contasRaw ?? []) as { id: string; nome?: string; criado_em: string; is_teste: boolean; emails_optout: boolean; status: string }[];
  if (contas.length === 0) return base;

  // os contadores, em três consultas para toda a base
  const [emp, ana, lau] = await Promise.all([
    admin.from("empresas").select("tenant_id"),
    admin.from("analises").select("tenant_id"),
    admin.from("laudos").select("tenant_id, emitido_em"),
  ]);

  const conta = (linhas: { tenant_id: string }[] | null) => {
    const m = new Map<string, number>();
    for (const l of linhas ?? []) m.set(l.tenant_id, (m.get(l.tenant_id) ?? 0) + 1);
    return m;
  };
  const nEmp = conta(emp.data as never);
  const nAna = conta(ana.data as never);
  const nLau = conta(lau.data as never);

  // a data do PRIMEIRO laudo de cada conta — âncora do passo de comemoração
  const primeiro = new Map<string, string>();
  for (const l of (lau.data ?? []) as { tenant_id: string; emitido_em: string }[]) {
    const d = (l.emitido_em ?? "").slice(0, 10);
    if (!d) continue;
    const atual = primeiro.get(l.tenant_id);
    if (!atual || d < atual) primeiro.set(l.tenant_id, d);
  }

  const { data: enviados } = await admin
    .from("onboarding_envios")
    .select("tenant_id, passo_chave");
  const ja = new Set((enviados ?? []).map((e) => `${e.tenant_id}|${e.passo_chave}`));

  const r = { ...base };

  for (const c of contas) {
    const estado: EstadoConta = {
      id: c.id,
      criado_em: (c.criado_em ?? "").slice(0, 10),
      is_teste: c.is_teste,
      emails_optout: c.emails_optout,
      status: c.status,
      empresas: nEmp.get(c.id) ?? 0,
      analises: nAna.get(c.id) ?? 0,
      laudos: nLau.get(c.id) ?? 0,
      primeiro_laudo_em: primeiro.get(c.id) ?? null,
    };

    const devidos = onboardingDevido(estado, passos, hoje, ja);
    if (devidos.length === 0) continue;

    const { data: perfil } = await admin
      .from("profiles")
      .select("email")
      .eq("tenant_id", c.id)
      .limit(1)
      .maybeSingle();
    const para = (perfil?.email as string) ?? "";
    if (!para) continue;

    const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
    for (const d of devidos) {
      const passo = passos.find((p) => p.chave === d.passo_chave);
      if (!passo) continue;

      const valores = {
        nome: c.nome ?? "",
        link_importar: `${site}/painel/importar`,
        link_painel: `${site}/painel`,
      };
      r.planejado.push({ conta: c.nome ?? c.id, passo: passo.chave, para });
      if (simular) continue;

      const env = await enviarEmail({
        para,
        assunto: preencher(passo.assunto, valores),
        html: preencher(passo.corpo, valores)
          .split("\n")
          .map((l) => (l.trim() ? `<p>${l}</p>` : ""))
          .join(""),
      });

      // grava a falha também: sem isso o dia seguinte reenviaria achando que
      // nunca mandou, e a pessoa receberia a régua inteira de uma vez
      await admin.from("onboarding_envios").insert({
        tenant_id: c.id,
        passo_chave: passo.chave,
        para,
        status: env.enviado ? "enviado" : "erro",
        erro: env.enviado ? null : (env.motivo ?? "falha desconhecida"),
      });

      if (env.enviado) r.enviados++;
      else r.falhas++;
      ja.add(`${c.id}|${passo.chave}`);
    }
  }

  return r;
}
