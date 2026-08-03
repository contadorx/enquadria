import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { situacaoPlano, mensagemBloqueio, montarMuro, type Assinatura } from "@/lib/plano";
import { HONORARIO_PADRAO } from "@/lib/potencial";

/**
 * Emite o laudo de uma análise (RPC atômica que numera por tenant).
 *
 * GATE DO FREEMIUM: a trava vive AQUI, no servidor. Esconder o botão na tela não
 * é gate — é sugestão. O limite incide sobre a emissão, nunca sobre analisar:
 * o contador vê a carteira inteira de graça e só esbarra no muro quando vai
 * transformar a análise em documento com a marca dele.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });

  let corpo: { analise_id: string };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }
  if (!corpo.analise_id) {
    return NextResponse.json({ erro: "analise_id obrigatório" }, { status: 400 });
  }

  // reemitir um laudo que já existe nunca consome cota
  const { data: jaExiste } = await supabase
    .from("laudos")
    .select("id")
    .eq("analise_id", corpo.analise_id)
    .maybeSingle();

  if (!jaExiste) {
    const { data: assinRaw } = await supabase.rpc("assinatura_ativa");
    const assinatura = (Array.isArray(assinRaw) ? assinRaw[0] : assinRaw) as Assinatura | null;

    const { count } = await supabase
      .from("laudos")
      .select("id", { count: "exact", head: true });

    const situacao = situacaoPlano(assinatura, count ?? 0);
    if (situacao.bloqueado) {
      // O PREÇO VEM DO BANCO, não de constante no código. O muro cita um valor
      // ao lado do honorário do contador; se essa cifra divergir da página de
      // planos, o argumento inteiro perde a força — e é o tipo de divergência
      // que ninguém percebe até um cliente apontar. Pego o plano público mais
      // caro, que é o anual.
      const { data: plano } = await supabase
        .from("planos")
        .select("preco_centavos")
        .eq("ativo", true)
        .eq("publico", true)
        .gt("preco_centavos", 0)
        .order("preco_centavos", { ascending: false })
        .limit(1)
        .maybeSingle();

      return NextResponse.json(
        {
          erro: mensagemBloqueio(situacao),
          bloqueado_por_plano: true,
          usados: situacao.usados,
          limite: situacao.limite,
          muro: montarMuro(situacao, HONORARIO_PADRAO, plano?.preco_centavos ?? null),
        },
        { status: 402 }
      );
    }
  }

  const { data, error } = await supabase
    .rpc("emitir_laudo", { p_analise: corpo.analise_id })
    .single();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  const laudo = data as { id: string; numero: number };
  return NextResponse.json({ ok: true, laudo_id: laudo.id, numero: laudo.numero });
}
