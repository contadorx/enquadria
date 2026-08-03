"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ItemNav } from "@/lib/nav";

/**
 * A FAIXA DE ABAS — genérica, porque agora são quatro seções com o mesmo
 * comportamento: Escritório, Ajuda, Contas e Suporte.
 *
 * Cada uma nasceu de tirar itens do menu lateral. O menu diz o DESTINO; a aba
 * diz o assunto dentro dele. Sem esta faixa, o que saiu do menu simplesmente
 * desapareceria — e "sumiu" é pior que "menu grande".
 */
export function Abas({ itens }: { itens: ItemNav[] }) {
  const pathname = usePathname() || "";
  return (
    <div className="mb-4 flex flex-wrap gap-1.5 border-b border-linesoft pb-3">
      {itens.map((a) => {
        // a rota mais específica vence: /painel/ajuda não pode ficar ativa
        // quando a pessoa está em /painel/ajuda/algum-artigo? pode — o artigo
        // pertence à central. Mas /painel/chamados não ativa /painel/ajuda.
        const ativo = pathname === a.href || pathname.startsWith(a.href + "/");
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
