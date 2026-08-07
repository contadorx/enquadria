import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { PropostaFolha } from "@/components/PropostaFolha";
import type { Proposta } from "@/lib/proposta";
import type { Escritorio } from "@/lib/escritorio";

/**
 * A proposta pela porta do contador — a RLS de `propostas` decide o acesso.
 *
 * Lê o CONTEÚDO CONGELADO, nunca remonta: proposta é oferta com data e valor.
 * Recompor ao vivo mudaria o preço de um papel já entregue quando a sugestão
 * do sistema mudasse — o que transformaria um documento em uma tela.
 */
export const dynamic = "force-dynamic";

export default async function PropostaDoc({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: doc } = await supabase
    .from("propostas")
    .select("numero, emitido_em, conteudo, escritorio")
    .eq("id", params.id)
    .maybeSingle();
  if (!doc) notFound();

  return (
    <PropostaFolha
      dados={{
        numero: doc.numero as number,
        emitido_em: doc.emitido_em as string,
        proposta: doc.conteudo as unknown as Proposta,
        escritorio: (doc.escritorio as Escritorio | null) ?? null,
      }}
    />
  );
}
