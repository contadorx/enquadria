import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CascaPublica } from "@/components/CascaPublica";
import { ROTULO_SEVERIDADE } from "@/lib/radar";
import { materiasPublicas } from "@/lib/radar-publico";
import {
  acharPorEndereco, CLASSE_SEVERIDADE, dataBR, enderecoDaMateria, enderecoPagina,
  paginaDe, vizinhas,
} from "@/lib/reforma-publica";
import { APP, SITE } from "@/lib/site";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * UMA MATÉRIA DO RADAR — a página que existe para ser achada.
 *
 * ---------------------------------------------------------------------------
 * POR QUE CADA NORMA MERECE UMA PÁGINA.
 *
 * Quem procura no Google não procura "radar da reforma": procura "NFS-e
 * nacional Simples obrigatória", "split payment 2027 Simples", "alíquota
 * 27,91% é verdade". São buscas de UMA pergunta, e quem responde uma pergunta
 * por página responde melhor do que quem responde onze na mesma.
 *
 * O que muda de conteúdo em relação ao índice: aqui entra o "o que fazer" —
 * a parte que vale — e a fonte oficial. É de propósito: o índice atrai, a
 * matéria entrega, e a única coisa que continua guardada é o cruzamento com a
 * carteira de quem está logado.
 *
 * ---------------------------------------------------------------------------
 * O `criterio` do item NÃO É LIDO nem aqui nem no índice. Ele descreve o
 * recorte de carteira que a norma atinge (anexos, faixas, saídas do motor) e é
 * inteligência do produto, não informação do leitor.
 */

async function achar(slug: string) {
  const todas = await materiasPublicas();
  const materia = acharPorEndereco(todas, decodeURIComponent(slug));
  if (!materia) return null;
  const indice = todas.findIndex((m) => m.id === materia.id);
  return { materia, todas, indice, ...vizinhas(todas, indice) };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const achado = await achar(slug);
  if (!achado) return { title: "Matéria não encontrada — Radar da Reforma" };

  const { materia } = achado;
  const endereco = `/reforma/${enderecoDaMateria(materia)}`;
  return {
    title: `${materia.titulo} | Radar da Reforma`,
    description: materia.resumo.slice(0, 300),
    alternates: { canonical: endereco },
    openGraph: {
      title: materia.titulo,
      description: materia.resumo.slice(0, 300),
      url: endereco,
      siteName: "Enquadria",
      locale: "pt_BR",
      type: "article",
      publishedTime: materia.publicado_em ?? undefined,
    },
  };
}

export default async function MateriaDaReforma({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const achado = await achar(slug);
  /* endereço desconhecido é 404 de verdade, com o 404 do site (que tem menu).
     Redirecionar para o índice seria pior: o buscador manteria a URL morta
     viva para sempre e a pessoa não entenderia por que caiu noutra página. */
  if (!achado) notFound();

  const { materia, indice, anterior, proxima } = achado;
  const endereco = enderecoDaMateria(materia);
  const voltarPara = enderecoPagina(paginaDe(indice));

  /**
   * Article com autor, editor e data. É isto que faz o buscador tratar a
   * página como uma peça datada e não como um parágrafo solto — e é o que
   * permite aparecer com a data certa quando a norma é recente.
   */
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: materia.titulo,
        description: materia.resumo,
        datePublished: materia.publicado_em,
        author: { "@type": "Person", name: "Leandro Oliveira" },
        publisher: { "@type": "Organization", name: "Enquadria", url: SITE },
        mainEntityOfPage: `${SITE}/reforma/${endereco}`,
        isPartOf: { "@type": "CollectionPage", name: "Radar da Reforma", url: `${SITE}/reforma` },
        ...(materia.fonte ? { citation: materia.fonte } : {}),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Início", item: SITE },
          { "@type": "ListItem", position: 2, name: "Radar da Reforma", item: `${SITE}/reforma` },
          { "@type": "ListItem", position: 3, name: materia.titulo, item: `${SITE}/reforma/${endereco}` },
        ],
      },
    ],
  };

  return (
    <CascaPublica largura="max-w-none" semColuna>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <article>
        {/* O PALCO DA MATÉRIA É CLARO (08/08/2026). Ele usava o mesmo hero
            escuro do índice e das páginas de venda: título e resumo em branco
            sobre azul-marinho, e o resto da mesma matéria — "o que fazer", "a
            norma" — em cinza claro logo abaixo. A página quebrava ao meio no
            meio da leitura. Aqui o título e o resumo passam a ser texto da
            página, com o mesmo fundo e a mesma tipografia do que vem depois. */}
        <section className="casca-hero casca-hero--claro">
          <div className="casca-container">
            <p className="casca-migalhas">
              <Link href="/reforma">Radar da Reforma</Link> ·{" "}
              {ROTULO_SEVERIDADE[materia.severidade] ?? materia.severidade}
              {materia.publicado_em ? ` · publicado em ${dataBR(materia.publicado_em)}` : ""}
            </p>
            <h1 className="casca-titulo">{materia.titulo}</h1>
            <p className="casca-lead">{materia.resumo}</p>
          </div>
        </section>

        <section className="casca-secao casca-secao--continua">
          <div className="casca-container">
            {materia.o_que_fazer && (
              <div className="casca-destaque">
                <p className="casca-destaque-rotulo">O que fazer</p>
                <div className="casca-prosa">
                  <p className="casca-p" style={{ marginBottom: 0 }}>
                    {materia.o_que_fazer}
                  </p>
                </div>
              </div>
            )}

            <div className="casca-card">
              <p className="casca-destaque-rotulo">A norma</p>
              <div className="casca-meta" style={{ marginTop: 4 }}>
                <span className={CLASSE_SEVERIDADE[materia.severidade] ?? "casca-sev casca-sev--baixa"}>
                  {ROTULO_SEVERIDADE[materia.severidade] ?? materia.severidade}
                </span>
                {materia.publicado_em && <span>publicado em {dataBR(materia.publicado_em)}</span>}
                {materia.vigencia_em && <span>vigência {dataBR(materia.vigencia_em)}</span>}
              </div>
              {materia.fonte && (
                <p className="casca-item-resumo">
                  {/^https?:\/\//i.test(materia.fonte) ? (
                    /* `fonte` é um campo de texto livre da tela de publicar:
                       às vezes é URL, às vezes é a citação ("LC 214/2025, art.
                       349"). Só vira link quando for endereço de verdade — e
                       `rel` fecha a porta do referenciador. */
                    <a
                      href={materia.fonte}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      style={{ color: "#0E7490", fontWeight: 600 }}
                    >
                      Ler a norma na fonte oficial →
                    </a>
                  ) : (
                    <span>Fonte: {materia.fonte}</span>
                  )}
                </p>
              )}
            </div>

            {(anterior || proxima) && (
              <div className="casca-vizinhas">
                {anterior ? (
                  <Link href={`/reforma/${enderecoDaMateria(anterior)}`} className="casca-vizinha">
                    <div className="casca-vizinha-rotulo">← anterior</div>
                    <div className="casca-vizinha-titulo">{anterior.titulo}</div>
                  </Link>
                ) : (
                  <span />
                )}
                {proxima ? (
                  <Link
                    href={`/reforma/${enderecoDaMateria(proxima)}`}
                    className="casca-vizinha"
                    style={{ textAlign: "right" }}
                  >
                    <div className="casca-vizinha-rotulo">próxima →</div>
                    <div className="casca-vizinha-titulo">{proxima.titulo}</div>
                  </Link>
                ) : (
                  <span />
                )}
              </div>
            )}

            <p className="casca-meta" style={{ marginTop: 26 }}>
              <Link href={voltarPara} style={{ color: "#0E7490" }}>
                ← voltar para o radar
              </Link>
            </p>
          </div>
        </section>

        <section className="casca-faixa">
          <div className="casca-container">
            <h2 className="casca-faixa-titulo">E quais dos seus clientes esta norma atinge?</h2>
            <p className="casca-faixa-texto">
              O Enquadria cruza cada norma com a sua carteira e diz, cliente por cliente, quem é
              atingido e o que falta fazer. A triagem é grátis e não precisa de cartão.
            </p>
            <div className="casca-botoes">
              <a href={`${APP}/painel`} className="casca-btn casca-btn-primary">
                Fazer a triagem da minha carteira
              </a>
              <Link href="/curso" className="casca-btn casca-btn-clara">
                Ver o curso gratuito
              </Link>
              <Link href="/guia" className="casca-btn casca-btn-clara">
                Baixar o guia da janela
              </Link>
            </div>
          </div>
        </section>
      </article>
    </CascaPublica>
  );
}
