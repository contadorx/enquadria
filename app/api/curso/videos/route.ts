import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { urlDeEmbed } from "@/lib/ajuda";
import { MODULOS, TODAS_AULAS, videoDaAula, type MapaVideos } from "@/lib/curso";

/**
 * OS VÍDEOS DO CURSO, para o SITE ESTÁTICO consumir.
 *
 * O PROBLEMA QUE ISTO RESOLVE. O curso existe em dois lugares: dentro do app
 * (Next.js, lê o banco) e no site de vendas (HTML estático no HostGator, sem
 * banco e sem build). Publicar uma aula significava editar nove arquivos HTML
 * à mão, trocar "onda 2" por "no ar" no índice, rodar um script de versão e
 * subir tudo por FTP — para colar uma URL.
 *
 * Com este endpoint, o link mora num lugar só (Negócio → Curso) e o site
 * pergunta. Publicar uma aula volta a ser o que deveria ser: colar e salvar.
 *
 * ABERTO DE PROPÓSITO — e a diferença para `/api/curso/lead` importa. Lá
 * trafega e-mail de pessoa, e a lista de origens é fechada porque endpoint
 * aberto vira formulário de spam. Aqui o conteúdo é uma lista de vídeos
 * PÚBLICOS do YouTube, que qualquer visitante já vê na página. Fechar a
 * origem protegeria o quê? E quebraria o site no dia em que o domínio mudar
 * ou alguém abrir por `www`.
 *
 * SÓ SAI URL DE PLAYER. O que vem do banco passa por `urlDeEmbed` antes de
 * sair — o site injeta isso num iframe, e injetar endereço arbitrário vindo
 * de uma API é como se abre um buraco de segurança numa página estática que
 * não tem nenhum.
 */

export const revalidate = 60;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
  /* 60s na borda: publicar aula é raro, mas quando acontece a pessoa quer ver
     no ar agora — não amanhã */
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET() {
  let mapa: MapaVideos = {};

  try {
    const supabase = createAdminClient();
    if (supabase) {
      const { data } = await supabase.from("curso_videos").select("slug, video_url");
      mapa = Object.fromEntries(
        ((data ?? []) as { slug: string; video_url: string | null }[]).map((l) => [l.slug, l.video_url])
      );
    }
  } catch {
    /* banco fora do ar não pode derrubar a página do curso: cai no que está
       no código, que é o comportamento de antes deste endereço existir */
  }

  const aulas = TODAS_AULAS.map((a) => {
    const url = videoDaAula(a, mapa);
    const embed = urlDeEmbed(url);
    return {
      numero: a.numero,
      slug: a.slug,
      titulo: a.titulo,
      minutos: a.minutos,
      onda: a.onda,
      /* a chave da coisa: o site injeta ISTO num iframe, e é sempre um player
         de YouTube ou Vimeo — nunca o que estiver escrito no banco */
      embed: embed ?? null,
      no_ar: !!embed,
    };
  });

  return NextResponse.json(
    {
      atualizado_em: new Date().toISOString(),
      total: aulas.length,
      no_ar: aulas.filter((a) => a.no_ar).length,
      modulos: MODULOS.map((m) => ({ numero: m.numero, titulo: m.titulo })),
      aulas,
    },
    { headers: CORS }
  );
}
