import Link from "next/link";
import { APP } from "@/lib/site";

/**
 * O CABEÇALHO E O RODAPÉ DO SITE — refeitos em Tailwind, de propósito.
 *
 * ---------------------------------------------------------------------------
 * POR QUE NÃO REAPROVEITAR O CABEÇALHO ORIGINAL DO SITE
 *
 * Porque ele depende de `app/site.css`, e esse arquivo tem regras de ELEMENTO,
 * não só de classe: `body`, `p`, `a`, e `h1` com `clamp(2rem, 4.6vw, 3.35rem)`.
 * Carregá-lo numa página feita em Tailwind — o curso, o exemplo, os documentos
 * legais — reescreveria o tamanho de todos os títulos e o fundo da página. O
 * remédio para "esta página está sem menu" não pode ser "agora ela está com
 * menu e com a tipografia trocada".
 *
 * Então a marca é a mesma, o desenho é o mesmo, e a folha de estilo é a que a
 * página já usava. É a única forma de as duas metades do produto conviverem sem
 * uma estragar a outra.
 *
 * ---------------------------------------------------------------------------
 * ONDE ELE PRECISA ESTAR: em toda página PÚBLICA servida pelo app — curso,
 * exemplo, verificar, documentos legais e o 404. São as páginas em que alguém
 * chega de fora, muitas vezes por busca, sem ter passado pela home. Sem menu,
 * essa pessoa não tem para onde ir a não ser voltar.
 */

const LINKS = [
  { href: "/", rotulo: "Início" },
  { href: "/reforma", rotulo: "Reforma" },
  { href: "/guia", rotulo: "Guia" },
  { href: "/curso", rotulo: "Curso" },
  { href: "/como-funciona", rotulo: "Como funciona" },
  { href: "/precos", rotulo: "Preços" },
  { href: "/faq", rotulo: "Dúvidas" },
];

function Marca() {
  return (
    <Link href="/" className="flex items-center gap-2 text-[17px] font-extrabold tracking-tight text-ink">
      <svg width="26" height="26" viewBox="0 0 64 64" aria-hidden>
        <rect width="64" height="64" rx="14" fill="#0B1220" />
        <path
          d="M20 16h24M20 16v32M20 48h24M20 32h16"
          stroke="#06B6D4"
          strokeWidth="5"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="46" cy="32" r="4" fill="#06B6D4" />
      </svg>
      Enquadria
    </Link>
  );
}

export function CascaPublica({
  children,
  largura = "max-w-[1100px]",
}: {
  children: React.ReactNode;
  /** o curso e os documentos legais pedem coluna estreita; a home, larga */
  largura?: string;
}) {
  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-line bg-surface">
        <div className={`mx-auto flex ${largura} flex-wrap items-center justify-between gap-3 px-4 py-3`}>
          <Marca />
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-[13.5px] font-semibold text-slate2 hover:text-accentdeep"
              >
                {l.rotulo}
              </Link>
            ))}
            <a
              href={`${APP}/painel`}
              className="rounded-sm border border-line px-3 py-1.5 text-[13px] font-semibold text-ink"
            >
              Entrar
            </a>
            <a
              href={`${APP}/painel`}
              className="rounded-sm bg-accent px-3.5 py-1.5 text-[13px] font-bold text-[#04212B]"
            >
              Fazer a triagem grátis
            </a>
          </nav>
        </div>
      </header>

      <main className={`mx-auto ${largura} px-4 py-6`}>{children}</main>

      <footer className="mt-10 border-t border-line bg-surface">
        <div className={`mx-auto ${largura} px-4 py-6`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-mono text-[11px] text-muted">
              Enquadria · Leandro Oliveira · CRC 304880/O-8
            </span>
            <nav className="flex flex-wrap gap-x-4 gap-y-1.5">
              {[
                ["/politicas", "Políticas"],
                ["/privacidade", "Privacidade"],
                ["/termos", "Termos"],
                ["/seguranca", "Segurança"],
                ["/verificar", "Verificar documento"],
              ].map(([href, rotulo]) => (
                <Link key={href} href={href} className="text-[12px] text-slate2 hover:text-accentdeep">
                  {rotulo}
                </Link>
              ))}
            </nav>
          </div>
          {/* a ressalva que vale em toda página pública: o produto estima
              cenário, quem decide e assina é o contador */}
          <p className="mt-3 max-w-[80ch] text-[11px] leading-relaxed text-muted">
            Estimativa de cenário a partir das premissas informadas. A alíquota de referência de
            IBS/CBS só é fixada por Resolução do Senado até 31/10/2026. A decisão e a
            responsabilidade técnica são do contador que assina.
          </p>
        </div>
      </footer>
    </div>
  );
}
