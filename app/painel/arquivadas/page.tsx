import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { AbasEscritorio } from "@/components/AbasEscritorio";
import { formatarCnpj } from "@/lib/cnpj";
import { ROTULO_FAIXA, type Faixa } from "@/lib/triagem";

/**
 * AS EMPRESAS ARQUIVADAS.
 *
 * Arquivar tira da fila e das contagens — que é o ponto. Mas sem uma tela como
 * esta, arquivar viraria sumiço: o contador tira uma empresa da frente por
 * engano e não tem nenhum caminho de volta, porque a única tela que sabe
 * desarquivar é o dossiê, e o dossiê se abre a partir da fila.
 *
 * Fica em Configurações porque é administração de carteira, não trabalho da
 * janela. Quem entra aqui está corrigindo um cadastro, não decidindo IBS/CBS.
 */

export const dynamic = "force-dynamic";

export default async function Arquivadas() {
  const supabase = createClient();

  const { data: empresas } = await supabase
    .from("empresas")
    .select("id, cnpj, razao_social, faixa, arquivada_em, arquivada_motivo")
    .not("arquivada_em", "is", null)
    .order("arquivada_em", { ascending: false })
    .limit(500);

  const lista = empresas ?? [];

  return (
    <div>
      <AbasEscritorio />
      <h1 className="text-[19px] font-bold tracking-tight">Empresas arquivadas</h1>
      <p className="mt-0.5 max-w-[70ch] text-[13px] text-muted">
        Fora da fila e de todas as contagens. Nada foi apagado: os laudos e termos que já saíram
        continuam válidos e verificáveis pelo cliente. Para trazer uma de volta, abra o dossiê dela.
      </p>

      {lista.length === 0 ? (
        <p className="mt-6 rounded border border-line bg-surface p-5 text-[13px] text-muted">
          Nenhuma empresa arquivada. Quando você tirar alguma da fila, ela aparece aqui.
        </p>
      ) : (
        <div className="mt-5 divide-y divide-linesoft overflow-hidden rounded border border-line bg-surface">
          {lista.map((e) => (
            <Link
              key={e.id as string}
              href={`/painel/empresa/${e.id}?aba=dossie`}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-surface2"
            >
              <div className="min-w-0">
                <div className="text-[13.5px] font-semibold">{e.razao_social as string}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-[10.5px] text-muted">
                  <span>{formatarCnpj(e.cnpj as string)}</span>
                  <span>{ROTULO_FAIXA[(e.faixa ?? "C") as Faixa]}</span>
                  <span>
                    arquivada em{" "}
                    {e.arquivada_em
                      ? new Date(e.arquivada_em as string).toLocaleDateString("pt-BR")
                      : "—"}
                  </span>
                  {e.arquivada_motivo && <span>· {e.arquivada_motivo as string}</span>}
                </div>
              </div>
              <span aria-hidden className="shrink-0 text-muted">
                →
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
