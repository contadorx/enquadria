import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CursoMateriais } from "@/components/CursoMateriais";
import { urlDeEmbed } from "@/lib/ajuda";
import { createClient } from "@/lib/supabase-server";
import {
  CURSO,
  RESSALVA,
  TODAS_AULAS,
  aulaPorSlug,
  materiaisDe,
  videoDaAula,
  minutosDaAula,
} from "@/lib/curso";

/**
 * A AULA.
 *
 * Abre e roda: sem cadastro, sem modal, sem "assista o próximo vídeo em 3, 2,
 * 1". Enquanto a gravação não sobe, a página mostra o que a aula entrega e o
 * material — porque a grade completa no ar desde o primeiro dia é o que faz a
 * pessoa voltar para a onda seguinte.
 */

export function generateStaticParams() {
  return TODAS_AULAS.map((a) => ({ slug: a.slug }));
}

/* o link do vídeo vem do banco (0038) — ver nota no índice do curso */
export const revalidate = 60;

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const achado = aulaPorSlug(params.slug);
  if (!achado) return { title: CURSO.nome };
  return {
    title: `${achado.aula.numero}. ${achado.aula.titulo} | ${CURSO.nome}`,
    description: achado.aula.resumo,
  };
}

export default async function AulaPage({ params }: { params: { slug: string } }) {
  const achado = aulaPorSlug(params.slug);
  if (!achado) notFound();
  const { aula, modulo } = achado;

  const supabase = createClient();
  const { data: linha } = await supabase
    .from("curso_videos")
    .select("video_url, minutos")
    .eq("slug", aula.slug)
    .maybeSingle();
  const doBanco = (linha?.video_url as string | null) ?? null;
  /* a duração medida vence a estimativa do código — ver migration 0046 */
  const duracao = minutosDaAula(aula, { [aula.slug]: (linha as { minutos?: number | null } | null)?.minutos ?? null });

  const i = TODAS_AULAS.findIndex((a) => a.slug === aula.slug);
  const anterior = i > 0 ? TODAS_AULAS[i - 1] : null;
  const proxima = i < TODAS_AULAS.length - 1 ? TODAS_AULAS[i + 1] : null;
  const materiais = materiaisDe(aula.materiais);

  /**
   * O LINK QUE VOCÊ COLA É O LINK QUE VOCÊ COPIOU.
   *
   * Antes, `aula.video` ia direto para o `src` do iframe. Isso obrigava a colar
   * a URL de EMBED (`youtube.com/embed/ID`) — e a URL que o YouTube entrega no
   * botão de compartilhar é `youtu.be/ID`, que num iframe carrega uma página de
   * recusa, não o player. O erro só aparecia depois de publicar.
   *
   * `urlDeEmbed` (a mesma função da central de ajuda, já testada) converte
   * watch / youtu.be / live / embed e vimeo para a forma de player. O fallback
   * para a URL crua existe porque este campo é código, não formulário: se um
   * dia a gravação for para outro provedor, o `https://` dele passa. O que não
   * passa é um `javascript:` — e é isso que a checagem impede.
   */
  const url = videoDaAula(aula, { [aula.slug]: doBanco });
  const embed = urlDeEmbed(url) ?? (url && /^https:\/\//i.test(url) ? url : null);

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-line bg-ink">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-5 py-3.5">
          <Link href="/curso" className="text-[15px] font-extrabold tracking-tight text-white">
            ENQUADRIA<span className="text-accentbright">.</span>
            <span className="ml-2 font-mono text-[11px] font-normal text-slate-400">
              a decisão de setembro
            </span>
          </Link>
          <Link href="/curso" className="text-[13px] text-slate-300 hover:text-white">
            todas as aulas
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-8 md:py-12">
        <div className="font-mono text-[11.5px] uppercase tracking-[0.14em] text-accentdeep">
          Módulo {modulo.numero} · {modulo.titulo} · aula {aula.numero} de {TODAS_AULAS.length}
        </div>
        <h1 className="mt-2 max-w-[24ch] text-[28px] font-extrabold leading-tight tracking-tight text-ink md:text-[36px]">
          {aula.titulo}
        </h1>
        <p className="mt-3 max-w-[64ch] text-[16px] leading-relaxed text-slate2">{aula.resumo}</p>
        <div className="mt-2 font-mono text-[12px] text-muted">{duracao} minutos</div>

        {/* ---------------------------------------------------------- vídeo */}
        <div className="mt-6 overflow-hidden rounded-lg border border-line bg-ink">
          {embed ? (
            <div className="relative w-full pb-[56.25%]">
              <iframe
                src={embed}
                title={aula.titulo}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 h-full w-full"
              />
            </div>
          ) : (
            <div className="flex min-h-[220px] flex-col items-center justify-center px-6 py-12 text-center">
              <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-accentbright">
                onda {aula.onda}
              </div>
              <p className="mt-2 max-w-[46ch] text-[15px] text-slate-300">
                Esta aula ainda não subiu. O conteúdo dela está listado abaixo — e quem
                baixou os materiais recebe um aviso quando a gravação entra no ar.
              </p>
            </div>
          )}
        </div>

        {/* --------------------------------------------------------- pontos */}
        <div className="mt-8 rounded-lg border border-line bg-surface p-5">
          <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
            O que tem nesta aula
          </div>
          <ul className="mt-3 space-y-2">
            {aula.topicos.map((t, n) => (
              <li key={t} className="flex gap-3 text-[15px] leading-relaxed text-slate2">
                <span className="mt-0.5 font-mono text-[12px] text-accentdeep">
                  {String(n + 1).padStart(2, "0")}
                </span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* ------------------------------------------------------ materiais */}
        {materiais.length > 0 && (
          <div className="mt-6">
            <CursoMateriais materiais={materiais} />
          </div>
        )}

        {/* -------------------------------------------------------- navegar */}
        <nav className="mt-8 flex flex-wrap items-stretch justify-between gap-3">
          {anterior ? (
            <Link
              href={`/curso/${anterior.slug}`}
              className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-4 py-3"
            >
              <div className="font-mono text-[10.5px] text-muted">← aula {anterior.numero}</div>
              <div className="truncate text-[14px] font-semibold text-ink">{anterior.titulo}</div>
            </Link>
          ) : (
            <span className="flex-1" />
          )}
          {proxima ? (
            <Link
              href={`/curso/${proxima.slug}`}
              className="min-w-0 flex-1 rounded-lg border border-ink bg-ink px-4 py-3 text-right"
            >
              <div className="font-mono text-[10.5px] text-slate-400">aula {proxima.numero} →</div>
              <div className="truncate text-[14px] font-semibold text-white">{proxima.titulo}</div>
            </Link>
          ) : (
            <Link
              href="/login"
              className="min-w-0 flex-1 rounded-lg border border-ink bg-ink px-4 py-3 text-right"
            >
              <div className="font-mono text-[10.5px] text-slate-400">terminou o curso</div>
              <div className="text-[14px] font-semibold text-white">
                Fazer a triagem da sua carteira →
              </div>
            </Link>
          )}
        </nav>

        <p className="mt-8 max-w-[80ch] text-[11.5px] leading-relaxed text-muted">{RESSALVA}</p>
      </main>
    </div>
  );
}
