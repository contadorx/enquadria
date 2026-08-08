import Link from "next/link";
import { CascaPublica } from "@/components/CascaPublica";
import legal from "@/lib/legal.json";

/**
 * OS DOCUMENTOS LEGAIS — uma fonte, dois destinos.
 *
 * O texto vive em lib/legal.json. Este componente renderiza no app; o script
 * ferramentas/gerar-legal.py gera as páginas estáticas do site a partir do
 * MESMO arquivo. Texto jurídico duplicado é texto jurídico que diverge — e
 * divergir aqui é pior do que não ter documento nenhum.
 */

export interface Secao {
  t: string;
  p: string[];
}
export interface DocLegal {
  slug: string;
  titulo: string;
  resumo: string;
  secoes: Secao[];
}

export const DOCUMENTOS = legal.documentos as DocLegal[];
export const EMPRESA = legal.empresa;

export function docPorSlug(slug: string): DocLegal | null {
  return DOCUMENTOS.find((d) => d.slug === slug) ?? null;
}

/** negrito em **texto** — o único enfeite que o texto legal precisa */
function comNegrito(texto: string, chave: string) {
  const partes = texto.split(/\*\*(.+?)\*\*/g);
  return partes.map((p, i) =>
    i % 2 === 1 ? (
      <b key={`${chave}-${i}`} className="font-semibold text-ink">
        {p}
      </b>
    ) : (
      <span key={`${chave}-${i}`}>{p}</span>
    )
  );
}

export function DocumentoLegal({ slug }: { slug: string }) {
  const doc = docPorSlug(slug);
  if (!doc) return null;

  return (
    <CascaPublica largura="max-w-3xl">
      {/* o cabeçalho e o rodapé próprios saíram: eram os do APP, num documento
          que é público e costuma ser aberto por link direto — o leitor caía
          numa página com "Entrar" e nada mais. A casca pública dá o menu do
          site, que é de onde ele veio ou para onde ele quer ir. */}

      <main className="mx-auto max-w-3xl px-5 py-10 md:py-14">
        <h1 className="text-[30px] font-extrabold leading-tight tracking-tight text-ink md:text-[38px]">
          {doc.titulo}
        </h1>
        <p className="mt-3 max-w-[64ch] text-[16px] leading-relaxed text-slate2">{doc.resumo}</p>
        <p className="mt-4 font-mono text-[12px] text-muted">
          Vigência: {EMPRESA.vigencia} · {EMPRESA.razao_social} · CNPJ {EMPRESA.cnpj}
        </p>

        <div className="mt-10 space-y-8">
          {doc.secoes.map((s) => (
            <section key={s.t}>
              <h2 className="text-[17px] font-bold tracking-tight text-ink">{s.t}</h2>
              <div className="mt-2 space-y-2.5">
                {s.p.map((par, i) => (
                  <p key={i} className="max-w-[72ch] text-[15px] leading-relaxed text-slate2">
                    {comNegrito(par, `${s.t}-${i}`)}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-12 rounded-lg border border-line bg-surface p-5">
          <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">Contato</div>
          <p className="mt-2 text-[14.5px] text-slate2">
            Geral: <b className="text-ink">{EMPRESA.email_contato}</b> · Privacidade:{" "}
            <b className="text-ink">{EMPRESA.email_privacidade}</b> · Segurança:{" "}
            <b className="text-ink">{EMPRESA.email_seguranca}</b>
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {DOCUMENTOS.filter((d) => d.slug !== slug).map((d) => (
              <Link
                key={d.slug}
                href={`/${d.slug}`}
                className="rounded-sm border border-line px-3 py-2 text-[13px] font-semibold text-slate2"
              >
                {d.titulo}
              </Link>
            ))}
          </div>
        </div>
      </main>

    </CascaPublica>
  );
}
