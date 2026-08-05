import { createClient } from "@/lib/supabase-server";
import { CursoVideos } from "@/components/CursoVideos";
import type { MapaMinutos, MapaVideos } from "@/lib/curso";

/**
 * NEGÓCIO → CURSO: publicar aula sem deploy.
 *
 * Fica na área da plataforma (superadmin) e não na do escritório: o curso é
 * ativo de aquisição da Enquadria, não conteúdo que cada contador edita.
 */
export const dynamic = "force-dynamic";

export default async function CursoNegocio() {
  const supabase = createClient();
  /* leitura falhando deixa TODOS os campos vazios ("aula em breve") — e o
     admin, ao salvar um deles, publica por cima de um mapa que ele acredita
     estar vazio */
  const { data, error: eVideos } = await supabase.from("curso_videos").select("slug, video_url, minutos");

  const mapa: MapaVideos = Object.fromEntries(
    (data ?? []).map((l) => [l.slug as string, (l.video_url as string | null) ?? ""])
  );
  /* a duração medida depois de gravar — nula enquanto ninguém mediu */
  const minutos: MapaMinutos = Object.fromEntries(
    (data ?? []).map((l) => [l.slug as string, (l as { minutos?: number | null }).minutos ?? null])
  );

  return (
    <div>
      {eVideos && (
        <p className="mb-4 rounded border border-amarelo/40 bg-amarelowash p-3 text-[12.5px]">
          Não consegui ler os vídeos já publicados ({eVideos.message}). Os campos abaixo aparecem
          vazios por causa disso — <b>não</b> porque as aulas estejam sem link. Salvar agora pode
          apagar um link existente.
        </p>
      )}
      <h1 className="text-[19px] font-bold tracking-tight">Vídeos do curso</h1>
      <p className="mt-0.5 max-w-[76ch] text-[13px] leading-relaxed text-muted">
        Cole o link do YouTube de cada aula e salve — a aula entra no ar na hora, sem deploy. Serve
        o link do botão compartilhar, o da barra de endereço, o de live ou o de embed; Vimeo
        também. Deixar o campo em branco tira a aula do ar e ela volta a aparecer como “em breve”.
        <b> A duração vai ao lado</b>: preencha depois de gravar, com o número real do player. Em
        branco, a grade mostra a estimativa do planejamento — que erra, e o aluno confere.
      </p>

      <div className="mt-5">
        <CursoVideos inicial={mapa} minutos={minutos} />
      </div>
    </div>
  );
}
