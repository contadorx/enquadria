import { ABAS_AJUDA } from "@/lib/nav";
import { Abas } from "@/components/Abas";
import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { CATEGORIAS, temNovidade, ordenarAjuda, type Artigo } from "@/lib/ajuda";

/**
 * A CENTRAL DE AJUDA vista pelo contador.
 *
 * Organizada por CATEGORIA e não por data. Quem entra aqui não quer "o que há
 * de novo" — quer resolver a dúvida que trouxe. A novidade aparece como
 * marcador dentro da lista, não como critério de ordenação.
 *
 * A Reforma vem primeiro de propósito: é a categoria que muda sozinha, e é
 * aquela em que estar desatualizado custa dinheiro do cliente do contador.
 */

export const dynamic = "force-dynamic";

export default async function AjudaPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: artigos } = await supabase
    .from("ajuda_artigos")
    .select("id, slug, titulo, resumo, corpo, categoria, tipo, destaque, publicado, ordem, atualizado_em")
    .eq("tipo", "ajuda")
    .eq("publicado", true)
    .order("ordem", { ascending: true });

  const { data: lidos } = user
    ? await supabase.from("ajuda_leituras").select("artigo_id, lido_em")
    : { data: [] };
  const leituras = Object.fromEntries(
    (lidos ?? []).map((l) => [l.artigo_id as string, l.lido_em as string])
  );

  const lista = ordenarAjuda((artigos ?? []) as unknown as Artigo[]);

  return (
    <div>
      <Abas itens={ABAS_AJUDA} />
      <h1 className="text-[19px] font-bold tracking-tight">Central de ajuda</h1>
      <p className="mt-0.5 max-w-[70ch] text-[13px] text-muted">
        Como usar cada tela e como vender o serviço. O que muda na Reforma fica no{" "}
        <a href="/painel/reforma" className="text-accentdeep underline underline-offset-2">
          quadro da Reforma
        </a>{" "}
        — lá a ordem é cronológica, porque notícia velha entulharia esta lista.
      </p>

      {lista.length === 0 && (
        <p className="mt-6 rounded border border-line bg-surface p-5 text-[13px] text-muted">
          Ainda não há artigos publicados.
        </p>
      )}

      <div className="mt-6 space-y-7">
        {CATEGORIAS.map((cat) => {
          const doGrupo = lista.filter((a) => a.categoria === cat.chave);
          if (doGrupo.length === 0) return null;
          return (
            <section key={cat.chave}>
              <h2 className="text-[15px] font-bold">{cat.rotulo}</h2>
              <p className="mt-0.5 max-w-[68ch] text-[12.5px] text-muted">{cat.descricao}</p>

              <div className="mt-3 divide-y divide-linesoft overflow-hidden rounded border border-line bg-surface">
                {doGrupo.map((a) => {
                  const novo = temNovidade(a, leituras[a.id]);
                  return (
                    <Link
                      key={a.id}
                      href={`/painel/ajuda/${a.slug}`}
                      className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-surface2"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[13.5px] font-semibold">{a.titulo}</span>
                          {novo && (
                            <span className="rounded-sm bg-accentwash px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-accentdeep">
                              novo
                            </span>
                          )}
                        </div>
                        {a.resumo && (
                          <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{a.resumo}</p>
                        )}
                      </div>
                      <span aria-hidden className="shrink-0 text-muted">
                        →
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

    </div>
  );
}
