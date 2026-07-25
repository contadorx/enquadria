"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { decidir, dDASefetivo, pct, moeda, SAIDAS, PARAMETROS_2027, type Respostas } from "@/lib/motor";
import { anexoPorCnae } from "@/lib/triagem";
import { parseValorBRL } from "@/lib/csv";
import { Gauge } from "@/components/Gauge";

const PERGUNTAS: {
  chave: keyof Respostas;
  titulo: string;
  dica?: string;
  opcoes: [string, number][];
}[] = [
  {
    chave: "b2b",
    titulo: "Quanto do faturamento vem de vendas para outras empresas?",
    opcoes: [["até 20%", 0.12], ["20–40%", 0.3], ["40–60%", 0.5], ["60–80%", 0.7], ["mais de 80%", 0.9]],
  },
  {
    chave: "qual",
    titulo: "Desses clientes empresa, quantos estão no Lucro Real ou Presumido?",
    dica: "Cliente no Simples tradicional ou MEI não aproveita o crédito — é aqui que a maioria das análises erra.",
    opcoes: [["quase nenhum", 0.1], ["menos da metade", 0.33], ["mais da metade", 0.65], ["quase todos", 0.92]],
  },
  {
    chave: "cred",
    titulo: "Quanto da receita corresponde a compras que geram crédito?",
    dica: "Não entram folha, pró-labore, aluguel de pessoa física nem compras de fornecedor do Simples tradicional.",
    opcoes: [["até 15%", 0.1], ["15–30%", 0.22], ["30–45%", 0.37], ["45–60%", 0.52], ["mais de 60%", 0.7]],
  },
  {
    chave: "folha",
    titulo: "A folha representa quanto do faturamento?",
    dica: "Serve de conferência: folha alta com crédito alto costuma ser resposta inconsistente.",
    opcoes: [["até 15%", 0.12], ["15–30%", 0.22], ["30–45%", 0.37], ["mais de 45%", 0.55]],
  },
  {
    chave: "preco",
    titulo: "A empresa consegue renegociar preço com os clientes empresa?",
    opcoes: [["tem poder de preço", 3], ["com esforço", 2], ["contratos travados", 1], ["não, o mercado define", 0]],
  },
  {
    chave: "conc",
    titulo: "Os concorrentes diretos estão majoritariamente fora do Simples?",
    opcoes: [["sim", 1], ["não", 0], ["não sei", 0]],
  },
  {
    chave: "exig",
    titulo: "Algum cliente já sinalizou que vai exigir crédito integral em 2027?",
    opcoes: [["sim", 1], ["não", 0], ["não sei", 0]],
  },
];

const CLASSE_SAIDA: Record<string, string> = {
  vermelho: "bg-vermelho",
  amarelo: "bg-amarelo",
  neutro: "bg-neutro",
  verde: "bg-verde",
};

const PADRAO: Respostas = { b2b: 0.9, qual: 0.92, cred: 0.7, folha: 0.12, preco: 2, conc: 1, exig: 0 };

function MotorInterno() {
  const params = useSearchParams();
  const router = useRouter();
  const empresaId = params.get("empresa");

  const [empresa, setEmpresa] = useState<{
    razao_social: string;
    anexo: number | null;
    cnae_principal?: string | null;
    rbt12?: number | null;
  } | null>(null);
  const [rbt12, setRbt12] = useState<string>("");
  const [r, setR] = useState<Respostas>(PADRAO);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [analiseId, setAnaliseId] = useState<string | null>(null);
  const [laudoId, setLaudoId] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [termoNome, setTermoNome] = useState("");
  const [termoEmail, setTermoEmail] = useState("");

  useEffect(() => {
    if (!empresaId) return;
    const supabase = createClient();
    (async () => {
      const { data: emp } = await supabase
        .from("empresas")
        .select("razao_social, anexo, cnae_principal, rbt12")
        .eq("id", empresaId)
        .maybeSingle();
      if (emp) {
        setEmpresa(emp);
        if (emp.rbt12 != null) setRbt12(String(emp.rbt12));
      }
      const { data: an } = await supabase
        .from("analises")
        .select("id, respostas")
        .eq("empresa_id", empresaId)
        .maybeSingle();
      if (an?.respostas) setR(an.respostas as Respostas);
      if (an?.id) {
        setAnaliseId(an.id);
        const { data: l } = await supabase
          .from("laudos")
          .select("id")
          .eq("analise_id", an.id)
          .maybeSingle();
        if (l?.id) setLaudoId(l.id);
      }
    })();
  }, [empresaId]);

  // dDAS EFETIVO na prévia: mesmo cálculo do servidor (anexo + RBT12 informado)
  const anexoEfetivo = empresa?.anexo ?? anexoPorCnae(empresa?.cnae_principal) ?? 1;
  const rbt12Num = parseValorBRL(rbt12) ?? null;
  const ddas = dDASefetivo(anexoEfetivo, rbt12Num);
  const parametros = { ...PARAMETROS_2027, das: ddas.das };
  const res = decidir(r, parametros);
  const saida = SAIDAS[res.saida];

  async function salvar() {
    if (!empresaId) return;
    setSalvando(true);
    try {
      const resp = await fetch("/api/analise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa_id: empresaId, respostas: r, rbt12: rbt12Num }),
      });
      if (resp.ok) {
        const json = await resp.json();
        if (json.analise_id) setAnaliseId(json.analise_id);
        setSalvo(true);
        router.refresh();
        setTimeout(() => setSalvo(false), 2500);
      }
    } finally {
      setSalvando(false);
    }
  }

  async function emitirLaudo() {
    if (!analiseId) return;
    setOcupado("laudo");
    try {
      const resp = await fetch("/api/laudo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analise_id: analiseId }),
      });
      const json = await resp.json();
      if (resp.ok && json.laudo_id) {
        setLaudoId(json.laudo_id);
        window.open(`/doc/laudo/${json.laudo_id}`, "_blank");
        router.refresh();
      } else {
        alert(
          "Não foi possível emitir o laudo: " +
            (json.erro ?? "erro desconhecido") +
            "\n\nSe a mensagem mencionar a função emitir_laudo, a migration 0003 ainda não foi aplicada no banco."
        );
      }
    } finally {
      setOcupado(null);
    }
  }

  async function enviarTermo() {
    if (!analiseId || !termoNome || !termoEmail) return;
    setOcupado("termo");
    try {
      const resp = await fetch("/api/termo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analise_id: analiseId,
          decisao: res.saida === "S4" ? "optar" : "permanecer",
          nome: termoNome,
          email: termoEmail,
          empresa: empresa?.razao_social,
        }),
      });
      const json = await resp.json();
      if (resp.ok && json.termo_id) {
        window.open(`/doc/termo/${json.termo_id}`, "_blank");
        router.refresh();
      } else {
        alert(
          "Não foi possível gerar o termo: " +
            (json.erro ?? "erro desconhecido") +
            "\n\nSe mencionar registrar_termo, a migration 0003 ainda não foi aplicada."
        );
      }
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[19px] font-bold tracking-tight">
            {empresa?.razao_social ?? "Análise de enquadramento"}
          </h1>
          <p className="mt-0.5 text-[13px] text-muted">
            Cenário para 2027 · CBS {pct(PARAMETROS_2027.aliquota - 0.001, 1)} + IBS 0,1%
            {empresa?.anexo ? ` · Anexo ${empresa.anexo}` : ""}
          </p>
        </div>
        {empresaId && (
          <button
            onClick={salvar}
            disabled={salvando}
            className="rounded-sm bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {salvando ? "Salvando..." : salvo ? "Salvo ✓" : "Salvar análise"}
          </button>
        )}
      </div>

      {!empresaId && (
        <p className="mt-3 rounded-sm bg-accentwash px-3 py-2 text-[12.5px] text-accentdeep">
          Modo de demonstração — abra uma empresa pela fila para salvar a análise.
        </p>
      )}

      <div className="mt-5 grid grid-cols-1 items-start gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded border border-line bg-surface p-4 shadow-card">
          <div className="mb-3 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
            Premissas informadas
          </div>

          <div className="mb-3.5 border-b border-linesoft pb-3.5">
            <div className="text-[13.5px] font-semibold">
              Receita bruta dos últimos 12 meses (RBT12)
            </div>
            <p className="mb-2 mt-0.5 text-[12px] text-muted">
              É o que torna a alíquota do Simples EFETIVA, não a nominal do topo da faixa.
              Sem informar, o cálculo usa o topo da faixa {ddas.faixa} — estimativa conservadora.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center rounded-sm border border-line px-2.5 focus-within:border-accent">
                <span className="font-mono text-[12px] text-muted">R$</span>
                <input
                  value={rbt12}
                  onChange={(e) => setRbt12(e.target.value)}
                  inputMode="decimal"
                  placeholder="ex.: 480.000"
                  className="w-36 bg-transparent px-2 py-1.5 font-mono text-[13px] outline-none"
                />
              </div>
              <span
                className={`rounded-sm px-2 py-1 font-mono text-[11px] ${
                  ddas.fonte === "efetiva"
                    ? "bg-verdewash text-verde"
                    : "bg-accentwash text-accentdeep"
                }`}
              >
                Anexo {ddas.anexo} · faixa {ddas.faixa} ·{" "}
                {ddas.fonte === "efetiva"
                  ? `efetiva ${pct(ddas.aliquota)}`
                  : `topo ${pct(ddas.aliquota)} (estimado)`}
              </span>
            </div>
          </div>

          {PERGUNTAS.map((p, i) => (
            <div
              key={p.chave}
              className={i < PERGUNTAS.length - 1 ? "mb-3.5 border-b border-linesoft pb-3.5" : ""}
            >
              <div className="text-[13.5px] font-semibold">{p.titulo}</div>
              {p.dica && <p className="mb-2 mt-0.5 text-[12px] text-muted">{p.dica}</p>}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {p.opcoes.map(([rotulo, valor]) => {
                  const ativo = Math.abs((r[p.chave] as number) - valor) < 1e-9;
                  return (
                    <button
                      key={rotulo}
                      onClick={() => setR({ ...r, [p.chave]: valor })}
                      className={`rounded-sm border px-2.5 py-1.5 font-mono text-[11.5px] ${
                        ativo
                          ? "border-ink bg-ink font-medium text-white"
                          : "border-line bg-surface text-slate2 hover:border-accent"
                      }`}
                    >
                      {rotulo}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-5">
          <div className="rounded border border-line bg-surface p-4 shadow-card">
            <div className="mb-3 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
              A decisão em uma linha
            </div>
            <Gauge re={res.re} fc={res.fc} />

            <div className="mt-4 overflow-hidden rounded border border-line">
              <div
                className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-white ${
                  CLASSE_SAIDA[saida.cor]
                }`}
              >
                <span className="font-mono text-[11px] tracking-[0.14em]">{res.saida}</span>
                <span className="text-[14.5px] font-bold">{saida.titulo}</span>
              </div>
              <div className="bg-surface px-4 py-3.5 text-[13.5px] text-slate2">
                {saida.descricao}
                {res.saida === "S4" && isFinite(res.re) && (
                  <>
                    {" "}
                    Repasse de {pct(res.re)} contra {pct(res.fc)} de ganho do comprador — folga de{" "}
                    {(res.folga * 100).toFixed(1).replace(".", ",")} pontos.
                  </>
                )}
                {res.prioridade && (
                  <div className="mt-2.5 rounded-sm bg-vermelhowash px-2.5 py-2 font-mono text-[11px] tracking-wide text-vermelho">
                    PRIORIDADE FORÇADA — a decisão já saiu do campo fiscal.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded border border-line bg-surface p-4 shadow-card">
            <div className="mb-3 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
              Como o número se forma
            </div>
            <table className="w-full border-collapse text-[13px]">
              <tbody>
                {[
                  ["IBS/CBS no regime regular sobre a base", pct(res.ch)],
                  ["Compras que geram crédito", pct(r.cred)],
                  [
                    `Sai do DAS — PIS/Cofins (efetiva ${pct(ddas.aliquota)} × ${pct(ddas.sharePC)})`,
                    "−" + pct(ddas.das),
                  ],
                  ["Receita vendida a quem aproveita crédito", pct(res.rq)],
                ].map(([k, v]) => (
                  <tr key={k}>
                    <td className="border-b border-linesoft py-2">{k}</td>
                    <td className="border-b border-linesoft py-2 text-right font-mono">{v}</td>
                  </tr>
                ))}
                <tr>
                  <td className="pt-3 font-bold">Custo líquido / repasse necessário</td>
                  <td className="pt-3 text-right font-mono font-bold text-accentdeep">{pct(res.re)}</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
              {ddas.fonte === "efetiva" ? (
                <>
                  dDAS pela alíquota EFETIVA do Simples sobre a RBT12 de {moeda(ddas.rbt12)} (Anexo{" "}
                  {ddas.anexo}, faixa {ddas.faixa}).{" "}
                </>
              ) : (
                <>
                  RBT12 não informada — dDAS pelo TOPO da faixa {ddas.faixa} do Anexo {ddas.anexo}
                  {" "}(estimativa conservadora, tende a superestimar o custo). Informe a RBT12 para o número exato.{" "}
                </>
              )}
              Estimativa de cenário a partir das premissas informadas. Não substitui apuração
              com dados fiscais efetivos. A responsabilidade técnica é do contador que assina.
            </p>
          </div>

          {analiseId && (
            <div className="rounded border border-line bg-surface p-4 shadow-card">
              <div className="mb-3 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
                Entregáveis
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={emitirLaudo}
                  disabled={ocupado === "laudo"}
                  className="rounded-sm border border-line px-3.5 py-2 text-[13px] font-semibold text-slate2 disabled:opacity-40"
                >
                  {ocupado === "laudo" ? "..." : laudoId ? "Reabrir laudo" : "Emitir laudo"}
                </button>
                {laudoId && (
                  <a
                    href={`/doc/laudo/${laudoId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-sm border border-line px-3.5 py-2 text-[13px] font-semibold text-accentdeep"
                  >
                    Abrir para PDF
                  </a>
                )}
              </div>

              <div className="mt-4 border-t border-linesoft pt-4">
                <div className="mb-2 text-[12.5px] font-semibold">Termo de ciência</div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    value={termoNome}
                    onChange={(e) => setTermoNome(e.target.value)}
                    placeholder="Nome do signatário"
                    className="flex-1 rounded-sm border border-line px-3 py-2 text-[13px] outline-none focus:border-accent"
                  />
                  <input
                    value={termoEmail}
                    onChange={(e) => setTermoEmail(e.target.value)}
                    placeholder="email@empresa.com"
                    className="flex-1 rounded-sm border border-line px-3 py-2 text-[13px] outline-none focus:border-accent"
                  />
                  <button
                    onClick={enviarTermo}
                    disabled={ocupado === "termo" || !termoNome || !termoEmail}
                    className="whitespace-nowrap rounded-sm bg-ink px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
                  >
                    {ocupado === "termo" ? "..." : "Gerar termo"}
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-muted">
                  Decisão registrada: {res.saida === "S4" ? "optar pelo híbrido" : "permanecer no tradicional"}.
                  Com ZapSign configurado, o link de assinatura é criado automaticamente.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Motor() {
  return (
    <Suspense fallback={<div className="text-sm text-muted">Carregando…</div>}>
      <MotorInterno />
    </Suspense>
  );
}
