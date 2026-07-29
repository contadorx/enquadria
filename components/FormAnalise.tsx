"use client";

import { useState } from "react";
import { decidir, dDASefetivo, pct, moeda, SAIDAS, PARAMETROS_2027, type Respostas } from "@/lib/motor";
import { anexoPorCnae } from "@/lib/triagem";
import { parseValorBRL } from "@/lib/csv";
import { Gauge } from "@/components/Gauge";

/**
 * AS PERGUNTAS E A CONTA — agora um componente, não uma tela.
 *
 * Vive dentro da gaveta da fila e da página da empresa. Foi a última coisa que
 * obrigava o contador a sair da lista para trabalhar: analisar era um endereço.
 * A prévia roda no navegador só para ele ver o número mudar enquanto responde;
 * o valor que vale é sempre o que o servidor recalcula ao salvar.
 */

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

export const RESPOSTAS_PADRAO: Respostas = {
  b2b: 0.9,
  qual: 0.92,
  cred: 0.7,
  folha: 0.12,
  preco: 2,
  conc: 1,
  exig: 0,
};

export function FormAnalise({
  empresaId,
  anexo,
  cnae,
  rbt12Inicial,
  respostasIniciais,
  estimada,
  aoSalvar,
}: {
  empresaId: string;
  anexo: number | null;
  cnae: string | null;
  rbt12Inicial: number | null;
  respostasIniciais: Respostas | null;
  /** premissas vieram do lote por CNAE — o contador precisa confirmar antes do papel */
  estimada?: boolean;
  aoSalvar?: (analiseId: string) => void;
}) {
  const [r, setR] = useState<Respostas>(respostasIniciais ?? RESPOSTAS_PADRAO);
  const [rbt12, setRbt12] = useState(rbt12Inicial != null ? String(rbt12Inicial) : "");
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const anexoEfetivo = anexo ?? anexoPorCnae(cnae) ?? 1;
  const rbt12Num = parseValorBRL(rbt12) ?? null;
  const ddas = dDASefetivo(anexoEfetivo, rbt12Num);
  const res = decidir(r, { ...PARAMETROS_2027, das: ddas.das });
  const saida = SAIDAS[res.saida];

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      const resp = await fetch("/api/analise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa_id: empresaId, respostas: r, rbt12: rbt12Num }),
      });
      const json = await resp.json();
      if (resp.ok && json.analise_id) {
        setSalvo(true);
        setTimeout(() => setSalvo(false), 2500);
        aoSalvar?.(json.analise_id as string);
      } else {
        setErro(json.erro ?? "não foi possível salvar a análise");
      }
    } catch {
      setErro("falha de rede ao salvar a análise");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-4">
      {estimada && (
        <div className="rounded-sm border border-amarelo bg-amarelowash px-3 py-2.5 text-[12.5px] text-slate2">
          <b className="text-ink">Premissas estimadas pelo CNAE.</b> Vieram da análise em lote e ainda
          não foram confirmadas por você. Confira cada resposta antes de emitir o laudo — o documento
          sai com a sua assinatura.
        </div>
      )}

      <div className="rounded border border-line bg-surface p-4">
        <div className="mb-3 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
          Premissas informadas
        </div>

        <div className="mb-3.5 border-b border-linesoft pb-3.5">
          <div className="text-[13.5px] font-semibold">Receita bruta dos últimos 12 meses (RBT12)</div>
          <p className="mb-2 mt-0.5 text-[12px] text-muted">
            É o que torna a alíquota do Simples EFETIVA, não a nominal do topo da faixa. Sem informar,
            o cálculo usa a faixa {ddas.faixa} — estimativa conservadora.
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
                ddas.fonte === "efetiva" ? "bg-verdewash text-verde" : "bg-accentwash text-accentdeep"
              }`}
            >
              Anexo {ddas.anexo} · faixa {ddas.faixa} ·{" "}
              {ddas.fonte === "efetiva" ? `efetiva ${pct(ddas.aliquota)}` : `topo ${pct(ddas.aliquota)} (estimado)`}
            </span>
          </div>
          {ddas.acimaDoTeto && (
            <p className="mt-2 rounded-sm bg-vermelhowash px-2.5 py-2 text-[12px] text-vermelho">
              RBT12 acima do teto do Simples (R$ 4,8 milhões). Esta empresa está excluída do Simples e
              não tem decisão a tomar nesta janela.
            </p>
          )}
        </div>

        {PERGUNTAS.map((p, i) => (
          <div key={p.chave} className={i < PERGUNTAS.length - 1 ? "mb-3.5 border-b border-linesoft pb-3.5" : ""}>
            <div className="text-[13.5px] font-semibold">{p.titulo}</div>
            {p.dica && <p className="mb-2 mt-0.5 text-[12px] text-muted">{p.dica}</p>}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {p.opcoes.map(([rotulo, valor]) => {
                const ativo = Math.abs((r[p.chave] as number) - valor) < 1e-9;
                return (
                  <button
                    key={rotulo}
                    onClick={() => setR({ ...r, [p.chave]: valor })}
                    className={`min-h-[38px] rounded-sm border px-2.5 py-1.5 font-mono text-[11.5px] ${
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

      <div className="rounded border border-line bg-surface p-4">
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

        <table className="mt-3 w-full border-collapse text-[13px]">
          <tbody>
            {[
              ["IBS/CBS no regime regular sobre a base", pct(res.ch)],
              ["Compras que geram crédito", pct(r.cred)],
              [`Sai do DAS — PIS/Cofins (${pct(ddas.aliquota)} × ${pct(ddas.sharePC)})`, "−" + pct(ddas.das)],
              ["Receita vendida a quem aproveita crédito", pct(res.rq)],
            ].map(([k, v]) => (
              <tr key={k}>
                <td className="border-b border-linesoft py-2 pr-2">{k}</td>
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
              dDAS pela alíquota EFETIVA do Simples sobre a RBT12 de {moeda(ddas.rbt12)} (Anexo {ddas.anexo},
              faixa {ddas.faixa}).{" "}
            </>
          ) : (
            <>
              RBT12 não informada — dDAS pelo topo da faixa {ddas.faixa} do Anexo {ddas.anexo} (estimativa
              conservadora). Informe a RBT12 para o número exato.{" "}
            </>
          )}
          A alíquota de referência de IBS/CBS só é fixada por Resolução do Senado até 31/10/2026 — depois
          do fechamento desta janela. Estimativa de cenário a partir das premissas informadas; não
          substitui apuração com dados fiscais efetivos. A responsabilidade técnica é do contador que
          assina.
        </p>
      </div>

      {erro && (
        <p className="rounded-sm bg-vermelhowash px-3 py-2 text-[12.5px] text-vermelho">{erro}</p>
      )}

      <button
        onClick={salvar}
        disabled={salvando}
        className="w-full rounded-sm bg-ink px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
      >
        {salvando ? "Salvando..." : salvo ? "Análise salva ✓" : "Salvar análise"}
      </button>
    </div>
  );
}
