import { NextResponse } from "next/server";
import { varrerEntregas, type MensagemReenvio } from "@/lib/entrega-server";
import { enviarPelaBrevo } from "@/lib/brevo";

/**
 * A VARREDURA DA ENTREGA — o que fecha a garantia.
 *
 * O envio registra a mensagem como ACEITA. O webhook confirma a que chegou.
 * Esta rota cuida do resto: o que ficou aceito além da janela é considerado
 * perdido, reenviado pela Brevo, e a taxa de perda abre ou fecha o disjuntor.
 *
 * Sem ela, o registro seria só um log bonito — e a mensagem represada
 * continuaria represada.
 *
 * Roda de 15 em 15 minutos. Protegida pelo mesmo CRON_SECRET das outras.
 * `?teste=1` examina e devolve o diagnóstico sem reenviar nada — é assim que
 * se confere o efeito antes de deixar o cron solto.
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

  const teste = new URL(req.url).searchParams.get("teste") === "1";

  /* em teste, o "envio" não manda nada e diz que deu certo: serve para ver
     QUANTAS mensagens seriam reenviadas antes de deixar o cron solto */
  const enviar = teste
    ? async () => ({ enviado: true as const })
    : (m: MensagemReenvio) => enviarPelaBrevo(m);

  const r = await varrerEntregas(enviar);

  return NextResponse.json({
    ok: true,
    teste,
    examinadas: r.examinadas,
    reenviadas: r.reenviadas,
    desistidas: r.desistidas,
    sem_corpo: r.semCorpo,
    corpos_apagados: r.corposApagados,
    cega: r.cega,
    aviso: r.aviso,
    disjuntor: r.disjuntor,
    mudou_estado: r.mudou,
    erros: r.erros,
  });
}
