import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-admin";
import { ComparativoFolha } from "@/components/ComparativoFolha";
import type { ResultadoComparativo } from "@/lib/comparativo";

/**
 * O COMPARATIVO NO ENDEREÇO DO CLIENTE.
 *
 * Mesma razão da página pública do laudo: `/doc/comparativo/[id]` exige sessão
 * do contador, então o link nunca podia ser enviado.
 *
 * E este é, dos dois, o documento que mais precisava sair. O laudo é a PROVA —
 * o cliente lê depois de decidir. O comparativo é o documento de VENDA: é ele
 * que mostra por que a conversa vale a pena, antes de o cliente pagar.
 *
 * Os valores são os CONGELADOS na emissão. O comparativo não recalcula nem para
 * o contador nem aqui: ele é o retrato daquele cenário, com as premissas que o
 * profissional declarou e assinou.
 */

export const dynamic = "force-dynamic";

export default async function ComparativoPublico({ params }: { params: { token: string } }) {
  const supabase = createAdminClient();
  if (!supabase) return <Indisponivel />;

  const { data: doc } = await supabase
    .from("comparativos")
    .select("numero, emitido_em, entrada, premissas, resultado, empresa_id, escritorio")
    .eq("token", params.token)
    .maybeSingle();
  if (!doc) notFound();

  const { data: empresa } = doc.empresa_id
    ? await supabase
        .from("empresas")
        .select("razao_social, cnpj")
        .eq("id", doc.empresa_id)
        .maybeSingle()
    : { data: null };

  /**
   * O CABEÇALHO DO ESCRITÓRIO VEM DO DOCUMENTO, NÃO DA SESSÃO.
   *
   * Na rota do contador o nome e o CRC vêm do `profiles` de quem está olhando —
   * o que funciona porque quem olha é o dono. Aqui não há sessão, e buscar "o
   * primeiro perfil" carimbaria o comparativo com o nome de outro escritório.
   * A coluna `escritorio` é preenchida na hora do envio (ver
   * /api/comparativo/enviar); sem ela o documento sai sem marca, que é a falha
   * segura — melhor um documento sem logotipo do que um com o logotipo errado.
   */
  const t = (doc.escritorio ?? null) as { nome?: string; crc?: string; logo_url?: string } | null;

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
      publico
    />
  );
}

function Indisponivel() {
  return (
    <div className="mx-auto max-w-lg p-10 text-center">
      <p className="text-[14px] text-slate2">
        Documento temporariamente indisponível. Peça ao seu contador para reenviar o link em
        instantes.
      </p>
    </div>
  );
}
