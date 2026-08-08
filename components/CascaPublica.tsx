import Link from "next/link";
import { APP } from "@/lib/site";
import { CascaMenu } from "./CascaMenu";
import "../app/casca.css";

/**
 * O CABEÇALHO E O RODAPÉ DO SITE — agora IGUAIS aos das páginas do site.
 *
 * ---------------------------------------------------------------------------
 * O QUE ESTAVA ERRADO ANTES, E POR QUE ESTAVA.
 *
 * A casca nasceu redesenhada em Tailwind por um motivo real: `app/site.css`
 * tem regras de ELEMENTO (`body`, `p`, `a`, `h1 { clamp(2rem, 4.6vw, 3.35rem) }`),
 * e carregá-lo numa página feita em Tailwind reescreveria a tipografia dela
 * inteira. Fugir disso resolveu o problema técnico e criou um pior: DUAS
 * CASCAS. Quem saía de /precos para /reforma via a marca mudar de tamanho, o
 * menu mudar de forma e os botões mudarem de cor no meio do mesmo site. Menu
 * que muda entre páginas não é detalhe de estilo — é o sinal de que o
 * visitante saiu do site sem querer.
 *
 * O conserto não foi carregar o site.css assim mesmo, nem redesenhar as
 * páginas do site: foi ISOLAR a casca. `app/casca.css` é o cabeçalho e o
 * rodapé do site.css copiados com todas as classes prefixadas `casca-` e sem
 * uma única regra de elemento. As duas folhas convivem na mesma página, o
 * desenho é o mesmo dos dois lados, e a tipografia de cada página continua
 * sendo a que ela já usava.
 *
 * O PREÇO, declarado: são duas cópias do mesmo desenho. Mudança visual no
 * cabeçalho do site.css precisa ser repetida no casca.css, senão as metades
 * divergem de novo. É o custo de o site ser HTML portado e o app ser Tailwind
 * — e é mais barato do que unificar as duas bases agora.
 *
 * ---------------------------------------------------------------------------
 * ONDE ELE PRECISA ESTAR: em toda página PÚBLICA servida pelo app — a Reforma,
 * o curso, o exemplo, o verificar, os documentos legais e o 404. São as
 * páginas em que alguém chega de fora, muitas vezes por busca, sem ter passado
 * pela home.
 */

/**
 * O MENU — e por que o Guia saiu dele.
 *
 * Menu não é índice do site: é a lista das poucas coisas que a pessoa pode
 * querer fazer. O Guia e o Curso prometem a MESMA coisa a quem chega — "me
 * ensina a decisão de setembro" — e duas portas para a mesma sala fazem a
 * pessoa escolher entre elas em vez de entrar. O curso é a versão maior, com
 * nove aulas, materiais e certificado; ele fica.
 *
 * O Guia continua no ar, indexado e entregue por link: no rodapé, dentro do
 * curso e ao pé da Reforma, que é onde alguém acabou de sentir a falta dele.
 * Tirar do menu não é despublicar — é parar de disputar o clique consigo mesmo.
 */
const LINKS = [
  { href: "/", rotulo: "Início" },
  { href: "/reforma", rotulo: "Reforma" },
  { href: "/curso", rotulo: "Curso" },
  { href: "/como-funciona", rotulo: "Como funciona" },
  { href: "/precos", rotulo: "Preços" },
  { href: "/faq", rotulo: "Dúvidas" },
];

/* o mesmo desenho da marca do site, nas duas cores em que ele aparece */
function Logo({ fundo }: { fundo: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="14" fill={fundo} />
      <path
        d="M20 16h24M20 16v32M20 48h24M20 32h16"
        stroke="#06B6D4"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="46" cy="32" r="4" fill="#06B6D4" />
    </svg>
  );
}

export function CascaPublica({
  children,
  largura = "max-w-[1100px]",
  semColuna = false,
}: {
  children: React.ReactNode;
  /** o curso e os documentos legais pedem coluna estreita; a home, larga */
  largura?: string;
  /**
   * Para páginas compostas por FAIXAS de largura total (hero escuro → seção
   * clara → chamada), como a Reforma. A coluna passa a ser responsabilidade de
   * cada faixa; se o `main` a impusesse, o fundo escuro terminaria no meio da
   * tela com margens brancas dos lados — que é a marca de página remendada.
   */
  semColuna?: boolean;
}) {
  return (
    <div className="min-h-screen bg-bg">
      <header className="casca-header">
        <div className="casca-container">
          <div className="casca-nav">
            <Link href="/" className="casca-brand">
              <Logo fundo="#0B1220" />
              Enquadria
            </Link>
            <CascaMenu links={LINKS} app={APP} />
          </div>
        </div>
      </header>

      {semColuna ? (
        <main className="casca-main casca-main--faixas">{children}</main>
      ) : (
        <main className={`mx-auto ${largura} px-4 py-8`}>{children}</main>
      )}

      <footer className="casca-footer">
        <div className="casca-container">
          <div className="casca-footgrid">
            <div>
              <div className="casca-footbrand">
                <Logo fundo="#111C33" />
                Enquadria
              </div>
              <p className="casca-foottexto">
                O enquadramento de IBS/CBS da carteira do escritório contábil — com triagem,
                entregável e prova, em cada janela da transição.
              </p>
            </div>

            <div className="casca-footcol">
              <h4>Material gratuito</h4>
              <Link href="/guia">Guia: a janela de setembro</Link>
              <Link href="/curso">A decisão de setembro</Link>
              <Link href="/reforma">Radar da Reforma</Link>
              <Link href="/curso#materiais">Planilhas e modelos</Link>
            </div>

            <div className="casca-footcol">
              <h4>Produto</h4>
              <Link href="/como-funciona">Como funciona</Link>
              <Link href="/precos">Preços</Link>
              <Link href="/faq">Dúvidas</Link>
              <a href={`${APP}/painel`}>Entrar no app</a>
              <Link href="/verificar">Verificar documento</Link>
            </div>

            <div className="casca-footcol">
              <h4>Documentos</h4>
              <Link href="/termos">Termos de Uso</Link>
              <Link href="/privacidade">Privacidade</Link>
              <Link href="/seguranca">Segurança</Link>
              <Link href="/politicas">Políticas internas</Link>
            </div>
          </div>

          <div className="casca-footbottom">
            <span>© 2026 Enquadria. Todos os direitos reservados.</span>
            {/* a ressalva que vale em toda página pública: o produto estima
                cenário, quem decide e assina é o contador */}
            <span>
              Estimativa de cenário a partir das premissas informadas. A alíquota de referência de
              IBS/CBS só é fixada por Resolução do Senado até 31/10/2026 — a decisão e a
              responsabilidade técnica são do contador que assina.
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
