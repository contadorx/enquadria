"use client";

import { useState } from "react";

/**
 * TIRAR UMA EMPRESA DA FRENTE.
 *
 * A pergunta que gerou esta tela foi prática: "subi a carteira errada, e
 * agora?". Até aqui não havia resposta nenhuma — nem apagar, nem esconder. A
 * empresa errada ficava na fila para sempre, contando nos números do funil e
 * competindo por atenção com as que pagam.
 *
 * DUAS AÇÕES, E A DIFERENÇA ENTRE ELAS É O QUE JÁ FOI ENTREGUE:
 *
 *  · ARQUIVAR sai da fila e das contagens e não perde nada. É o caminho normal,
 *    e o único possível quando já existe laudo ou termo — documento entregue
 *    tem código de verificação público, e apagar a empresa transformaria a
 *    prova do cliente num link quebrado.
 *
 *  · APAGAR só existe para o engano puro: importei errado, nada foi produzido.
 *    Quem decide não é esta tela — é o servidor, que recusa com 409 quando há
 *    documento. Aqui a recusa vira explicação e oferta de arquivar, em vez de
 *    um erro vermelho sem saída.
 *
 * O botão de apagar exige confirmação escrita porque é irreversível e fica ao
 * lado de uma ação que não é.
 */
export function ArquivarEmpresa({
  empresaId,
  razaoSocial,
  arquivadaEm,
  aoMudar,
}: {
  empresaId: string;
  razaoSocial: string;
  arquivadaEm?: string | null;
  aoMudar?: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [confirmandoApagar, setConfirmandoApagar] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sugereArquivar, setSugereArquivar] = useState(false);
  const [pronto, setPronto] = useState<string | null>(null);

  async function chamar(acao: "arquivar" | "desarquivar" | "apagar") {
    setOcupado(acao);
    setErro(null);
    setSugereArquivar(false);
    try {
      const r = await fetch("/api/empresa/arquivar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa_id: empresaId, acao, motivo }),
      });
      const j = (await r.json().catch(() => ({}))) as { erro?: string; sugestao?: string; acao?: string };
      if (!r.ok) {
        setErro(j.erro ?? "não consegui concluir");
        setSugereArquivar(j.sugestao === "arquivar");
        return;
      }
      setConfirmandoApagar(false);
      setPronto(
        j.acao === "apagada"
          ? "Empresa apagada. Ela não aparece mais em lugar nenhum."
          : j.acao === "desarquivada"
            ? "Empresa de volta à fila."
            : "Empresa arquivada. Saiu da fila e das contagens; nada foi perdido."
      );
      aoMudar?.();
    } finally {
      setOcupado(null);
    }
  }

  /* já arquivada: a única oferta é voltar */
  if (arquivadaEm) {
    return (
      <div className="rounded-sm border border-line bg-surface2 p-3">
        <div className="text-[12.5px] font-semibold">
          Arquivada em {new Date(arquivadaEm).toLocaleDateString("pt-BR")}
        </div>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">
          Fora da fila e das contagens. Os documentos emitidos continuam válidos e verificáveis.
        </p>
        <button
          // ux-ok: o aviso de resultado aparece logo abaixo deste botão
          onClick={() => void chamar("desarquivar")}
          disabled={ocupado === "desarquivar"}
          className="mt-2 rounded-sm border border-line bg-surface px-3 py-1.5 text-[12px] font-semibold text-slate2 disabled:opacity-40"
        >
          {ocupado === "desarquivar" ? "Trazendo de volta…" : "Trazer de volta à fila"}
        </button>
        {pronto && <p className="mt-2 text-[12px] text-verde">{pronto}</p>}
        {erro && <p className="mt-2 text-[12px] text-vermelho">{erro}</p>}
      </div>
    );
  }

  if (pronto) {
    return <p className="rounded-sm bg-verdewash px-3 py-2 text-[12.5px] text-verde">{pronto}</p>;
  }

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        className="text-[12px] font-semibold text-muted underline underline-offset-2"
      >
        Tirar esta empresa da fila
      </button>
    );
  }

  return (
    <div className="rounded-sm border border-line bg-surface2 p-3">
      <div className="text-[12.5px] font-semibold">Tirar {razaoSocial} da fila</div>
      <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">
        <b>Arquivar</b> é o caminho normal: ela sai da fila e das contagens e pode voltar quando
        você quiser. Nada é perdido.
      </p>

      <label className="mt-2 block">
        <span className="mb-1 block text-[11.5px] text-muted">Motivo (opcional, fica no registro)</span>
        <input
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ex.: encerrou atividade · saiu da carteira · importei duplicado"
          className="w-full rounded-sm border border-line px-2.5 py-1.5 text-[16px] outline-none focus:border-accent sm:text-[12.5px]"
        />
      </label>

      <div className="mt-2.5 flex flex-wrap gap-2">
        <button
          // ux-ok: o resultado aparece nesta mesma caixa, logo abaixo
          onClick={() => void chamar("arquivar")}
          disabled={ocupado === "arquivar"}
          className="rounded-sm bg-ink px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
        >
          {ocupado === "arquivar" ? "Arquivando…" : "Arquivar"}
        </button>
        <button
          onClick={() => setAberto(false)}
          className="rounded-sm border border-line px-3 py-1.5 text-[12px] font-semibold text-slate2"
        >
          Cancelar
        </button>
      </div>

      <div className="mt-3 border-t border-line pt-3">
        {!confirmandoApagar ? (
          <button
            onClick={() => setConfirmandoApagar(true)}
            className="text-[11.5px] font-semibold text-vermelho underline underline-offset-2"
          >
            Apagar de vez (só se nada foi emitido)
          </button>
        ) : (
          <>
            <p className="text-[11.5px] leading-relaxed text-vermelho">
              Apagar remove a empresa e as análises dela para sempre. Se já existe laudo ou termo,
              o sistema recusa — e aí o caminho é arquivar.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                // ux-ok: a recusa ou a confirmação aparecem logo abaixo
                onClick={() => void chamar("apagar")}
                disabled={ocupado === "apagar"}
                className="rounded-sm bg-vermelho px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
              >
                {ocupado === "apagar" ? "Apagando…" : "Confirmo, apagar"}
              </button>
              <button
                onClick={() => setConfirmandoApagar(false)}
                className="rounded-sm border border-line px-3 py-1.5 text-[12px] font-semibold text-slate2"
              >
                Voltar
              </button>
            </div>
          </>
        )}
      </div>

      {erro && (
        <div className="mt-2 rounded-sm border border-amarelo bg-amarelowash p-2.5">
          <p className="text-[12px] leading-relaxed text-slate2">{erro}</p>
          {sugereArquivar && (
            <button
              // ux-ok: a confirmação substitui esta caixa na hora
              onClick={() => void chamar("arquivar")}
              disabled={ocupado === "arquivar"}
              className="mt-2 rounded-sm bg-ink px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
            >
              {ocupado === "arquivar" ? "Arquivando…" : "Arquivar em vez de apagar"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
