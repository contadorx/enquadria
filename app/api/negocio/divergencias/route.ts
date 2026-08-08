import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { recalcular } from "@/lib/recalculo";
import { MOTOR_VERSAO } from "@/lib/motor";
import type { AnaliseGravada } from "@/lib/laudo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * A VARREDURA HISTÓRICA — quantos documentos assinados o motor de hoje
 * contradiz.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO PRECISA EXISTIR, E POR QUE É SÓ LEITURA
 *
 * O motor mudou três vezes em duas semanas: `re_liquido` nos passos 4 e 7, o
 * passo 6 (absorção que cabe vira S3), o epsilon das bordas. Cada mudança foi
 * uma correção — e correção de árvore de decisão significa que ANÁLISES
 * ANTERIORES podem decidir diferente hoje.
 *
 * A emissão já se protege: `garantirAnaliseCoerente` refaz a conta antes de
 * congelar o laudo. O que ninguém olhou é o ESTOQUE — os laudos que já saíram,
 * com a assinatura do contador, sob uma árvore que mudou depois.
 *
 * `recalcular()` faz a única comparação honesta possível: a LÓGICA de hoje
 * sobre os PARÂMETROS congelados daquele dia. Misturar as duas mudanças (a da
 * árvore e a da alíquota) diria que tudo divergiu, e não diria por quê.
 *
 * ---------------------------------------------------------------------------
 * NÃO ESCREVE NADA. De propósito, e a razão não é técnica:
 *
 *   · reescrever análise antiga apagaria a que sustenta um laudo assinado;
 *   · avisar 400 contadores de uma vez, antes de saber o tamanho, é criar um
 *     incidente de confiança maior que o defeito;
 *   · e pode ser que o número seja zero — nesse caso não existe problema, só
 *     uma preocupação minha.
 *
 * Medir primeiro. É a mesma regra que eu aplico a conteúdo e a produto, e ela
 * vale em dobro quando o passo seguinte é falar com quem assinou.
 */
export async function GET(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });

  // schema-ok: profiles.is_superadmin é criada pela migration 0020
  const { data: perfil } = await supabase
    .from("profiles")
    .select("is_superadmin")
    .eq("id", user.id)
    .maybeSingle();
  if (!perfil?.is_superadmin) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 403 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ erro: "sem credencial de serviço" }, { status: 500 });

  const detalhar = new URL(req.url).searchParams.get("detalhe") === "1";

  // schema-ok: analises.parametros existe desde a 0006
  const { data: analises, error } = await admin
    .from("analises")
    .select("id, empresa_id, saida, respostas, parametros, calculado_em")
    .limit(5000);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  /* só interessa o que virou PAPEL: análise sem laudo é rascunho, e rascunho
     que muda de saída é o produto funcionando, não um defeito */
  const { data: laudos } = await admin.from("laudos").select("analise_id, numero, emitido_em");
  const comLaudo = new Map(
    (laudos ?? []).map((l) => [l.analise_id as string, l as { numero: number; emitido_em: string }])
  );

  let semParametros = 0;
  const divergentes: {
    analise_id: string;
    laudo: number | null;
    emitido_em: string | null;
    de: string | null;
    para: string | null;
  }[] = [];

  for (const a of (analises ?? []) as unknown as AnaliseGravada[] & { id: string }[]) {
    const r = recalcular(a as AnaliseGravada);
    if (r.impedimento) {
      semParametros++;
      continue;
    }
    if (!r.mudou) continue;
    const l = comLaudo.get((a as { id: string }).id);
    divergentes.push({
      analise_id: (a as { id: string }).id,
      laudo: l?.numero ?? null,
      emitido_em: l?.emitido_em ?? null,
      de: r.de,
      para: r.para,
    });
  }

  const comPapel = divergentes.filter((d) => d.laudo != null);

  return NextResponse.json({
    motor_de_hoje: MOTOR_VERSAO,
    analisadas: analises?.length ?? 0,
    com_laudo: comLaudo.size,
    /* não dá para recalcular sem o dDAS congelado — e inventar a premissa que
       mais move o resultado seria pior que não saber */
    sem_como_recalcular: semParametros,
    divergem: divergentes.length,
    divergem_com_laudo_emitido: comPapel.length,
    /* a lista só sai sob pedido: é dado de cliente de outro escritório, e
       resumo basta para decidir se há problema */
    detalhe: detalhar ? comPapel.slice(0, 100) : undefined,
  });
}
