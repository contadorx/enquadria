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

  /**
   * A TRAVA DE HORÁRIO — nova em 03/08, junto com o cron de hora em hora.
   *
   * O cron passou de uma vez ao dia para toda hora, para diluir os disparos.
   * Sem esta trava, "toda hora" incluiria a madrugada — e e-mail que chega às
   * 3h é lido às 9h junto com todos os outros: perde-se o efeito da diluição e
   * fica só o incômodo.
   *
   * `forcar=1` permite testar fora do horário sem esperar amanhã.
   */
  const { emHorarioDeEnvio } = await import("@/lib/reguas");
  const forcar = new URL(req.url).searchParams.get("forcar") === "1";
  const dentroDoHorario = emHorarioDeEnvio(new Date());
  const podeEnviar = simular || forcar || dentroDoHorario;

  let reguas: { planejados: number; enviados: number; semEmail: number } = {
    planejados: 0, enviados: 0, semEmail: 0,
  };
  let lista: unknown[] = [];
  const modo = simular
    ? "teste (nada foi enviado)"
    : podeEnviar
      ? "envio"
      : "fora do horário comercial (nada foi enviado)";

  try {
    const { executarReguas } = await import("@/lib/reguas");
    // fora do horário, roda em modo simulação: o log mostra o que sairia,
    // sem mandar nada — assim o cron das 4h da manhã continua sendo útil
    const r = await executarReguas(supabase, { simular: simular || !podeEnviar });
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

  /**
   * O BATIMENTO — a resposta para "o motor está rodando?".
   *
   * Sem isto, a única evidência de que o cron existe é o e-mail que chega. E
   * quando NÃO chega, não há como distinguir três causas muito diferentes: o
   * cron nunca rodou (CRON_SECRET ausente devolve 401 em silêncio), rodou fora
   * do horário comercial, ou rodou e não tinha nada para mandar.
   *
   * A tela de Negócio → E-mails lê esta chave. Falhar aqui não pode derrubar o
   * cron: diagnóstico nunca atrapalha a função.
   */
  try {
    await supabase.from("plataforma_config").upsert(
      {
        chave: "reguas_execucao",
        valor: {
          em: new Date().toISOString(),
          modo,
          planejados: reguas.planejados,
          enviados: reguas.enviados,
          travados: reguas.semEmail,
          erros: erros.slice(0, 3),
        },
        descricao: "Última execução do motor de réguas — diagnóstico do painel de e-mails.",
      },
      { onConflict: "chave" }
    );
  } catch {
    /* o batimento é diagnóstico: nunca pode impedir o envio */
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

  /**
   * UM MOTOR SÓ — `lib/reguas.ts`.
   *
   * Em 03/08 chegaram a existir dois: `cobranca-executar` e
   * `onboarding-executar`, escritos sem que se tivesse olhado que este aqui já
   * fazia as duas coisas, com copy em tabela e tela de edição. Ligados juntos,
   * o mesmo cliente receberia a mesma cobrança por dois caminhos, e a trava de
   * um não enxergava a do outro.
   *
   * Os dois foram removidos e o que tinham de melhor veio para cá: os degraus
   * `cobranca_no_dia` e `cobranca_d10`, e os testes da escada e da regra de
   * parar, em testes/reguas.test.mjs.
   */

  return NextResponse.json({
    ok: true,
    modo,
    horario_br: `${(new Date().getUTCHours() + 21) % 24}h`,
    vencidas_encontradas: vencidas.ids.length,
    vencidas_marcadas: vencidas.marcadas,
    reguas,
    foto,
    ...(simular ? { lista } : {}),
    erros,
  });
}
