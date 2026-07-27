import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { mascararCnpj } from "@/lib/cnpj";
import {
  decidir,
  dDASefetivo,
  pct,
  PARAMETROS_2027,
  SAIDAS,
  type Respostas,
  type Saida,
} from "@/lib/motor";
import { anexoPorCnae } from "@/lib/triagem";
import { NovaRodada } from "@/components/NovaRodada";

/**
 * REVISÃO DA CARTEIRA — o recálculo de 1 clique da próxima janela.
 *
 * Reprocessa TODAS as análises salvas com os parâmetros vigentes hoje e mostra
 * o DIFF: quem mudou de recomendação e quanto o repasse se moveu.
 *
 * DECISÃO DE DESENHO: esta tela NÃO reescreve as análises. Um laudo emitido tem
 * os parâmetros congelados de propósito — é isso que o torna prova. Aqui o
 * contador VÊ o que mudaria e decide, empresa por empresa, se re-analisa. Cada
 * empresa que virou é uma revisão cobrável.
 */

const COR_SAIDA: Record<string, string> = {
  vermelho: "text-vermelho",
  amarelo: "text-amarelo",
  neutro: "text-neutro",
  verde: "text-verde",
};

export default async function Revisao() {
  const supabase = createClient();

  const { data: param } = await supabase
    .from("parametros_exercicio")
    .select("aliquota_cbs, aliquota_ibs, corte_s1, fronteira_min, fronteira_max, exercicio")
    .eq("exercicio", 2027)
    .maybeSingle();

  const { data: analises } = await supabase
    .from("analises")
    .select("id, empresa_id, respostas, saida, re, parametros, calculado_em")
    .limit(500);

  const ids = (analises ?? []).map((a) => a.empresa_id);
  const { data: empresas } = ids.length
    ? await supabase
        .from("empresas")
        .select("id, razao_social, cnpj, anexo, rbt12, cnae_principal")
        .in("id", ids)
    : { data: [] as never[] };

  const mapaEmpresa = new Map((empresas ?? []).map((e) => [e.id, e]));

  const aliquota = param
    ? Number(param.aliquota_cbs) + Number(param.aliquota_ibs)
    : PARAMETROS_2027.aliquota;

  const linhas = (analises ?? [])
    .map((a) => {
      const e = mapaEmpresa.get(a.empresa_id);
      if (!e || !a.respostas) return null;

      const anexo = e.anexo ?? anexoPorCnae(e.cnae_principal) ?? 1;
      const rbt12 = e.rbt12 != null ? Number(e.rbt12) : null;
      const ddas = dDASefetivo(anexo, rbt12);

      const novo = decidir(a.respostas as Respostas, {
        aliquota,
        das: ddas.das,
        corteS1: param ? Number(param.corte_s1) : PARAMETROS_2027.corteS1,
        fronteiraMin: param ? Number(param.fronteira_min) : PARAMETROS_2027.fronteiraMin,
        fronteiraMax: param ? Number(param.fronteira_max) : PARAMETROS_2027.fronteiraMax,
      });

      const antes = (a.saida ?? null) as Saida | null;
      const reAntes = a.re != null ? Number(a.re) : null;
      const mudou = antes !== null && antes !== novo.saida;
      const deltaRe = reAntes != null && isFinite(novo.re) ? novo.re - reAntes : null;

      return {
        empresaId: e.id,
        nome: e.razao_social,
        cnpj: e.cnpj,
        antes,
        depois: novo.saida,
        reAntes,
        reDepois: isFinite(novo.re) ? novo.re : null,
        deltaRe,
        mudou,
        semRbt12: rbt12 == null,
      };
    })
    .filter(Boolean) as Array<{
    empresaId: string;
    nome: string;
    cnpj: string;
    antes: Saida | null;
    depois: Saida;
    reAntes: number | null;
    reDepois: number | null;
    deltaRe: number | null;
    mudou: boolean;
    semRbt12: boolean;
  }>;

  const viraram = linhas.filter((l) => l.mudou);
  const semRbt = linhas.filter((l) => l.semRbt12).length;
  const ordenadas = [...linhas].sort((a, b) => Number(b.mudou) - Number(a.mudou));

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[19px] font-bold tracking-tight">Revisão da carteira</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            Recálculo de {linhas.length} análises com os parâmetros vigentes
            {param?.exercicio ? ` (exercício ${param.exercicio})` : ""}
          </p>
        </div>
      </div>

      {linhas.length === 0 ? (
        <div className="mt-6 rounded border border-dashed border-line bg-surface p-8 text-center text-sm text-slate2">
          Nenhuma análise salva ainda. Assim que você analisar as primeiras empresas, esta tela
          passa a mostrar o que muda a cada nova janela.
        </div>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3.5 md:grid-cols-4">
            {[
              { n: linhas.length, l: "análises revisadas", cor: "" },
              { n: viraram.length, l: "mudaram de recomendação", cor: viraram.length ? "text-vermelho" : "" },
              { n: linhas.length - viraram.length, l: "seguem válidas", cor: "text-verde" },
              { n: semRbt, l: "sem RBT12 (estimadas)", cor: semRbt ? "text-amarelo" : "" },
            ].map((c) => (
              <div key={c.l} className="rounded border border-line bg-surface p-3.5">
                <div className={`font-mono text-[22px] font-semibold ${c.cor}`}>{c.n}</div>
                <div className="mt-1 text-[11.5px] text-muted">{c.l}</div>
              </div>
            ))}
          </div>

          {viraram.length > 0 && (
            <div className="mt-5 rounded border border-[#A5F3FC] bg-accentwash px-4 py-3.5">
              <p className="max-w-[70ch] text-[13.5px] text-slate2">
                <b>{viraram.length}</b>{" "}
                {viraram.length === 1 ? "empresa mudou" : "empresas mudaram"} de recomendação com os
                parâmetros atuais. Cada uma é uma revisão para conversar com o cliente — e cobrar.
                Os laudos já emitidos continuam válidos com os parâmetros da data em que saíram.
              </p>
            </div>
          )}

          <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
            <table className="mt-4 w-full border-collapse text-[13.5px] min-w-[680px] md:min-w-0">
              <thead>
                <tr>
                  {["Empresa", "Antes", "Agora", "Repasse", "Variação", ""].map((h) => (
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
                {ordenadas.map((l) => (
                  <tr key={l.empresaId} className={l.mudou ? "bg-accentwash/40" : ""}>
                    <td className="border-b border-linesoft px-2.5 py-2.5">
                      <div className="font-semibold">{l.nome}</div>
                      <div className="font-mono text-[10.5px] text-muted">
                        {mascararCnpj(l.cnpj)}
                        {l.semRbt12 && <span className="ml-1.5 text-amarelo">· sem RBT12</span>}
                      </div>
                    </td>
                    <td className="border-b border-linesoft px-2.5 py-2.5">
                      <span className={`font-mono text-[11.5px] ${l.antes ? COR_SAIDA[SAIDAS[l.antes].cor] : "text-muted"}`}>
                        {l.antes ?? "—"}
                      </span>
                    </td>
                    <td className="border-b border-linesoft px-2.5 py-2.5">
                      <span className={`font-mono text-[11.5px] font-semibold ${COR_SAIDA[SAIDAS[l.depois].cor]}`}>
                        {l.depois}
                      </span>
                      {l.mudou && <span className="ml-1.5 font-mono text-[10px] text-accentdeep">mudou</span>}
                    </td>
                    <td className="border-b border-linesoft px-2.5 py-2.5 text-right font-mono text-[12px]">
                      {l.reDepois != null ? pct(l.reDepois) : "—"}
                    </td>
                    <td className="border-b border-linesoft px-2.5 py-2.5 text-right font-mono text-[12px]">
                      {l.deltaRe == null ? (
                        "—"
                      ) : (
                        <span className={l.deltaRe > 0 ? "text-vermelho" : l.deltaRe < 0 ? "text-verde" : "text-muted"}>
                          {l.deltaRe > 0 ? "+" : ""}
                          {(l.deltaRe * 100).toFixed(1).replace(".", ",")} p.p.
                        </span>
                      )}
                    </td>
                    <td className="border-b border-linesoft px-2.5 py-2.5 text-right">
                      <Link
                        href={`/painel/empresa/${l.empresaId}`}
                        className="rounded-sm border border-line px-3 py-1.5 text-[12.5px] font-semibold text-slate2"
                      >
                        Dossiê
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <NovaRodada totalAnalises={linhas.length} />

          <p className="mt-4 max-w-[80ch] text-[11.5px] leading-relaxed text-muted">
            Esta tela não altera nenhuma análise: ela compara o que está gravado com o que o motor
            devolveria hoje. Para atualizar uma empresa dentro desta mesma janela, abra o dossiê e
            salve a análise novamente — os laudos já emitidos ficam congelados com os números da
            data em que saíram e não mudam.
          </p>
        </>
      )}
    </div>
  );
}
