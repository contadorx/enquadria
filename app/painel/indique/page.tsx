"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { limparIndicados, type Indicado } from "@/lib/nps";
import { AbasEscritorio } from "@/components/AbasEscritorio";

/**
 * INDIQUE — só o formulário.
 *
 * A nota de NPS saiu daqui. Eram duas coisas diferentes na mesma tela, e a
 * mistura estragava as duas:
 *
 *  · A NOTA precisa ser pedida em momento escolhido, de tempos em tempos, para
 *    alguém que acabou de receber valor. Numa página que a pessoa visita
 *    quando quer, ela vira autosseleção: só responde quem está muito satisfeito
 *    ou muito bravo, e a média não significa nada.
 *
 *  · A INDICAÇÃO precisa estar disponível o tempo todo, sem pedágio. Obrigar
 *    alguém a dar uma nota antes de indicar um colega é cobrar por um favor.
 *
 * A nota agora vive no modal periódico (components/NpsModal), e quem quiser
 * indicar sem nota nenhuma entra aqui direto.
 */
export default function Indique() {
  const [linhas, setLinhas] = useState<Indicado[]>([
    { nome: "", email: "" },
    { nome: "", email: "" },
  ]);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState<{ enviados: number; repetidos: number } | null>(null);

  async function enviar() {
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
      body: JSON.stringify({ indicados: limpos }),
    });
    const j = (await r.json().catch(() => ({}))) as {
      erro?: string;
      enviados?: number;
      repetidos?: number;
    };
    setOcupado(false);
    if (!r.ok || j.erro) {
      setErro(j.erro ?? "Não consegui enviar os convites.");
      return;
    }
    setPronto({ enviados: j.enviados ?? 0, repetidos: j.repetidos ?? 0 });
    setLinhas([{ nome: "", email: "" }, { nome: "", email: "" }]);
  }

  return (
    <div className="max-w-[62ch]">
      <AbasEscritorio />
      <h1 className="text-[19px] font-bold tracking-tight">Indique um colega</h1>
      <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
        A janela de 30 de setembro vale para a carteira do seu colega também. Quem você
        indicar recebe um convite em nome do Enquadria, dizendo que veio de você — seu
        escritório não vira remetente de propaganda sem você combinar isso.
      </p>

      {pronto && (
        <div className="mt-4 rounded border border-verde bg-verdewash p-4">
          <p className="text-[13.5px] leading-relaxed text-slate2">
            <strong>
              {pronto.enviados} convite{pronto.enviados === 1 ? "" : "s"} enviado
              {pronto.enviados === 1 ? "" : "s"}.
            </strong>{" "}
            {pronto.repetidos > 0 && (
              <>
                {pronto.repetidos}{" "}
                {pronto.repetidos === 1 ? "pessoa já tinha sido convidada" : "pessoas já tinham sido convidadas"}{" "}
                antes e não recebeu de novo — cada e-mail é convidado uma vez só.
              </>
            )}
          </p>
        </div>
      )}

      <div className="mt-5 rounded border border-line bg-surface p-5">
        <div className="space-y-2">
          {linhas.map((l, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-2">
              <input
                placeholder="Nome"
                value={l.nome}
                onChange={(e) =>
                  setLinhas(linhas.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))
                }
                className="rounded-sm border border-line px-3 py-2 text-[16px] outline-none focus:border-accent sm:text-sm"
              />
              <input
                placeholder="E-mail"
                inputMode="email"
                value={l.email}
                onChange={(e) =>
                  setLinhas(linhas.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))
                }
                className="rounded-sm border border-line px-3 py-2 text-[16px] outline-none focus:border-accent sm:text-sm"
              />
            </div>
          ))}
        </div>

        <button
          onClick={() => setLinhas([...linhas, { nome: "", email: "" }])}
          className="mt-2 text-[12.5px] font-semibold text-accentdeep"
        >
          + mais um
        </button>

        {erro && (
          <p className="mt-3 rounded-sm bg-vermelhowash px-3 py-2 text-[12.5px] text-vermelho">
            {erro}
          </p>
        )}

        <div className="mt-4">
          <button
            onClick={enviar}
            title={ocupado ? "Enviando" : "Preencha ao menos um e-mail"}
            disabled={ocupado}
            className="rounded-sm bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {ocupado ? "Enviando…" : "Enviar convites"}
          </button>
        </div>

        <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
          Eu falo com cada indicado pessoalmente. Cada e-mail recebe um convite único, para
          sempre — indicação que vira enxurrada queima o canal.
        </p>
      </div>
    </div>
  );
}
