"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

/**
 * REGISTRA A LEITURA quando o artigo aparece na tela — não antes.
 *
 * Fica no cliente de propósito. Se a gravação vivesse no componente de
 * servidor, cada pré-carregamento que o Next dispara ao passar o mouse sobre
 * o link contaria como leitura, e o marcador "novo" sumiria de artigos que
 * ninguém abriu. Um aviso que some sozinho é pior que aviso nenhum: ele mente.
 *
 * Não renderiza nada e não avisa se falhar. Falha aqui significa, no pior
 * caso, o artigo continuar marcado como novo — que é o lado seguro do erro.
 */
export function MarcarLidoAjuda({ artigoId }: { artigoId: string }) {
  const router = useRouter();
  const jaFoi = useRef(false);

  useEffect(() => {
    if (jaFoi.current) return;
    jaFoi.current = true;

    (async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        await supabase
          .from("ajuda_leituras")
          .upsert(
            { user_id: user.id, artigo_id: artigoId, lido_em: new Date().toISOString() },
            { onConflict: "user_id,artigo_id" }
          );
        // Sem isto, a lista da central — que é server component — continua
        // servindo o cálculo antigo e o artigo recém-lido volta ostentando
        // o selo "novo". O selo mentiria justamente para quem obedeceu a ele.
        router.refresh();
      } catch {
        // silêncio proposital: ver o artigo é o que importa, registrar é acessório
      }
    })();
  }, [artigoId, router]);

  return null;
}
