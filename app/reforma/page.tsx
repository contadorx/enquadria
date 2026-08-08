import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase-admin";
import { CascaPublica } from "@/components/CascaPublica";
import { ordenar, ROTULO_SEVERIDADE, COR_SEVERIDADE, type ItemRadar } from "@/lib/radar";
import { APP, SITE } from "@/lib/site";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * O RADAR DA REFORMA, ABERTO.
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
 * logado, e é ele — não a notícia — que se paga. Publicar a notícia e guardar o
 * cruzamento não é meia-entrega: é a divisão certa entre o que atrai e o que
 * retém.
 *
 * ---------------------------------------------------------------------------
 * O `criterio` de cada item é DELIBERADAMENTE omitido. Ele descreve o recorte
 * de carteira que a norma atinge (anexos, faixas, saídas do motor) e é
 * inteligência do produto, não informação do leitor.
 */

const TITULO = "Radar da Reforma — o que mudou para o Simples Nacional";
const RESUMO =
  "As normas da transição do IBS/CBS que afetam empresas do Simples Nacional, " +
  "com o que fazer em cada uma. Atualizado à medida que a regulamentação sai.";

export const metadata: Metadata = {
  title: TITULO,
  description: RESUMO,
  alternates: { canonical: "/reforma" },
  openGraph: {
    title: TITULO,
    description: RESUMO,
    url: "/reforma",
    siteName: "Enquadria",
    locale: "pt_BR",
    type: "website",
  },
};

function dataBR(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("pt-BR") : "";
}

export default async function ReformaPublica() {
  const supabase = createAdminClient();

  let itens: ItemRadar[] = [];
  if (supabase) {
    /* leitura pelo cliente de serviço, como as demais páginas públicas: o
       conteúdo é nosso e igual para todo mundo, não há carteira envolvida */
    // schema-ok: radar_itens vem da 0053, ampliada pela 0056
    const { data } = await supabase
      .from("radar_itens")
      .select("id, titulo, resumo, o_que_fazer, fonte, publicado_em, vigencia_em, severidade")
      .eq("ativo", true)
      .order("publicado_em", { ascending: false })
      .limit(200);
    itens = ordenar(((data ?? []) as unknown as ItemRadar[]), new Date().toISOString());
  }

  /**
   * O JSON-LD é o que faz cada item ser lido como uma PEÇA, e não como um
   * parágrafo solto no meio de uma página. Sem ele, o buscador vê uma lista;
   * com ele, vê uma coleção datada com autor e fonte.
   */
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: TITULO,
    description: RESUMO,
    url: `${SITE}/reforma`,
    numberOfItems: itens.length,
    itemListElement: itens.slice(0, 50).map((i, n) => ({
      "@type": "ListItem",
      position: n + 1,
      item: {
        "@type": "Article",
        headline: i.titulo,
        description: i.resumo,
        datePublished: i.publicado_em,
        author: { "@type": "Person", name: "Leandro Oliveira" },
        publisher: { "@type": "Organization", name: "Enquadria" },
      },
    })),
  };

  return (
    <CascaPublica largura="max-w-[880px]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-ink md:text-[32px]">
        Radar da Reforma
      </h1>
      <p className="mt-2 max-w-[70ch] text-[14px] leading-relaxed text-slate2">
        A transição do IBS/CBS vai até 2033 e cobra decisão a cada fase. Aqui ficam as normas que
        afetam empresas do Simples Nacional — e, em cada uma, <b>o que o contador faz a respeito</b>.
      </p>

      {itens.length === 0 ? (
        <p className="mt-6 rounded border border-line bg-surface p-5 text-[13.5px] text-slate2">
          Nenhuma norma publicada ainda. Esta página é atualizada à medida que a regulamentação
          sai.
        </p>
      ) : (
        <ol className="mt-6 space-y-3">
          {itens.map((i) => (
            <li key={i.id} className="rounded border border-line bg-surface p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[17px] font-bold leading-snug text-ink">{i.titulo}</h2>
                <span className={`font-mono text-[10.5px] ${COR_SEVERIDADE[i.severidade] ?? "text-muted"}`}>
                  {ROTULO_SEVERIDADE[i.severidade] ?? i.severidade}
                </span>
              </div>

              <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate2">{i.resumo}</p>

              {i.o_que_fazer && (
                <p className="mt-2.5 rounded-sm border border-linesoft bg-surface2 px-3.5 py-2.5 text-[13px] leading-relaxed text-slate2">
                  <b className="text-ink">O que fazer.</b> {i.o_que_fazer}
                </p>
              )}

              <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10.5px] text-muted">
                {i.publicado_em && <span>publicado em {dataBR(i.publicado_em)}</span>}
                {i.vigencia_em && <span>vigência {dataBR(i.vigencia_em)}</span>}
                {i.fonte && <span>{i.fonte}</span>}
              </div>
            </li>
          ))}
        </ol>
      )}

      {/* O CTA DA PÁGINA — e ele não vende assinatura.
          Quem chega aqui por busca acabou de entender o problema; é o pico de
          intenção e o pior momento possível para pedir cartão. O que se oferece
          é a resposta que falta: "e quais dos MEUS clientes isso atinge?" — que
          é justamente o que esta página não dá. */}
      <div className="mt-8 rounded border border-accent bg-accentwash p-5">
        <div className="text-[15px] font-bold text-ink">
          E quais dos seus clientes cada uma dessas normas atinge?
        </div>
        <p className="mt-1 max-w-[62ch] text-[13.5px] leading-relaxed text-slate2">
          O Enquadria cruza cada norma com a sua carteira e diz, cliente por cliente, quem é
          atingido e o que falta fazer. A triagem é grátis e não precisa de cartão.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={`${APP}/painel`}
            className="rounded-sm bg-ink px-4 py-2.5 text-[13px] font-semibold text-white"
          >
            Fazer a triagem da minha carteira
          </a>
          <Link
            href="/curso"
            className="rounded-sm border border-line px-4 py-2.5 text-[13px] font-semibold text-slate2"
          >
            Ver o curso gratuito
          </Link>
        </div>
      </div>
    </CascaPublica>
  );
}
