"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ROTULO_FAIXA, type Faixa } from "@/lib/triagem";
import { EXPLICA_FAIXA } from "@/lib/potencial";
import { formatarCnpj } from "@/lib/cnpj";

/**
 * CARTEIRA — o inventário completo, com busca e filtro.
 *
 * Diferença em relação à FILA (que é a lista de trabalho das faixas A e B):
 * aqui está TODA a carteira, inclusive o que foi descartado — e o motivo do
 * descarte. É a tela que responde "cadê a empresa X?" e "por que ela não está
 * na fila?".
 */

export interface EmpresaCarteira {
  id: string;
  cnpj: string;
  razao_social: string;
  cnae_principal: string | null;
  faixa: Faixa | null;
  motivo_triagem: string | null;
  prioridade_maxima: boolean;
  rbt12: number | null;
}

const PILL: Record<Faixa, string> = {
  A: "bg-vermelhowash text-vermelho",
  B: "bg-amarelowash text-amarelo",
  C: "bg-neutrowash text-slate2",
  D: "bg-neutrowash text-muted",
  MEI: "bg-neutrowash text-neutro",
  FORA: "bg-neutrowash text-muted",
};

const FILTROS: (Faixa | "TODAS" | "ANALISE")[] = ["TODAS", "ANALISE", "A", "B", "C", "D", "MEI", "FORA"];

const ROTULO_FILTRO: Record<string, string> = {
  TODAS: "Todas",
  ANALISE: "Precisam de análise",
  ...ROTULO_FAIXA,
};

const semAcento = (s: string) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function CarteiraTabela({ empresas }: { empresas: EmpresaCarteira[] }) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Faixa | "TODAS" | "ANALISE">("TODAS");

  const contagem = useMemo(() => {
    const c: Record<string, number> = { TODAS: empresas.length, ANALISE: 0 };
    for (const e of empresas) {
      const f = e.faixa ?? "C";
      c[f] = (c[f] ?? 0) + 1;
      if (f === "A" || f === "B") c.ANALISE++;
    }
    return c;
  }, [empresas]);

  const lista = useMemo(() => {
    const q = semAcento(busca.trim());
    const soDigitos = q.replace(/\D/g, "");
    return empresas.filter((e) => {
      if (filtro === "ANALISE" && e.faixa !== "A" && e.faixa !== "B") return false;
      if (filtro !== "TODAS" && filtro !== "ANALISE" && e.faixa !== filtro) return false;
      if (!q) return true;
      if (semAcento(e.razao_social).includes(q)) return true;
      if (soDigitos && e.cnpj.includes(soDigitos)) return true;
      if (e.cnae_principal && e.cnae_principal.includes(q)) return true;
      return false;
    });
  }, [empresas, busca, filtro]);

  const explica = filtro !== "TODAS" && filtro !== "ANALISE" ? EXPLICA_FAIXA[filtro] : null;

  return (
    <div>
      {/* BUSCA + FILTROS */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="flex min-w-[240px] flex-1 items-center rounded-sm border border-line bg-surface px-3 focus-within:border-accent">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
          </svg>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, CNPJ ou CNAE"
            className="w-full bg-transparent px-2.5 py-2 text-[13.5px] outline-none"
          />
          {busca && (
            <button onClick={() => setBusca("")} className="px-1 font-mono text-[13px] text-muted">
              ×
            </button>
          )}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {FILTROS.map((f) => {
          const n = contagem[f] ?? 0;
          if (f !== "TODAS" && f !== "ANALISE" && n === 0) return null;
          const ativo = filtro === f;
          return (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`rounded-full border px-3 py-1.5 text-[12px] font-medium ${
                ativo
                  ? "border-ink bg-ink text-white"
                  : "border-line bg-surface text-slate2 hover:border-accent"
              }`}
            >
              {ROTULO_FILTRO[f]}
              <span className={`ml-1.5 font-mono text-[11px] ${ativo ? "opacity-70" : "text-muted"}`}>
                {n}
              </span>
            </button>
          );
        })}
      </div>

      {explica && (
        <div className="mt-3 rounded-sm border border-line bg-surface2 px-3.5 py-2.5">
          <p className="text-[12.5px] text-slate2">{explica.oQueE}</p>
          <p className="mt-1 text-[12.5px]">
            <b className="text-ink">O que fazer:</b>{" "}
            <span className="text-slate2">{explica.oQueFazer}</span>
          </p>
        </div>
      )}

      <div className="mt-3 text-[12.5px] text-muted">
        {lista.length === empresas.length
          ? `${empresas.length} empresas`
          : `${lista.length} de ${empresas.length} empresas`}
      </div>

      {lista.length === 0 ? (
        <div className="mt-3 rounded border border-dashed border-line bg-surface p-8 text-center text-[13.5px] text-slate2">
          Nenhuma empresa encontrada com esse filtro.
          {busca && (
            <>
              {" "}
              <button onClick={() => setBusca("")} className="font-semibold text-accentdeep">
                Limpar a busca
              </button>
            </>
          )}
        </div>
      ) : (
        <table className="mt-2 w-full border-collapse text-[13.5px]">
          <thead>
            <tr>
              {["Empresa", "CNAE", "RBT12", "Faixa", "Por quê", ""].map((h) => (
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
            {lista.map((e) => {
              const f = (e.faixa ?? "C") as Faixa;
              return (
                <tr key={e.id}>
                  <td className="border-b border-linesoft px-2.5 py-2.5">
                    <div className="font-semibold">{e.razao_social}</div>
                    <div className="font-mono text-[10.5px] text-muted">{formatarCnpj(e.cnpj)}</div>
                  </td>
                  <td className="border-b border-linesoft px-2.5 py-2.5 font-mono text-[12px]">
                    {e.cnae_principal ?? "—"}
                  </td>
                  <td className="border-b border-linesoft px-2.5 py-2.5 font-mono text-[11.5px]">
                    {e.rbt12 != null ? (
                      Number(e.rbt12).toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                        maximumFractionDigits: 0,
                      })
                    ) : (
                      <span className="text-amarelo">informar</span>
                    )}
                  </td>
                  <td className="border-b border-linesoft px-2.5 py-2.5">
                    <span
                      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${PILL[f]}`}
                    >
                      {ROTULO_FAIXA[f]}
                    </span>
                    {e.prioridade_maxima && (
                      <span className="ml-1.5 font-mono text-[10px] text-vermelho">· prioridade</span>
                    )}
                  </td>
                  <td className="border-b border-linesoft px-2.5 py-2.5 text-[12px] text-muted">
                    {e.motivo_triagem}
                  </td>
                  <td className="border-b border-linesoft px-2.5 py-2.5 text-right">
                    <Link
                      href={`/painel/empresa/${e.id}`}
                      className="whitespace-nowrap rounded-sm border border-line px-3 py-1.5 text-[12.5px] font-semibold text-slate2"
                    >
                      Dossiê
                    </Link>
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
