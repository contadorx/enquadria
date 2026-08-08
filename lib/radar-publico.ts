import "server-only";
import { createAdminClient } from "@/lib/supabase-admin";
import { ordenar, type ItemRadar } from "@/lib/radar";

/**
 * A LEITURA DAS MATÉRIAS PÚBLICAS — num arquivo só, e por dois motivos.
 *
 * 1. O ÍNDICE E A MATÉRIA LEEM A MESMA COISA. `/reforma` monta a lista e
 *    `/reforma/<endereco>` precisa da lista inteira para achar a matéria e
 *    saber quem é a anterior e a próxima. Duas consultas com colunas
 *    ligeiramente diferentes é como um `select` esquece de acompanhar o outro.
 *
 * 2. UMA PÁGINA DO NEXT NÃO PODE EXPORTAR MAIS NADA além dos nomes que o
 *    framework conhece. Tentar reaproveitar a função exportando-a da página do
 *    índice quebra a compilação — e a mensagem não diz isso.
 *
 * `server-only` é a trava: se algum dia isto for importado por um componente
 * de cliente, o erro aparece no build e não em produção com a chave de serviço
 * dentro do pacote do navegador.
 */
export async function materiasPublicas(): Promise<ItemRadar[]> {
  const supabase = createAdminClient();
  if (!supabase) return [];
  /* leitura pelo cliente de serviço, como as demais páginas públicas: o
     conteúdo é nosso e igual para todo mundo, não há carteira envolvida.
     `criterio` fica DE FORA de propósito — é o recorte de carteira atingida,
     inteligência do produto, não informação do leitor. */
  // schema-ok: radar_itens vem da 0053, ampliada pela 0056 e pela 0064 (slug)
  const { data } = await supabase
    .from("radar_itens")
    .select("id, slug, titulo, resumo, o_que_fazer, fonte, publicado_em, vigencia_em, severidade")
    .eq("ativo", true)
    .order("publicado_em", { ascending: false })
    .limit(500);
  return ordenar((data ?? []) as unknown as ItemRadar[], new Date().toISOString());
}
