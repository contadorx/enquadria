"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { LIMITE_GRATIS } from "@/lib/plano";
import { AbasEscritorio } from "@/components/AbasEscritorio";

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
  const [laudos, setLaudos] = useState(0);
  const [ilimitado, setIlimitado] = useState(false);

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
      if (a?.plano_id) {
        setAtivo(a.plano_id);
        setIlimitado(a.limite_analises == null);
      }

      const { count } = await supabase
        .from("laudos")
        .select("id", { count: "exact", head: true });
      setLaudos(count ?? 0);
    })();
  }, []);

  const semAssinatura = !ativo;
  const restantes = Math.max(LIMITE_GRATIS - laudos, 0);

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
      <AbasEscritorio />
      <h1 className="text-[19px] font-bold tracking-tight">Planos</h1>
      <p className="mt-0.5 max-w-[70ch] text-[13px] text-muted">
        Uma análise cobrada do seu cliente paga o ano inteiro de Enquadria. O plano gratuito
        serve para você ver a carteira e sentir o entregável; o PRO libera o papel cobrável sem
        limite.
      </p>

      {/* CONSUMO ATUAL */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded border border-line bg-surface px-4 py-3.5">
        <div>
          <div className="text-[13px] font-semibold">
            {semAssinatura ? "Plano gratuito" : "Plano ativo"}
          </div>
          <div className="mt-0.5 text-[12.5px] text-muted">
            {ilimitado ? (
              <>Laudos e termos ilimitados.</>
            ) : (
              <>
                {laudos} de {LIMITE_GRATIS} laudos de degustação usados
                {restantes > 0 ? ` · restam ${restantes}` : " · limite atingido"}.
              </>
            )}
          </div>
        </div>
        {!ilimitado && (
          <div className="flex gap-1">
            {Array.from({ length: LIMITE_GRATIS }).map((_, i) => (
              <span
                key={i}
                className={`h-2.5 w-10 rounded-full ${i < laudos ? "bg-accent" : "bg-linesoft"}`}
              />
            ))}
          </div>
        )}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {planos.map((p) => {
          const eAtivo = ativo === p.id;
          const gratuito = p.preco_centavos === 0;
          const destaque = p.id === "assinatura" || p.id === "pro_anual";
          const atualGratuito = gratuito && semAssinatura;
          return (
            <div
              key={p.id}
              className={`flex flex-col rounded-lg border bg-surface p-5 ${
                destaque ? "border-accent shadow-card" : "border-line"
              }`}
            >
              {destaque && !eAtivo && (
                <span className="mb-2 inline-block w-fit rounded-full bg-accentwash px-2.5 py-0.5 text-[11px] font-semibold text-accentdeep">
                  {p.id === "pro_anual" ? "2 meses grátis" : "mais escolhido"}
                </span>
              )}
              <div className="text-[15px] font-bold">{p.nome}</div>
              <div className="mt-1 min-h-[36px] text-[12.5px] text-muted">{p.descricao}</div>
              <div className="mt-4 font-mono text-[26px] font-semibold">
                {gratuito ? "R$ 0" : brl(p.preco_centavos)}
                {p.recorrente && (
                  <span className="text-[13px] text-muted">
                    {p.id === "pro_anual" ? "/ano" : "/mês"}
                  </span>
                )}
              </div>

              {gratuito ? (
                <div
                  className={`mt-5 rounded-sm py-2.5 text-center text-sm font-semibold ${
                    atualGratuito ? "bg-verdewash text-verde" : "bg-surface2 text-muted"
                  }`}
                >
                  {atualGratuito ? "Seu plano atual" : "Incluso em todos os planos"}
                </div>
              ) : (
                <button
                  onClick={() => contratar(p.id)}
                  disabled={ocupado === p.id || eAtivo}
                  className={`mt-5 rounded-sm py-2.5 text-sm font-semibold ${
                    eAtivo ? "bg-verdewash text-verde" : "bg-ink text-white disabled:opacity-40"
                  }`}
                >
                  {eAtivo ? "Plano ativo" : ocupado === p.id ? "..." : "Assinar"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-6 max-w-[70ch] text-[12px] leading-relaxed text-muted">
        Pagamento processado pelo Asaas (Pix, boleto ou cartão). A liberação é automática
        após a confirmação. No mensal você cancela quando quiser; o anual é pré-pago pelo período.
        Sem o Asaas configurado, a assinatura fica pendente para ativação manual.
      </p>
    </div>
  );
}
