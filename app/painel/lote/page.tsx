"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { decidir, dDASefetivo, pct, PARAMETROS_2027, SAIDAS, type Saida } from "@/lib/motor";
import { anexoPorCnae } from "@/lib/triagem";
import { premissasPadrao, ROTULO_CONFIANCA, COR_CONFIANCA, type Confianca } from "@/lib/premissas-padrao";
import { mascararCnpj } from "@/lib/cnpj";

/**
 * ANÁLISE EM LOTE — de carteira importada a fila inteira analisada em um clique.
 *
 * A prévia roda no navegador só para o contador VER antes de gravar; ao
 * confirmar, o servidor recalcula tudo (nunca confiamos no número do cliente).
 */

interface Empresa {
  id: string;
  cnpj: string;
  razao_social: string;
  cnae_principal: string | null;
  anexo: number | null;
  rbt12: number | null;
  faixa: string | null;
}

const COR_SAIDA: Record<string, string> = {
  vermelho: "text-vermelho",
  amarelo: "text-amarelo",
  neutro: "text-neutro",
  verde: "text-verde",
};

export default function Lote() {
  const router = useRouter();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [jaAnalisadas, setJaAnalisadas] = useState<Set<string>>(new Set());
  const [carregando, setCarregando] = useState(true);
  const [gravando, setGravando] = useState(false);
  const [feito, setFeito] = useState<{ gravadas: number; puladas: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: emp } = await supabase
        .from("empresas")
        .select("id, cnpj, razao_social, cnae_principal, anexo, rbt12, faixa")
        .in("faixa", ["A", "B"])
        .limit(1000);
      const { data: an } = await supabase.from("analises").select("empresa_id");
      setEmpresas((emp ?? []) as Empresa[]);
      setJaAnalisadas(new Set((an ?? []).map((a) => a.empresa_id)));
      setCarregando(false);
    })();
  }, []);

  const previa = empresas.map((e) => {
    const p = premissasPadrao(e.cnae_principal);
    const anexo = e.anexo ?? anexoPorCnae(e.cnae_principal) ?? 1;
    const ddas = dDASefetivo(anexo, e.rbt12 != null ? Number(e.rbt12) : null);
    const r = decidir(p.respostas, { ...PARAMETROS_2027, das: ddas.das });
    return { e, p, r, jaTem: jaAnalisadas.has(e.id), semRbt12: e.rbt12 == null };
  });

  const novas = previa.filter((x) => !x.jaTem);
  const porSaida = previa.reduce((acc, x) => {
    acc[x.r.saida] = (acc[x.r.saida] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const revisar = previa.filter((x) => x.p.confianca !== "alta").length;

  async function rodar() {
    setGravando(true);
    setErro(null);
    try {
      const resp = await fetch("/api/analise/lote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.erro ?? "falha ao gravar");
      setFeito({ gravadas: json.gravadas, puladas: json.puladas });
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "erro inesperado");
    } finally {
      setGravando(false);
    }
  }

  if (carregando) return <div className="text-sm text-muted">Carregando a fila…</div>;

  if (empresas.length === 0) {
    return (
      <div>
        <h1 className="text-[19px] font-bold tracking-tight">Análise em lote</h1>
        <div className="mt-6 rounded border border-dashed border-line bg-surface p-8 text-center text-sm text-slate2">
          Nenhuma empresa nas faixas de análise ainda.{" "}
          <Link href="/painel/importar" className="font-semibold text-accentdeep">
            Importe a carteira
          </Link>{" "}
          primeiro.
        </div>
      </div>
    );
  }

  if (feito) {
    return (
      <div>
        <h1 className="text-[19px] font-bold tracking-tight">Análise em lote</h1>
        <div className="mt-5 rounded border border-verde bg-verdewash p-6">
          <div className="text-[15px] font-semibold text-verde">
            ✓ {feito.gravadas} análises geradas
          </div>
          <p className="mt-1.5 text-[13.5px] text-slate2">
            {feito.puladas > 0 && (
              <>
                {feito.puladas} empresas foram preservadas porque você já as tinha analisado à mão.{" "}
              </>
            )}
            As premissas são estimativas por CNAE. Revise as empresas antes de emitir o laudo —
            principalmente as marcadas como &quot;Revise&quot;.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/painel/fila" className="rounded-sm bg-ink px-4 py-2.5 text-sm font-semibold text-white">
              Ir para a fila
            </Link>
            <Link href="/painel" className="rounded-sm border border-line px-4 py-2.5 text-sm font-semibold text-slate2">
              Ver o mapa
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[19px] font-bold tracking-tight">Análise em lote</h1>
          <p className="mt-0.5 max-w-[72ch] text-[13px] text-muted">
            Roda a fila inteira de uma vez usando o perfil típico de cada atividade, para você não
            precisar responder as sete perguntas empresa por empresa. Depois é só revisar.
          </p>
        </div>
        <button
          onClick={rodar}
          disabled={gravando}
          className="rounded-sm bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {gravando ? "Analisando…" : `Analisar ${novas.length || previa.length} empresas`}
        </button>
      </div>

      {erro && (
        <p className="mt-4 rounded-sm bg-vermelhowash px-3 py-2 text-[13px] text-vermelho">{erro}</p>
      )}

      {/* AVISO HONESTO */}
      <div className="mt-4 rounded border border-amarelo bg-amarelowash px-4 py-3">
        <p className="max-w-[80ch] text-[13px] text-slate2">
          <b className="text-ink">Premissas estimadas, não informadas.</b> O lote parte do perfil
          típico do CNAE — não conhece o cliente. Serve para você ver a carteira inteira e priorizar,
          mas <b>o laudo leva a sua assinatura</b>: revise cada empresa antes de emitir, começando
          pelas marcadas como &quot;Revise&quot;. Análises que você já fez à mão não são
          sobrescritas.
        </p>
      </div>

      {/* RESUMO */}
      <div className="mt-4 grid grid-cols-2 gap-3.5 md:grid-cols-4">
        {[
          { n: previa.length, l: "empresas na fila", cor: "" },
          { n: novas.length, l: "sem análise ainda", cor: "text-accentdeep" },
          { n: (porSaida.S4 ?? 0) + (porSaida.S5 ?? 0), l: "tendem a optar", cor: "text-verde" },
          { n: revisar, l: "exigem revisão atenta", cor: revisar ? "text-amarelo" : "" },
        ].map((c) => (
          <div key={c.l} className="rounded border border-line bg-surface p-3.5">
            <div className={`font-mono text-[22px] font-semibold ${c.cor}`}>{c.n}</div>
            <div className="mt-1 text-[11.5px] text-muted">{c.l}</div>
          </div>
        ))}
      </div>

      {/* PRÉVIA */}
      <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <table className="mt-5 w-full border-collapse text-[13.5px] min-w-[680px] md:min-w-0">
          <thead>
            <tr>
              {["Empresa", "Perfil aplicado", "Confiança", "Resultado", "Repasse", ""].map((h) => (
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
            {previa.slice(0, 60).map(({ e, p, r, jaTem, semRbt12 }) => (
              <tr key={e.id} className={jaTem ? "opacity-55" : ""}>
                <td className="border-b border-linesoft px-2.5 py-2.5">
                  <div className="font-semibold">{e.razao_social}</div>
                  <div className="font-mono text-[10.5px] text-muted">
                    {mascararCnpj(e.cnpj)}
                    {jaTem && <span className="ml-1.5 text-accentdeep">· já analisada</span>}
                    {semRbt12 && <span className="ml-1.5 text-amarelo">· sem RBT12</span>}
                  </div>
                </td>
                <td className="border-b border-linesoft px-2.5 py-2.5 text-[12px] text-muted">
                  {p.justificativa}
                </td>
                <td className="border-b border-linesoft px-2.5 py-2.5">
                  <span className={`font-mono text-[11.5px] font-semibold ${COR_CONFIANCA[p.confianca as Confianca]}`}>
                    {ROTULO_CONFIANCA[p.confianca as Confianca]}
                  </span>
                </td>
                <td className="border-b border-linesoft px-2.5 py-2.5">
                  <span className={`font-mono text-[11.5px] font-semibold ${COR_SAIDA[SAIDAS[r.saida as Saida].cor]}`}>
                    {r.saida}
                  </span>{" "}
                  <span className="text-[12px] text-muted">{SAIDAS[r.saida as Saida].titulo}</span>
                </td>
                <td className="border-b border-linesoft px-2.5 py-2.5 text-right font-mono text-[12px]">
                  {isFinite(r.re) ? pct(r.re) : "—"}
                </td>
                <td className="border-b border-linesoft px-2.5 py-2.5 text-right">
                  <Link
                    href={`/painel/motor?empresa=${e.id}`}
                    className="whitespace-nowrap rounded-sm border border-line px-3 py-1.5 text-[12.5px] font-semibold text-slate2"
                  >
                    Revisar
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {previa.length > 60 && (
        <p className="mt-2 text-[12px] text-muted">+ {previa.length - 60} empresas na fila</p>
      )}
    </div>
  );
}
