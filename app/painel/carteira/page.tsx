import { createClient } from "@/lib/supabase-server";
import { ROTULO_FAIXA, type Faixa } from "@/lib/triagem";

const PILL: Record<Faixa, string> = {
  MEI: "bg-neutrowash text-neutro",
  FORA: "bg-neutrowash text-muted",
  A: "bg-vermelhowash text-vermelho",
  B: "bg-amarelowash text-amarelo",
  C: "bg-verdewash text-verde",
  D: "bg-neutrowash text-muted",
};

export default async function Carteira() {
  const supabase = createClient();
  const { data: empresas } = await supabase
    .from("empresas")
    .select("id, cnpj, razao_social, cnae_principal, faixa, motivo_triagem, prioridade_maxima")
    .order("faixa", { ascending: true })
    .limit(200);

  return (
    <div>
      <h1 className="text-[19px] font-bold tracking-tight">Carteira</h1>
      <p className="mt-0.5 text-[13px] text-muted">
        {empresas?.length ?? 0} empresas · ordenadas por urgência
      </p>

      {!empresas?.length ? (
        <div className="mt-6 rounded border border-dashed border-line bg-surface p-8 text-center text-sm text-slate2">
          A importação por CSV entra na próxima fatia. O schema e a triagem já estão prontos.
        </div>
      ) : (
        <table className="mt-4 w-full border-collapse text-[13.5px]">
          <thead>
            <tr>
              {["Empresa", "CNAE", "Faixa", "Motivo"].map((h) => (
                <th
                  key={h}
                  className="border-b border-line px-2.5 pb-2 text-left font-mono text-[9.5px] font-medium uppercase tracking-[0.12em] text-muted"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {empresas.map((e) => {
              const f = (e.faixa ?? "C") as Faixa;
              return (
                <tr key={e.id}>
                  <td className="border-b border-linesoft px-2.5 py-2.5">
                    <div className="font-semibold">{e.razao_social}</div>
                    <div className="font-mono text-[10.5px] text-muted">{e.cnpj}</div>
                  </td>
                  <td className="border-b border-linesoft px-2.5 py-2.5 font-mono text-[12px]">
                    {e.cnae_principal ?? "—"}
                  </td>
                  <td className="border-b border-linesoft px-2.5 py-2.5">
                    <span
                      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${PILL[f]}`}
                    >
                      {ROTULO_FAIXA[f]}
                    </span>
                    {e.prioridade_maxima && (
                      <span className="ml-2 font-mono text-[10px] text-vermelho">· prioridade</span>
                    )}
                  </td>
                  <td className="border-b border-linesoft px-2.5 py-2.5 text-[12.5px] text-muted">
                    {e.motivo_triagem}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
