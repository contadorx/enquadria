"use client";

import { useState } from "react";
import {
  ROTULO_STATUS,
  dataBR,
  moedaCentavos,
  ordenarFaturas,
  podePagar,
  resumirFaturas,
  statusEfetivo,
  type Fatura,
} from "@/lib/faturas";

/**
 * A CENTRAL DE FATURAS DO ESCRITÓRIO.
 *
 * Três perguntas chegam por e-mail em todo SaaS, todo mês, sempre para uma
 * pessoa só: "quanto eu pago mesmo?", "me manda a segunda via" e "eu paguei,
 * por que não entrou?". Esta tela responde as três sem ninguém do outro lado.
 *
 * O QUE VEM PRIMEIRO É O QUE PEDE AÇÃO. Fatura vencida no topo, com o botão
 * de pagar ao lado — boleto vencido que o cliente não acha é a causa mais boba
 * de churn que existe: ele QUER pagar.
 *
 * O QUE ESTA TELA NÃO FAZ: cancelar assinatura, trocar de plano, emitir nota.
 * Cada uma dessas é uma conversa, não um clique — e prometer o botão sem ter
 * o processo atrás é pior que não ter o botão.
 */
export function CentralFaturas({ faturas }: { faturas: Fatura[] }) {
  const [hoje] = useState(() => new Date());
  const lista = ordenarFaturas(faturas, hoje);
  const r = resumirFaturas(faturas, hoje);

  if (faturas.length === 0) {
    return (
      <div className="rounded border border-line bg-surface p-5">
        <div className="text-[14px] font-bold">Nenhuma fatura ainda</div>
        <p className="mt-1 max-w-[68ch] text-[12.5px] leading-relaxed text-muted">
          Quando você contratar um plano, cada cobrança aparece aqui com o valor, o vencimento e o
          link para pagar ou baixar a segunda via. Nada de procurar e-mail antigo.
        </p>
      </div>
    );
  }

  const cor: Record<string, string> = {
    pago: "bg-verdewash text-verde",
    pendente: "bg-amarelowash text-amarelo",
    vencido: "bg-vermelhowash text-vermelho",
    cancelado: "bg-neutrowash text-muted",
    estornado: "bg-neutrowash text-muted",
  };

  return (
    <div className="space-y-3">
      {/* o que precisa de ação, dito antes da tabela */}
      {r.atrasada && (
        <div className="rounded-sm border border-vermelho bg-vermelhowash p-3.5">
          <div className="text-[13px] font-bold text-vermelho">
            Fatura vencida em {dataBR(r.atrasada.vencimento)} · {moedaCentavos(r.atrasada.valor_centavos)}
          </div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-slate2">
            É ela que segura o seu acesso. Se já pagou, o registro pode levar até um dia útil — e o
            documento que você já emitiu continua válido de qualquer forma.
          </p>
          {podePagar(r.atrasada, hoje) && (
            <a
              href={r.atrasada.link_pagamento ?? r.atrasada.link_boleto ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block rounded-sm bg-vermelho px-3.5 py-2 text-[12.5px] font-semibold text-white"
            >
              Pagar agora
            </a>
          )}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-3">
        {[
          { r: "Pago até hoje", v: moedaCentavos(r.pago_centavos) },
          { r: "Em aberto", v: moedaCentavos(r.aberto_centavos) },
          {
            r: "Próximo vencimento",
            v: r.proxima?.vencimento ? dataBR(r.proxima.vencimento) : "—",
          },
        ].map((c) => (
          <div key={c.r} className="rounded-sm border border-line bg-surface2 px-3 py-2.5">
            <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">{c.r}</div>
            <div className="mt-0.5 font-mono text-[15px] font-semibold">{c.v}</div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded border border-line bg-surface">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {["Cobrança", "Vencimento", "Valor", "Situação", ""].map((h) => (
                <th
                  key={h}
                  className="border-b border-line px-3 pb-2 pt-2.5 text-left font-mono text-[9px] font-medium uppercase tracking-[0.1em] text-muted"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lista.map((f) => {
              const s = statusEfetivo(f, hoje);
              return (
                <tr key={f.id}>
                  <td className="border-b border-linesoft px-3 py-2.5">
                    <div className="font-semibold">{f.descricao ?? "Assinatura"}</div>
                    {f.pago_em && (
                      <div className="font-mono text-[10.5px] text-muted">
                        pago em {dataBR(f.pago_em)}
                      </div>
                    )}
                  </td>
                  <td className="border-b border-linesoft px-3 py-2.5 font-mono text-[12px]">
                    {dataBR(f.vencimento)}
                  </td>
                  <td className="border-b border-linesoft px-3 py-2.5 font-mono text-[12px]">
                    {moedaCentavos(f.valor_centavos)}
                  </td>
                  <td className="border-b border-linesoft px-3 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${cor[s]}`}>
                      {ROTULO_STATUS[s]}
                    </span>
                  </td>
                  <td className="border-b border-linesoft px-3 py-2.5 text-right">
                    {podePagar(f, hoje) ? (
                      <a
                        href={f.link_pagamento ?? f.link_boleto ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-sm bg-ink px-3 py-1.5 text-[12px] font-semibold text-white"
                      >
                        Pagar
                      </a>
                    ) : f.link_pagamento ? (
                      <a
                        href={f.link_pagamento}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-sm border border-line px-3 py-1.5 text-[12px] font-semibold text-slate2"
                      >
                        Ver recibo
                      </a>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11.5px] leading-relaxed text-muted">
        As faturas vêm do Asaas, que é quem processa o pagamento. Precisa de nota fiscal ou quer
        trocar de plano? Abra um chamado — resolvo caso a caso.
      </p>
    </div>
  );
}
