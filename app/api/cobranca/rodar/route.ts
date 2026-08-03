import { NextResponse } from "next/server";
import { executarRegua } from "@/lib/cobranca-executar";

/**
 * DISPARO MANUAL DA RÉGUA — e, principalmente, a SIMULAÇÃO.
 *
 * O cron diário já roda a régua sozinho (/api/cron/negocio). Esta rota existe
 * para duas coisas que o cron não dá: rodar fora de hora quando algo falhou, e
 * `?simular=1`, que mostra exatamente o que sairia sem mandar nada.
 *
 * A simulação não é conforto: régua de cobrança que só pode ser conferida
 * mandando e-mail de verdade é régua que ninguém confere antes de ligar.
 *
 * `?hoje=AAAA-MM-DD` permite ver o que sai num dia futuro — dá para conferir a
 * régua inteira de um ciclo em cinco chamadas, hoje.
 */

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const segredo = process.env.CRON_SECRET;
  const dado = req.headers.get("x-cron-secret") ?? url.searchParams.get("segredo");
  if (!segredo || dado !== segredo) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const hoje = (url.searchParams.get("hoje") ?? new Date().toISOString()).slice(0, 10);
  const simular = url.searchParams.get("simular") === "1";

  const r = await executarRegua(hoje, simular);
  return NextResponse.json({ ok: !r.erro, ...r });
}
