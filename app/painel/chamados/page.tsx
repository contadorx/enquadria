import { createClient } from "@/lib/supabase-server";

/**
 * MEUS CHAMADOS — o outro lado do escalonamento.
 *
 * Quando o assistente abre um chamado ele diz "você recebe a resposta". Sem
 * esta tela, essa frase seria promessa sem endereço: a pessoa não teria onde
 * conferir se alguém pegou.
 */

export const dynamic = "force-dynamic";

const ROTULO: Record<string, string> = {
  aberto: "aguardando resposta",
  respondido: "respondido",
  resolvido: "resolvido",
};

export default async function ChamadosPage() {
  const supabase = createClient();

  const { data: chamados } = await supabase
    .from("chamados")
    .select("id, assunto, status, escalado_ia, criado_em, respondido_em")
    .order("criado_em", { ascending: false });

  const lista = (chamados ?? []) as {
    id: string;
    assunto: string;
    status: string;
    escalado_ia: boolean;
    criado_em: string;
    respondido_em: string | null;
  }[];

  const ids = lista.map((c) => c.id);
  const { data: msgs } = ids.length
    ? await supabase
        .from("chamado_mensagens")
        .select("chamado_id, autor, corpo, criado_em")
        .in("chamado_id", ids)
        .order("criado_em")
    : { data: [] };

  const porChamado = new Map<string, { autor: string; corpo: string; criado_em: string }[]>();
  for (const m of (msgs ?? []) as { chamado_id: string; autor: string; corpo: string; criado_em: string }[]) {
    const arr = porChamado.get(m.chamado_id) ?? [];
    arr.push(m);
    porChamado.set(m.chamado_id, arr);
  }

  return (
    <div className="max-w-[72ch]">
      <h1 className="text-[19px] font-bold tracking-tight">Meus chamados</h1>
      <p className="mt-0.5 text-[13px] text-muted">
        O que o assistente não soube responder vira chamado aqui — e é respondido por gente.
      </p>

      {lista.length === 0 && (
        <p className="mt-6 rounded border border-line bg-surface p-5 text-[13px] text-muted">
          Nenhum chamado. Quando o assistente não souber algo, ele abre um e você acompanha por aqui.
        </p>
      )}

      <div className="mt-5 space-y-3">
        {lista.map((c) => (
          <div key={c.id} className="rounded border border-line bg-surface p-4">
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
                {ROTULO[c.status] ?? c.status}
              </span>
              {c.escalado_ia && (
                <span className="font-mono text-[9.5px] uppercase tracking-wider text-muted">
                  via assistente
                </span>
              )}
            </div>
            <div className="mt-1 text-[14px] font-semibold">{c.assunto}</div>

            <div className="mt-2.5 space-y-2">
              {(porChamado.get(c.id) ?? []).map((m, i) => (
                <div
                  key={i}
                  className={`rounded-sm px-3 py-2 text-[13px] leading-relaxed ${
                    m.autor === "suporte" ? "bg-accentwash" : "bg-surface2"
                  }`}
                >
                  <div className="font-mono text-[9.5px] uppercase tracking-wider text-muted">
                    {m.autor === "cliente" ? "você" : m.autor === "suporte" ? "suporte" : "sistema"}
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap">{m.corpo}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
