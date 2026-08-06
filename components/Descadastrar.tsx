"use client";

import { useState } from "react";

/**
 * O botão que confirma a saída. Existe como componente de cliente por um
 * motivo só: o descadastro tem de acontecer no CLIQUE, nunca ao abrir a
 * página — antivírus corporativo e pré-visualização de e-mail abrem todos os
 * links da mensagem, e um GET que remove endereço esvaziaria a base sozinho.
 */
export function Descadastrar({ email, token }: { email: string; token: string }) {
  const [estado, setEstado] = useState<"pronto" | "enviando" | "feito" | "erro">("pronto");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  async function sair() {
    setEstado("enviando");
    setErro(null);
    try {
      const r = await fetch("/api/descadastro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token, motivo }),
      });
      const j = (await r.json()) as { ok?: boolean; erro?: string };
      if (!r.ok || !j.ok) {
        setErro(j.erro ?? "Não consegui registrar agora. Responda ao e-mail que eu removo na mão.");
        setEstado("erro");
        return;
      }
      setEstado("feito");
    } catch {
      setErro("Sem conexão. Tente de novo em um minuto.");
      setEstado("erro");
    }
  }

  if (estado === "feito") {
    return (
      <div className="mt-4 rounded-sm border border-verde/40 bg-verdewash px-4 py-3">
        <p className="text-[13.5px] font-semibold text-ink">Pronto. Você não recebe mais novidades.</p>
        <p className="mt-1 text-[12.5px] text-slate2">
          Se mudar de ideia, é só me responder por e-mail. E os avisos da sua conta continuam
          chegando normalmente.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <label className="block text-[12.5px] font-semibold text-slate2">
        Se quiser, conte por quê <span className="font-normal text-muted">(opcional, e eu leio)</span>
      </label>
      <input
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="muitos e-mails, não é o meu assunto, não uso mais…"
        className="mt-1 w-full rounded-sm border border-line bg-white px-3 py-2 text-[13px] outline-none focus:border-accent"
      />

      {erro && <p className="mt-2 text-[12.5px] text-vermelho">{erro}</p>}

      <button
        onClick={sair}
        disabled={estado === "enviando"}
        className="mt-3 rounded-sm bg-ink px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
      >
        {estado === "enviando" ? "Removendo…" : "Confirmar: não quero mais novidades"}
      </button>
    </div>
  );
}
