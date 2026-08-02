"use client";

import { useState } from "react";
import { PERGUNTAS, TOTAL_PERGUNTAS, respondidas, type RespostasColeta, type ChaveColeta } from "@/lib/coleta";

/**
 * O FORMULÁRIO QUE A EMPRESA RESPONDE.
 *
 * Desenhado para o celular do dono da empresa, entre um cliente e outro:
 * uma coluna, alvo grande, zero jargão, barra mostrando o quanto falta. Seis
 * perguntas e acabou — se parecer um cadastro, ninguém responde, e o contador
 * volta a chutar os cinco números que não tem.
 */
export function FormColeta({ token, empresa }: { token: string; empresa: string }) {
  const [r, setR] = useState<RespostasColeta>({});
  const [nome, setNome] = useState("");
  const [cargo, setCargo] = useState("");
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  /* separado do `erro` de propósito: quando o que falta é o NOME, acender as
     seis perguntas em amarelo manda a pessoa procurar erro onde não há */
  const [marcarVazias, setMarcarVazias] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState(false);

  const feitas = respondidas(r);
  const pct = Math.round((feitas / TOTAL_PERGUNTAS) * 100);

  async function enviar() {
    setErro(null);
    setMarcarVazias(false);
    if (feitas < TOTAL_PERGUNTAS) {
      setErro("Falta responder alguma pergunta — as que faltam estão marcadas.");
      setMarcarVazias(true);
      document.querySelector("[data-vazia]")?.scrollIntoView({ block: "center" });
      return;
    }
    if (nome.trim().length < 3) {
      setErro("Antes de enviar, escreva o seu nome — o seu contador precisa saber quem respondeu.");
      return;
    }
    setEnviando(true);
    try {
      const resp = await fetch(`/api/coleta/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ respostas: r, nome, cargo, observacao: obs }),
      });
      const json = await resp.json();
      if (resp.ok) setPronto(true);
      else setErro(json.erro ?? "Não consegui enviar. Tente de novo em instantes.");
    } catch {
      setErro("Falha de conexão. Tente de novo em instantes.");
    } finally {
      setEnviando(false);
    }
  }

  if (pronto) {
    return (
      <div className="rounded border border-verde bg-verdewash p-6 text-center">
        <h2 className="text-[19px] font-bold text-ink">Respostas enviadas</h2>
        <p className="mx-auto mt-2 max-w-[46ch] text-[14px] leading-relaxed text-slate2">
          Obrigado. O seu contador já recebeu e vai usar isso para calcular a decisão da{" "}
          <b>{empresa}</b>. Pode fechar esta página.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* a barra fica no topo e gruda: quem responde no celular precisa ver que
          acaba rápido, senão desiste na terceira pergunta */}
      <div className="sticky top-0 z-10 -mx-1 mb-5 bg-bg px-1 pb-3 pt-1">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted">
            {feitas} de {TOTAL_PERGUNTAS} respondidas
          </span>
          <span className="font-mono text-[12px] font-semibold text-accentdeep">{pct}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-linesoft">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="space-y-3">
        {PERGUNTAS.map((p, i) => {
          const valor = r[p.chave];
          const vazia = typeof valor !== "number";
          return (
            <div
              key={p.chave}
              data-vazia={vazia && marcarVazias ? "" : undefined}
              className={`rounded border bg-surface p-4 ${
                vazia && marcarVazias ? "border-amarelo bg-amarelowash" : "border-line"
              }`}
            >
              <div className="flex gap-2.5">
                <span className="mt-0.5 font-mono text-[11px] text-muted">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold leading-snug text-ink">{p.titulo}</div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{p.ajuda}</p>
                  <div className="mt-3 space-y-1.5">
                    {p.opcoes.map((o) => {
                      const ativo = typeof valor === "number" && Math.abs(valor - o.valor) < 1e-9;
                      return (
                        <button
                          key={o.rotulo}
                          type="button"
                          onClick={() => setR({ ...r, [p.chave]: o.valor } as RespostasColeta)}
                          className={`flex min-h-[44px] w-full items-center gap-2.5 rounded-sm border px-3 py-2 text-left text-[14px] ${
                            ativo
                              ? "border-ink bg-ink font-medium text-white"
                              : "border-line bg-surface text-slate2 hover:border-accent"
                          }`}
                        >
                          <span
                            className={`h-3.5 w-3.5 flex-none rounded-full border-2 ${
                              ativo ? "border-accent bg-accent" : "border-line"
                            }`}
                          />
                          {o.rotulo}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        <div className="rounded border border-line bg-surface p-4">
          <div className="text-[15px] font-semibold text-ink">Quem está respondendo?</div>
          <div className="mt-3 space-y-2.5">
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Seu nome"
              className="min-h-[44px] w-full rounded-sm border border-line px-3 text-[14px] outline-none focus:border-accent"
            />
            <input
              value={cargo}
              onChange={(e) => setCargo(e.target.value)}
              placeholder="Cargo (opcional) — sócio, gerente, financeiro"
              className="min-h-[44px] w-full rounded-sm border border-line px-3 text-[14px] outline-none focus:border-accent"
            />
            <textarea
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              rows={3}
              placeholder="Quer contar mais alguma coisa ao seu contador? (opcional)"
              className="w-full rounded-sm border border-line p-3 text-[14px] outline-none focus:border-accent"
            />
          </div>
        </div>
      </div>

      {erro && (
        <div className="mt-4 rounded-sm border border-amarelo bg-amarelowash px-3.5 py-2.5 text-[13.5px] text-slate2">
          {erro}
        </div>
      )}

      <button
        onClick={enviar}
        disabled={enviando}
        className="mt-4 min-h-[50px] w-full rounded-sm bg-ink text-[15px] font-semibold text-white disabled:opacity-50"
      >
        {enviando ? "Enviando…" : "Enviar as respostas"}
      </button>
    </div>
  );
}
