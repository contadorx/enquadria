"use client";

import { useState } from "react";
import type { Material } from "@/lib/curso";

/**
 * O GATE — um campo, uma vez.
 *
 * Assistir nunca pede nada; baixar pede o e-mail uma única vez. Depois de
 * liberado, todos os materiais abrem no mesmo acesso. A escolha é deliberada:
 * quem baixa a planilha está declarando intenção, e é esse o lead. Quem só
 * assiste é público — e público também vale, só não vale incomodar.
 *
 * O estado do desbloqueio vive em MEMÓRIA (nada de localStorage, regra da casa).
 * Recarregou a página, pede de novo — e o servidor reconhece o e-mail repetido
 * sem duplicar o lead.
 */
export function CursoMateriais({ materiais }: { materiais: Material[] }) {
  const [email, setEmail] = useState("");
  const [liberado, setLiberado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function liberar() {
    const limpo = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(limpo)) {
      setErro("Confira o e-mail — parece incompleto.");
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      const resp = await fetch("/api/curso/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: limpo, origem: "curso" }),
      });
      // o download não fica refém do cadastro: se a gravação falhar, libera
      // assim mesmo. Prometi o material em troca do e-mail, e o e-mail veio.
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        if (j?.erro) setErro(j.erro as string);
      }
      setLiberado(true);
    } catch {
      setLiberado(true);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-5 shadow-card">
      <h3 className="text-[17px] font-bold tracking-tight text-ink">
        As planilhas e os modelos
      </h3>
      <p className="mt-1 max-w-[62ch] text-[14px] text-slate2">
        Para assistir, não peço nada. Para baixar, peço o seu e-mail uma vez — e aí
        todos os materiais abrem.
      </p>

      {!liberado && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && liberar()}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="seu@email.com.br"
            aria-label="Seu e-mail para liberar os materiais"
            className="min-w-0 flex-1 rounded-sm border border-line px-3.5 py-3 text-[15px] outline-none focus:border-accent"
          />
          <button
            onClick={liberar}
            disabled={enviando}
            className="whitespace-nowrap rounded-sm bg-ink px-5 py-3 text-[15px] font-semibold text-white disabled:opacity-40"
          >
            {enviando ? "Liberando…" : "Liberar os materiais"}
          </button>
        </div>
      )}

      {erro && <p className="mt-2 text-[13px] text-vermelho">{erro}</p>}

      {liberado && (
        <p className="mt-3 rounded-sm bg-verdewash px-3 py-2 text-[13.5px] font-semibold text-verde">
          Pronto. Os arquivos abaixo estão liberados.
        </p>
      )}

      <ul className="mt-4 space-y-2.5">
        {materiais.map((m) => (
          <li
            key={m.id}
            className="flex flex-wrap items-start justify-between gap-3 rounded-sm border border-linesoft bg-surface2 px-3.5 py-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="rounded-sm bg-ink px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-white">
                  {m.formato}
                </span>
                <span className="text-[14px] font-semibold text-ink">{m.nome}</span>
              </div>
              <p className="mt-1 max-w-[58ch] text-[13px] text-muted">{m.descricao}</p>
            </div>
            {liberado ? (
              <a
                href={m.arquivo}
                download
                className="shrink-0 rounded-sm border border-accentdeep px-3.5 py-2 text-[13.5px] font-semibold text-accentdeep"
              >
                Baixar
              </a>
            ) : (
              <span className="shrink-0 rounded-sm border border-line px-3.5 py-2 text-[13.5px] font-semibold text-muted">
                aula {m.aula}
              </span>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
        Uso o seu e-mail para mandar os materiais e avisar quando as próximas aulas
        entrarem no ar. Um clique cancela, em qualquer mensagem. Não repasso o seu
        contato para ninguém.
      </p>
    </div>
  );
}
