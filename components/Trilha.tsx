"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * TRILHA DE ATIVAÇÃO — o caminho até o primeiro papel assinado.
 *
 * A métrica-norte do produto é ATIVAÇÃO: escritório que importou, viu o mapa e
 * emitiu documento. Sem uma trilha visível, o contador importa a carteira, olha
 * o mapa e some — a distância entre "achei bonito" e "faturei" é onde ele se
 * perde.
 *
 * Cada passo mostra o QUE FALTA e leva direto para a tela que resolve. Some
 * sozinha quando o ciclo se completa, para não virar mobília.
 */

export interface EstadoTrilha {
  empresas: number;
  analises: number;
  laudos: number;
  termos: number;
  assinados: number;
  fila: number;
}

interface Passo {
  chave: string;
  titulo: string;
  descricao: string;
  href: string;
  cta: string;
  feito: boolean;
}

export function Trilha({ estado }: { estado: EstadoTrilha }) {
  const [oculta, setOculta] = useState(false);

  const passos: Passo[] = [
    {
      chave: "importar",
      titulo: "Importe a carteira",
      descricao: "Um CSV com CNPJ e razão social basta. A triagem é automática.",
      href: "/painel/importar",
      cta: "Importar",
      feito: estado.empresas > 0,
    },
    {
      chave: "analisar",
      titulo: "Analise a fila",
      descricao:
        estado.fila > 0
          ? `${estado.fila} empresas precisam de decisão. Em lote, sai tudo de uma vez.`
          : "Rode a decisão nas empresas que exigem análise.",
      href: "/painel/lote",
      cta: "Analisar em lote",
      feito: estado.analises > 0,
    },
    {
      chave: "laudo",
      titulo: "Emita o primeiro laudo",
      descricao: "O papel com a sua marca — é isto que você cobra do cliente.",
      href: "/painel/entrega",
      cta: "Emitir laudo",
      feito: estado.laudos > 0,
    },
    {
      chave: "termo",
      titulo: "Colha a ciência do cliente",
      descricao:
        "O termo assinado é a prova de que você avaliou e avisou dentro do prazo.",
      href: "/painel/entrega",
      cta: "Enviar termo",
      feito: estado.assinados > 0,
    },
  ];

  const concluidos = passos.filter((p) => p.feito).length;
  const completa = concluidos === passos.length;
  const atual = passos.find((p) => !p.feito);

  if (completa || oculta) return null;

  return (
    <div className="mb-5 overflow-hidden rounded border border-accent bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-linesoft bg-accentwash px-4 py-3">
        <div>
          <div className="text-[13.5px] font-bold text-ink">
            Do arquivo ao primeiro honorário
          </div>
          <div className="mt-0.5 text-[12px] text-slate2">
            {concluidos} de {passos.length} passos · o caminho que transforma a carteira em papel
            cobrável
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {passos.map((p) => (
              <span
                key={p.chave}
                className={`h-1.5 w-8 rounded-full ${p.feito ? "bg-accent" : "bg-white"}`}
              />
            ))}
          </div>
          <button
            onClick={() => setOculta(true)}
            className="font-mono text-[11px] text-accentdeep"
            title="Ocultar até a próxima visita"
          >
            ocultar
          </button>
        </div>
      </div>

      <div className="divide-y divide-linesoft">
        {passos.map((p, i) => {
          const eAtual = atual?.chave === p.chave;
          return (
            <div
              key={p.chave}
              className={`flex flex-wrap items-center gap-3 px-4 py-3 ${
                eAtual ? "bg-surface" : ""
              } ${p.feito ? "opacity-60" : ""}`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] ${
                  p.feito
                    ? "bg-verde text-white"
                    : eAtual
                    ? "bg-ink text-white"
                    : "bg-surface2 text-muted"
                }`}
              >
                {p.feito ? "✓" : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold">{p.titulo}</div>
                {!p.feito && (
                  <div className="text-[12px] text-muted">{p.descricao}</div>
                )}
              </div>
              {eAtual && (
                <Link
                  href={p.href}
                  className="whitespace-nowrap rounded-sm bg-ink px-3.5 py-2 text-[12.5px] font-semibold text-white"
                >
                  {p.cta}
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
