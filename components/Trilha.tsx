"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * O ASSISTENTE E A TRILHA — a mesma peça em dois momentos.
 *
 * Na primeira vez ela é um assistente de quatro passos com um objetivo
 * declarado: sair daqui com o primeiro laudo emitido. Depois vira uma faixa
 * discreta com o próximo passo da carteira, e some sozinha quando não há mais
 * passo nenhum.
 *
 * NÃO EXISTE FLAG DE ONBOARDING NO BANCO. O passo atual é DERIVADO do que já
 * existe: tem escritório? tem carteira? tem análise? tem laudo? Um flag salvo
 * mente na primeira vez que alguém apaga a carteira ou entra por outro
 * caminho — e mentir sobre "onde você está" é pior do que não guiar.
 */

export interface EstadoTrilha {
  temEscritorio: boolean;
  empresas: number;
  naFila: number;
  analises: number;
  laudos: number;
  assinados: number;
  /** a empresa de maior prioridade que ainda tem trabalho pendente */
  proxima: { id: string; nome: string } | null;
  proximaAcao: "analisar" | "confirmar" | "emitir" | "termo" | "cobrar" | null;
}

const ROTULO: Record<string, string> = {
  analisar: "Analisar",
  confirmar: "Confirmar as premissas de",
  emitir: "Emitir o laudo de",
  termo: "Enviar o termo de",
  cobrar: "Cobrar a assinatura de",
};

export function Trilha({
  estado,
  aoAbrirEmpresa,
}: {
  estado: EstadoTrilha;
  aoAbrirEmpresa: (id: string, aba: "decisao" | "dossie") => void;
}) {
  const [oculta, setOculta] = useState(false);
  if (oculta) return null;

  const primeiroCiclo = estado.laudos === 0;

  /* ------------------------------------------------ assistente da 1ª vez */
  if (primeiroCiclo) {
    const passos = [
      {
        n: 1,
        titulo: "Identifique o escritório",
        texto: "Nome, CRC e logo. É o que vai na capa de cada laudo e termo — sem isso o entregável não tem marca.",
        feito: estado.temEscritorio,
        cta: (
          <Link href="/painel/config" className="btn">
            Preencher o escritório
          </Link>
        ),
      },
      {
        n: 2,
        titulo: "Suba a carteira",
        texto:
          "Um CSV com a coluna de CNPJ já basta. Razão social e CNAE deixam a triagem mais precisa — e você vê o resultado na hora.",
        feito: estado.empresas > 0,
        cta: (
          <Link href="/painel/importar" className="btn">
            Importar carteira
          </Link>
        ),
      },
      {
        n: 3,
        titulo: "Faça a primeira análise",
        texto: estado.proxima
          ? `Comece pela empresa de maior prioridade: ${estado.proxima.nome}. Cada pergunta explica por que está sendo feita.`
          : "Depois da triagem, o cockpit aponta por qual empresa começar.",
        feito: estado.analises > 0,
        cta: estado.proxima ? (
          <button onClick={() => aoAbrirEmpresa(estado.proxima!.id, "decisao")} className="btn">
            Analisar {estado.proxima.nome}
          </button>
        ) : null,
      },
      {
        n: 4,
        titulo: "Emita o primeiro laudo",
        texto:
          "O documento sai numerado, com a sua marca e um código de verificação pública. Na sequência dá para enviar o termo ao cliente.",
        feito: estado.laudos > 0,
        cta: estado.proxima ? (
          <button onClick={() => aoAbrirEmpresa(estado.proxima!.id, "decisao")} className="btn">
            Fazer a análise
          </button>
        ) : null,
      },
    ];

    const atual = passos.find((p) => !p.feito) ?? passos[passos.length - 1];

    return (
      <div className="mb-3 rounded border border-accent bg-surface p-4 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-accentdeep">
              Primeiros passos
            </div>
            <h2 className="mt-1 text-[15px] font-bold text-ink">
              O objetivo daqui é um só: o seu primeiro laudo emitido.
            </h2>
          </div>
          <button
            onClick={() => setOculta(true)}
            className="text-[12px] font-semibold text-muted underline underline-offset-2"
          >
            ocultar
          </button>
        </div>

        <div className="mt-3 space-y-1.5">
          {passos.map((p) => {
            const ehAtual = p.n === atual.n;
            return (
              <div
                key={p.n}
                className={`flex flex-wrap items-start gap-3 rounded-sm border px-3 py-2.5 ${
                  ehAtual ? "border-accent bg-accentwash" : "border-linesoft bg-surface2"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] ${
                    p.feito ? "bg-verde text-white" : ehAtual ? "bg-ink text-white" : "bg-line text-muted"
                  }`}
                >
                  {p.feito ? "✓" : p.n}
                </span>
                <div className="min-w-0 flex-1">
                  <div className={`text-[13px] font-semibold ${p.feito ? "text-muted line-through" : ""}`}>
                    {p.titulo}
                  </div>
                  {ehAtual && !p.feito && <div className="mt-0.5 text-[12.5px] text-slate2">{p.texto}</div>}
                </div>
                {ehAtual && !p.feito && p.cta && <div className="shrink-0">{p.cta}</div>}
              </div>
            );
          })}
        </div>

        <p className="mt-2.5 text-[11.5px] text-muted">
          Pode pular qualquer passo e voltar depois — nada aqui trava o resto do sistema.
        </p>

        <style dangerouslySetInnerHTML={{ __html: `
          .btn { display: inline-block; border-radius: 6px; background: #0B1220; color: #fff;
                 padding: 8px 14px; font-size: 12.5px; font-weight: 600; white-space: nowrap; }
        ` }} />
      </div>
    );
  }

  /* -------------------------------------------- trilha permanente, discreta */
  if (!estado.proxima || !estado.proximaAcao) return null;

  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded border border-linesoft bg-surface2 px-3.5 py-2.5">
      <p className="text-[12.5px] text-slate2">
        <b className="font-mono">{estado.naFila}</b> na fila ·{" "}
        <b className="font-mono">{estado.analises}</b> analisadas ·{" "}
        <b className="font-mono">{estado.laudos}</b> com laudo ·{" "}
        <b className="font-mono">{estado.assinados}</b> assinados
        <span className="text-muted">
          {" "}
          — próximo: {ROTULO[estado.proximaAcao]} {estado.proxima.nome}
        </span>
      </p>
      <button
        onClick={() => aoAbrirEmpresa(estado.proxima!.id, "decisao")}
        className="shrink-0 rounded-sm border border-ink px-3 py-1.5 text-[12.5px] font-semibold text-ink"
      >
        Continuar
      </button>
    </div>
  );
}
