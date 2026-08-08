"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ROTULO_STATUS, type StatusApontamento } from "@/lib/apontamentos";
import { ROTULO_SEVERIDADE, COR_SEVERIDADE } from "@/lib/radar";
import { ROTULO_FAIXA } from "@/lib/triagem";
import { mascararCnpj } from "@/lib/cnpj";

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

interface Empresa {
  id: string;
  razao_social: string;
  cnpj: string;
  faixa: string | null;
}

interface Apontamento {
  id: string;
  status: StatusApontamento;
  criado_em: string;
  tratado_em: string | null;
  empresa_id: string;
  item_id: string;
  empresas: Empresa | null;
  radar_itens: Materia | null;
}

/**
 * A TELA DO MONITOR — as normas de um lado, a carteira do outro.
 *
 * ---------------------------------------------------------------------------
 * AGRUPADA POR NORMA, E NÃO POR EMPRESA. É a decisão que define esta tela.
 *
 * Uma lista plana de apontamentos, numa carteira de duzentos clientes com meia
 * dúzia de normas, é uma parede de mil linhas em que a mesma frase se repete
 * duzentas vezes. Ninguém trabalha assim — e, pior, a repetição faz o contador
 * ler a mesma norma vinte vezes para tomar vinte decisões idênticas.
 *
 * Agrupado, o trabalho vira o que ele realmente é: LER UMA VEZ, DECIDIR EM
 * BLOCO, e abrir só os casos que fogem da regra. "Esta resolução não se aplica
 * a nenhum dos meus dez clientes de transporte" é uma decisão só, tomada uma
 * vez — não dez.
 *
 * ---------------------------------------------------------------------------
 * O NÚMERO QUE APARECE PRIMEIRO É O DE NORMAS, não o de apontamentos. "4 normas
 * atingem a sua carteira" é uma manhã de trabalho; "312 apontamentos" é um
 * motivo para fechar a aba. O segundo número existe, e fica na linha da norma,
 * onde ele quer dizer alguma coisa.
 */
export function PainelApontamentos() {
  const [tudo, setTudo] = useState<Apontamento[] | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [expandida, setExpandida] = useState<string | null>(null);
  const [verTratados, setVerTratados] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/apontamentos/carteira", { cache: "no-store" });
      const j = await r.json();
      setTudo((j.apontamentos ?? []) as Apontamento[]);
    } catch {
      setTudo([]);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function decidir(ids: string[], status: StatusApontamento, marca: string) {
    if (ids.length === 0) return;
    setOcupado(marca);
    try {
      await fetch("/api/apontamentos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, status }),
      });
      await carregar();
    } finally {
      setOcupado(null);
    }
  }

  /** um grupo por norma, com as empresas dentro e a contagem do que falta */
  const grupos = useMemo(() => {
    const mapa = new Map<string, { materia: Materia; linhas: Apontamento[] }>();
    for (const a of tudo ?? []) {
      if (!a.radar_itens) continue;
      const g = mapa.get(a.item_id);
      if (g) g.linhas.push(a);
      else mapa.set(a.item_id, { materia: a.radar_itens, linhas: [a] });
    }
    return Array.from(mapa.values())
      .map((g) => ({
        ...g,
        abertos: g.linhas.filter((l: Apontamento) => l.status === "novo"),
        /* o que já foi decidido continua contando para o histórico, e some da
           tela por padrão: lista que nunca diminui é lista que se para de ler */
        decididos: g.linhas.filter(
          (l: Apontamento) => l.status !== "novo" && l.status !== "superado"
        ),
      }))
      .filter((g) => (verTratados ? true : g.abertos.length > 0))
      .sort((a, b) => {
        const peso: Record<string, number> = { alta: 0, media: 1, baixa: 2 };
        const pa = peso[a.materia.severidade] ?? 1;
        const pb = peso[b.materia.severidade] ?? 1;
        if (pa !== pb) return pa - pb;
        return b.abertos.length - a.abertos.length;
      });
  }, [tudo, verTratados]);

  if (tudo === null) {
    return <p className="text-[13px] text-muted">Carregando os apontamentos da carteira…</p>;
  }

  const totalAbertos = (tudo ?? []).filter((a) => a.status === "novo").length;
  const comAberto = grupos.filter((g) => g.abertos.length > 0).length;

  if (tudo.length === 0) {
    return (
      <div className="rounded border border-line bg-surface p-6 text-center">
        <div className="text-[15px] font-bold text-ink">Nada apontado ainda.</div>
        <p className="mx-auto mt-1.5 max-w-md text-[13px] text-slate2">
          A varredura roda todo dia às 5h e cruza cada norma publicada com a sua carteira. Quando
          alguma atingir um cliente seu, ela aparece aqui — com o que fazer.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[13.5px] text-slate2">
          {comAberto === 0 ? (
            <>Nenhuma norma com trabalho pendente. O histórico continua abaixo.</>
          ) : (
            <>
              <b className="text-ink">
                {comAberto} {comAberto === 1 ? "norma atinge" : "normas atingem"}
              </b>{" "}
              a sua carteira, em {totalAbertos}{" "}
              {totalAbertos === 1 ? "cliente" : "clientes"}.
            </>
          )}
        </p>
        <button
          // ux-ok: o clique refaz a lista logo abaixo, e o rótulo muda junto
          onClick={() => setVerTratados((v) => !v)}
          className="text-[12.5px] font-semibold text-accentdeep underline underline-offset-2"
        >
          {verTratados ? "só o que falta" : "ver também o já tratado"}
        </button>
      </div>

      <ul className="space-y-2.5">
        {grupos.map((g) => {
          const abertos = g.abertos;
          const marca = `g-${g.materia.id}`;
          const aberta = expandida === g.materia.id;
          return (
            <li key={g.materia.id} className="rounded border border-line bg-surface p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[14px] font-bold text-ink">{g.materia.titulo}</span>
                <span className={`font-mono text-[10.5px] ${COR_SEVERIDADE[g.materia.severidade] ?? "text-muted"}`}>
                  {ROTULO_SEVERIDADE[g.materia.severidade] ?? g.materia.severidade}
                  {g.materia.vigencia_em &&
                    ` · vigência ${new Date(g.materia.vigencia_em).toLocaleDateString("pt-BR")}`}
                </span>
              </div>

              <p className="mt-1 text-[12.5px] leading-relaxed text-slate2">{g.materia.resumo}</p>

              {g.materia.o_que_fazer && (
                <p className="mt-2 rounded-sm border border-linesoft bg-surface2 px-3 py-2 text-[12.5px] leading-relaxed text-slate2">
                  <b className="text-ink">O que fazer.</b> {g.materia.o_que_fazer}
                  {g.materia.fonte && (
                    <span className="mt-1 block font-mono text-[10.5px] text-muted">
                      {g.materia.fonte}
                    </span>
                  )}
                </p>
              )}

              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="font-mono text-[11px] text-muted">
                  {abertos.length > 0
                    ? `${abertos.length} ${abertos.length === 1 ? "cliente pendente" : "clientes pendentes"}`
                    : "sem pendências"}
                  {g.decididos.length > 0 && ` · ${g.decididos.length} já decidido(s)`}
                </span>

                <button
                  // ux-ok: o clique abre a lista de empresas imediatamente abaixo
                  onClick={() => setExpandida(aberta ? null : g.materia.id)}
                  className="text-[12px] font-semibold text-accentdeep underline underline-offset-2"
                >
                  {aberta ? "ocultar os clientes" : "ver os clientes"}
                </button>
              </div>

              {/* DECIDIR A NORMA INTEIRA — o gesto que esta tela existe para
                  permitir. Ler uma vez, decidir em bloco, e abrir só os casos
                  que fogem da regra. */}
              {abertos.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {(
                    [
                      ["tratado", `Tratei ${abertos.length === 1 ? "" : `as ${abertos.length}`}`.trim()],
                      ["virou_servico", "Virou serviço"],
                      ["nao_se_aplica", "Não se aplica"],
                    ] as [StatusApontamento, string][]
                  ).map(([s, rotulo]) => (
                    <button
                      key={s}
                      onClick={() => void decidir(abertos.map((a) => a.id), s, marca)}
                      disabled={ocupado === marca}
                      className="rounded-sm border border-line bg-surface px-3 py-1.5 text-[12px] font-semibold text-slate2 disabled:opacity-40"
                    >
                      {ocupado === marca ? "…" : rotulo}
                    </button>
                  ))}
                </div>
              )}

              {aberta && (
                <ul className="mt-3 space-y-1.5 border-t border-linesoft pt-3">
                  {g.linhas
                    .filter((l) => (verTratados ? true : l.status === "novo"))
                    .map((l) => (
                      <li
                        key={l.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-sm bg-surface2 px-3 py-2"
                      >
                        <span className="min-w-0">
                          <a
                            href={`/painel/empresa/${l.empresa_id}`}
                            className="text-[12.5px] font-semibold text-accentdeep"
                          >
                            {l.empresas?.razao_social ?? "empresa"}
                          </a>
                          <span className="ml-2 font-mono text-[10.5px] text-muted">
                            {l.empresas?.cnpj ? mascararCnpj(l.empresas.cnpj) : ""}
                            {l.empresas?.faixa &&
                              ` · ${ROTULO_FAIXA[l.empresas.faixa as keyof typeof ROTULO_FAIXA] ?? l.empresas.faixa}`}
                          </span>
                        </span>

                        {l.status === "novo" ? (
                          <button
                            onClick={() => void decidir([l.id], "tratado", l.id)}
                            disabled={ocupado === l.id}
                            className="shrink-0 rounded-sm border border-line bg-surface px-2.5 py-1 text-[11.5px] font-semibold text-slate2 disabled:opacity-40"
                          >
                            {ocupado === l.id ? "…" : "Tratei"}
                          </button>
                        ) : (
                          <span className="shrink-0 font-mono text-[10.5px] text-muted">
                            {ROTULO_STATUS[l.status]}
                          </span>
                        )}
                      </li>
                    ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
