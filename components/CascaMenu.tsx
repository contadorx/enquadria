"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

/**
 * O MENU — a única parte da casca que precisa de JavaScript.
 *
 * Duas coisas moram aqui e não podiam ficar no servidor: o botão de abrir no
 * celular e a marcação do link da página atual. O resto da casca (rodapé,
 * marca, ressalva) é estático de propósito — quanto menos JS numa página que
 * existe para ser achada na busca, melhor.
 *
 * As classes vêm de `app/casca.css`, cópia isolada do cabeçalho do site.css.
 * Ver a nota longa naquele arquivo para o porquê de existir uma cópia.
 */

export interface LinkCasca {
  href: string;
  rotulo: string;
}

export function CascaMenu({ links, app }: { links: LinkCasca[]; app: string }) {
  const [aberto, setAberto] = useState(false);
  const rota = usePathname();

  /* "/" só é a página atual quando é exatamente "/" — senão a home ficaria
     acesa em toda rota do site. Nas demais, o prefixo vale, para que
     /curso/aula-3 mantenha "Curso" marcado. */
  const ehAtual = (href: string) =>
    href === "/" ? rota === "/" : rota === href || rota.startsWith(`${href}/`);

  return (
    <>
      <nav className={`casca-links${aberto ? " casca-aberto" : ""}`}>
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            onClick={() => setAberto(false)}
            className={ehAtual(l.href) ? "casca-ativo" : undefined}
            aria-current={ehAtual(l.href) ? "page" : undefined}
          >
            {l.rotulo}
          </Link>
        ))}
        {/* no celular o menu aberto é o único lugar onde o CTA cabe */}
        <a href={`${app}/painel`} className="casca-mobcta">
          Fazer a triagem grátis
        </a>
      </nav>

      <div className="casca-cta">
        <a href={`${app}/painel`} className="casca-btn casca-btn-ghost">
          Entrar
        </a>
        <a href={`${app}/painel`} className="casca-btn casca-btn-primary">
          Fazer a triagem grátis
        </a>
      </div>

      <button
        type="button"
        className="casca-toggle"
        aria-label="Menu"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
        </svg>
      </button>
    </>
  );
}
