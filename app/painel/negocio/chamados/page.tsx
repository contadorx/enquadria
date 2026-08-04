"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";

/**
 * A CAIXA DE ENTRADA DO SUPORTE.
 *
 * Ordena por ABERTO primeiro, depois por mais antigo. Não é ordenação
 * estética: chamado antigo e sem resposta é o que estraga a relação, e ele é
 * exatamente o que uma lista "mais recente primeiro" empurra para o fim.
 *
 * O aviso "respondido mas o e-mail não saiu" tem destaque próprio. Sem ele,
 * uma resposta escrita e não entregue fica indistinguível de uma resposta
 * entregue — e é o caso em que alguém precisa agir.
 */

interface Msg {
  id: string;
  chamado_id: string;
  autor: string;
  corpo: string;
  criado_em: string;
  notificado_em: string | null;
}

interface Chamado {
  id: string;
  assunto: string;
  status: string;
  escalado_ia: boolean;
  criado_em: string;
  user_id: string;
}

export default function ChamadosAdmin() {
  const [lista, setLista] = useState<Chamado[]>([]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [aberto, setAberto] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function carregar() {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("chamados")
      .select("id, assunto, status, escalado_ia, criado_em, user_id")
      .order("criado_em", { ascending: true });
    if (error) {
      setErro(/chamados/i.test(error.message) ? "A migration 0031 ainda não foi rodada." : error.message);
      return;
    }
    const cs = (data ?? []) as unknown as Chamado[];
    // aberto primeiro, depois o mais antigo — o que espera há mais tempo sobe
    cs.sort((a, b) => {
      const pa = a.status === "aberto" ? 0 : a.status === "respondido" ? 1 : 2;
      const pb = b.status === "aberto" ? 0 : b.status === "respondido" ? 1 : 2;
      return pa === pb ? a.criado_em.localeCompare(b.criado_em) : pa - pb;
    });
    setLista(cs);

    if (cs.length) {
      const { data: m } = await supabase
        .from("chamado_mensagens")
        .select("id, chamado_id, autor, corpo, criado_em, notificado_em")
        .in("chamado_id", cs.map((c) => c.id))
        .order("criado_em");
      setMsgs((m ?? []) as unknown as Msg[]);
    }
  }

  useEffect(() => {
    void carregar();
  }, []);

  async function responder(id: string, resolver: boolean) {
    if (!texto.trim()) return;
    setEnviando(true);
    setErro(null);
    setAviso(null);
    try {
      const r = await fetch("/api/chamado/responder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chamado_id: id, resposta: texto, resolver }),
      });
      const j = (await r.json().catch(() => ({}))) as { erro?: string; avisado?: boolean; motivo?: string };
      if (!r.ok || j.erro) {
        setErro(j.erro ?? "Não consegui responder.");
        return;
      }
      setTexto("");
      setAviso(
        j.avisado
          ? "Resposta enviada e o cliente foi avisado por e-mail."
          : `Resposta gravada, mas o e-mail NÃO saiu${j.motivo ? ` (${j.motivo})` : ""}. Ele só vai ver se entrar no app.`
      );
      await carregar();
    } catch {
      setErro("Não consegui falar com o servidor.");
    } finally {
      setEnviando(false);
    }
  }

  const abertos = lista.filter((c) => c.status === "aberto").length;

  return (
    <div className="max-w-[80ch]">
      <h1 className="text-[19px] font-bold tracking-tight">Chamados</h1>
      <p className="mt-0.5 text-[13px] text-muted">
        {abertos > 0
          ? `${abertos} aguardando resposta. Os mais antigos aparecem primeiro.`
          : "Nenhum chamado aguardando."}
      </p>

      {erro && <p className="mt-4 rounded-sm bg-vermelhowash px-3 py-2 text-[12.5px] text-vermelho">{erro}</p>}
      {aviso && (
        <p
          className={`mt-4 rounded-sm px-3 py-2 text-[12.5px] ${
            aviso.startsWith("Resposta enviada")
              ? "bg-verdewash text-verde"
              : "bg-amarelowash text-slate2"
          }`}
        >
          {aviso}
        </p>
      )}

      <div className="mt-5 space-y-3">
        {lista.map((c) => {
          const doChamado = msgs.filter((m) => m.chamado_id === c.id);
          const ultimaDoSuporte = [...doChamado].reverse().find((m) => m.autor === "suporte");
          const naoAvisado = ultimaDoSuporte && !ultimaDoSuporte.notificado_em;

          return (
            <div key={c.id} className="rounded border border-line bg-surface p-4">
              <button
                onClick={() => setAberto(aberto === c.id ? null : c.id)}
                className="w-full text-left"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10.5px] text-muted">
                    {new Date(c.criado_em).toLocaleDateString("pt-BR")}
                  </span>
                  <span
                    className={`rounded-sm px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider ${
                      c.status === "aberto"
                        ? "bg-amarelowash text-slate2"
                        : c.status === "resolvido"
                          ? "bg-verdewash text-verde"
                          : "bg-accentwash text-accentdeep"
                    }`}
                  >
                    {c.status}
                  </span>
                  {c.escalado_ia && (
                    <span className="font-mono text-[9.5px] uppercase tracking-wider text-muted">
                      via assistente
                    </span>
                  )}
                  {naoAvisado && (
                    <span className="rounded-sm bg-vermelhowash px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-vermelho">
                      e-mail não saiu
                    </span>
                  )}
                </div>
                <div className="mt-1 text-[14px] font-semibold">{c.assunto}</div>
              </button>

              {aberto === c.id && (
                <div className="mt-3">
                  <div className="space-y-2">
                    {doChamado.map((m) => (
                      <div
                        key={m.id}
                        className={`rounded-sm px-3 py-2 text-[13px] leading-relaxed ${
                          m.autor === "suporte" ? "bg-accentwash" : "bg-surface2"
                        }`}
                      >
                        <div className="font-mono text-[9.5px] uppercase tracking-wider text-muted">
                          {m.autor === "cliente" ? "cliente" : m.autor === "suporte" ? "suporte" : "sistema"}
                          {m.autor === "suporte" && !m.notificado_em && " · não avisado por e-mail"}
                        </div>
                        <p className="mt-0.5 whitespace-pre-wrap">{m.corpo}</p>
                      </div>
                    ))}
                  </div>

                  <textarea
                    rows={4}
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    placeholder="A resposta vai inteira no e-mail — quem perguntou algo operacional quer a resposta, não um convite para acessar o site."
                    className="mt-3 w-full rounded-sm border border-line px-3 py-2 text-[13.5px]"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      onClick={() => void responder(c.id, false)}
                      disabled={enviando || !texto.trim()}
                      className="rounded-sm bg-ink px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
                    >
                      {enviando ? "Enviando…" : "Responder"}
                    </button>
                    <button
                      onClick={() => void responder(c.id, true)}
                      disabled={enviando || !texto.trim()}
                      className="rounded-sm border border-line px-4 py-2 text-[13px] font-semibold text-slate2 disabled:opacity-40"
                    >
                      Responder e resolver
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {lista.length === 0 && !erro && (
          <p className="rounded border border-line bg-surface p-5 text-[13px] text-muted">
            Nenhum chamado ainda.
          </p>
        )}
      </div>
    </div>
  );
}
