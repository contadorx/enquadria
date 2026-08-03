import { NextResponse } from "next/server";
import { executarRegua } from "@/lib/cobranca-executar";

/**
 * DISPARO MANUAL DA RÉGUA — HOJE APENAS SIMULAÇÃO SEGURA.
 *
 * ⚠️ ATENÇÃO: este motor é PARALELO ao de `lib/reguas.ts`, que já manda
 * cobrança e já roda no cron. Enquanto os dois existirem, disparar este aqui
 * com `simular=0` manda a segunda cópia da mesma cobrança para o cliente.
 *
 * Por isso o envio real está BLOQUEADO nesta rota até a consolidação: só
 * `?simular=1` passa. Bloquear é melhor que confiar em quem chama lembrar.
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

  if (!simular) {
    return NextResponse.json(
      {
        erro:
          "Envio real bloqueado: lib/reguas.ts já manda cobrança pelo cron. Disparar daqui enviaria a segunda cópia. Use ?simular=1 ou consolide os dois motores primeiro.",
      },
      { status: 409 }
    );
  }

  const r = await executarRegua(hoje, simular);
  return NextResponse.json({ ok: !r.erro, ...r });
}
