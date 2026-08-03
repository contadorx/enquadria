import { ABAS_AJUDA } from "@/lib/nav";
import { Abas } from "@/components/Abas";
import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { temNovidade, type Artigo } from "@/lib/ajuda";

/**
 * QUADRO DE NOTÍCIAS DA REFORMA.
 *
 * Separado da ajuda porque o comportamento é outro: aqui a informação é
 * EMPURRADA — a pessoa não sabe que precisa saber. Por isso ordena por data
 * (mais recente primeiro), mostra a data em destaque e marca o que ela ainda
 * não leu.
 *
 * A ajuda, ao lado, é puxada: alguém chega com dúvida, busca e sai. Numa lista
 * só, a notícia velha entulharia a ajuda e a notícia nova se perderia ordenada
 * por relevância em vez de cronologia.
 */

export const dynamic = "force-dynamic";

export default async function ReformaPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: artigos } = await supabase
    .from("ajuda_artigos")
    .select("id, slug, titulo, resumo, categoria, tipo, destaque, publicado, publicado_em, ordem, atualizado_em")
    .eq("tipo", "noticia")
    .eq("publicado", true)
    .order("publicado_em", { ascending: false });

  const { data: lidos } = user
    ? await supabase.from("ajuda_leituras").select("artigo_id, lido_em")
    : { data: [] };
  const leituras = Object.fromEntries(
    (lidos ?? []).map((l) => [l.artigo_id as string, l.lido_em as string])
  );

  const lista = (artigos ?? []) as unknown as Artigo[];

  return (
    <div className="max-w-[74ch]">
      <Abas itens={ABAS_AJUDA} />
      <h1 className="text-[19px] font-bold tracking-tight">Reforma tributária — o que mudou</h1>
      <p className="mt-0.5 text-[13px] text-muted">
        A regulamentação continua saindo. Publicamos aqui o que muda a decisão do seu cliente, com
        a data em que passou a valer. O que você ainda não leu aparece marcado.
      </p>

      {lista.length === 0 && (
        <p className="mt-6 rounded border border-line bg-surface p-5 text-[13px] text-muted">
          Nenhuma novidade publicada ainda.
        </p>
      )}

      <div className="mt-6 space-y-2.5">
        {lista.map((a) => {
          const novo = temNovidade(a, leituras[a.id]);
          return (
            <Link
              key={a.id}
              href={`/painel/ajuda/${a.slug}`}
              className={`block rounded border bg-surface px-4 py-3 hover:border-accent ${
                novo ? "border-accent" : "border-line"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[10.5px] text-muted">
                  {a.publicado_em
                    ? new Date(a.publicado_em).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })
                    : "—"}
                </span>
                {novo && (
                  <span className="rounded-sm bg-accentwash px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-accentdeep">
                    novo
                  </span>
                )}
              </div>
              <div className="mt-1 text-[14.5px] font-semibold">{a.titulo}</div>
              {a.resumo && (
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{a.resumo}</p>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
