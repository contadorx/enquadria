"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { urlDeEmbed } from "@/lib/ajuda";
import { MODULOS, type MapaMinutos, type MapaVideos } from "@/lib/curso";

/**
 * PUBLICAR AULA — o campo que faltava.
 *
 * O link do vídeo morava em `lib/curso.ts`. Publicar uma aula era editar
 * arquivo, commitar, esperar deploy — e, no fluxo real desta operação,
 * extrair um zip por cima da pasta, com risco de sobrescrever trabalho.
 * Nada disso é publicar um vídeo: é fazer um release.
 *
 * Aqui cada aula tem um campo. Cola, salva, está no ar.
 *
 * A VALIDAÇÃO É A MESMA DA CENTRAL DE AJUDA (`urlDeEmbed`): aceita o link do
 * botão compartilhar, o da barra de endereço, o de live e o de embed, do
 * YouTube ou do Vimeo. Endereço que ela não reconhece é recusado ANTES de
 * salvar — descobrir que o player não carrega depois de publicar é o pior
 * momento possível.
 */
export function CursoVideos({
  inicial,
  minutos: minutosIniciais,
}: {
  inicial: MapaVideos;
  minutos?: MapaMinutos;
}) {
  const router = useRouter();
  const [mapa, setMapa] = useState<MapaVideos>(inicial);
  /**
   * A DURAÇÃO, ao lado do link (migration 0046).
   *
   * Guardada como TEXTO no estado, de propósito: `Number("")` é 0, e um campo
   * vazio precisa significar "ainda não medi", nunca "dura zero minuto". Foi
   * exatamente esse o erro que zerou o valor mensal de um escritório na tela de
   * contas — mesmo formato de campo, mesma armadilha.
   */
  const [mins, setMins] = useState<Record<string, string>>(
    Object.fromEntries(
      Object.entries(minutosIniciais ?? {}).map(([k, v]) => [k, v == null ? "" : String(v)])
    )
  );
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<{ slug: string; texto: string } | null>(null);
  const [salvo, setSalvo] = useState<string | null>(null);

  async function salvar(slug: string) {
    const url = (mapa[slug] ?? "").trim();
    setErro(null);

    /* a mesma trava do banco (0046): 0 é dedo escorregando, 5.400 é segundo
       digitado como minuto. Recusar aqui evita a ida ao servidor e diz o que
       está errado no lugar em que a pessoa está olhando. */
    const bruto = (mins[slug] ?? "").trim();
    let minutos: number | null = null;
    if (bruto) {
      const n = Number(bruto.replace(",", "."));
      if (!Number.isFinite(n) || n <= 0 || n > 600) {
        setErro({ slug, texto: "Duração em minutos, entre 1 e 600. Deixe vazio se ainda não mediu." });
        return;
      }
      minutos = Math.round(n);
    }

    // recusa antes de gravar: link que o player não abre não pode ir ao ar
    if (url && !urlDeEmbed(url)) {
      setErro({
        slug,
        texto:
          "Não reconheci este endereço como YouTube ou Vimeo. Cole o link do vídeo (o do botão compartilhar serve).",
      });
      return;
    }

    setSalvando(slug);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = url
      ? await supabase
          .from("curso_videos")
          .upsert(
            { slug, video_url: url, minutos, atualizado_em: new Date().toISOString(), atualizado_por: user?.id ?? null },
            { onConflict: "slug" }
          )
      : minutos != null
        ? /* sem vídeo mas COM duração medida: a linha fica, senão tirar a aula
             do ar apagaria o minuto que alguém cronometrou */
          await supabase.from("curso_videos").upsert(
            { slug, video_url: null, minutos, atualizado_em: new Date().toISOString(), atualizado_por: user?.id ?? null },
            { onConflict: "slug" }
          )
        : // campo esvaziado e sem duração = tirar do ar; apagar a linha é mais
          // honesto que gravar string vazia e deixar o estado ambíguo
          await supabase.from("curso_videos").delete().eq("slug", slug);

    setSalvando(null);
    if (error) {
      setErro({ slug, texto: error.message });
      return;
    }
    setSalvo(slug);
    setTimeout(() => setSalvo(null), 2500);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {MODULOS.map((m) => (
        <section key={m.numero}>
          <h2 className="text-[15px] font-bold">
            Módulo {m.numero} · {m.titulo}
          </h2>
          <div className="mt-2 divide-y divide-linesoft overflow-hidden rounded border border-line bg-surface">
            {m.aulas.map((a) => {
              const valor = mapa[a.slug] ?? "";
              const embed = urlDeEmbed(valor);
              const noAr = !!(valor || a.video);
              return (
                <div key={a.slug} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[13.5px] font-semibold">
                        {a.numero}. {a.titulo}
                      </span>
                      <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-muted">
                        {/* o número do CÓDIGO, marcado como estimativa: enquanto
                            ninguém mediu, é ele que a grade publica */}
                        {(mins[a.slug] ?? "") ? `${mins[a.slug]} min` : `~${a.minutos} min estimados`} · onda {a.onda}
                      </span>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-wider ${
                        noAr ? "bg-verdewash text-verde" : "bg-surface2 text-muted"
                      }`}
                    >
                      {noAr ? "no ar" : "em breve"}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <input
                      value={valor}
                      onChange={(ev) => setMapa({ ...mapa, [a.slug]: ev.target.value })}
                      placeholder="https://youtu.be/… (deixe em branco para tirar do ar)"
                      className="min-w-0 flex-1 rounded-sm border border-line px-3 py-2 text-[16px] outline-none focus:border-accent sm:text-[13px]"
                    />
                    <input
                      value={mins[a.slug] ?? ""}
                      onChange={(ev) => setMins({ ...mins, [a.slug]: ev.target.value })}
                      inputMode="numeric"
                      placeholder="min"
                      title="Duração real, medida no player. Em branco = a grade usa a estimativa."
                      className="w-full rounded-sm border border-line px-3 py-2 text-center font-mono text-[16px] outline-none focus:border-accent sm:w-20 sm:text-[13px]"
                    />
                    <button
                      // ux-ok: o aviso de erro e o "salvo ✓" ficam nesta linha
                      onClick={() => void salvar(a.slug)}
                      disabled={salvando === a.slug}
                      className="whitespace-nowrap rounded-sm bg-ink px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
                    >
                      {salvando === a.slug ? "Salvando…" : salvo === a.slug ? "Salvo ✓" : "Salvar"}
                    </button>
                  </div>

                  {erro?.slug === a.slug && (
                    <p className="mt-2 rounded-sm bg-vermelhowash px-3 py-2 text-[12px] text-vermelho">
                      {erro.texto}
                    </p>
                  )}

                  {/* conferir aqui é mais barato que descobrir no ar */}
                  {embed && (
                    <div className="mt-2 aspect-video w-full max-w-[380px] overflow-hidden rounded border border-line">
                      <iframe src={embed} title={a.titulo} allowFullScreen className="h-full w-full" />
                    </div>
                  )}

                  {!valor && a.video && (
                    <p className="mt-2 text-[11.5px] text-muted">
                      Esta aula está no ar por um link que ainda vem do código. Cole aqui para passar
                      a controlar por esta tela.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
