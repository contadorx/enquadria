"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV, ATALHOS, tituloDaRota } from "@/lib/nav";
import { BotaoSair } from "./BotaoSair";

/**
 * NAVEGAÇÃO NO CELULAR.
 *
 * O menu lateral era `hidden md:block` — abaixo de 768px o app ficava SEM
 * navegação nenhuma e sem botão de sair. Quem abrisse pelo telefone só
 * conseguia sair fechando a aba.
 *
 * Aqui vão as duas peças que faltavam:
 *  · o cabeçalho do celular, que diz em que tela a pessoa está e abre a gaveta;
 *  · a barra inferior com os quatro passos do trabalho, ao alcance do polegar.
 *
 * Ambas somem a partir de md, onde o menu lateral volta a ser a navegação.
 */
export function NavMobile({
  escritorio,
  email,
  dias,
  posPct,
}: {
  escritorio: string;
  email?: string;
  /** dias restantes da janela, calculados no servidor */
  dias: number;
  /** posição na régua, 0 a 100, calculada no servidor */
  posPct: number;
}) {
  const [aberto, setAberto] = useState(false);
  const pathname = usePathname() || "/painel";

  // fecha a gaveta ao navegar — sem isso ela fica por cima da tela nova
  useEffect(() => {
    setAberto(false);
  }, [pathname]);

  // trava o scroll do fundo enquanto a gaveta está aberta
  useEffect(() => {
    document.body.style.overflow = aberto ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [aberto]);

  // Esc fecha
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const ativo = (href: string) =>
    pathname === href || (href !== "/painel" && pathname.startsWith(href + "/"));

  return (
    <>
      {/* --------------------------- barra única e fixa do celular ---------
          Fixa de propósito: numa lista de 143 empresas, um menu que exige
          rolar de volta ao topo é um menu que não existe. */}
      <div className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-ink px-4 py-2.5 md:hidden">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold text-white">
            {tituloDaRota(pathname)}
          </div>
          <div className="truncate font-mono text-[10px] text-slate-400">{escritorio}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <ContagemCurta dias={dias} posPct={posPct} />
          <button
            onClick={() => setAberto(true)}
            aria-label="Abrir o menu"
            aria-expanded={aberto}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-white/15 text-white"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------ gaveta */}
      {aberto && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            aria-label="Fechar o menu"
            onClick={() => setAberto(false)}
            className="absolute inset-0 h-full w-full bg-ink/60"
          />
          <nav className="absolute right-0 top-0 flex h-full w-[86%] max-w-[320px] flex-col bg-surface shadow-card">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div className="text-[15px] font-extrabold tracking-tight text-ink">
                ENQUADRIA<span className="text-accent">.</span>
              </div>
              <button
                onClick={() => setAberto(false)}
                aria-label="Fechar o menu"
                className="flex h-10 w-10 items-center justify-center rounded-sm border border-line text-slate2"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto py-2">
              {NAV.map((g) => (
                <div key={g.grupo} className="mb-1">
                  <div className="px-4 py-2 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
                    {g.grupo}
                  </div>
                  {g.itens.map((i) => (
                    <Link
                      key={i.href}
                      href={i.href}
                      className={`block border-l-2 px-4 py-3 text-[15px] ${
                        ativo(i.href)
                          ? "border-accent bg-accentwash font-semibold text-accentdeep"
                          : "border-transparent text-slate2"
                      }`}
                    >
                      {i.label}
                    </Link>
                  ))}
                </div>
              ))}
            </div>

            <div className="border-t border-line px-4 py-3">
              <p className="text-[13px] font-semibold text-ink">{escritorio}</p>
              {email && <p className="mt-0.5 truncate font-mono text-[10.5px] text-muted">{email}</p>}
              <BotaoSair />
            </div>
          </nav>
        </div>
      )}

      {/* --------------------------------------------- barra inferior fixa */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        {ATALHOS.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[10.5px] font-medium ${
              ativo(i.href) ? "text-accentdeep" : "text-muted"
            }`}
          >
            <span
              className={`h-0.5 w-6 rounded-full ${ativo(i.href) ? "bg-accent" : "bg-transparent"}`}
            />
            {i.curto ?? i.label}
          </Link>
        ))}
      </nav>
    </>
  );
}

/**
 * A régua completa não cabe em 390px — no celular fica só o que decide.
 * Os números vêm prontos do servidor: calcular a data aqui faria o servidor e o
 * navegador renderizarem valores diferentes e quebraria a hidratação.
 */
function ContagemCurta({ dias, posPct }: { dias: number; posPct: number }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="relative block h-1 w-9 overflow-hidden rounded-full bg-slate-300/25">
        <span
          className="absolute left-0 top-0 h-full rounded-full bg-accentbright"
          style={{ width: `${posPct}%` }}
        />
      </span>
      <span className="whitespace-nowrap font-mono text-[10.5px] text-accentbright">
        {dias > 0 ? `${dias}d` : "fim"}
      </span>
    </span>
  );
}
