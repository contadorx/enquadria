import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * O CRON DO NEGÓCIO, EXTRAÍDO — porque agora ele tem dois gatilhos.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * POR QUE ISTO SAIU DA ROTA.
 *
 * O painel já tinha "Enviar agora", e ele chamava só `executarReguas`. O cron
 * de verdade faz mais três coisas: conta (e às vezes marca) as assinaturas
 * vencidas, respeita a trava de horário comercial, e tira a foto da receita.
 *
 * Quer dizer: o botão dizia "rodar" e rodava DIFERENTE do que roda sozinho às
 * 9h. Duas execuções com o mesmo nome e comportamentos distintos é a receita
 * do diagnóstico errado — você aperta o botão para reproduzir um problema do
 * cron e reproduz outra coisa.
 *
 * Agora existe uma função só. A rota do cron a chama com o segredo; a tela a
 * chama com a sessão do superadmin. O que difere é QUEM autoriza, nunca o que
 * acontece.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * O QUE `forcar` FAZ, e por que ele é explícito.
 *
 * Fora do horário comercial o motor roda em modo simulação — e isso é
 * deliberado: e-mail que chega às 3h é lido às 9h junto com todos os outros.
 * `forcar` atravessa essa trava. É o que o botão do painel usa quando você
 * clica "Forçar envio agora" às 22h, e é por isso que o botão diz "forçar" em
 * vez de "rodar": o nome tem de admitir que está passando por cima de uma
 * regra.
 */

export interface ResultadoCron {
  ok: true;
  modo: string;
  horario_br: string;
  dentro_do_horario: boolean;
  vencidas_encontradas: number;
  vencidas_marcadas: number;
  reguas: { planejados: number; enviados: number; semEmail: number };
  foto: unknown;
  lista?: unknown[];
  erros: string[];
}

export interface OpcoesCron {
  /** planeja e devolve a lista sem enviar nada */
  simular?: boolean;
  /** atravessa a trava de horário comercial */
  forcar?: boolean;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = SupabaseClient<any, any, any>;

export async function rodarCronNegocio(supabase: Db, opcoes: OpcoesCron = {}): Promise<ResultadoCron> {
  const simular = opcoes.simular === true;
  const forcar = opcoes.forcar === true;
  const erros: string[] = [];

  /* assinaturas vencidas: por padrão só CONTA. Marcar tira o acesso, e isso é
     decisão de negócio — liga em plataforma_config → cobranca.bloquear_automatico. */
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

  const { emHorarioDeEnvio } = await import("@/lib/reguas");
  const dentroDoHorario = emHorarioDeEnvio(new Date());
  const podeEnviar = simular || forcar || dentroDoHorario;

  let reguas = { planejados: 0, enviados: 0, semEmail: 0 };
  let lista: unknown[] = [];
  const modo = simular
    ? "teste (nada foi enviado)"
    : podeEnviar
      ? forcar && !dentroDoHorario
        ? "envio FORÇADO fora do horário comercial"
        : "envio"
      : "fora do horário comercial (nada foi enviado)";

  try {
    const { executarReguas } = await import("@/lib/reguas");
    const r = await executarReguas(supabase, { simular: simular || !podeEnviar });
    reguas = { planejados: r.planejados, enviados: r.enviados, semEmail: r.semEmail };
    if (r.erros.length) erros.push(...r.erros.slice(0, 10));

    /**
     * ZERO PLANEJADOS COM ZERO ERROS É UMA AFIRMAÇÃO, não um silêncio.
     *
     * Foi exatamente o que esta rotina respondeu por dias enquanto a tela
     * mostrava 16 na fila — porque a RPC que lê os escritórios barrava a
     * service role e o erro era descartado (0042).
     */
    if (r.planejados === 0 && !r.erros.length) {
      erros.push("nada planejado — confira se há escritório na base e se as réguas estão ligadas");
    }
    if (simular) {
      lista = r.lista.map((e) => ({
        escritorio: e.escritorio, regra: e.nome_regra, motivo: e.motivo, para: e.para, assunto: e.assunto,
      }));
    }
  } catch (e) {
    erros.push(`reguas: ${e instanceof Error ? e.message : "erro"}`);
  }

  /* O BATIMENTO — a resposta para "o motor está rodando?". Falhar aqui não
     pode derrubar nada: diagnóstico nunca atrapalha a função. */
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
    /* idem */
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

  return {
    ok: true,
    modo,
    horario_br: `${(new Date().getUTCHours() + 21) % 24}h`,
    dentro_do_horario: dentroDoHorario,
    vencidas_encontradas: vencidas.ids.length,
    vencidas_marcadas: vencidas.marcadas,
    reguas,
    foto,
    ...(simular ? { lista } : {}),
    erros,
  };
}
