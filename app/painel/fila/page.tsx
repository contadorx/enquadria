import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { mascararCnpj } from "@/lib/cnpj";
import { pct } from "@/lib/motor";
import { type Faixa } from "@/lib/triagem";

const STATUS_ROTULO: Record<string, string> = {
  pendente: "pendente",
  em_analise: "em análise",
  laudo_emitido: "laudo emitido",
  termo_enviado: "termo enviado",
  decidida: "decidida",
};
const STATUS_COR: Record<string, string> = {
  pendente: "text-muted",
  em_analise: "text-slate2",
  laudo_emitido: "text-verde",
  termo_enviado: "text-verde",
  decidida: "text-verde",
};
const PILL: Partial<Record<Faixa, string>> = {
  A: "bg-vermelhowash text-vermelho",
  B: "bg-amarelowash text-amarelo",
};

type EmpresaFila = {
  id: string;
  cnpj: string;
  razao_social: string;
  cnae_principal: string | null;
  faixa: Faixa | null;
  prioridade_maxima: boolean;
};

export default async function Fila() {
  const supabase = createClient();

  const { data: empresas } = await supabase
    .from("empresas")
    .select("id, cnpj, razao_social, cnae_principal, faixa, prioridade_maxima")
    .in("faixa", ["A", "B"])
    .order("prioridade_maxima", { ascending: false })
    .order("faixa", { ascending: true })
    .limit(200);

  const { data: analises } = await supabase
    .from("analises")
    .select("empresa_id, status, re, saida");

  const porEmpresa = new Map(
    (analises ?? []).map((a) => [a.empresa_id, a])
  );

  const fila = (empresas ?? []) as EmpresaFila[];
  const concluidas = (analises ?? []).filter((a) =>
    ["laudo_emitido", "termo_enviado", "decidida"].includes(a.status)
  ).length;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[19px] font-bold tracking-tight">Fila de análise</h1>
          <p className="mt-0.5 max-w-[70ch] text-[13px] text-muted">
            Só as empresas que exigem decisão nesta janela, na ordem de quem paga melhor.{" "}
            {concluidas} de {fila.length} já têm decisão registrada.
          </p>
        </div>
      </div>

      {fila.length === 0 ? (
        <div className="mt-6 rounded border border-dashed border-line bg-surface p-8 text-center text-sm text-slate2">
          Nenhuma empresa nas faixas de análise ainda.{" "}
          <Link href="/painel/importar" className="font-semibold text-accentdeep">
            Importe a carteira
          </Link>{" "}
          para montar a fila.
        </div>
      ) : (
        <table className="mt-4 w-full border-collapse text-[13.5px]">
          <thead>
            <tr>
              {["Empresa", "Atividade", "Faixa", "Repasse", "Estado", ""].map((h) => (
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
            {fila.map((e) => {
              const a = porEmpresa.get(e.id);
              const f = (e.faixa ?? "B") as Faixa;
              const status = a?.status ?? "pendente";
              return (
                <tr key={e.id}>
                  <td className="border-b border-linesoft px-2.5 py-2.5">
                    <div className="font-semibold">{e.razao_social}</div>
                    <div className="font-mono text-[10.5px] text-muted">
                      {mascararCnpj(e.cnpj)}
                    </div>
                  </td>
                  <td className="border-b border-linesoft px-2.5 py-2.5 font-mono text-[11.5px] text-muted">
                    {e.cnae_principal ?? "—"}
                  </td>
                  <td className="border-b border-linesoft px-2.5 py-2.5">
                    <span
                      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${
                        PILL[f] ?? "bg-neutrowash text-neutro"
                      }`}
                    >
                      {e.prioridade_maxima ? "Prioridade" : f === "A" ? "Urgente" : "Avaliar"}
                    </span>
                  </td>
                  <td className="border-b border-linesoft px-2.5 py-2.5 text-right font-mono">
                    {a?.re != null ? pct(Number(a.re)) : "—"}
                  </td>
                  <td
                    className={`border-b border-linesoft px-2.5 py-2.5 font-mono text-[11px] ${
                      STATUS_COR[status]
                    }`}
                  >
                    {STATUS_ROTULO[status]}
                  </td>
                  <td className="border-b border-linesoft px-2.5 py-2.5 text-right">
                    <div className="flex justify-end gap-1.5">
                      <Link
                        href={`/painel/empresa/${e.id}`}
                        className="rounded-sm border border-line px-3 py-1.5 text-[12.5px] font-semibold text-muted"
                      >
                        Dossiê
                      </Link>
                      <Link
                        href={`/painel/motor?empresa=${e.id}`}
                        className="rounded-sm border border-line px-3 py-1.5 text-[12.5px] font-semibold text-slate2"
                      >
                        {a ? "Rever" : "Analisar"}
                      </Link>
                    </div>
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
