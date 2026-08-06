import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

/**
 * QUANTAS EMPRESAS ESTE CRITÉRIO ALCANÇA — perguntado ANTES de publicar.
 *
 * O erro típico do radar não é de sintaxe: é de escopo. Publicar para todo
 * mundo um item que só vale para o Anexo IV enche a tela de quem não tem nada a
 * ver com aquilo — e é assim que o contador aprende a não abrir a aba.
 *
 * Escopo errado não dá erro. Este número é o único sinal que existe.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = createClient();
  let corpo: { criterio?: Record<string, unknown> };
  try { corpo = await req.json(); } catch { return NextResponse.json({ erro: "corpo inválido" }, { status: 400 }); }

  const { data, error } = await supabase
    .rpc("radar_alcance", { p_criterio: corpo.criterio ?? {} })
    .maybeSingle();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  const d = data as { empresas?: number; escritorios?: number; com_analise?: number } | null;
  return NextResponse.json({
    empresas: Number(d?.empresas ?? 0),
    escritorios: Number(d?.escritorios ?? 0),
    com_analise: Number(d?.com_analise ?? 0),
  });
}
