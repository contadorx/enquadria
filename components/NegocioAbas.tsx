"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ABAS = [
  { href: "/painel/negocio", label: "Visão" },
  { href: "/painel/negocio/cobrancas", label: "Cobranças" },
  { href: "/painel/negocio/emails", label: "E-mails proativos" },
  { href: "/painel/negocio/planos", label: "Planos & Asaas" },
];

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
