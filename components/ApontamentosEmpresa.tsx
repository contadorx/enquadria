"use client";

import { useCallback, useEffect, useState } from "react";
import { ROTULO_STATUS, type StatusApontamento } from "@/lib/apontamentos";
import { COR_SEVERIDADE } from "@/lib/radar";

interface Materia {
  id: string;
  titulo: string;
  resumo: string;
  o_que_fazer: string | null;
  fonte: string | null;
  severidade: string;
  vigencia_em: string | null;
  publicado_em: string;
}

interface Linha {
  id: string;
  status: StatusApontamento;
  nota: string | null;
  criado_em: string;
  tratado_em: string | null;
  radar_itens: Materia | null;
}

/**
 * O QUE A REFORMA JÁ APONTOU NESTA EMPRESA.
 *
 * É a peça que transforma o radar em monitor. O radar diz "esta norma atinge 23
 * clientes seus" e some; aqui fica o registro por empresa, com o que foi feito
 * a respeito — que é o que o contador mostra ao cliente no fim do ano para
 * justificar o honorário do ano inteiro.
 *
 * TRÊS DECISÕES, e não duas: "tratei", "não se aplica" e "virou serviço". A
 * terceira existe porque é a que fecha a conta do produto — cada marco da
 * transição é uma revisão cobrável, e sem registrar isso ninguém sabe quanto a
 * carteira rendeu de revisão no ano.
 *
 * O que NÃO tem botão é `superado`: quem supera é a varredura, olhando o
 * critério. Deixar a tela marcar isso confundiria "o fato mudou" com "eu
 * decidi" — e são exatamente as duas coisas que este registro separa.
 */
export function ApontamentosEmpresa({
  empresaId,
  /**
   * QUEM CONTA É QUEM JÁ TEM A LISTA — 10/08/2026.
   *
   * A aba da ficha mostra "Apontamentos da Reforma · 3" no rótulo e o cockpit
   * mostra o selo "reforma 3" na linha da empresa. Se cada superfície contasse
   * por conta própria seriam consultas diferentes para o mesmo número — e elas
   * divergiriam por meio segundo justamente enquanto alguém trata um ponto,
   * que é o pior momento possível para dois números discordarem na tela.
   */
  aoContarPendentes,
  /** avisa o cockpit de que o selo mudou, para a fila se redesenhar */
  aoMudar,
}: {
  empresaId: string;
  aoContarPendentes?: (abertos: number) => void;
  aoMudar?: () => void;
}) {
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  /** o ponto que está esperando o valor do serviço */
  const [cobrando, setCobrando] = useState<string | null>(null);
  const [valor, setValor] = useState("");

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/apontamentos?empresa=${empresaId}`, { cache: "no-store" });
      const j = await r.json();
      const lista = (j.apontamentos ?? []) as Linha[];
      setLinhas(lista);
      aoContarPendentes?.(lista.filter((l) => l.status === "novo").length);
    } catch {
      setLinhas([]);
      /* falha de rede NÃO vira zero: zero diz "conferi e não há nada", e aqui
         o que houve foi não conseguir conferir. O rótulo fica sem número. */
    }
  }, [empresaId, aoContarPendentes]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function decidir(id: string, status: StatusApontamento, honorarioCentavos?: number | null) {
    setOcupado(id);
    try {
      await fetch("/api/apontamentos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          status,
          ...(status === "virou_servico" ? { honorario_centavos: honorarioCentavos ?? null } : {}),
        }),
      });
      await carregar();
      aoMudar?.();
    } finally {
      setOcupado(null);
      setCobrando(null);
      setValor("");
    }
  }

  /**
   * QUANTO FOI COBRADO — o campo que faltava para o rótulo virar registro.
   *
   * "Virou serviço" mudava a cor do botão e a informação morria ali. Sem valor,
   * ninguém responde "quanto a carteira rendeu de revisão no ano" — que é a
   * pergunta de março de 2027 e o argumento de renovação da assinatura.
   *
   * O valor é OPCIONAL de propósito: obrigar a informar transformaria um clique
   * de dois segundos numa decisão de preço, e o contador deixaria de marcar. É
   * melhor ter o registro do serviço sem valor do que não ter registro nenhum;
   * o relatório anual conta quantos ficaram sem valor e diz isso na cara.
   */
  const emCentavos = (txt: string): number | null => {
    const n = Number(txt.replace(/\./g, "").replace(",", ".").trim());
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
  };

  if (linhas === null) {
    return <p className="text-[12.5px] text-muted">Carregando os apontamentos…</p>;
  }

  if (linhas.length === 0) {
    return (
      <p className="text-[12.5px] text-muted">
        Nenhuma norma da transição atingiu esta empresa até agora. A varredura roda todo dia.
      </p>
    );
  }

  const abertos = linhas.filter((l) => l.status === "novo").length;

  return (
    <div>
      <p className="mb-2.5 text-[12.5px] text-slate2">
        {abertos > 0 ? (
          <>
            <b className="text-ink">{abertos}</b> {abertos === 1 ? "aponta" : "apontam"} trabalho
            pendente. O resto é histórico.
          </>
        ) : (
          <>Tudo tratado. O histórico fica para o relatório do cliente.</>
        )}
      </p>

      <ul className="space-y-2">
        {linhas.map((l) => {
          const m = l.radar_itens;
          const novo = l.status === "novo";
          return (
            <li
              key={l.id}
              className={`rounded-sm border p-3 ${
                novo ? "border-accent bg-accentwash" : "border-linesoft bg-surface2"
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className={`text-[13px] font-semibold ${novo ? "text-ink" : "text-slate2"}`}>
                  {m?.titulo ?? "matéria removida"}
                </span>
                <span className="font-mono text-[10.5px] text-muted">
                  {!novo && `${ROTULO_STATUS[l.status]} · `}
                  {new Date(l.criado_em).toLocaleDateString("pt-BR")}
                </span>
              </div>

              {m && (
                <p className={`mt-1 text-[12px] leading-relaxed ${COR_SEVERIDADE[m.severidade] ?? "text-slate2"}`}>
                  {m.resumo}
                </p>
              )}

              {/* o "o que fazer" é a parte cara de escrever e a única que a
                  norma não dá — fica a um clique, aberta por quem vai agir */}
              {m?.o_que_fazer && (
                <>
                  <button
                    // ux-ok: o clique abre o texto imediatamente abaixo do botão
                    onClick={() => setAberto(aberto === l.id ? null : l.id)}
                    className="mt-1.5 text-[11.5px] font-semibold text-accentdeep underline underline-offset-2"
                  >
                    {aberto === l.id ? "ocultar" : "o que fazer"}
                  </button>
                  {aberto === l.id && (
                    <p className="mt-1.5 rounded-sm bg-surface px-2.5 py-2 text-[12px] leading-relaxed text-slate2">
                      {m.o_que_fazer}
                      {m.fonte && (
                        <span className="mt-1 block font-mono text-[10.5px] text-muted">
                          {m.fonte}
                        </span>
                      )}
                    </p>
                  )}
                </>
              )}

              {novo && cobrando !== l.id && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {(
                    [
                      ["tratado", "Tratei"],
                      ["virou_servico", "Virou serviço"],
                      ["nao_se_aplica", "Não se aplica"],
                    ] as [StatusApontamento, string][]
                  ).map(([s, rotulo]) => (
                    <button
                      key={s}
                      /* "virou serviço" abre o campo do valor logo abaixo, em vez
                         de gravar direto: é o único dos três que produz número
                         para o relatório anual, e perguntar depois é perguntar
                         nunca */
                      onClick={() =>
                        s === "virou_servico" ? setCobrando(l.id) : void decidir(l.id, s)
                      }
                      disabled={ocupado === l.id}
                      className="rounded-sm border border-line bg-surface px-2.5 py-1.5 text-[12px] font-semibold text-slate2 disabled:opacity-40"
                    >
                      {ocupado === l.id ? "…" : rotulo}
                    </button>
                  ))}
                </div>
              )}

              {/* ux-ok: o campo abre imediatamente abaixo do botão que o pediu */}
              {novo && cobrando === l.id && (
                <div className="mt-2.5 rounded-sm border border-line bg-surface p-2.5">
                  <label className="block text-[11.5px] font-semibold text-slate2">
                    Quanto você cobrou por este serviço?
                  </label>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <div className="flex items-center rounded-sm border border-line px-2">
                      <span className="font-mono text-[11px] text-muted">R$</span>
                      <input
                        value={valor}
                        onChange={(e) => setValor(e.target.value.replace(/[^\d.,]/g, ""))}
                        inputMode="decimal"
                        placeholder="350,00"
                        autoFocus
                        className="w-28 bg-transparent px-1.5 py-1.5 font-mono text-[13px] outline-none"
                      />
                    </div>
                    <button
                      onClick={() => void decidir(l.id, "virou_servico", emCentavos(valor))}
                      disabled={ocupado === l.id}
                      className="rounded-sm bg-ink px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-40"
                    >
                      {ocupado === l.id ? "…" : "Registrar serviço"}
                    </button>
                    <button
                      onClick={() => void decidir(l.id, "virou_servico", null)}
                      disabled={ocupado === l.id}
                      className="text-[11.5px] font-semibold text-muted underline underline-offset-2 disabled:opacity-40"
                    >
                      registrar sem valor
                    </button>
                    <button
                      onClick={() => {
                        setCobrando(null);
                        setValor("");
                      }}
                      className="text-[11.5px] text-muted underline underline-offset-2"
                    >
                      cancelar
                    </button>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-snug text-muted">
                    Entra no relatório anual desta empresa. É o valor que você informa — o
                    Enquadria não cobra nada por aqui.
                  </p>
                </div>
              )}

              {/* desfazer existe porque decidir errado é barato de corrigir e
                  caro de descobrir: sem a volta, o contador evita decidir */}
              {!novo && l.status !== "superado" && (
                <button
                  onClick={() => void decidir(l.id, "novo")}
                  disabled={ocupado === l.id}
                  className="mt-1.5 text-[11px] font-semibold text-muted underline underline-offset-2 disabled:opacity-40"
                >
                  {ocupado === l.id ? "reabrindo…" : "reabrir"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
