"use client";

import { useEffect, useRef, useState } from "react";

/**
 * O ASSISTENTE, DISPONÍVEL EM QUALQUER TELA.
 *
 * A primeira versão era um bloco no fim de /painel/ajuda. Isso exige que a
 * pessoa (a) saiba que existe, (b) pare o que está fazendo, (c) navegue até lá
 * e (d) role até o fim. Dúvida não funciona assim: ela aparece no meio da
 * tarefa, e se a resposta obriga a sair da tarefa, a pessoa desiste — ou pior,
 * decide no chute e emite um laudo errado.
 *
 * Por isso: botão fixo, em toda tela do painel, que abre um painel lateral sem
 * tirar a pessoa de onde ela está.
 *
 * NÃO APARECE se o assistente estiver desligado. Botão que abre e responde
 * "estou desligado" é pior que botão nenhum.
 */

interface Fala {
  de: "voce" | "assistente";
  texto: string;
  escalado?: boolean;
}

export function AssistenteFlutuante({ ativo }: { ativo: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [pergunta, setPergunta] = useState("");
  const [falas, setFalas] = useState<Fala[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth" });
  }, [falas, ocupado]);

  if (!ativo) return null;

  async function perguntar() {
    const q = pergunta.trim();
    if (!q || ocupado) return;
    setPergunta("");
    setFalas((f) => [...f, { de: "voce", texto: q }]);
    setOcupado(true);
    try {
      const r = await fetch("/api/assistente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pergunta: q }),
      });
      const j = (await r.json()) as { resposta?: string; escalado?: boolean; erro?: string };
      setFalas((f) => [
        ...f,
        {
          de: "assistente",
          texto: j.erro ?? j.resposta ?? "Não consegui responder agora.",
          escalado: j.escalado,
        },
      ]);
    } catch {
      setFalas((f) => [
        ...f,
        { de: "assistente", texto: "Não consegui falar com o servidor. Tente de novo." },
      ]);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>
      {!aberto && (
        <button
          onClick={() => setAberto(true)}
          aria-label="Abrir o assistente"
          className="fixed bottom-20 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-ink text-[20px] font-bold text-white shadow-card md:bottom-6"
        >
          ?
        </button>
      )}

      {aberto && (
        <div className="fixed bottom-0 right-0 z-50 flex h-[80vh] w-full flex-col border-l border-t border-line bg-surface shadow-card md:bottom-4 md:right-4 md:h-[560px] md:w-[380px] md:rounded md:border">
          <div className="flex items-start justify-between gap-2 border-b border-line px-4 py-3">
            <div>
              <div className="text-[14px] font-bold">Assistente</div>
              <div className="text-[11.5px] leading-snug text-muted">
                Respondo com o que está na central de ajuda. O que não estiver lá vira chamado —
                daqui sai laudo, então não chuto.
              </div>
            </div>
            <button
              onClick={() => setAberto(false)}
              aria-label="Fechar"
              className="shrink-0 text-[18px] leading-none text-muted"
            >
              ×
            </button>
          </div>

          <div className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
            {falas.length === 0 && (
              <p className="text-[12.5px] leading-relaxed text-muted">
                Pergunte em português mesmo. Por exemplo: “preciso do RBT12 para emitir o laudo?”
                ou “como mando o formulário para o cliente?”.
              </p>
            )}
            {falas.map((f, i) => (
              <div
                key={i}
                className={`rounded-sm px-3 py-2 text-[13px] leading-relaxed ${
                  f.de === "voce"
                    ? "ml-6 bg-ink text-white"
                    : f.escalado
                      ? "mr-6 border border-accent bg-accentwash"
                      : "mr-6 bg-surface2"
                }`}
              >
                <p className="whitespace-pre-wrap">{f.texto}</p>
                {f.escalado && (
                  <a
                    href="/painel/chamados"
                    className="mt-1.5 block text-[11.5px] font-semibold text-accentdeep underline underline-offset-2"
                  >
                    Acompanhar em Meus chamados
                  </a>
                )}
              </div>
            ))}
            {ocupado && <p className="text-[12.5px] text-muted">Pensando…</p>}
            <div ref={fim} />
          </div>

          <div className="flex gap-2 border-t border-line px-3 py-3">
            <input
              value={pergunta}
              onChange={(e) => setPergunta(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void perguntar();
              }}
              placeholder="Sua dúvida"
              className="flex-1 rounded-sm border border-line px-3 py-2 text-[16px] outline-none focus:border-accent md:text-sm"
            />
            <button
              onClick={perguntar}
              title={ocupado ? "Aguardando a resposta anterior" : "Escreva a pergunta para liberar"}
              disabled={ocupado || !pergunta.trim()}
              className="rounded-sm bg-ink px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
            >
              Enviar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
