"use client";

import Link from "next/link";
import type { Muro } from "@/lib/plano";

/**
 * O MURO — a tela do 3º laudo.
 *
 * Aparece no momento de maior desejo do produto inteiro: o contador acabou de
 * produzir dois documentos com a marca dele e está tentando o terceiro, que já
 * é para um cliente de verdade. O texto vem do servidor (montarMuro), porque a
 * conta usa o preço real do banco — cifra inventada no cliente é cifra que
 * diverge da página de planos.
 *
 * O botão do ANUAL é botão; o mensal é texto pequeno. A opção de IBS/CBS é
 * semestral: quem assina mensal em setembro emite tudo, não tem o que fazer em
 * outubro e cancela antes de ver o produto funcionar a segunda vez. Não é
 * truque — o motivo está escrito na tela, e o contador pode discordar.
 */
export function MuroPlano({ muro, aoFechar }: { muro: Muro; aoFechar?: () => void }) {
  return (
    <div className="rounded border border-accent bg-accentwash p-5 shadow-card">
      <div className="text-[16px] font-bold leading-snug text-ink">{muro.titulo}</div>

      <div className="mt-2 space-y-1">
        {muro.linhas.map((l, i) => (
          <p key={i} className="text-[13.5px] leading-relaxed text-slate2">
            {l}
          </p>
        ))}
      </div>

      {muro.conta && (
        <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-linesoft bg-linesoft">
          <div className="bg-surface p-3.5">
            <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
              você cobra, por empresa
            </div>
            <div className="mt-1 font-mono text-[22px] font-semibold leading-none text-ink">
              R$ {muro.conta.honorario.toLocaleString("pt-BR")}
            </div>
          </div>
          <div className="bg-surface p-3.5">
            <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
              o Enquadria custa, por ano
            </div>
            <div className="mt-1 font-mono text-[22px] font-semibold leading-none text-accentdeep">
              R$ {muro.conta.anual.toLocaleString("pt-BR")}
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link
          href="/painel/planos"
          className="rounded-sm bg-ink px-4 py-2.5 text-sm font-semibold text-white"
        >
          Liberar laudos ilimitados
        </Link>
        {aoFechar && (
          <button
            onClick={aoFechar}
            className="text-[12.5px] font-semibold text-muted underline underline-offset-2"
          >
            agora não
          </button>
        )}
      </div>

      <p className="mt-3 max-w-[68ch] text-[12px] leading-relaxed text-slate2">
        {muro.nota_anual}
      </p>
      <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{muro.garantia}</p>
    </div>
  );
}
