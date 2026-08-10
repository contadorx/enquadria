"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * O BOTÃO DE RECOMEÇAR A GRAVAÇÃO — 10/08/2026.
 *
 * Só aparece na conta declarada como de demonstração (a própria rota recusa
 * qualquer outra). Não é atalho de produto: é ferramenta de quem grava vídeo e
 * precisa da carteira vazia várias vezes no mesmo dia.
 *
 * A frase digitada não é cerimônia. Este botão apaga a carteira inteira, e
 * botão de apagar tudo protegido só por "tem certeza?" é botão que se clica sem
 * ler. Digitar obriga a passar pela cabeça.
 */
export function ZerarCarteira({ visivel }: { visivel: boolean }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [frase, setFrase] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [recado, setRecado] = useState<string | null>(null);

  if (!visivel) return null;

  async function zerar() {
    setOcupado(true);
    setRecado(null);
    try {
      const r = await fetch("/api/dev/zerar-carteira", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmacao: frase }),
      });
      const j = await r.json();
      if (!r.ok) {
        setRecado(j.erro ?? "não foi possível zerar");
        return;
      }
      /* o relatório por tabela some da tela em três segundos, mas é o que
         responde "apagou mesmo?" — e é ele que denuncia tabela que não existe
         neste banco, em vez de deixar o problema para a próxima importação */
      const linhas = Object.entries(j.apagados as Record<string, number | string>)
        .filter(([, v]) => v !== 0)
        .map(([t, v]) => `${t}: ${v}`);
      setRecado(linhas.length ? `Carteira zerada. ${linhas.join(" · ")}` : "Não havia nada para apagar.");
      setFrase("");
      setAberto(false);
      router.refresh();
    } catch {
      setRecado("falha de rede — nada foi apagado.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="mt-8 rounded border border-vermelho/30 bg-vermelhowash p-4">
      <div className="text-[13.5px] font-bold text-ink">Conta de demonstração · zerar a carteira</div>
      <p className="mt-1 max-w-[70ch] text-[12.5px] leading-relaxed text-slate2">
        Apaga empresas, análises, laudos, termos, coletas, comparativos e apontamentos{" "}
        <b>desta conta</b>, para recomeçar uma gravação do zero. O escritório, a marca, o CRC e o
        plano <b>ficam</b> — o que se refaz numa tomada é a carteira, não o cadastro.
      </p>

      {!aberto ? (
        <button
          onClick={() => setAberto(true)}
          className="mt-3 rounded-sm border border-vermelho px-3 py-2 text-[12.5px] font-semibold text-vermelho"
        >
          Zerar a carteira
        </button>
      ) : (
        <div className="mt-3">
          <label className="block text-[12px] font-semibold text-slate2">
            Digite <span className="font-mono">APAGAR A CARTEIRA</span> para confirmar
          </label>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <input
              value={frase}
              onChange={(e) => setFrase(e.target.value)}
              placeholder="APAGAR A CARTEIRA"
              className="rounded-sm border border-line px-3 py-2 font-mono text-[12.5px]"
            />
            <button
              onClick={() => void zerar()}
              disabled={ocupado || frase.trim().toUpperCase() !== "APAGAR A CARTEIRA"}
              className="rounded-sm bg-vermelho px-3 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40"
            >
              {ocupado ? "Apagando…" : "Apagar agora"}
            </button>
            <button
              onClick={() => {
                setAberto(false);
                setFrase("");
              }}
              className="text-[12.5px] font-semibold text-muted underline underline-offset-2"
            >
              cancelar
            </button>
          </div>
        </div>
      )}

      {recado && (
        <p className="mt-2.5 font-mono text-[11.5px] leading-relaxed text-slate2">{recado}</p>
      )}
    </div>
  );
}
