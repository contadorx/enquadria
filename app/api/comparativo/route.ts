import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import {
  compararRegimes,
  PREMISSAS_PADRAO,
  type EntradaComparativo,
  type Premissas,
} from "@/lib/comparativo";
import { situacaoPlano, type Assinatura } from "@/lib/plano";

/**
 * Emite o comparativo de regimes como documento numerado e arquivado.
 *
 * Mesma regra do laudo: a TELA é livre (o contador explora à vontade), o
 * DOCUMENTO com a marca dele é o que exige plano pago. E o cálculo é refeito no
 * servidor — o cliente nunca dita o número que vai para um papel assinado.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });

  let corpo: { empresa_id?: string | null; entrada: EntradaComparativo; premissas?: Premissas };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }
  if (!corpo?.entrada?.receita) {
    return NextResponse.json({ erro: "informe ao menos a receita anual" }, { status: 400 });
  }

  // gate: documento é do plano pago
  const { data: assinRaw } = await supabase.rpc("assinatura_ativa");
  const assinatura = (Array.isArray(assinRaw) ? assinRaw[0] : assinRaw) as Assinatura | null;
  const { count } = await supabase.from("laudos").select("id", { count: "exact", head: true });
  const situacao = situacaoPlano(assinatura, count ?? 0);
  if (!situacao.ilimitado) {
    return NextResponse.json(
      {
        erro: "O comparativo impresso faz parte do plano PRO. Na versão gratuita ele fica disponível na tela.",
        bloqueado_por_plano: true,
      },
      { status: 402 }
    );
  }

  const premissas = { ...PREMISSAS_PADRAO, ...(corpo.premissas ?? {}) };
  const resultado = compararRegimes(corpo.entrada, premissas);

  const { data, error } = await supabase
    .rpc("emitir_comparativo", {
      p_empresa: corpo.empresa_id ?? null,
      p_entrada: corpo.entrada,
      p_premissas: premissas,
      p_resultado: resultado,
    })
    .single();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  const doc = data as { id: string; numero: number };
  return NextResponse.json({ ok: true, comparativo_id: doc.id, numero: doc.numero });
}
