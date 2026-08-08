"use client";

import { useState } from "react";
import { roteiroDaEmpresa, progressoRoteiro, type EstadoDaEmpresa } from "@/lib/roteiro";

/**
 * O ROTEIRO, na tela da empresa.
 *
 * A aba Análise mostra tudo o que é possível fazer e nada sobre a ORDEM. Quem
 * abre a primeira empresa encontra um formulário longo e dois botões apagados
 * — e botão apagado, sem explicação, é lido como defeito, não como "ainda não".
 *
 * FECHADO POR PADRÃO DEPOIS DO PRIMEIRO PASSO. Na empresa nova ele abre
 * inteiro, porque é ali que a dúvida existe; a partir do momento em que a
 * esteira andou, o contador já sabe o caminho e a lista vira ruído acima do
 * trabalho. A linha do passo atual continua visível fechada — é ela que
 * responde "e agora?" sem custar espaço.
 */
export function RoteiroEmpresa({ estado }: { estado: EstadoDaEmpresa }) {
  const passos = roteiroDaEmpresa(estado);
  const { feitos, total } = progressoRoteiro(passos);
  const atual = passos.find((p) => p.estado === "agora") ?? null;
  const [aberto, setAberto] = useState(feitos === 0);
  /* fechar reduz a uma linha; OCULTAR tira da tela. São gestos diferentes e
     quem já sabe o caminho pede o segundo — mesmo gesto da Trilha no cockpit.
     Volta ao recarregar de propósito: esconder para sempre o que responde
     "e agora?" é decisão grande demais para um clique sem volta. */
  const [oculto, setOculto] = useState(false);

  const completo = feitos === total;

  if (oculto) return null;

  return (
    <div className="rounded-sm border border-line bg-surface p-3.5">
      <button
        // ux-ok: o clique abre/fecha a própria lista, logo abaixo do botão
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
            Roteiro desta empresa · {feitos} de {total}
          </div>
          <div className="mt-0.5 text-[13.5px] font-semibold">
            {completo ? (
              <span className="text-verde">Esteira concluída — laudo emitido e termo assinado.</span>
            ) : (
              <>
                Agora: <span className="text-accentdeep">{atual?.titulo}</span>
              </>
            )}
          </div>
        </div>
        <span aria-hidden className="shrink-0 text-[12px] text-muted">
          {aberto ? "▲" : "▼"}
        </span>
      </button>

      <button
        // ux-ok: o clique remove este próprio bloco da tela — o efeito é o bloco sumir
        onClick={() => setOculto(true)}
        className="mt-1 text-[11px] font-semibold text-muted underline underline-offset-2"
      >
        ocultar o roteiro
      </button>

      {aberto && (
        <ol className="mt-3 space-y-1.5 border-t border-linesoft pt-3">
          {passos.map((p, i) => (
            <li key={p.chave} className="flex gap-2.5">
              <span
                className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full font-mono text-[10px] ${
                  p.estado === "feito"
                    ? "bg-verde text-white"
                    : p.estado === "agora"
                      ? "bg-ink text-white"
                      : "border border-line text-muted"
                }`}
              >
                {p.estado === "feito" ? "✓" : i + 1}
              </span>
              <div className="min-w-0">
                <div
                  className={`text-[13px] ${
                    p.estado === "feito"
                      ? "text-muted line-through decoration-linesoft"
                      : p.estado === "agora"
                        ? "font-semibold text-ink"
                        : "text-slate2"
                  }`}
                >
                  {p.titulo}
                </div>
                {/* o porquê some quando o passo já foi feito: explicação de
                    coisa resolvida é entulho na leitura do que falta */}
                {p.estado !== "feito" && (
                  <p className="text-[11.5px] leading-relaxed text-muted">{p.detalhe}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
