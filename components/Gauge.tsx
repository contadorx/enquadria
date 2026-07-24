"use client";

import { pct } from "@/lib/motor";

/**
 * A decisão em uma linha: o repasse necessário cabe dentro do ganho do comprador?
 * É o único gráfico do produto — e o que nenhum simulador do mercado mostra.
 */
export function Gauge({ re, fc }: { re: number; fc: number }) {
  const escala = Math.max(fc, isFinite(re) ? re : fc) || 1;
  const larguraFc = (fc / escala) * 100;
  const larguraRe = (Math.min(isFinite(re) ? re : escala, escala) / escala) * 100;
  const estourou = re > fc;

  return (
    <div>
      <div className="mb-4">
        <div className="mb-1.5 flex items-baseline justify-between text-[12.5px]">
          <span>Quanto o comprador ganha de crédito</span>
          <b className="font-mono text-base font-semibold">{pct(fc)}</b>
        </div>
        <div className="h-[26px] overflow-hidden rounded-sm bg-linesoft">
          <div
            className="h-full rounded-sm transition-all duration-300"
            style={{
              width: `${larguraFc}%`,
              background:
                "repeating-linear-gradient(135deg,#CFFAFE 0 6px,#A5F3FC 6px 12px)",
            }}
          />
        </div>
        <p className="mt-1.5 text-[11.5px] text-muted">
          Teto do aumento de preço que ele absorve e ainda sai ganhando.
        </p>
      </div>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between text-[12.5px]">
          <span>Repasse de que a empresa precisa</span>
          <b className="font-mono text-base font-semibold">{pct(re)}</b>
        </div>
        <div className="h-[26px] overflow-hidden rounded-sm bg-linesoft">
          <div
            className={`h-full rounded-sm transition-all duration-300 ${
              estourou ? "bg-vermelho" : "bg-ink"
            }`}
            style={{ width: `${larguraRe}%` }}
          />
        </div>
        <p className="mt-1.5 text-[11.5px] text-muted">
          Aumento de preço nas vendas a empresa que deixa a companhia neutra.
        </p>
      </div>
    </div>
  );
}
