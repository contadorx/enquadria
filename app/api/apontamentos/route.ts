import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import type { StatusApontamento } from "@/lib/apontamentos";

/**
 * OS APONTAMENTOS DE UMA EMPRESA — ler e decidir.
 *
 * A geração é do cron (uma vez por dia, 05h). Aqui só se lê o que ele produziu
 * e se registra a decisão do contador sobre cada um.
 *
 * A separação é de propósito: gerar é trabalho de máquina sobre a carteira
 * inteira; decidir é trabalho de gente sobre um caso. Misturar os dois numa
 * rota só faria a tela do contador esperar por uma varredura.
 */

const VALIDOS: StatusApontamento[] = ["novo", "tratado", "nao_se_aplica", "virou_servico"];

export async function GET(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });

  const empresa = new URL(req.url).searchParams.get("empresa");
  if (!empresa) return NextResponse.json({ erro: "empresa obrigatória" }, { status: 400 });

  /* a matéria vem junto: o apontamento sozinho é um id, e o contador precisa
     ler o que a norma diz para decidir se trata ou se não se aplica */
  const { data, error } = await supabase
    .from("apontamentos")
    // schema-ok: apontamentos vem da 0063; as colunas entre parênteses são o join com radar_itens
    .select(
      "id, status, nota, criado_em, tratado_em, radar_itens(id, titulo, resumo, o_que_fazer, fonte, severidade, vigencia_em, publicado_em)"
    )
    .eq("empresa_id", empresa)
    .order("criado_em", { ascending: false });

  /**
   * A MIGRATION PODE NÃO TER RODADO — e isso não pode derrubar o dossiê.
   *
   * Mesma decisão da leitura de propostas: falha aqui devolve lista vazia e o
   * resto da tela continua funcionando. Um bloco a menos é incômodo; a ficha da
   * empresa inteira em branco por causa de um bloco é um beco.
   */
  if (error) return NextResponse.json({ apontamentos: [], indisponivel: true });

  return NextResponse.json({ apontamentos: data ?? [] });
}

export async function PATCH(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });

  let corpo: { id?: string; ids?: string[]; status?: StatusApontamento; nota?: string | null };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  /* UM OU MUITOS, PELA MESMA PORTA.
     A tela da carteira decide uma norma inteira de uma vez — "esta resolução
     não se aplica a nenhum dos meus dez clientes de transporte" é uma decisão
     só, tomada uma vez. Obrigar dez requisições faria a tela piscar dez vezes
     e deixaria estado pela metade se a quinta falhasse. */
  const ids = corpo.ids?.length ? corpo.ids : corpo.id ? [corpo.id] : [];
  if (ids.length === 0) return NextResponse.json({ erro: "id obrigatório" }, { status: 400 });
  if (ids.length > 500) {
    return NextResponse.json({ erro: "no máximo 500 por vez" }, { status: 400 });
  }
  if (!corpo.status || !VALIDOS.includes(corpo.status)) {
    return NextResponse.json({ erro: "status inválido" }, { status: 400 });
  }

  /* `superado` não entra na lista de válidos: quem supera é a varredura, olhando
     o critério. Deixar a tela marcar superado seria confundir "o fato mudou"
     com "eu decidi" — e são as duas informações que este registro separa. */
  const patch: Record<string, unknown> = {
    status: corpo.status,
    nota: corpo.nota ?? null,
    tratado_em: corpo.status === "novo" ? null : new Date().toISOString(),
    tratado_por: corpo.status === "novo" ? null : user.id,
  };

  const { error } = await supabase.from("apontamentos").update(patch).in("id", ids);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, atualizados: ids.length });
}
