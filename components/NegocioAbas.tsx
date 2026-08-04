"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ABAS_NEGOCIO } from "@/lib/nav";

/**
 * TODA a navegação da plataforma mora aqui.
 *
 * O menu lateral tinha seis links para telas que só o superadmin abre — o
 * menu de administração competindo por espaço com o de trabalho, para todo
 * mundo. Agora o menu leva a um lugar só e a navegação interna é esta faixa.
 *
 * A ordem é a do uso: dinheiro primeiro (visão, contas, cobranças, planos),
 * depois relacionamento (comunicação, suporte, assistente) e por último
 * conteúdo (ajuda, curso) — que se mexe uma vez por mês, não por dia.
 */
const ABAS = ABAS_NEGOCIO;

export function NegocioAbas() {
  const path = usePathname();
  return (
    <div className="mt-3 flex gap-1 overflow-x-auto border-b border-line">
      {ABAS.map((a) => {
        const ativa = a.href === "/painel/negocio" ? path === a.href : path.startsWith(a.href);
        return (
          <Link
            key={a.href}
            href={a.href}
            className={`whitespace-nowrap px-3.5 py-2 text-[13px] transition ${
              ativa
                ? "-mb-px border-b-2 border-accent font-semibold text-accentdeep"
                : "font-medium text-muted hover:text-slate1"
            }`}
          >
            {a.label}
          </Link>
        );
      })}
    </div>
  );
}
