import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { ComparativoFolha } from "@/components/ComparativoFolha";
import type { ResultadoComparativo } from "@/lib/comparativo";

/**
 * COMPARATIVO IMPRESSO — o entregável cobrável do motor de regimes.
 *
 * Usa os valores CONGELADOS na emissão, nunca recalcula: o documento é a prova
 * do cenário daquela data, com as premissas que o contador declarou.
 *
 * O desenho vive em components/ComparativoFolha porque o mesmo documento passou
 * a ter DOIS endereços: este, com a sessão do contador, e `/comparativo/[token]`,
 * o link que vai ao cliente. Duas cópias do desenho divergiriam na primeira
 * alteração — e o cliente receberia um documento diferente do que foi revisado.
 */
export default async function ComparativoDoc({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: doc } = await supabase
    .from("comparativos")
    .select("numero, emitido_em, entrada, premissas, resultado, empresa_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!doc) notFound();

  const { data: empresa } = doc.empresa_id
    ? await supabase
        .from("empresas")
        .select("razao_social, cnpj")
        .eq("id", doc.empresa_id)
        .maybeSingle()
    : { data: null };

  const { data: perfil } = await supabase
    .from("profiles")
    .select("tenants(nome, crc, logo_url)")
    .maybeSingle();
  const t = perfil?.tenants as { nome?: string; crc?: string; logo_url?: string } | null;

  return (
    <ComparativoFolha
      dados={{
        numero: doc.numero,
        emitido_em: doc.emitido_em,
        entrada: doc.entrada as unknown as ResultadoComparativo["entrada"],
        premissas: doc.premissas as unknown as ResultadoComparativo["premissas"],
        resultado: doc.resultado as unknown as ResultadoComparativo,
        empresa,
        escritorio: t,
      }}
    />
  );
}
