import { createAdminClient } from "@/lib/supabase-admin";
import { enviarEmail } from "@/lib/email";
import {
  devidosHoje,
  competenciaDe,
  preencher,
  moedaBR,
  dataBR,
  type PassoCobranca,
  type ContaCobravel,
} from "@/lib/cobranca";

/**
 * A EXECUÇÃO DA RÉGUA — um lugar só, chamado de dois.
 *
 * Vive aqui e não dentro de uma rota porque duas entradas precisam dela: o
 * cron diário de negócio e a rota manual de simulação. Se cada uma tivesse a
 * própria cópia, elas divergiriam na primeira correção — e a divergência
 * apareceria como "simulei e saiu diferente do que mandou", que é o pior jeito
 * de descobrir um bug de cobrança.
 *
 * A DECISÃO de quem recebe o quê não está aqui: está em lib/cobranca, que é
 * pura e testada. Este arquivo só lê o banco, entrega e registra.
 */

export interface ResultadoRegua {
  hoje: string;
  simulacao: boolean;
  contas_avaliadas: number;
  planejado: { conta: string; passo: string; para: string; assunto: string }[];
  enviados: number;
  falhas: number;
  erro?: string;
}

export async function executarRegua(
  hoje: string,
  simular: boolean
): Promise<ResultadoRegua> {
  const vazio: ResultadoRegua = {
    hoje,
    simulacao: simular,
    contas_avaliadas: 0,
    planejado: [],
    enviados: 0,
    falhas: 0,
  };

  const admin = createAdminClient();
  if (!admin) return { ...vazio, erro: "sem chave de serviço" };

  const { data: passosRaw } = await admin
    .from("cobranca_passos")
    .select("chave, momento, dias, assunto, corpo, ativo")
    .order("ordem");
  const passos = (passosRaw ?? []) as unknown as PassoCobranca[];
  if (passos.length === 0) return { ...vazio, erro: "nenhum passo configurado" };

  const { data: contasRaw } = await admin
    .from("tenants")
    .select(
      "id, nome, status, is_teste, acesso_cortesia, emails_optout, proximo_vencimento, ultimo_pagamento, valor_mensal"
    );
  const contas = (contasRaw ?? []) as unknown as (ContaCobravel & { nome?: string })[];

  // o que já saiu, numa consulta só — não uma por conta
  const competencias = Array.from(
    new Set(
      contas
        .map((c) => (c.proximo_vencimento ? competenciaDe(c.proximo_vencimento) : ""))
        .filter(Boolean)
    )
  );
  const { data: enviados } = competencias.length
    ? await admin
        .from("cobranca_envios")
        .select("tenant_id, passo_chave, competencia")
        .in("competencia", competencias)
    : { data: [] };
  const jaEnviados = new Set(
    (enviados ?? []).map((e) => `${e.tenant_id}|${e.passo_chave}|${e.competencia}`)
  );

  const r: ResultadoRegua = { ...vazio, contas_avaliadas: contas.length };

  for (const conta of contas) {
    const devidos = devidosHoje(conta, passos, hoje, jaEnviados);
    if (devidos.length === 0) continue;

    const { data: perfil } = await admin
      .from("profiles")
      .select("email")
      .eq("tenant_id", conta.id)
      .limit(1)
      .maybeSingle();
    const para = (perfil?.email as string) ?? "";
    if (!para) continue;

    for (const d of devidos) {
      const passo = passos.find((p) => p.chave === d.passo_chave);
      if (!passo) continue;

      const valores = {
        competencia: d.competencia,
        vencimento: dataBR(d.vencimento),
        valor: moedaBR(conta.valor_mensal),
        link: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/painel/planos`,
        nome: conta.nome ?? "",
      };
      const assunto = preencher(passo.assunto, valores);
      r.planejado.push({ conta: conta.nome ?? conta.id, passo: passo.chave, para, assunto });

      if (simular) continue;

      const env = await enviarEmail({
        para,
        assunto,
        html: preencher(passo.corpo, valores)
          .split("\n")
          .map((l) => (l.trim() ? `<p>${l}</p>` : ""))
          .join(""),
      });

      // A FALHA TAMBÉM É GRAVADA. Se sumisse do registro, o dia seguinte
      // tentaria de novo achando que nunca mandou — e no dia em que o e-mail
      // voltasse a funcionar, o cliente receberia a régua inteira de uma vez.
      await admin.from("cobranca_envios").insert({
        tenant_id: d.tenant_id,
        passo_chave: d.passo_chave,
        competencia: d.competencia,
        para,
        status: env.enviado ? "enviado" : "erro",
        erro: env.enviado ? null : (env.motivo ?? "falha desconhecida"),
      });

      if (env.enviado) r.enviados++;
      else r.falhas++;
    }
  }

  return r;
}
