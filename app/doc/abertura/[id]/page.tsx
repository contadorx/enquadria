import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { FolhaAbertura } from "@/components/FolhaAbertura";
import type { EstudoAbertura } from "@/lib/abertura";
import type { Escritorio } from "@/lib/escritorio";

/** O estudo pela porta do contador — a RLS de `aberturas` decide o acesso. */
export const dynamic = "force-dynamic";

export default async function AberturaDoc({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: doc } = await supabase
    .from("aberturas")
    .select("numero, emitido_em, nome_negocio, responsavel, resultado, escritorio")
    .eq("id", params.id)
    .maybeSingle();
  if (!doc) notFound();

  return (
    <FolhaAbertura
      dados={{
        numero: doc.numero as number,
        emitido_em: doc.emitido_em as string,
        nome_negocio: doc.nome_negocio as string,
        responsavel: (doc.responsavel as string | null) ?? null,
        estudo: doc.resultado as unknown as EstudoAbertura,
        escritorio: (doc.escritorio as Escritorio | null) ?? null,
      }}
    />
  );
}
