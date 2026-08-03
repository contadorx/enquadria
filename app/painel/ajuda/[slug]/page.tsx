import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { renderizarCorpo, urlDeEmbed, rotuloCategoria, type Artigo } from "@/lib/ajuda";
import { MarcarLidoAjuda } from "@/components/MarcarLidoAjuda";

/**
 * O ARTIGO.
 *
 * A marcação de "li" acontece no cliente, ao abrir — não no servidor. Marcar
 * no servidor gravaria leitura em cada pré-carregamento de link que o Next
 * dispara ao passar o mouse, e o aviso de novidade sumiria sem ninguém ter
 * lido nada.
 */

export const dynamic = "force-dynamic";

export default async function ArtigoPage({ params }: { params: { slug: string } }) {
  const supabase = createClient();

  const { data } = await supabase
    .from("ajuda_artigos")
    .select("id, slug, titulo, resumo, categoria, corpo, video_url, capa_url, publicado, publicado_em, ordem, atualizado_em")
    .eq("slug", params.slug)
    .maybeSingle();

  if (!data) notFound();
  const artigo = data as unknown as Artigo;

  const embed = urlDeEmbed(artigo.video_url);
  const html = renderizarCorpo(artigo.corpo);

  return (
    <div className="max-w-[72ch]">
      <MarcarLidoAjuda artigoId={artigo.id} />

      <Link href="/painel/ajuda" className="text-[12.5px] font-semibold text-accentdeep">
        ← Central de ajuda
      </Link>

      <div className="mt-3 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
        {rotuloCategoria(artigo.categoria)}
        {!artigo.publicado && <span className="ml-2 text-vermelho">· rascunho</span>}
      </div>
      <h1 className="mt-1 text-[22px] font-bold leading-tight tracking-tight">{artigo.titulo}</h1>
      {artigo.resumo && <p className="mt-1.5 text-[14px] text-slate2">{artigo.resumo}</p>}
      <p className="mt-1 font-mono text-[11px] text-muted">
        atualizado em {new Date(artigo.atualizado_em).toLocaleDateString("pt-BR")}
      </p>

      {artigo.capa_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={artigo.capa_url}
          alt=""
          className="mt-4 w-full rounded border border-line object-cover"
        />
      )}

      {embed && (
        <div className="mt-5 aspect-video w-full overflow-hidden rounded border border-line">
          <iframe
            src={embed}
            title={artigo.titulo}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
      )}

      {/* O corpo passou por renderizarCorpo, que escapa o texto ANTES de
          formatar: nenhuma tag escrita por quem edita chega aqui viva. */}
      <div className="mt-5 text-[14px] text-slate1" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
