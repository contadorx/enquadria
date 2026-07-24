"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parsearCarteira, CSV_EXEMPLO, type ResultadoParse } from "@/lib/csv";
import { ROTULO_FAIXA, triar, type Faixa } from "@/lib/triagem";

const ORDEM: Faixa[] = ["A", "B", "C", "D", "MEI", "FORA"];
const COR: Record<Faixa, string> = {
  A: "text-vermelho",
  B: "text-amarelo",
  C: "text-slate1",
  D: "text-muted",
  MEI: "text-neutro",
  FORA: "text-muted",
};

export function Importador() {
  const router = useRouter();
  const [nomeArquivo, setNomeArquivo] = useState<string>("");
  const [parse, setParse] = useState<ResultadoParse | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<{
    gravadas: number;
    enriquecidas: number;
    receita_ativa: boolean;
  } | null>(null);

  // triagem local só para a prévia — o servidor recalcula ao gravar
  const previaFaixas = parse
    ? parse.linhas.reduce(
        (acc, l) => {
          const f = triar({
            cnpj: l.cnpj,
            razao_social: l.razao_social,
            cnae_principal: l.cnae_principal ?? null,
            porte: l.porte ?? null,
            situacao: l.situacao ?? null,
            regime: l.regime ?? null,
            faturamento_faixa: l.faturamento_faixa ?? null,
          }).faixa;
          acc[f] = (acc[f] ?? 0) + 1;
          return acc;
        },
        {} as Record<Faixa, number>
      )
    : null;

  async function aoSelecionar(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    setErro(null);
    setFeito(null);
    setNomeArquivo(arquivo.name);
    const texto = await arquivo.text();
    const resultado = parsearCarteira(texto);
    if (!resultado.colunas_reconhecidas.cnpj) {
      setErro("Não encontrei a coluna de CNPJ. Confira o cabeçalho do arquivo.");
      setParse(null);
      return;
    }
    setParse(resultado);
  }

  function usarExemplo() {
    setErro(null);
    setFeito(null);
    setNomeArquivo("exemplo.csv");
    setParse(parsearCarteira(CSV_EXEMPLO));
  }

  async function gravar() {
    if (!parse) return;
    setEnviando(true);
    setErro(null);
    try {
      const resp = await fetch("/api/importar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          linhas: parse.linhas,
          arquivo: nomeArquivo,
          stats: {
            total_lidas: parse.total_lidas,
            descartadas: parse.descartadas,
            duplicadas: parse.duplicadas,
          },
        }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.erro ?? "falha ao gravar");
      setFeito(json);
      setParse(null);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "erro inesperado");
    } finally {
      setEnviando(false);
    }
  }

  if (feito) {
    return (
      <div className="rounded border border-verde bg-verdewash p-6">
        <div className="flex items-center gap-2 text-verde">
          <span className="font-mono text-sm">✓</span>
          <span className="text-[15px] font-semibold">
            {feito.gravadas} empresas na carteira
          </span>
        </div>
        <p className="mt-2 text-[13.5px] text-slate2">
          {feito.receita_ativa
            ? `${feito.enriquecidas} enriquecidas contra a base da Receita.`
            : "Enriquecimento da Receita não configurado — a triagem usou os dados do arquivo."}
        </p>
        <div className="mt-4 flex gap-2">
          <a
            href="/painel"
            className="rounded-sm bg-ink px-4 py-2 text-sm font-semibold text-white"
          >
            Ver o mapa de risco
          </a>
          <button
            onClick={() => setFeito(null)}
            className="rounded-sm border border-line px-4 py-2 text-sm font-semibold text-slate2"
          >
            Importar outro
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="rounded border border-dashed border-line bg-surface p-6">
        <div className="flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-sm bg-ink px-4 py-2.5 text-sm font-semibold text-white">
            Escolher arquivo CSV
            <input type="file" accept=".csv,text/csv" onChange={aoSelecionar} className="hidden" />
          </label>
          <button
            onClick={usarExemplo}
            className="rounded-sm border border-line px-4 py-2.5 text-sm font-semibold text-slate2"
          >
            Usar carteira de exemplo
          </button>
          {nomeArquivo && (
            <span className="font-mono text-[12px] text-muted">{nomeArquivo}</span>
          )}
        </div>
        <p className="mt-4 max-w-[70ch] text-[12.5px] leading-relaxed text-muted">
          Aceita qualquer exportação com pelo menos CNPJ e razão social — as colunas são
          reconhecidas por sinônimos. CNAE, porte e situação, quando faltam, vêm do
          enriquecimento contra a Receita. CNPJs inválidos e repetidos são descartados
          antes de gravar.
        </p>
      </div>

      {erro && (
        <p className="mt-4 rounded-sm bg-vermelhowash px-3 py-2 text-[13px] text-vermelho">{erro}</p>
      )}

      {parse && previaFaixas && (
        <div className="mt-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[15px] font-bold">Prévia da triagem</div>
              <div className="mt-0.5 text-[13px] text-muted">
                {parse.linhas.length} empresas válidas · {parse.descartadas} descartadas ·{" "}
                {parse.duplicadas} duplicadas
              </div>
            </div>
            <button
              onClick={gravar}
              disabled={enviando}
              className="rounded-sm bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {enviando ? "Gravando..." : `Gravar ${parse.linhas.length} empresas`}
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded border border-linesoft bg-linesoft md:grid-cols-6">
            {ORDEM.map((f) => (
              <div key={f} className="bg-surface p-3.5">
                <div className={`font-mono text-[24px] font-semibold leading-none ${COR[f]}`}>
                  {previaFaixas[f] ?? 0}
                </div>
                <div className="mt-1.5 text-[11.5px] leading-tight text-muted">
                  {ROTULO_FAIXA[f]}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 overflow-hidden rounded border border-line">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  {["Empresa", "CNPJ", "CNAE", "Origem"].map((h) => (
                    <th
                      key={h}
                      className="border-b border-line bg-surface2 px-3 py-2 text-left font-mono text-[9.5px] font-medium uppercase tracking-[0.12em] text-muted"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parse.linhas.slice(0, 8).map((l) => (
                  <tr key={l.cnpj}>
                    <td className="border-b border-linesoft px-3 py-2 font-medium">
                      {l.razao_social}
                    </td>
                    <td className="border-b border-linesoft px-3 py-2 font-mono text-[11.5px] text-muted">
                      {l.cnpj}
                    </td>
                    <td className="border-b border-linesoft px-3 py-2 font-mono text-[11.5px]">
                      {l.cnae_principal ?? "—"}
                    </td>
                    <td className="border-b border-linesoft px-3 py-2 text-[12px] text-muted">
                      {l.cnae_principal ? "arquivo" : "via Receita"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parse.linhas.length > 8 && (
              <div className="bg-surface2 px-3 py-2 text-[12px] text-muted">
                + {parse.linhas.length - 8} empresas
              </div>
            )}
          </div>

          {parse.colunas_ignoradas.length > 0 && (
            <p className="mt-3 text-[11.5px] text-muted">
              Colunas ignoradas: {parse.colunas_ignoradas.join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
