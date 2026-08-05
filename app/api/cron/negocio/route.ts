import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { rodarCronNegocio } from "@/lib/cron-negocio";

/**
 * CRON DO NEGÓCIO — réguas proativas, vencidas e foto da receita.
 *
 * Esta rota é só a PORTA: autentica pelo CRON_SECRET e delega. O que roda mora
 * em `lib/cron-negocio.ts`, e o botão do painel chama exatamente a mesma
 * função. Enquanto os dois caminhos foram códigos diferentes, apertar o botão
 * para reproduzir um problema do cron reproduzia outra coisa — o botão só
 * chamava as réguas, e o cron também conta vencidas, respeita a trava de
 * horário e tira a foto da receita.
 *
 * Proteção: CRON_SECRET no header do Vercel Cron (Authorization: Bearer …) ou
 * em ?segredo=. Sem segredo configurado, não roda.
 *
 * ?teste=1  planeja e devolve a lista sem enviar nada — é assim que se confere
 *           uma régua nova antes de deixá-la solta na base.
 * ?forcar=1 atravessa a trava de horário comercial.
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
  return NextResponse.json(
    await rodarCronNegocio(supabase, {
      simular: url.searchParams.get("teste") === "1",
      forcar: url.searchParams.get("forcar") === "1",
    })
  );
}
