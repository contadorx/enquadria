"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

/**
 * ABRIR CHAMADO NA MÃO.
 *
 * Até agora um chamado só podia nascer do assistente escalando. Isso deixava
 * dois buracos, e os dois são grandes:
 *
 *  · Com o assistente DESLIGADO — que é o estado padrão — não havia como pedir
 *    ajuda por dentro do produto. Nenhuma.
 *  · Quem não tem uma pergunta, tem um problema. "O laudo saiu com o CNPJ
 *    errado" não é dúvida para assistente nenhum responder: é relato, e precisa
 *    chegar em gente.
 *
 * O campo de assunto é separado do texto de propósito: é ele que aparece na
 * fila do suporte, e assunto derivado das primeiras palavras de um desabafo
 * produz uma fila ilegível.
 */
export function AbrirChamado() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [assunto, setAssunto] = useState("");
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  async function enviar() {
    if (!assunto.trim() || !texto.trim()) return;
    setEnviando(true);
    setErro(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setEnviando(false);
      setErro("Sessão expirada. Recarregue a página.");
      return;
    }

    const { data: perfil } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .maybeSingle();

    const { data: chamado, error } = await supabase
      .from("chamados")
      .insert({
        user_id: user.id,
        tenant_id: (perfil?.tenant_id as string) ?? null,
        assunto: assunto.trim().slice(0, 120),
        escalado_ia: false,
        status: "aberto",
      })
      .select("id")
      .maybeSingle();

    if (error || !chamado?.id) {
      setEnviando(false);
      setErro(error?.message ?? "Não consegui abrir o chamado.");
      return;
    }

    await supabase
      .from("chamado_mensagens")
      .insert({ chamado_id: chamado.id, autor: "cliente", corpo: texto.trim() });

    setEnviando(false);
    setPronto(true);
    setAssunto("");
    setTexto("");
    setAberto(false);
    router.refresh();
  }

  if (!aberto) {
    return (
      <div className="mb-4">
        <button
          onClick={() => {
            setAberto(true);
            setPronto(false);
          }}
          className="rounded-sm bg-ink px-4 py-2.5 text-[13px] font-semibold text-white"
        >
          Abrir um chamado
        </button>
        {pronto && (
          <p className="mt-2 rounded-sm bg-verdewash px-3 py-2 text-[12.5px] text-verde">
            Chamado aberto. Ele aparece na lista abaixo e você recebe a resposta por e-mail.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mb-4 rounded border border-line bg-surface p-4">
      <div className="text-[14px] font-bold">Abrir um chamado</div>
      <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
        Escreva com suas palavras. Se for sobre uma empresa específica, cite o CNPJ — é o
        que mais acelera a resposta.
      </p>

      <label className="mt-3 block">
        <span className="mb-1 block text-[12.5px] font-semibold">Assunto</span>
        <input
          value={assunto}
          onChange={(e) => setAssunto(e.target.value)}
          placeholder="Ex.: o laudo saiu sem o meu CRC"
          className="w-full rounded-sm border border-line px-3 py-2 text-[16px] outline-none focus:border-accent sm:text-sm"
        />
      </label>

      <label className="mt-3 block">
        <span className="mb-1 block text-[12.5px] font-semibold">O que aconteceu</span>
        <textarea
          rows={5}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          className="w-full rounded-sm border border-line px-3 py-2 text-[16px] sm:text-[13.5px]"
        />
      </label>

      {erro && (
        <p className="mt-2 rounded-sm bg-vermelhowash px-3 py-2 text-[12.5px] text-vermelho">{erro}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={enviar}
          title={!assunto.trim() || !texto.trim() ? "Preencha o assunto e o relato" : undefined}
          disabled={enviando || !assunto.trim() || !texto.trim()}
          className="rounded-sm bg-ink px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-40"
        >
          {enviando ? "Enviando…" : "Abrir chamado"}
        </button>
        <button
          onClick={() => setAberto(false)}
          className="rounded-sm border border-line px-4 py-2.5 text-[13px] font-semibold text-slate2"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
