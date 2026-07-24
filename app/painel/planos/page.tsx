"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";

interface Plano {
  id: string;
  nome: string;
  descricao: string | null;
  preco_centavos: number;
  recorrente: boolean;
}

const brl = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });

export default function Planos() {
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [ativo, setAtivo] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data } = await supabase
        .from("planos")
        .select("id, nome, descricao, preco_centavos, recorrente")
        .eq("ativo", true)
        .order("ordem");
      if (data) setPlanos(data);

      const { data: assin } = await supabase.rpc("assinatura_ativa");
      const a = Array.isArray(assin) ? assin[0] : assin;
      if (a?.plano_id) setAtivo(a.plano_id);
    })();
  }, []);

  async function contratar(planoId: string) {
    setOcupado(planoId);
    try {
      const resp = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plano_id: planoId }),
      });
      const json = await resp.json();
      if (resp.ok && json.checkout_url) {
        window.open(json.checkout_url, "_blank");
      } else if (resp.ok && !json.asaas_ativo) {
        alert(
          "Assinatura registrada. O pagamento pelo Asaas ainda não está configurado — combine o pagamento e ative pelo painel."
        );
      }
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div>
      <h1 className="text-[19px] font-bold tracking-tight">Planos da janela</h1>
      <p className="mt-0.5 max-w-[70ch] text-[13px] text-muted">
        Uma análise cobrada do seu cliente paga o pacote inteiro. Os pacotes valem para a
        janela de setembro; a assinatura cobre a janela de março e o monitoramento contínuo.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {planos.map((p) => {
          const eAtivo = ativo === p.id;
          const destaque = p.id === "escritorio";
          return (
            <div
              key={p.id}
              className={`flex flex-col rounded-lg border bg-surface p-5 ${
                destaque ? "border-accent shadow-card" : "border-line"
              }`}
            >
              {destaque && (
                <span className="mb-2 inline-block w-fit rounded-full bg-accentwash px-2.5 py-0.5 text-[11px] font-semibold text-accentdeep">
                  mais escolhido
                </span>
              )}
              <div className="text-[15px] font-bold">{p.nome}</div>
              <div className="mt-1 text-[12.5px] text-muted">{p.descricao}</div>
              <div className="mt-4 font-mono text-[26px] font-semibold">
                {brl(p.preco_centavos)}
                {p.recorrente && <span className="text-[13px] text-muted">/mês</span>}
              </div>
              <button
                onClick={() => contratar(p.id)}
                disabled={ocupado === p.id || eAtivo}
                className={`mt-5 rounded-sm py-2.5 text-sm font-semibold ${
                  eAtivo
                    ? "bg-verdewash text-verde"
                    : "bg-ink text-white disabled:opacity-40"
                }`}
              >
                {eAtivo ? "Plano ativo" : ocupado === p.id ? "..." : "Contratar"}
              </button>
            </div>
          );
        })}
      </div>

      <p className="mt-6 max-w-[70ch] text-[12px] leading-relaxed text-muted">
        Pagamento processado pelo Asaas (Pix, boleto ou cartão). A liberação é automática
        após a confirmação. Sem o Asaas configurado, a assinatura fica pendente para ativação manual.
      </p>
    </div>
  );
}
