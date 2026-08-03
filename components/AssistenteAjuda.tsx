"use client";

import { useState } from "react";

/**
 * A CAIXA DE PERGUNTA da central de ajuda.
 *
 * Fica ABAIXO da lista de artigos, não acima. Quem já sabe o nome do que
 * procura acha na lista em dois segundos; a pergunta é para quem não sabe como
 * chamar a coisa. Pôr a caixa primeiro empurraria todo mundo para o caminho
 * mais caro e mais lento.
 *
 * Quando o assistente não sabe, ele NÃO tenta. Abre chamado e diz que abriu —
 * porque a resposta errada aqui vira premissa de laudo, e um laudo errado custa
 * mais que uma pergunta sem resposta.
 */
export function AssistenteAjuda() {
  const [pergunta, setPergunta] = useState("");
  const [resposta, setResposta] = useState<string | null>(null);
  const [escalado, setEscalado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function perguntar() {
    if (!pergunta.trim()) return;
    setOcupado(true);
    setErro(null);
    setResposta(null);
    try {
      const r = await fetch("/api/assistente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pergunta }),
      });
      const j = (await r.json()) as { resposta?: string; escalado?: boolean; erro?: string };
      if (j.erro) {
        setErro(j.erro);
        return;
      }
      setResposta(j.resposta ?? "");
      setEscalado(!!j.escalado);
    } catch {
      setErro("Não consegui falar com o servidor. Tente de novo.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="mt-8 rounded border border-line bg-surface p-5">
      <div className="text-[14px] font-bold">Não achou? Pergunte.</div>
      <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
        Respondo com o que está escrito nestes artigos. Se a resposta não estiver aqui, eu abro
        um chamado em vez de chutar — daqui sai laudo.
      </p>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          value={pergunta}
          onChange={(e) => setPergunta(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void perguntar();
          }}
          placeholder="Ex.: preciso do RBT12 para emitir o laudo?"
          className="flex-1 rounded-sm border border-line px-3 py-2.5 text-sm outline-none focus:border-accent"
        />
        <button
          onClick={perguntar}
          disabled={ocupado || !pergunta.trim()}
          className="rounded-sm bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {ocupado ? "Pensando…" : "Perguntar"}
        </button>
      </div>

      {erro && (
        <p className="mt-3 rounded-sm bg-vermelhowash px-3 py-2 text-[12.5px] text-vermelho">{erro}</p>
      )}

      {resposta && (
        <div
          className={`mt-3 rounded-sm border px-3.5 py-3 text-[13.5px] leading-relaxed ${
            escalado ? "border-accent bg-accentwash" : "border-line bg-surface2"
          }`}
        >
          <p className="whitespace-pre-wrap">{resposta}</p>
          {escalado && (
            <p className="mt-2 text-[11.5px] text-slate2">
              Você pode acompanhar em <b>Meus chamados</b>.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
