import { createClient } from "@/lib/supabase-server";
import { CursoVideos } from "@/components/CursoVideos";
import type { MapaVideos } from "@/lib/curso";

/**
 * NEGÓCIO → CURSO: publicar aula sem deploy.
 *
 * Fica na área da plataforma (superadmin) e não na do escritório: o curso é
 * ativo de aquisição da Enquadria, não conteúdo que cada contador edita.
 */
export const dynamic = "force-dynamic";

export default async function CursoNegocio() {
  const supabase = createClient();
  const { data } = await supabase.from("curso_videos").select("slug, video_url");

  const mapa: MapaVideos = Object.fromEntries(
    (data ?? []).map((l) => [l.slug as string, (l.video_url as string | null) ?? ""])
  );

  return (
    <div>
      <h1 className="text-[19px] font-bold tracking-tight">Vídeos do curso</h1>
      <p className="mt-0.5 max-w-[76ch] text-[13px] leading-relaxed text-muted">
        Cole o link do YouTube de cada aula e salve — a aula entra no ar na hora, sem deploy. Serve
        o link do botão compartilhar, o da barra de endereço, o de live ou o de embed; Vimeo
        também. Deixar o campo em branco tira a aula do ar e ela volta a aparecer como “em breve”.
      </p>

      <div className="mt-5">
        <CursoVideos inicial={mapa} />
      </div>
    </div>
  );
}
