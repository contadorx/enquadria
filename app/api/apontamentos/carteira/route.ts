import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * OS APONTAMENTOS DA CARTEIRA INTEIRA — a tela de trabalho do monitor.
 *
 * A ficha da empresa responde "o que apontaram sobre ESTE cliente". Esta rota
 * responde a pergunta oposta e mais produtiva: "esta norma atinge QUEM, e o que
 * eu já fiz a respeito?".
 *
 * A diferença não é de ângulo, é de ritmo de trabalho. Tratar norma por norma é
 * uma leitura e vinte decisões parecidas; tratar empresa por empresa é vinte
 * leituras da mesma norma. O contador que abre isto de manhã quer a primeira.
 *
 * Traz TUDO, inclusive o que já foi tratado — quem filtra é a tela, no
 * navegador, porque alternar entre "o que falta" e "o que eu fiz" é o gesto que
 * mais se repete aqui e ida ao servidor a cada clique seria pior em toda medida
 * que interessa.
 */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });

  /* as colunas de dentro dos parênteses são das tabelas JUNTADAS (empresas e
     radar_itens), não de `apontamentos` — o auditor de schema lê a string do
     select e não sabe distinguir, então a dispensa é explícita. */
  const { data, error } = await supabase
    .from("apontamentos")
    // schema-ok: apontamentos vem da 0063; empresas e radar_itens são o join
    .select(
      "id, status, criado_em, tratado_em, empresa_id, item_id, " +
        "empresas(id, razao_social, cnpj, faixa), " +
        "radar_itens(id, titulo, resumo, o_que_fazer, fonte, severidade, vigencia_em, publicado_em)"
    )
    .order("criado_em", { ascending: false })
    .limit(3000);

  /* a migration pode não ter rodado — lista vazia, e a tela diz isso em vez de
     quebrar. Mesma regra da leitura de propostas. */
  if (error) return NextResponse.json({ apontamentos: [], indisponivel: true });

  return NextResponse.json({ apontamentos: data ?? [] });
}
