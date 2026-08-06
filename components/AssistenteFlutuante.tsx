"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  dicaDaTela,
  proximoPasso,
  respostaLocal,
  sugestoes,
  passoEmTexto,
  type Situacao,
} from "@/lib/passos";

/**
 * O ASSISTENTE — agora ele fala primeiro.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * O QUE MUDOU, E POR QUÊ. A versão anterior era um botão "?" que respondia
 * quando perguntado, com o conteúdo dos artigos. Funcionava para quem sabia o
 * que perguntar.
 *
 * Em 05-06/08/2026 uma contadora com 25 clientes no Simples travou três vezes
 * — "como consigo acessar?", "primeiro eu preencho aquela planilha?", "eu
 * estou perdida" — e as três vezes ela escreveu no WHATSAPP, não aqui. Não é
 * falha dela: quem está perdido não sabe formular a pergunta, e um botão de
 * interrogação no canto não parece um lugar onde alguém responde "clique aqui,
 * depois aqui".
 *
 * Daí as três mudanças:
 *
 *   1. ELE ABRE SOZINHO, uma vez por tela, quando a pessoa está parada num
 *      ponto conhecido de travamento — e só nesses pontos. Assistente que
 *      aparece em toda tela é pop-up, e pop-up se aprende a fechar sem ler.
 *
 *   2. PERGUNTA DE USO NÃO VAI PARA A IA. "Por onde começo", "preciso da
 *      planilha", "o que é RBT12" têm resposta certa e escrita: sai na hora,
 *      de graça, sem risco de variação. A IA continua respondendo o que é
 *      conteúdo — e continua com a trava de não inventar.
 *
 *   3. AS PERGUNTAS APARECEM PRONTAS, escolhidas pelo momento da conta. Quem
 *      não sabe o que perguntar não digita; mas clica.
 */

interface Fala {
  de: "voce" | "assistente";
  texto: string;
  escalado?: boolean;
  /** veio do roteiro fixo, não da IA */
  roteiro?: boolean;
}

/** segundos parado na tela antes de o assistente se oferecer */
const ESPERA_MS = 9000;

export function AssistenteFlutuante({
  ativo,
  situacao,
}: {
  ativo: boolean;
  situacao?: Situacao;
}) {
  const rota = usePathname() ?? "/painel";
  const [aberto, setAberto] = useState(false);
  const [pergunta, setPergunta] = useState("");
  const [falas, setFalas] = useState<Fala[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [bolha, setBolha] = useState<ReturnType<typeof dicaDaTela>>(null);
  const fim = useRef<HTMLDivElement>(null);

  const sit: Situacao = situacao ?? {
    temEscritorio: false, empresas: 0, analises: 0, laudos: 0, termos: 0, assinados: 0,
  };

  /* rola para o fim a cada resposta — MENOS na primeira, que costuma ser o
     passo a passo inteiro: rolar ali esconde o título e a pessoa começa a ler
     pelo meio, que é a sensação exata que este assistente existe para evitar */
  useEffect(() => {
    if (falas.length > 1 || ocupado) fim.current?.scrollIntoView({ behavior: "smooth" });
  }, [falas, ocupado]);

  /**
   * A OFERTA PROATIVA — com três travas para não virar pop-up:
   *
   *   · só em ponto conhecido de travamento (quem decide é `dicaDaTela`);
   *   · uma vez por dica, por sessão do navegador — reabrir a tela dez vezes
   *     não repete a mesma frase dez vezes;
   *   · nunca por cima do assistente já aberto: se a pessoa está conversando,
   *     ela já foi atendida.
   */
  useEffect(() => {
    if (!ativo || aberto) return;
    const d = dicaDaTela(rota, sit);
    if (!d) { setBolha(null); return; }

    const marca = `enquadria_dica_${d.chave}`;
    try {
      if (sessionStorage.getItem(marca)) return;
    } catch {
      /* sem sessionStorage a dica pode repetir — incômodo pequeno, e melhor
         do que não aparecer para quem mais precisa dela */
    }

    const t = setTimeout(() => {
      setBolha(d);
      try { sessionStorage.setItem(marca, "1"); } catch { /* idem */ }
    }, ESPERA_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo, aberto, rota, sit.empresas, sit.analises, sit.laudos, sit.temEscritorio]);

  if (!ativo) return null;

  /** responde de dentro para fora: roteiro fixo primeiro, IA depois */
  async function responder(q: string) {
    if (!q.trim() || ocupado) return;
    setPergunta("");
    setFalas((f) => [...f, { de: "voce", texto: q }]);

    const local = respostaLocal(q, sit);
    if (local) {
      setFalas((f) => [...f, { de: "assistente", texto: local.texto, roteiro: true }]);
      return;
    }

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
        { de: "assistente", texto: j.erro ?? j.resposta ?? "Não consegui responder agora.", escalado: j.escalado },
      ]);
    } catch {
      setFalas((f) => [...f, { de: "assistente", texto: "Não consegui falar com o servidor. Tente de novo." }]);
    } finally {
      setOcupado(false);
    }
  }

  /** abre o painel já com o passo a passo do momento escrito */
  function abrirComPasso() {
    const p = proximoPasso(sit);
    setBolha(null);
    setAberto(true);
    setFalas((f) =>
      f.length ? f : [{ de: "assistente", texto: passoEmTexto(p), roteiro: true }]
    );
  }

  return (
    <>
      {/* ─────────────────────────────────────── a oferta, antes de perguntarem */}
      {!aberto && bolha && (
        <div className="fixed bottom-20 right-4 z-40 w-[min(92vw,320px)] rounded border border-accent bg-surface p-3 shadow-card md:bottom-6 md:right-20">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[13px] font-bold leading-snug">{bolha.titulo}</p>
            <button
              onClick={() => setBolha(null)}
              aria-label="Dispensar"
              className="shrink-0 text-[16px] leading-none text-muted"
            >
              ×
            </button>
          </div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-slate2">{bolha.texto}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {bolha.ctaRota ? (
              <Link href={bolha.ctaRota} className="rounded-sm bg-ink px-3 py-1.5 text-[12.5px] font-semibold text-white">
                {bolha.ctaRotulo ?? "Ir"}
              </Link>
            ) : (
              /* ux-ok: o clique abre o painel do assistente na mesma tela, com o
                 passo a passo já escrito — o efeito é imediato e no mesmo lugar. */
              <button
                onClick={abrirComPasso}
                className="rounded-sm bg-ink px-3 py-1.5 text-[12.5px] font-semibold text-white"
              >
                {bolha.ctaRotulo ?? "Ver o passo a passo"}
              </button>
            )}
          </div>
        </div>
      )}

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
                Pergunta de uso eu respondo na hora. Dúvida de norma vem da central de ajuda — e o
                que não estiver escrito lá vira chamado, porque daqui sai laudo.
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
              <>
                <p className="text-[12.5px] leading-relaxed text-muted">
                  Pergunte em português mesmo — ou comece por uma destas:
                </p>
                <div className="flex flex-col gap-1.5">
                  {sugestoes(sit).map((q) => (
                    /* ux-ok: o clique escreve a pergunta e a resposta aparece
                       logo abaixo, na mesma caixa. */
                    <button
                      key={q}
                      onClick={() => responder(q)}
                      className="rounded-sm border border-line px-3 py-2 text-left text-[12.5px] font-medium text-slate2 hover:border-accent"
                    >
                      {q}
                    </button>
                  ))}
                </div>
                <button
                  onClick={abrirComPasso}
                  className="mt-1 w-full rounded-sm bg-surface2 px-3 py-2 text-[12.5px] font-semibold text-accentdeep"
                >
                  Me mostre o meu próximo passo
                </button>
              </>
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
                {f.roteiro && (
                  <p className="mt-1.5 text-[11px] text-muted">
                    Travou em algum destes passos? Escreva aqui em qual — eu detalho.
                  </p>
                )}
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
                if (e.key === "Enter") void responder(pergunta);
              }}
              placeholder="Sua dúvida"
              className="flex-1 rounded-sm border border-line px-3 py-2 text-[16px] outline-none focus:border-accent md:text-sm"
            />
            <button
              onClick={() => responder(pergunta)}
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
