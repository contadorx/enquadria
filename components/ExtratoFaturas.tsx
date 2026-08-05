"use client";

import { useMemo, useState } from "react";
import {
  filtrar, totalizar, descreverFiltro, temFiltro, avisoDeTamanho, opcoesDe,
  type FiltroFaturas,
} from "@/lib/filtro-faturas";
import { ROTULO_STATUS, dataBR, moedaCentavos, statusEfetivo, type Fatura } from "@/lib/faturas";

/**
 * O EXTRATO COMPLETO — com filtros, e com o filtro escrito ao lado do total.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * O QUE ISTO SUBSTITUI: uma tabela das 30 faturas mais recentes, sem filtro.
 * Ela respondia "o que aconteceu esta semana?" e nenhuma das perguntas que
 * aparecem quando alguém liga — quanto aquele escritório já pagou, o que venceu
 * em julho, quem está com boleto aberto acima de tanto.
 *
 * A REGRA DE DESENHO, e ela vale mais que os filtros: o total NUNCA aparece
 * sozinho. Ao lado dele fica escrito, em português, de que recorte ele é. Um
 * filtro esquecido de dez minutos atrás transforma um relatório certo num
 * relatório errado com cara de certo, e o único remédio é a frase.
 *
 * A filtragem roda no navegador sobre a lista já carregada. Isso tem teto, e o
 * teto é declarado: passando dele a tela avisa que está olhando um pedaço, em
 * vez de deixar o silêncio sugerir que aquilo é o histórico inteiro.
 */

const campo =
  "rounded-sm border border-line bg-surface px-2.5 py-1.5 text-[12.5px] outline-none focus:border-accent";
const rotulo = "mb-1 block font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted";

const CORES: Record<string, string> = {
  pago: "bg-verdewash text-verde",
  pendente: "bg-accentwash text-accentdeep",
  vencido: "bg-vermelhowash text-vermelho",
  cancelado: "bg-surface2 text-muted",
  estornado: "bg-surface2 text-muted",
};

export function ExtratoFaturas({
  faturas,
  nomes,
}: {
  faturas: Fatura[];
  /** tenant_id → nome do escritório; sem isso o filtro mostraria uuid */
  nomes: Record<string, string>;
}) {
  const [f, setF] = useState<FiltroFaturas>({ campoData: "vencimento" });
  const hoje = useMemo(() => new Date(), []);

  const { planos, contratantes } = useMemo(() => opcoesDe(faturas), [faturas]);
  const lista = useMemo(() => filtrar(faturas, f, hoje), [faturas, f, hoje]);
  const t = useMemo(() => totalizar(lista, hoje), [lista, hoje]);
  const aviso = avisoDeTamanho(faturas.length);

  const set = (k: keyof FiltroFaturas, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  /* string vazia vira `undefined`, não `""`: "não filtrei" e "filtrei por vazio"
     são coisas diferentes, e o segundo esconderia as faturas sem plano */
  const texto = (k: keyof FiltroFaturas) => (e: { target: { value: string } }) =>
    set(k, e.target.value || undefined);
  /* número: `""` vira null (não filtrei) e "0" vira 0 (filtro de verdade) */
  const numero = (k: keyof FiltroFaturas) => (e: { target: { value: string } }) => {
    const bruto = e.target.value.trim();
    set(k, bruto === "" ? null : Number(bruto.replace(",", ".")));
  };

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-bold">Extrato de faturas</h2>
        <span className="text-[12px] text-muted">
          {faturas.length} carregada{faturas.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* ─────────────────────────────────────────────────────── os filtros */}
      <div className="rounded border border-line bg-surface2 p-3">
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className={rotulo}>Contratante</span>
            <select className={`${campo} w-full`} value={f.contratante ?? ""} onChange={texto("contratante")}>
              <option value="">todos</option>
              {contratantes.map((id) => (
                <option key={id} value={id}>{nomes[id] ?? id.slice(0, 8)}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className={rotulo}>Plano</span>
            <select className={`${campo} w-full`} value={f.plano ?? ""} onChange={texto("plano")}>
              <option value="">todos</option>
              {planos.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>

          <label className="block">
            <span className={rotulo}>Situação</span>
            <select className={`${campo} w-full`} value={f.status ?? ""} onChange={texto("status")}>
              <option value="">todas</option>
              {(["pago", "pendente", "vencido", "cancelado", "estornado"] as const).map((s) => (
                <option key={s} value={s}>{ROTULO_STATUS[s]}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className={rotulo}>Busca</span>
            <input
              className={`${campo} w-full`}
              placeholder="descrição ou plano"
              value={f.busca ?? ""}
              onChange={texto("busca")}
            />
          </label>

          {/**
            * QUAL DATA. Vencimento e pagamento respondem perguntas diferentes —
            * "o que venceu em julho" e "o que entrou em julho" — e sem o
            * seletor a tela responderia sempre a primeira, calada sobre isso.
            */}
          <label className="block">
            <span className={rotulo}>Filtrar a data de</span>
            <select
              className={`${campo} w-full`}
              value={f.campoData ?? "vencimento"}
              onChange={(e) => set("campoData", e.target.value as "vencimento" | "pago_em")}
            >
              <option value="vencimento">vencimento</option>
              <option value="pago_em">pagamento</option>
            </select>
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className={rotulo}>De</span>
              <input type="date" className={`${campo} w-full`} value={f.de ?? ""} onChange={texto("de")} />
            </label>
            <label className="block">
              <span className={rotulo}>Até</span>
              <input type="date" className={`${campo} w-full`} value={f.ate ?? ""} onChange={texto("ate")} />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className={rotulo}>Valor mín. (R$)</span>
              <input
                inputMode="decimal"
                className={`${campo} w-full`}
                value={f.valorMin ?? ""}
                onChange={numero("valorMin")}
              />
            </label>
            <label className="block">
              <span className={rotulo}>Valor máx. (R$)</span>
              <input
                inputMode="decimal"
                className={`${campo} w-full`}
                value={f.valorMax ?? ""}
                onChange={numero("valorMax")}
              />
            </label>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => setF({ campoData: "vencimento" })}
              disabled={!temFiltro(f)}
              className="rounded-sm border border-line px-3 py-1.5 text-[12px] font-semibold disabled:opacity-40"
              title={temFiltro(f) ? "Volta ao extrato inteiro" : "Nenhum filtro aplicado"}
            >
              Limpar filtros
            </button>
          </div>
        </div>
      </div>

      {/* ───────────────────────── o total, SEMPRE com o recorte ao lado */}
      <div className="mt-3 rounded border border-line bg-surface p-3.5">
        <p className="text-[12px] text-muted">
          <b className="text-ink">{t.linhas}</b> fatura{t.linhas === 1 ? "" : "s"} ·{" "}
          {descreverFiltro(f, (id) => nomes[id])}
        </p>
        <div className="mt-2 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Somam", moedaCentavos(t.total_centavos), ""],
            ["Pagas", moedaCentavos(t.pago_centavos), "dinheiro que entrou"],
            ["Em aberto", moedaCentavos(t.aberto_centavos), "ainda no prazo"],
            ["Vencidas", moedaCentavos(t.vencido_centavos), "pela data, não pelo rótulo"],
          ].map(([k, v, sub]) => (
            <div key={k} className="rounded-sm border border-line bg-surface2 p-2.5">
              <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">{k}</div>
              <div className="mt-0.5 font-mono text-[16px] font-bold">{v}</div>
              {sub && <div className="text-[10.5px] text-muted">{sub}</div>}
            </div>
          ))}
        </div>
      </div>

      {aviso && (
        <p className="mt-2 rounded-sm border border-amarelo/40 bg-amarelowash px-3 py-2 text-[12px] text-slate2">
          {aviso}
        </p>
      )}

      {/* ─────────────────────────────────────────────────────── a tabela */}
      <div className="mt-3 overflow-x-auto rounded border border-line bg-surface">
        <table className="w-full border-collapse text-[12.5px]">
          <thead className="border-b border-line text-left text-[10.5px] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Contratante</th>
              <th className="px-3 py-2.5 font-semibold">Descrição</th>
              <th className="px-3 py-2.5 font-semibold">Plano</th>
              <th className="px-3 py-2.5 font-semibold">Valor</th>
              <th className="px-3 py-2.5 font-semibold">Vencimento</th>
              <th className="px-3 py-2.5 font-semibold">Pago em</th>
              <th className="px-3 py-2.5 font-semibold">Situação</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((x) => {
              const s = statusEfetivo(x, hoje);
              return (
                <tr key={x.id} className="border-b border-linesoft">
                  <td className="px-3 py-2.5">
                    {x.tenant_id ? nomes[x.tenant_id] ?? "(conta apagada)" : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-muted">{x.descricao ?? "—"}</td>
                  <td className="px-3 py-2.5 text-muted">{x.plano_nome ?? "—"}</td>
                  <td className="px-3 py-2.5 font-mono">{moedaCentavos(Number(x.valor_centavos ?? 0))}</td>
                  <td className="px-3 py-2.5 font-mono text-[11.5px]">{dataBR(x.vencimento)}</td>
                  <td className="px-3 py-2.5 font-mono text-[11.5px]">{dataBR(x.pago_em)}</td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${CORES[s] ?? ""}`}>
                      {ROTULO_STATUS[s]}
                    </span>
                  </td>
                </tr>
              );
            })}
            {!lista.length && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted">
                  {faturas.length
                    ? "Nenhuma fatura com esses filtros. Limpe algum para voltar a ver o extrato."
                    : "Nenhuma fatura registrada ainda."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
