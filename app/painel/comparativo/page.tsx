"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import { moeda, pct } from "@/lib/motor";
import {
  compararRegimes,
  premissasDoSetor,
  anexoDoSetor,
  fatorR,
  PREMISSAS_PADRAO,
  ROTULO_SETOR,
  TETOS,
  type Setor,
  type Premissas,
  type EntradaComparativo,
} from "@/lib/comparativo";

/**
 * COMPARATIVO DE REGIMES — a tela que torna o produto perene.
 *
 * Depois de setembro, a pergunta deixa de ser "opto pelo híbrido?" e vira "em
 * que regime este cliente deveria estar?". Aqui todas as premissas ficam à
 * vista e editáveis: o contador ajusta ao caso dele e o número se recompõe.
 */

const SETORES: Setor[] = ["comercio", "industria", "servicos", "transporte_carga", "construcao"];

function Campo({
  label,
  valor,
  onChange,
  sufixo,
  dica,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
  sufixo?: string;
  dica?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-[12px] font-semibold text-slate2">{label}</label>
      <div className="flex items-center rounded-sm border border-line px-2.5 focus-within:border-accent">
        <input
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          inputMode="decimal"
          className="w-full bg-transparent py-1.5 font-mono text-[13px] outline-none"
        />
        {sufixo && <span className="pl-1 font-mono text-[11px] text-muted">{sufixo}</span>}
      </div>
      {dica && <p className="mt-0.5 text-[10.5px] text-muted">{dica}</p>}
    </div>
  );
}

function ComparativoInterno() {
  const params = useSearchParams();
  const empresaId = params.get("empresa");

  const [nome, setNome] = useState<string>("");
  const [setor, setSetor] = useState<Setor>("comercio");
  const [anexo, setAnexo] = useState(1);
  const [receita, setReceita] = useState("1200000");
  const [folha, setFolha] = useState("180000");
  const [compras, setCompras] = useState("30");
  const [margem, setMargem] = useState("15");
  const [p, setP] = useState<Premissas>(PREMISSAS_PADRAO);
  const [mostrarPremissas, setMostrarPremissas] = useState(false);
  const [emitindo, setEmitindo] = useState(false);
  const [bloqueio, setBloqueio] = useState<string | null>(null);

  useEffect(() => {
    if (!empresaId) return;
    const supabase = createClient();
    (async () => {
      const { data } = await supabase
        .from("empresas")
        .select("razao_social, anexo, rbt12")
        .eq("id", empresaId)
        .maybeSingle();
      if (data) {
        setNome(data.razao_social ?? "");
        if (data.anexo) setAnexo(Number(data.anexo));
        if (data.rbt12) setReceita(String(Number(data.rbt12)));
      }
    })();
  }, [empresaId]);

  // presunções acompanham o setor, mas o contador pode sobrescrever
  useEffect(() => {
    setP((atual) => ({ ...premissasDoSetor(setor, atual) }));
    setAnexo(anexoDoSetor(setor));
  }, [setor]);

  const num = (s: string) => {
    const n = Number(String(s).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };

  const entrada: EntradaComparativo = {
    receita: num(receita),
    anexo,
    setor,
    folha: num(folha),
    compras_credito: num(compras) / 100,
    margem_lucro: num(margem) / 100,
  };

  const r = compararRegimes(entrada, p);
  const fr = fatorR(entrada.receita, entrada.folha);

  async function emitir() {
    setEmitindo(true);
    setBloqueio(null);
    try {
      const resp = await fetch("/api/comparativo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa_id: empresaId, entrada, premissas: p }),
      });
      const json = await resp.json();
      if (resp.ok && json.comparativo_id) {
        window.open(`/doc/comparativo/${json.comparativo_id}`, "_blank");
      } else if (json.bloqueado_por_plano) {
        setBloqueio(json.erro as string);
      } else {
        alert("Não foi possível emitir: " + (json.erro ?? "erro desconhecido"));
      }
    } finally {
      setEmitindo(false);
    }
  }
  const maior = Math.max(...r.regimes.map((x) => x.total), 1);

  const setPct = (k: keyof Premissas) => (v: string) =>
    setP({ ...p, [k]: num(v) / 100 });
  const asPct = (v: number) => (v * 100).toFixed(2).replace(".", ",");

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[19px] font-bold tracking-tight">
            {nome || "Comparativo de regimes"}
          </h1>
          <p className="mt-0.5 text-[13px] text-muted">
            Simples × Presumido × Real no mundo IBS/CBS · estimativa de cenário
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {empresaId && (
            <Link
              href={`/painel/empresa/${empresaId}`}
              className="rounded-sm border border-line px-4 py-2 text-[13px] font-semibold text-slate2"
            >
              Ver dossiê
            </Link>
          )}
          <button
            onClick={emitir}
            disabled={emitindo || entrada.receita <= 0}
            className="rounded-sm bg-ink px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
          >
            {emitindo ? "Emitindo…" : "Emitir comparativo"}
          </button>
        </div>
      </div>

      {bloqueio && (
        <div className="mt-4 rounded-sm border border-accent bg-accentwash p-3.5">
          <p className="text-[13px] text-slate2">{bloqueio}</p>
          <a
            href="/painel/planos"
            className="mt-2 inline-block rounded-sm bg-accent px-3.5 py-2 text-[13px] font-bold text-[#04212B]"
          >
            Ver o PRO — R$ 47/mês
          </a>
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 items-start gap-5 lg:grid-cols-[340px_1fr]">
        {/* ENTRADA */}
        <div className="space-y-4">
          <div className="rounded border border-line bg-surface p-4 shadow-card">
            <div className="mb-3 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
              A empresa
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[12px] font-semibold text-slate2">Setor</label>
                <div className="flex flex-wrap gap-1.5">
                  {SETORES.map((s) => (
                    <button
                      key={s}
                      onClick={() => setSetor(s)}
                      className={`rounded-sm border px-2.5 py-1.5 text-[11.5px] ${
                        setor === s
                          ? "border-ink bg-ink font-medium text-white"
                          : "border-line bg-surface text-slate2 hover:border-accent"
                      }`}
                    >
                      {ROTULO_SETOR[s]}
                    </button>
                  ))}
                </div>
              </div>
              <Campo label="Receita anual" valor={receita} onChange={setReceita} sufixo="R$" />
              <Campo
                label="Folha anual (com pró-labore)"
                valor={folha}
                onChange={setFolha}
                sufixo="R$"
                dica={`Fator R: ${(fr * 100).toFixed(1).replace(".", ",")}% ${
                  fr >= 0.28 ? "— serviço vai ao Anexo III" : "— serviço cai no Anexo V"
                }`}
              />
              <Campo
                label="Compras que geram crédito"
                valor={compras}
                onChange={setCompras}
                sufixo="% da receita"
              />
              <Campo
                label="Margem de lucro contábil"
                valor={margem}
                onChange={setMargem}
                sufixo="% da receita"
                dica="Base do Lucro Real"
              />
              <div>
                <label className="mb-1 block text-[12px] font-semibold text-slate2">
                  Anexo do Simples
                </label>
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((a) => (
                    <button
                      key={a}
                      onClick={() => setAnexo(a)}
                      className={`h-8 w-8 rounded-sm border font-mono text-[12px] ${
                        anexo === a
                          ? "border-ink bg-ink font-medium text-white"
                          : "border-line bg-surface text-slate2"
                      }`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* PREMISSAS */}
          <div className="rounded border border-line bg-surface p-4 shadow-card">
            <button
              onClick={() => setMostrarPremissas(!mostrarPremissas)}
              className="flex w-full items-center justify-between font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted"
            >
              Premissas do cenário
              <span className="text-accentdeep">{mostrarPremissas ? "ocultar" : "editar"}</span>
            </button>
            {mostrarPremissas && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Campo label="CBS" valor={asPct(p.cbs)} onChange={setPct("cbs")} sufixo="%" />
                <Campo label="IBS" valor={asPct(p.ibs)} onChange={setPct("ibs")} sufixo="%" />
                <Campo label="ICMS efetivo" valor={asPct(p.icms)} onChange={setPct("icms")} sufixo="%" />
                <Campo label="ISS" valor={asPct(p.iss)} onChange={setPct("iss")} sufixo="%" />
                <Campo label="Presunção IRPJ" valor={asPct(p.presuncao_irpj)} onChange={setPct("presuncao_irpj")} sufixo="%" />
                <Campo label="Presunção CSLL" valor={asPct(p.presuncao_csll)} onChange={setPct("presuncao_csll")} sufixo="%" />
                <Campo label="CPP sobre folha" valor={asPct(p.cpp)} onChange={setPct("cpp")} sufixo="%" />
                <Campo label="CSLL" valor={asPct(p.csll)} onChange={setPct("csll")} sufixo="%" />
              </div>
            )}
            <p className="mt-3 text-[11px] leading-relaxed text-muted">
              A alíquota da CBS para 2027 ainda não foi publicada — o valor acima é estimativa
              declarada. Ajuste as premissas ao caso e elas saem impressas no comparativo.
            </p>
          </div>
        </div>

        {/* RESULTADO */}
        <div className="space-y-4">
          <div className="rounded border border-line bg-surface p-4 shadow-card">
            <div className="mb-3 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
              Carga anual estimada por regime
            </div>
            <div className="space-y-3">
              {r.regimes.map((x) => {
                const melhor = r.menor?.regime === x.regime;
                return (
                  <div key={x.regime}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-[13.5px] font-semibold">
                        {x.nome}
                        {melhor && (
                          <span className="ml-2 rounded-full bg-verdewash px-2 py-0.5 font-mono text-[10px] text-verde">
                            menor carga
                          </span>
                        )}
                      </span>
                      <span className="font-mono text-[14px] font-semibold">
                        {moeda(x.total)}{" "}
                        <span className="text-[11.5px] font-normal text-muted">
                          · {pct(x.sobre_receita)}
                        </span>
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-linesoft">
                      <div
                        className={`h-full ${melhor ? "bg-verde" : x.impedimento ? "bg-neutro" : "bg-accent"}`}
                        style={{ width: `${Math.min((x.total / maior) * 100, 100)}%` }}
                      />
                    </div>
                    {x.impedimento && (
                      <p className="mt-1 font-mono text-[10.5px] text-vermelho">{x.impedimento}</p>
                    )}
                  </div>
                );
              })}
            </div>

            {r.menor && (
              <div className="mt-4 rounded-sm border border-[#A5F3FC] bg-accentwash px-3.5 py-3 text-[13px] text-slate2">
                Pelo cenário informado, <b>{r.menor.nome}</b> apresenta a menor carga:{" "}
                <b>{moeda(r.menor.total)}</b> ao ano ({pct(r.menor.sobre_receita)} da receita).
                Compare com o regime atual da empresa antes de recomendar — mudança de regime tem
                efeitos que não cabem nesta conta.
              </div>
            )}
          </div>

          {/* COMPOSIÇÃO */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {r.regimes.map((x) => (
              <div key={x.regime} className="rounded border border-line bg-surface p-4 shadow-card">
                <div className="mb-2 text-[13px] font-bold">{x.nome}</div>
                <table className="w-full border-collapse text-[12.5px]">
                  <tbody>
                    {x.composicao.map((l) => (
                      <tr key={l.rotulo}>
                        <td className="border-b border-linesoft py-1.5 pr-2">
                          <div>{l.rotulo}</div>
                          <div className="text-[10.5px] leading-tight text-muted">{l.origem}</div>
                        </td>
                        <td
                          className={`border-b border-linesoft py-1.5 text-right align-top font-mono ${
                            l.valor < 0 ? "text-verde" : ""
                          }`}
                        >
                          {moeda(l.valor)}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td className="pt-2 font-bold">Total</td>
                      <td className="pt-2 text-right font-mono font-bold text-accentdeep">
                        {moeda(x.total)}
                      </td>
                    </tr>
                  </tbody>
                </table>
                {x.credito_ao_cliente > 0 && (
                  <p className="mt-2 rounded-sm bg-surface2 px-2.5 py-1.5 text-[11.5px] text-slate2">
                    Crédito transferido ao cliente PJ:{" "}
                    <b>{moeda(x.credito_ao_cliente)}</b> por ano.
                  </p>
                )}
                <ul className="mt-2 list-disc pl-4 text-[11px] text-muted">
                  {x.observacoes.map((o, i) => (
                    <li key={i} className="mb-0.5">{o}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <p className="max-w-[80ch] text-[11px] leading-relaxed text-muted">
            Comparativo de cenários a partir das premissas informadas. Não é apuração: não
            considera substituição tributária, benefícios setoriais, créditos acumulados, IS,
            regimes específicos nem o custo de conformidade de cada regime. Teto do Simples:{" "}
            {moeda(TETOS.simples)} · teto do Presumido: {moeda(TETOS.presumido)}. A decisão e a
            responsabilidade técnica são do contador que assina.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Comparativo() {
  return (
    <Suspense fallback={<div className="text-sm text-muted">Carregando…</div>}>
      <ComparativoInterno />
    </Suspense>
  );
}
