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
export function ApontamentosEmpresa({ empresaId }: { empresaId: string }) {
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/apontamentos?empresa=${empresaId}`, { cache: "no-store" });
      const j = await r.json();
      setLinhas((j.apontamentos ?? []) as Linha[]);
    } catch {
      setLinhas([]);
    }
  }, [empresaId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function decidir(id: string, status: StatusApontamento) {
    setOcupado(id);
    try {
      await fetch("/api/apontamentos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      await carregar();
    } finally {
      setOcupado(null);
    }
  }

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

              {novo && (
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
                      onClick={() => void decidir(l.id, s)}
                      disabled={ocupado === l.id}
                      className="rounded-sm border border-line bg-surface px-2.5 py-1.5 text-[12px] font-semibold text-slate2 disabled:opacity-40"
                    >
                      {ocupado === l.id ? "…" : rotulo}
                    </button>
                  ))}
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
