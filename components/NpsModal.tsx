"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { desfecho, limparIndicados, type Indicado } from "@/lib/nps";

/**
 * O NPS QUE APARECE — porque NPS que espera visita não é NPS.
 *
 * A primeira versão era a página /painel/indique. Ninguém navega até uma
 * pesquisa de satisfação: ela precisa aparecer, num momento em que a pessoa
 * acabou de receber valor.
 *
 * QUANDO aparece é decidido em lib/nps (`devePerguntarNps`), testado nota a
 * nota: só depois do primeiro laudo, 90 dias de paz para quem respondeu, 30
 * para quem dispensou.
 *
 * FECHAR É UMA RESPOSTA. O × registra "agora não" e some por 30 dias. Se
 * fechar não registrasse nada, o convite voltaria no próximo carregamento — e
 * a pessoa aprenderia a ignorar tudo que este produto mostra.
 */
export function NpsModal({ mostrar }: { mostrar: boolean }) {
  const router = useRouter();
  const [fechado, setFechado] = useState(false);
  const [nota, setNota] = useState<number | null>(null);
  const [npsId, setNpsId] = useState<string | null>(null);
  const [comentario, setComentario] = useState("");
  const [linhas, setLinhas] = useState<Indicado[]>([
    { nome: "", email: "" },
    { nome: "", email: "" },
  ]);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState<string | null>(null);

  if (!mostrar || fechado) return null;
  const d = nota === null ? null : desfecho(nota);

  async function dispensar() {
    setFechado(true);
    try {
      // registra o "agora não" no navegador: é leitura de um único usuário,
      // num único dispositivo, e não justifica uma tabela
      localStorage.setItem("enquadria_nps_dispensado", new Date().toISOString().slice(0, 10));
    } catch {
      /* navegador sem storage: no pior caso o convite volta depois */
    }
  }

  async function registrar(n: number) {
    setNota(n);
    setErro(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from("nps_respostas")
      .insert({ user_id: user.id, nota: n })
      .select("id")
      .maybeSingle();
    if (error) {
      setErro(error.message);
      return;
    }
    setNpsId((data?.id as string) ?? null);
    try {
      localStorage.setItem("enquadria_nps_respondido", new Date().toISOString().slice(0, 10));
    } catch {
      /* idem */
    }
    router.refresh();
  }

  async function enviarComentario() {
    if (!npsId || !comentario.trim()) return;
    setOcupado(true);
    const supabase = createClient();
    await supabase.from("nps_respostas").update({ comentario }).eq("id", npsId);
    setOcupado(false);
    setPronto("Obrigado. Sua resposta chega direto em mim — não é caixa de sugestões.");
  }

  async function enviarIndicacoes() {
    setErro(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const limpos = limparIndicados(linhas, user?.email ?? undefined);
    if (limpos.length === 0) {
      setErro("Preencha ao menos um e-mail válido.");
      return;
    }
    setOcupado(true);
    const r = await fetch("/api/indicacao/convidar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ indicados: limpos, nps_id: npsId }),
    });
    const j = (await r.json().catch(() => ({}))) as { erro?: string; enviados?: number; repetidos?: number };
    setOcupado(false);
    if (!r.ok || j.erro) {
      setErro(j.erro ?? "Não consegui enviar os convites.");
      return;
    }
    setPronto(
      `${j.enviados ?? 0} convite(s) enviado(s) em nome do Enquadria, dizendo que veio de você.${
        j.repetidos ? ` ${j.repetidos} já tinha(m) sido convidado(s) antes.` : ""
      }`
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div className="w-full max-w-md rounded border border-line bg-surface p-5 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div className="text-[15px] font-bold">
            {pronto ? "Obrigado" : "Uma pergunta só"}
          </div>
          <button
            // ux-ok: `fechado` faz o modal inteiro sumir pelo retorno antecipado
            onClick={dispensar}
            aria-label="Agora não"
            className="shrink-0 text-[18px] leading-none text-muted"
          >
            ×
          </button>
        </div>

        {pronto ? (
          <p className="mt-2 text-[13.5px] leading-relaxed text-slate2">{pronto}</p>
        ) : (
          <>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              De 0 a 10, quanto você indicaria o Enquadria a outro contador?
            </p>

            <div className="mt-3 flex flex-wrap gap-1">
              {Array.from({ length: 11 }, (_, n) => (
                <button
                  key={n}
                  onClick={() => void registrar(n)}
                  className={`h-9 w-9 rounded-sm border font-mono text-[12.5px] ${
                    nota === n
                      ? "border-ink bg-ink font-medium text-white"
                      : "border-line bg-surface text-slate2 hover:border-accent"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>

            {erro && (
              <p className="mt-2 rounded-sm bg-vermelhowash px-3 py-2 text-[12px] text-vermelho">{erro}</p>
            )}

            {d && (
              <div className="mt-4 border-t border-linesoft pt-3">
                <div className="text-[14px] font-bold">{d.titulo}</div>
                <p className="mt-1 text-[12.5px] leading-relaxed text-slate2">{d.texto}</p>

                {d.pedeIndicacao ? (
                  <>
                    <div className="mt-3 space-y-2">
                      {linhas.map((l, i) => (
                        <div key={i} className="grid grid-cols-2 gap-2">
                          <input
                            placeholder="Nome"
                            value={l.nome}
                            onChange={(e) =>
                              setLinhas(linhas.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))
                            }
                            className="rounded-sm border border-line px-2.5 py-2 text-[16px] sm:text-[13px]"
                          />
                          <input
                            placeholder="E-mail"
                            inputMode="email"
                            value={l.email}
                            onChange={(e) =>
                              setLinhas(linhas.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))
                            }
                            className="rounded-sm border border-line px-2.5 py-2 text-[16px] sm:text-[13px]"
                          />
                        </div>
                      ))}
                    </div>
                    <button
                      // ux-ok: `pronto` troca o conteúdo do modal na hora
                      onClick={enviarIndicacoes}
                      disabled={ocupado}
                      className="mt-3 w-full rounded-sm bg-ink py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-40"
                    >
                      {ocupado ? "Enviando…" : "Indicar"}
                    </button>
                    <p className="mt-2 text-[11px] leading-relaxed text-muted">
                      O convite sai em nome do Enquadria dizendo que veio de você. Seu escritório
                      não vira remetente sem você combinar isso.
                    </p>
                  </>
                ) : (
                  <>
                    <textarea
                      rows={3}
                      value={comentario}
                      onChange={(e) => setComentario(e.target.value)}
                      className="mt-2 w-full rounded-sm border border-line px-3 py-2 text-[16px] sm:text-[13.5px]"
                    />
                    <button
                      // ux-ok: `pronto` troca o conteúdo do modal na hora
                      onClick={enviarComentario}
                      disabled={ocupado || !comentario.trim()}
                      className="mt-2 w-full rounded-sm bg-ink py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-40"
                    >
                      {ocupado ? "Enviando…" : "Enviar"}
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
