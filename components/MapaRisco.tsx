"use client";

import { useState } from "react";
import Link from "next/link";
import { moeda } from "@/lib/motor";
import { ROTULO_FAIXA, type Faixa } from "@/lib/triagem";
import {
  calcularPotencial,
  fraseDoMapa,
  EXPLICA_FAIXA,
  HONORARIO_PADRAO,
  HONORARIO_CURTO_PADRAO,
  type ContagemFaixas,
} from "@/lib/potencial";

/**
 * O MAPA DE RISCO — a tela do "aha".
 *
 * Antes: seis contadores e uma frase. Agora: quanto a carteira VALE, o que cada
 * faixa significa, e qual é a próxima ação. O honorário é editável porque o
 * número precisa ser o DELE para ele acreditar.
 */

const ORDEM: Faixa[] = ["A", "B", "C", "D", "MEI", "FORA"];

const COR: Record<Faixa, { texto: string; barra: string }> = {
  A: { texto: "text-vermelho", barra: "bg-vermelho" },
  B: { texto: "text-amarelo", barra: "bg-amarelo" },
  C: { texto: "text-slate1", barra: "bg-neutro" },
  D: { texto: "text-muted", barra: "bg-linesoft" },
  MEI: { texto: "text-neutro", barra: "bg-linesoft" },
  FORA: { texto: "text-muted", barra: "bg-linesoft" },
};

export function MapaRisco({
  contagem,
  comLaudo,
}: {
  contagem: ContagemFaixas;
  comLaudo: number;
}) {
  const [honorario, setHonorario] = useState(HONORARIO_PADRAO);
  const [aberta, setAberta] = useState<Faixa | null>(null);

  const p = calcularPotencial(contagem, honorario, HONORARIO_CURTO_PADRAO);
  const maior = Math.max(...ORDEM.map((f) => contagem[f]), 1);
  const feitos = Math.min(comLaudo, p.analises);
  const pctFeito = p.analises ? Math.round((feitos / p.analises) * 100) : 0;

  return (
    <div>
      {/* O NÚMERO */}
      <div className="overflow-hidden rounded border border-line bg-ink shadow-card">
        <div className="grid grid-cols-1 gap-px bg-white/10 md:grid-cols-[1.35fr_1fr]">
          <div className="bg-ink p-5">
            <div className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-accentbright">
              Potencial de honorário nesta janela
            </div>
            <div className="mt-1.5 font-mono text-[40px] font-semibold leading-none text-white">
              {moeda(p.valor_total)}
            </div>
            <p className="mt-2.5 max-w-[46ch] text-[13px] leading-relaxed text-[#AEBED2]">
              {p.analises} análises completas × {moeda(p.honorario)}
              {p.curtos > 0 && <> + {p.curtos} laudos curtos × {moeda(p.honorario_curto)}</>}.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <span className="text-[12px] text-[#93A4BC]">Seu honorário por análise:</span>
              <div className="flex items-center rounded-sm border border-white/20 px-2">
                <span className="font-mono text-[11px] text-[#93A4BC]">R$</span>
                <input
                  value={honorario}
                  onChange={(e) => setHonorario(Number(e.target.value.replace(/\D/g, "")) || 0)}
                  inputMode="numeric"
                  className="w-16 bg-transparent px-1.5 py-1 font-mono text-[13px] text-white outline-none"
                />
              </div>
              <div className="flex gap-1">
                {[400, 600, 900].map((v) => (
                  <button
                    key={v}
                    onClick={() => setHonorario(v)}
                    className={`rounded-sm px-2 py-1 font-mono text-[11px] ${
                      honorario === v ? "bg-accent text-[#04212B]" : "bg-white/10 text-[#AEBED2]"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-ink p-5">
            <div className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#7C8AA3]">
              O que a triagem já fez por você
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-[#AEBED2]">{fraseDoMapa(p)}</p>
            {p.analises > 0 && (
              <div className="mt-3.5">
                <div className="flex items-baseline justify-between text-[12px] text-[#93A4BC]">
                  <span>Decisões registradas</span>
                  <span className="font-mono text-white">
                    {feitos}/{p.analises}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full bg-accent" style={{ width: `${pctFeito}%` }} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AS FAIXAS, COM EXPLICAÇÃO */}
      <div className="mt-5">
        <div className="mb-2.5 flex items-baseline justify-between">
          <h2 className="text-[15px] font-bold">Como a sua carteira se distribui</h2>
          <span className="text-[11.5px] text-muted">clique numa faixa para entender</span>
        </div>

        <div className="overflow-hidden rounded border border-line bg-surface">
          {ORDEM.map((f) => {
            const n = contagem[f];
            const e = EXPLICA_FAIXA[f];
            const ativa = aberta === f;
            return (
              <div key={f} className="border-b border-linesoft last:border-b-0">
                <button
                  onClick={() => setAberta(ativa ? null : f)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface2"
                >
                  <span className={`w-9 shrink-0 font-mono text-[19px] font-semibold ${COR[f].texto}`}>
                    {n}
                  </span>
                  <span className="w-[124px] shrink-0 text-[13px] font-semibold">
                    {ROTULO_FAIXA[f]}
                  </span>
                  <span className="hidden h-2 flex-1 overflow-hidden rounded-full bg-linesoft sm:block">
                    <span
                      className={`block h-full ${COR[f].barra}`}
                      style={{ width: `${(n / maior) * 100}%` }}
                    />
                  </span>
                  {e.cobravel && n > 0 && (
                    <span className="hidden shrink-0 font-mono text-[11.5px] text-accentdeep md:inline">
                      {moeda(n * (f === "A" || f === "B" ? honorario : p.honorario_curto))}
                    </span>
                  )}
                  <span className="shrink-0 font-mono text-[11px] text-muted">{ativa ? "−" : "+"}</span>
                </button>
                {ativa && (
                  <div className="border-t border-linesoft bg-surface2 px-4 py-3">
                    <p className="text-[13px] text-slate2">{e.oQueE}</p>
                    <p className="mt-1.5 text-[13px]">
                      <b className="text-ink">O que fazer:</b>{" "}
                      <span className="text-slate2">{e.oQueFazer}</span>
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* PRÓXIMA AÇÃO */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded border border-[#A5F3FC] bg-accentwash px-4 py-4">
        <p className="max-w-[56ch] text-[13.5px] text-slate2">
          {p.analises === 0 ? (
            <>Sua carteira não tem empresas na faixa de análise. Vale conferir se o arquivo trouxe o CNAE das empresas.</>
          ) : feitos === 0 ? (
            <>
              Comece pelas <b>{contagem.A} urgentes</b>. São as que vendem para outras empresas e vão sofrer
              pressão por crédito — e as que pagam melhor.
            </>
          ) : feitos < p.analises ? (
            <>
              Faltam <b>{p.analises - feitos}</b> decisões para fechar a janela. Restam{" "}
              {moeda((p.analises - feitos) * honorario)} de honorário na mesa.
            </>
          ) : (
            <>Todas as análises da janela estão registradas. Use a revisão da carteira quando os parâmetros mudarem.</>
          )}
        </p>
        <Link
          href="/painel/fila"
          className="whitespace-nowrap rounded-sm bg-ink px-4 py-2.5 text-[13px] font-semibold text-white"
        >
          Ir para a fila
        </Link>
      </div>

      <p className="mt-3 max-w-[80ch] text-[11px] leading-relaxed text-muted">
        Potencial de serviço a vender, não receita garantida: depende de você abordar e fechar cada
        cliente. O honorário acima é uma referência editável — pratique o preço que o seu mercado
        sustenta.
      </p>
    </div>
  );
}
