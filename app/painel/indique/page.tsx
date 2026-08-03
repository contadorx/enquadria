"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { desfecho, limparIndicados, type Indicado } from "@/lib/nps";
import { AbasEscritorio } from "@/components/AbasEscritorio";

/**
 * NOTA → INDICAÇÃO, numa tela só.
 *
 * O pedido de indicação aparece no instante seguinte a alguém escrever que
 * indicaria. Separar as duas coisas em telas ou dias diferentes é o que faz o
 * programa de indicação morrer: quando o e-mail chega, a intenção já passou.
 *
 * Detrator NUNCA vê o pedido. A regra mora em lib/nps e é testada nota por
 * nota, porque é o tipo de coisa que alguém "simplifica" sem perceber o que
 * quebrou.
 */
export default function Indique() {
  const [nota, setNota] = useState<number | null>(null);
  const [comentario, setComentario] = useState("");
  const [npsId, setNpsId] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<Indicado[]>([{ nome: "", email: "" }, { nome: "", email: "" }]);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState<number | null>(null);
  const [repetidos, setRepetidos] = useState(0);

  const d = nota === null ? null : desfecho(nota);

  async function registrarNota(n: number) {
    setNota(n);
    setErro(null);
    // ux-ok: nada renderizado no servidor lê NPS ou indicação — o placar do
    // gestor é client component e refaz a própria consulta. Um router.refresh()
    // aqui redesenharia esta tela por baixo do estado de sucesso.
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from("nps_respostas")
      .insert({ user_id: user.id, nota: n })
      .select("id")
      .maybeSingle();
    if (error) { setErro(error.message); return; }
    setNpsId((data?.id as string) ?? null);
  }

  async function salvarComentario() {
    if (!npsId || !comentario.trim()) return;
    setOcupado(true);
    const supabase = createClient();
    await supabase.from("nps_respostas").update({ comentario }).eq("id", npsId);
    setOcupado(false);
    setPronto(0);
  }

  async function enviarIndicacoes() {
    setErro(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const limpos = limparIndicados(linhas, user.email ?? undefined);
    if (limpos.length === 0) {
      setErro("Preencha ao menos um e-mail válido.");
      return;
    }
    setOcupado(true);
    // a rota manda o convite E grava — gravar aqui e mandar lá deixaria
    // registrado como "convidado" quem nunca recebeu nada
    const resp = await fetch("/api/indicacao/convidar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ indicados: limpos, nps_id: npsId }),
    });
    const j = (await resp.json().catch(() => ({}))) as
      { erro?: string; enviados?: number; repetidos?: number };
    setOcupado(false);
    if (!resp.ok || j.erro) { setErro(j.erro ?? "Não consegui enviar os convites."); return; }
    setRepetidos(j.repetidos ?? 0);
    setPronto(j.enviados ?? 0);
  }

  if (pronto !== null) {
    return (
      <div className="max-w-[60ch]">
        <AbasEscritorio />
        <div className="rounded border border-verde bg-verdewash p-6">
          <h1 className="text-[17px] font-bold">
            {pronto > 0 ? `${pronto} indicação${pronto === 1 ? "" : "ões"} registrada${pronto === 1 ? "" : "s"}` : "Obrigado"}
          </h1>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate2">
            {pronto > 0
              ? "O convite saiu em nome do Enquadria, dizendo que veio de você — seu escritório não vira remetente de propaganda sem você combinar isso."
              : "Sua resposta chega direto em mim — não é caixa de sugestões."}
            {repetidos > 0 && (
              <> {repetidos} {repetidos === 1 ? "pessoa já tinha sido convidada" : "pessoas já tinham sido convidadas"} antes e não recebeu de novo.</>
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[62ch]">
      <AbasEscritorio />
      <h1 className="text-[19px] font-bold tracking-tight">Indique um colega</h1>
      <p className="mt-0.5 text-[13px] text-muted">
        De 0 a 10, quanto você indicaria o Enquadria a outro contador?
      </p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {Array.from({ length: 11 }, (_, n) => (
          <button
            key={n}
            onClick={() => void registrarNota(n)}
            className={`h-11 w-11 rounded-sm border font-mono text-[13px] ${
              nota === n ? "border-ink bg-ink font-medium text-white" : "border-line bg-surface text-slate2 hover:border-accent"
            }`}
          >
            {n}
          </button>
        ))}
      </div>

      {erro && <p className="mt-3 rounded-sm bg-vermelhowash px-3 py-2 text-[12.5px] text-vermelho">{erro}</p>}

      {d && (
        <div className="mt-6 rounded border border-line bg-surface p-5">
          <h2 className="text-[15.5px] font-bold">{d.titulo}</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-slate2">{d.texto}</p>

          {d.pedeIndicacao ? (
            <>
              <div className="mt-4 space-y-2">
                {linhas.map((l, i) => (
                  <div key={i} className="grid gap-2 sm:grid-cols-2">
                    <input
                      placeholder="Nome"
                      value={l.nome}
                      onChange={(e) => setLinhas(linhas.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))}
                      className="rounded-sm border border-line px-3 py-2 text-sm"
                    />
                    <input
                      placeholder="E-mail"
                      inputMode="email"
                      value={l.email}
                      onChange={(e) => setLinhas(linhas.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))}
                      className="rounded-sm border border-line px-3 py-2 text-sm"
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
              <div className="mt-4">
                <button
                  // ux-ok: `pronto` troca a tela inteira no retorno antecipado
                  onClick={enviarIndicacoes}
                  disabled={ocupado}
                  className="rounded-sm bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                >
                  {ocupado ? "Enviando…" : "Indicar"}
                </button>
              </div>
              <p className="mt-2.5 text-[11.5px] leading-relaxed text-muted">
                Eu falo com cada um pessoalmente e digo que veio de você. Nada é disparado
                automaticamente em nome do seu escritório — seu nome é seu.
              </p>
            </>
          ) : (
            <>
              <textarea
                rows={4}
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                className="mt-3 w-full rounded-sm border border-line px-3 py-2 text-[13.5px]"
              />
              {/* ux-ok: mesmo caso — `pronto` substitui a tela inteira. */}
              <button
                onClick={salvarComentario}
                disabled={ocupado || !comentario.trim()}
                className="mt-2 rounded-sm bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                {ocupado ? "Enviando…" : "Enviar"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
