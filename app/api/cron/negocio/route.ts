import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * CRON DO NEGÓCIO — réguas proativas + foto da receita.
 *
 * Mesma proteção do digest: CRON_SECRET no header do Vercel Cron
 * (Authorization: Bearer …) ou em ?segredo=. Sem segredo configurado, não roda.
 *
 * ?teste=1 PLANEJA e devolve a lista sem enviar nada — é assim que se confere
 * uma régua nova antes de deixá-la solta na base.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function autorizado(req: Request): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return false;
  if (req.headers.get("authorization") === `Bearer ${segredo}`) return true;
  return new URL(req.url).searchParams.get("segredo") === segredo;
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
      { erro: "SUPABASE_SERVICE_ROLE_KEY ausente — o cron precisa dela para ler todos os escritórios" },
      { status: 503 }
    );
  }

  const url = new URL(req.url);
  const simular = url.searchParams.get("teste") === "1";
  const erros: string[] = [];

  // assinaturas vencidas: por padrão só CONTA. Marcar tira o acesso, e isso é
  // decisão de negócio — liga em plataforma_config → cobranca.bloquear_automatico.
  let vencidas = { ids: [] as string[], marcadas: 0 };
  try {
    const { data: cfg } = await supabase
      .from("plataforma_config").select("valor").eq("chave", "cobranca").maybeSingle();
    const marcar = (cfg as { valor?: { bloquear_automatico?: boolean } } | null)?.valor?.bloquear_automatico === true;
    const { vencidasPendentes } = await import("@/lib/reguas");
    vencidas = await vencidasPendentes(supabase, { marcar: marcar && !simular });
  } catch (e) {
    erros.push(`vencidas: ${e instanceof Error ? e.message : "erro"}`);
  }

  let reguas: { planejados: number; enviados: number; semEmail: number } = {
    planejados: 0, enviados: 0, semEmail: 0,
  };
  let lista: unknown[] = [];
  try {
    const { executarReguas } = await import("@/lib/reguas");
    const r = await executarReguas(supabase, { simular });
    reguas = { planejados: r.planejados, enviados: r.enviados, semEmail: r.semEmail };
    if (r.erros.length) erros.push(...r.erros.slice(0, 10));
    if (simular) {
      lista = r.lista.map((e) => ({
        escritorio: e.escritorio, regra: e.nome_regra, motivo: e.motivo, para: e.para, assunto: e.assunto,
      }));
    }
  } catch (e) {
    erros.push(`reguas: ${e instanceof Error ? e.message : "erro"}`);
  }

  let foto: unknown = null;
  if (!simular) {
    try {
      const { data } = await supabase.rpc("negocio_snapshot");
      foto = Array.isArray(data) ? data[0] : data;
    } catch (e) {
      erros.push(`snapshot: ${e instanceof Error ? e.message : "erro"}`);
    }
  }

  return NextResponse.json({
    ok: true,
    modo: simular ? "teste (nada foi enviado)" : "envio",
    vencidas_encontradas: vencidas.ids.length,
    vencidas_marcadas: vencidas.marcadas,
    reguas,
    foto,
    ...(simular ? { lista } : {}),
    erros,
  });
}
