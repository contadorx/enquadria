import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { CarteiraTabela, type EmpresaCarteira } from "@/components/CarteiraTabela";

export default async function Carteira() {
  const supabase = createClient();
  const { data: empresas } = await supabase
    .from("empresas")
    .select("id, cnpj, razao_social, cnae_principal, faixa, motivo_triagem, prioridade_maxima, rbt12")
    .order("faixa", { ascending: true })
    .limit(2000);

  const lista = (empresas ?? []) as EmpresaCarteira[];

  return (
    <div>
      <h1 className="text-[19px] font-bold tracking-tight">Carteira</h1>
      <p className="mt-0.5 max-w-[70ch] text-[13px] text-muted">
        Toda a carteira importada, inclusive o que a triagem descartou — e o motivo de cada
        descarte. Para trabalhar só o que precisa de decisão, use a{" "}
        <Link href="/painel/fila" className="font-semibold text-accentdeep">
          fila de análise
        </Link>
        .
      </p>

      {lista.length === 0 ? (
        <div className="mt-6 rounded border border-dashed border-line bg-surface p-8 text-center text-sm text-slate2">
          Nenhuma empresa importada ainda.{" "}
          <Link href="/painel/importar" className="font-semibold text-accentdeep">
            Importe a carteira
          </Link>{" "}
          para ver o mapa.
        </div>
      ) : (
        <CarteiraTabela empresas={lista} />
      )}
    </div>
  );
}
