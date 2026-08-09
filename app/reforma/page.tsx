import type { Metadata } from "next";
import Link from "next/link";
import { CascaPublica } from "@/components/CascaPublica";
import { ROTULO_SEVERIDADE } from "@/lib/radar";
import { materiasPublicas } from "@/lib/radar-publico";
import {
  CLASSE_SEVERIDADE, dataBR, enderecoDaMateria, enderecoPagina, paginar,
} from "@/lib/reforma-publica";
import { APP, SITE } from "@/lib/site";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * O RADAR DA REFORMA, ABERTO — o índice.
 *
 * ---------------------------------------------------------------------------
 * O QUE ESTA PÁGINA DÁ E O QUE ELA GUARDA — a distinção que sustenta o produto.
 *
 * Aqui fica O QUE MUDOU: a norma, o que ela diz, o que fazer a respeito, a
 * fonte e a data. Isso é conteúdo, é público, e é o que faz alguém chegar pela
 * busca.
 *
 * O que NÃO sai daqui é a única frase que ninguém copia: **quais dos SEUS
 * clientes ela atinge**. Esse cruzamento é feito com a carteira de quem está
 * logado, e é ele — não a notícia — que se paga. O `criterio` de cada item, que
 * descreve o recorte de carteira atingido, é deliberadamente omitido de toda
 * consulta pública.
 *
 * ---------------------------------------------------------------------------
 * POR QUE A PÁGINA ENCOLHEU.
 *
 * Ela mostrava as onze matérias INTEIRAS, empilhadas numa rolagem só. Quem
 * chegava procurando uma norma específica tinha de varrer tudo; quem chegava
 * sem procurar nada desistia na terceira. E, para a busca, onze assuntos numa
 * página é uma página que não ranqueia para nenhum deles.
 *
 * Agora é índice: título, resumo, data. O texto completo mora em
 * /reforma/<endereco>, onde cada matéria tem título próprio, endereço próprio
 * e chance própria de ser achada.
 */

const TITULO = "Radar da Reforma — o que muda para o Simples Nacional";
const RESUMO =
  "As normas da transição do IBS/CBS que afetam empresas do Simples Nacional, " +
  "com o que fazer em cada uma. Atualizado à medida que a regulamentação sai.";

/**
 * O CANONICAL É O DA PÁGINA PEDIDA, NÃO O DA PÁGINA 1 — 08/08/2026.
 *
 * O DEFEITO: aqui havia um `metadata` estático com `canonical: "/reforma"`.
 * Como o mesmo módulo responde por `/reforma?p=2`, `?p=3`…, a página 2 saía
 * dizendo "o endereço de verdade deste conteúdo é /reforma" — e /reforma mostra
 * OUTRAS oito matérias. Canonical só é obedecido quando aponta para uma página
 * equivalente; apontando para conteúdo diferente ele é descartado, e aí quem
 * decide o que indexar é o buscador. Pior: o JSON-LD logo abaixo já declarava a
 * URL paginada, então a mesma resposta trazia duas afirmações opostas sobre si
 * mesma — e o sitemap, uma terceira.
 *
 * A CORREÇÃO: `generateMetadata` lê o `?p` e devolve o canonical (e o og:url) da
 * página realmente servida, que é o mesmo endereço que o JSON-LD já usava. A
 * outra metade está em `app/sitemap.ts`, que parou de publicar as paginadas.
 *
 * POR QUE ISTO CONSULTA A LISTA DE NOVO. `paginar()` PUXA para dentro o `?p`
 * fora do intervalo — `?p=99` num índice de 2 páginas mostra a 2. Sem saber
 * quantas páginas existem, `?p=99`, `?p=100` e `?p=2` sairiam com três
 * canonicals diferentes para a mesma tela: seria reabrir por outra porta o
 * defeito de conteúdo repetido que este conserto fecha. A página é
 * `force-dynamic` e a leitura é a mesma consulta de sempre; a leitura a mais
 * por visita é deliberada.
 *
 * A numeração no título é parte do mesmo conserto: duas URLs com título
 * idêntico são, para quem lê o resultado da busca, a mesma página duas vezes.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}): Promise<Metadata> {
  const { p } = await searchParams;
  const pag = paginar(await materiasPublicas(), p);
  const endereco = enderecoPagina(pag.pagina);
  const titulo = pag.pagina > 1 ? `${TITULO} — página ${pag.pagina}` : TITULO;

  return {
    title: titulo,
    description: RESUMO,
    alternates: { canonical: endereco },
    openGraph: { title: titulo, description: RESUMO, url: endereco, siteName: "Enquadria", locale: "pt_BR", type: "website" },
  };
}

export default async function ReformaPublica({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const { p } = await searchParams;
  const todas = await materiasPublicas();
  const pag = paginar(todas, p);

  /**
   * O JSON-LD descreve A PÁGINA CORRENTE, não a coleção inteira. Declarar 50
   * itens numa página que mostra 8 é dizer ao buscador uma coisa e à pessoa
   * outra — e é a pessoa que ele confere.
   */
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: TITULO,
    description: RESUMO,
    url: `${SITE}${enderecoPagina(pag.pagina)}`,
    numberOfItems: pag.itens.length,
    itemListElement: pag.itens.map((i, n) => ({
      "@type": "ListItem",
      position: pag.primeiro + n,
      url: `${SITE}/reforma/${enderecoDaMateria(i)}`,
      name: i.titulo,
    })),
  };

  return (
    <CascaPublica largura="max-w-none" semColuna>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="casca-hero">
        <div className="casca-container">
          <span className="casca-kicker casca-kicker--ghost">
            <i className="casca-dot" /> Radar da Reforma
          </span>
          <h1 className="casca-titulo">O que muda, norma por norma.</h1>
          <p className="casca-lead">
            A transição do IBS/CBS vai até 2033 e cobra decisão a cada fase. Aqui ficam as normas
            que afetam empresas do Simples Nacional — e, em cada uma, o que o contador faz a
            respeito.
          </p>
        </div>
      </section>

      <section className="casca-secao">
        <div className="casca-container">
          {pag.total === 0 ? (
            <div className="casca-card">
              <p className="casca-item-resumo" style={{ marginTop: 0 }}>
                Nenhuma norma publicada ainda. Esta página é atualizada à medida que a
                regulamentação sai.
              </p>
            </div>
          ) : (
            <>
              <p className="casca-pag-conta">
                {pag.primeiro}–{pag.ultimo} de {pag.total} · página {pag.pagina} de {pag.paginas}
              </p>

              <ol className="casca-lista">
                {pag.itens.map((i) => (
                  <li key={i.id} className="casca-card">
                    <div
                      style={{ display: "flex", flexWrap: "wrap", gap: "8px 14px", alignItems: "baseline", justifyContent: "space-between" }}
                    >
                      <h2 className="casca-item-titulo">
                        <Link href={`/reforma/${enderecoDaMateria(i)}`}>{i.titulo}</Link>
                      </h2>
                      <span className={CLASSE_SEVERIDADE[i.severidade] ?? "casca-sev casca-sev--baixa"}>
                        {ROTULO_SEVERIDADE[i.severidade] ?? i.severidade}
                      </span>
                    </div>

                    <p className="casca-item-resumo">{i.resumo}</p>

                    <div className="casca-meta">
                      {i.publicado_em && <span>publicado em {dataBR(i.publicado_em)}</span>}
                      {i.vigencia_em && <span>vigência {dataBR(i.vigencia_em)}</span>}
                      <span>
                        <Link href={`/reforma/${enderecoDaMateria(i)}`} style={{ color: "#0E7490" }}>
                          ler a íntegra →
                        </Link>
                      </span>
                    </div>
                  </li>
                ))}
              </ol>

              <Paginacao pagina={pag.pagina} paginas={pag.paginas} />
            </>
          )}
        </div>
      </section>

      {/* O CTA DA PÁGINA — e ele não vende assinatura.
          Quem chega aqui por busca acabou de entender o problema; é o pico de
          intenção e o pior momento possível para pedir cartão. O que se oferece
          é a resposta que falta: "e quais dos MEUS clientes isso atinge?" — que
          é justamente o que esta página não dá. */}
      <section className="casca-faixa">
        <div className="casca-container">
          <h2 className="casca-faixa-titulo">E quais dos seus clientes cada uma dessas normas atinge?</h2>
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
            {/* o Guia saiu do menu; é aqui, ao pé de quem acabou de ler as
                normas, que alguém sente falta dele */}
            <Link href="/guia" className="casca-btn casca-btn-clara">
              Baixar o guia da janela
            </Link>
          </div>
        </div>
      </section>
    </CascaPublica>
  );
}

/**
 * A PAGINAÇÃO MOSTRA TODAS AS PÁGINAS ENQUANTO COUBEREM.
 *
 * Com poucas páginas, "1 2 3" é mais rápido de ler e de clicar do que
 * "anterior / próxima" — a pessoa vê de uma vez o tamanho do acervo. Passando
 * de nove, vira janela em torno da atual, senão a barra cresce mais do que a
 * lista.
 */
function Paginacao({ pagina, paginas }: { pagina: number; paginas: number }) {
  if (paginas <= 1) return null;

  const janela = 9;
  let de = 1;
  let ate = paginas;
  if (paginas > janela) {
    de = Math.max(1, Math.min(pagina - 4, paginas - janela + 1));
    ate = de + janela - 1;
  }
  const numeros = Array.from({ length: ate - de + 1 }, (_, i) => de + i);

  return (
    <nav className="casca-paginacao" aria-label="Páginas do radar">
      <Link
        href={enderecoPagina(pagina - 1)}
        className={`casca-pag${pagina === 1 ? " casca-pag--inerte" : ""}`}
        aria-disabled={pagina === 1}
        rel="prev"
      >
        ← anterior
      </Link>

      {de > 1 && <span className="casca-pag casca-pag--inerte">…</span>}

      {numeros.map((n) => (
        <Link
          key={n}
          href={enderecoPagina(n)}
          className="casca-pag"
          aria-current={n === pagina ? "page" : undefined}
        >
          {n}
        </Link>
      ))}

      {ate < paginas && <span className="casca-pag casca-pag--inerte">…</span>}

      <Link
        href={enderecoPagina(pagina + 1)}
        className={`casca-pag${pagina === paginas ? " casca-pag--inerte" : ""}`}
        aria-disabled={pagina === paginas}
        rel="next"
      >
        próxima →
      </Link>
    </nav>
  );
}
