"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ABAS_ESCRITORIO } from "@/lib/nav";

/**
 * Escritório é UM item de menu com três assuntos: configurações, equipe e
 * planos. Eram três entradas de navegação para coisas que a pessoa só abre
 * quando já decidiu mexer na administração — nunca no meio do trabalho.
 */
export function AbasEscritorio() {
  const pathname = usePathname() || "";
  return (
    <div className="mb-4 flex flex-wrap gap-1.5 border-b border-linesoft pb-3">
      {ABAS_ESCRITORIO.map((a) => {
        const ativo = pathname === a.href;
        return (
          <Link
            key={a.href}
            href={a.href}
            className={`rounded-sm px-3 py-2 text-[13px] font-semibold ${
              ativo ? "bg-ink text-white" : "border border-line bg-surface text-slate2"
            }`}
          >
            {a.label}
          </Link>
        );
      })}
    </div>
  );
}
