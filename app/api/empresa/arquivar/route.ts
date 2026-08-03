import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

/**
 * ARQUIVAR, DESARQUIVAR OU APAGAR UMA EMPRESA.
 *
 * A REGRA QUE DECIDE: só é permitido APAGAR de verdade quando nada foi
 * produzido — nenhuma análise, nenhum laudo, nenhum termo.
 *
 * O motivo não é técnico. Laudo e termo já foram entregues ao cliente final,
 * com código de verificação público. Apagar a empresa transformaria um
 * documento assinado num link quebrado — e quem abre esse link é justamente
 * quem tem motivo para desconfiar.
 *
 * Documento entregue é um fato do mundo, e o sistema não desfaz fato do mundo.
 * Por isso, com histórico, o máximo é arquivar.
 */

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });

  let corpo: { empresa_id?: string; acao?: "arquivar" | "desarquivar" | "apagar"; motivo?: string };
  try {
    corpo = await req.json();
  } catch {
    corpo = {};
  }

  const id = (corpo.empresa_id ?? "").trim();
  const acao = corpo.acao ?? "arquivar";
  if (!id) return NextResponse.json({ erro: "informe empresa_id" }, { status: 400 });

  // a RLS decide se esta empresa é da carteira deste contador
  const { data: empresa } = await supabase
    .from("empresas")
    .select("id, razao_social")
    .eq("id", id)
    .maybeSingle();
  if (!empresa) return NextResponse.json({ erro: "empresa não encontrada" }, { status: 404 });

  if (acao === "desarquivar") {
    const { error } = await supabase
      .from("empresas")
      .update({ arquivada_em: null, arquivada_motivo: null })
      .eq("id", id);
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, acao: "desarquivada" });
  }

  if (acao === "apagar") {
    // conta o que existe pendurado nesta empresa
    const { data: analises } = await supabase.from("analises").select("id").eq("empresa_id", id);
    const ids = (analises ?? []).map((a) => a.id as string);

    const [laudos, termos] = await Promise.all([
      ids.length
        ? supabase.from("laudos").select("id", { count: "exact", head: true }).in("analise_id", ids)
        : Promise.resolve({ count: 0 }),
      ids.length
        ? supabase.from("termos").select("id", { count: "exact", head: true }).in("analise_id", ids)
        : Promise.resolve({ count: 0 }),
    ]);

    const temDocumento = (laudos.count ?? 0) > 0 || (termos.count ?? 0) > 0;

    if (temDocumento) {
      return NextResponse.json(
        {
          erro:
            "Esta empresa já tem laudo ou termo emitido. Documento entregue ao cliente não pode virar link quebrado — arquive em vez de apagar; ela sai da fila e das contagens, e os documentos continuam verificáveis.",
          sugestao: "arquivar",
        },
        { status: 409 }
      );
    }

    // sem documento, apagar é seguro: as análises vão junto
    if (ids.length) await supabase.from("analises").delete().in("id", ids);
    const { error } = await supabase.from("empresas").delete().eq("id", id);
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, acao: "apagada" });
  }

  const { error } = await supabase
    .from("empresas")
    .update({
      arquivada_em: new Date().toISOString(),
      arquivada_motivo: (corpo.motivo ?? "").trim() || null,
    })
    .eq("id", id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, acao: "arquivada" });
}
