import Link from "next/link";
import { CascaPublica } from "@/components/CascaPublica";
import type { Metadata } from "next";
import { CursoMateriais } from "@/components/CursoMateriais";
import { createClient } from "@/lib/supabase-server";
import {
  comVideos,
  CURSO,
  MATERIAIS,
  MODULOS,
  RESSALVA,
  TOTAL_AULAS,
  totalMinutos,
  AULAS_NO_AR,
} from "@/lib/curso";

/**
 * A PÁGINA DO CURSO — o topo do funil.
 *
 * Estratégia: curso gratuito de verdade, sem cadastro para assistir. O e-mail é
 * pedido uma vez, e só para baixar material. O sistema aparece uma única vez, na
 * aula 8, declarado — porque conteúdo que finge não ter dono não engana ninguém
 * e ainda perde a confiança de quem percebe.
 *
 * Rota PÚBLICA de propósito: o middleware só protege /painel e /doc.
 */

export const metadata: Metadata = {
  title: "A decisão de setembro — curso gratuito para contadores | Enquadria",
  description:
    "Quais clientes da sua carteira precisam optar pelo IBS/CBS fora do DAS até 30 de setembro de 2026 — e como cobrar por isso. Nove aulas curtas, gratuitas, com planilhas e modelos.",
  /* NÃO EXISTE MAIS "a original" EM OUTRO LUGAR. O curso era uma página do
     site em HostGator e uma cópia dentro do app; depois da fusão dos dois no
     mesmo deploy, sobrou só esta — e ela estava com `noindex` apontando o
     canônico para si mesma, ou seja, pedindo ao buscador que ignorasse a única
     cópia que existe. Numa página que é topo de funil, isso é o funil fechado.
     A duplicata por host quem resolve é o middleware, com `X-Robots-Tag` no
     host `app.`. */
  alternates: { canonical: "/curso" },
};



/**
 * O VÍDEO VEM DO BANCO (migration 0038): publicar aula não exige deploy.
 * `revalidate` mantém a página estática e barata — o link novo aparece no
 * próximo minuto, que é rápido o suficiente para quem acabou de publicar e
 * evita uma consulta por visita numa página pública.
 */
export const revalidate = 60;

export default async function CursoPage() {
  const supabase = createClient();
  const { data: linhas } = await supabase.from("curso_videos").select("slug, video_url, minutos");
  const lidas = (linhas ?? []) as { slug: string; video_url: string | null; minutos: number | null }[];
  /**
   * A DURAÇÃO TAMBÉM VEM DO BANCO (migration 0046).
   *
   * O minuto do código é estimativa feita antes de gravar, e estimativa de
   * duração erra sempre. O aluno confere no player em três segundos — uma
   * grade que promete 8 minutos numa aula de 16 queima a credibilidade da
   * grade inteira, inclusive das partes certas.
   */
  const mapaMin = Object.fromEntries(lidas.map((l) => [l.slug, l.minutos]));
  const modulos = comVideos(
    MODULOS,
    Object.fromEntries(lidas.map((l) => [l.slug, l.video_url])),
    mapaMin
  );
  const total = totalMinutos(mapaMin);
  const horas = Math.floor(total / 60);
  const minutos = total % 60;
  const primeira = modulos[0].aulas[0];

  return (
    <CascaPublica largura="max-w-5xl">
      {/* O CABEÇALHO PRÓPRIO SAIU DAQUI (08/08/2026).
          Esta página é pública e é o ativo de tráfego frio: quem chega por
          busca cai nela sem ter passado pela home. Com o menu do APP em cima,
          a única saída era o "Entrar" — ou seja, o visitante que ainda não é
          cliente não tinha para onde ir. Agora ela usa a mesma casca das
          outras páginas públicas, com o menu do SITE. */}
      {/* ------------------------------------------------------------ hero */}
      <section className="border-b border-line bg-surface">
        <div className="mx-auto max-w-5xl px-5 py-10 md:py-14">
          <span className="inline-block rounded-full bg-accentwash px-3 py-1 font-mono text-[11px] font-semibold text-accentdeep">
            {CURSO.selo}
          </span>
          <h1 className="mt-4 max-w-[20ch] text-[32px] font-extrabold leading-[1.1] tracking-tight text-ink md:text-[44px]">
            {CURSO.nome}
          </h1>
          <p className="mt-3 max-w-[64ch] text-[16px] leading-relaxed text-slate2 md:text-[18px]">
            {CURSO.promessa}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href={`/curso/${primeira.slug}`}
              className="rounded-sm bg-ink px-6 py-3.5 text-[15px] font-semibold text-white"
            >
              Começar pela aula 1 →
            </Link>
            <a
              href="#grade"
              className="rounded-sm border border-line bg-surface px-5 py-3.5 text-[15px] font-semibold text-slate2"
            >
              Ver o currículo
            </a>
          </div>

          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[12px] text-muted">
            <span>
              {TOTAL_AULAS} aulas · {horas}h{String(minutos).padStart(2, "0")}
            </span>
            <span>{AULAS_NO_AR > 0 ? `${AULAS_NO_AR} no ar` : "gravação em andamento"}</span>
            <span>{MATERIAIS.length} materiais para baixar</span>
            <span>certificado ao concluir</span>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------- por que existe */}
      <section className="border-b border-line bg-surface2">
        <div className="mx-auto grid max-w-5xl gap-8 px-5 py-10 md:grid-cols-[1.1fr_0.9fr] md:py-14">
          <div>
            <h2 className="text-[22px] font-bold tracking-tight text-ink">
              Por que este curso existe
            </h2>
            <p className="mt-3 max-w-[62ch] text-[15px] leading-relaxed text-slate2">
              Abriu uma janela de trinta dias. De 1º a 30 de setembro de 2026, a empresa
              optante do Simples pode escolher apurar IBS e CBS fora do documento único de
              arrecadação, com efeito já em janeiro. Quem vende para outras empresas tem uma
              decisão real na mesa; quem vende para o consumidor final, não tem nenhuma.
            </p>
            <p className="mt-3 max-w-[62ch] text-[15px] leading-relaxed text-slate2">
              O problema não é técnico. É que ninguém abriu a carteira para ver quantos
              clientes estão de cada lado. Enquanto isso não acontece, a conversa fica em
              “a reforma vem aí” — e a conversa que fecha honorário é outra:{" "}
              <b className="text-ink">
                “estes dezenove clientes seus precisam decidir até 30 de setembro, e eu já
                sei qual é a conta de cada um”.
              </b>
            </p>
            <p className="mt-3 max-w-[62ch] text-[15px] leading-relaxed text-slate2">
              É isso que este curso ensina, na ordem em que se faz: triar a carteira,
              calcular a decisão, cobrar pelo trabalho e entregar um papel que se sustenta.
            </p>
          </div>

          <div className="rounded-lg border border-line bg-surface p-5">
            <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-accentdeep">
              As datas que não se movem
            </div>
            <ul className="mt-3 space-y-2.5 text-[14px]">
              {[
                ["1º a 30/09/2026", "a janela de opção abre e fecha"],
                ["31/10/2026", "prazo para fixar a alíquota de referência — depois da janela"],
                ["30/11/2026", "último dia para cancelar a opção"],
                ["01/01/2027", "começa o efeito, até junho"],
              ].map(([data, o]) => (
                <li key={data} className="flex gap-3 border-b border-linesoft pb-2.5 last:border-0">
                  <span className="w-[104px] shrink-0 font-mono text-[12.5px] font-semibold text-ink">
                    {data}
                  </span>
                  <span className="text-slate2">{o}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- grade */}
      <section id="grade" className="border-b border-line bg-surface">
        <div className="mx-auto max-w-5xl px-5 py-10 md:py-14">
          <h2 className="text-[22px] font-bold tracking-tight text-ink">O currículo</h2>
          <p className="mt-1.5 text-[14px] text-muted">
            Três módulos, {TOTAL_AULAS} aulas. As aulas entram em ondas — a grade toda já
            está aqui para você saber onde vai chegar.
          </p>

          <div className="mt-6 space-y-6">
            {modulos.map((m) => (
              <div key={m.numero}>
                <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h3 className="text-[16px] font-bold text-ink">
                    Módulo {m.numero} — {m.titulo}
                  </h3>
                  <span className="font-mono text-[11.5px] text-muted">
                    {m.aulas.length} aulas · {m.aulas.reduce((s, a) => s + a.minutos, 0)} min
                  </span>
                </div>
                <p className="mb-3 text-[13.5px] text-muted">{m.subtitulo}</p>

                <ul className="overflow-hidden rounded-lg border border-line">
                  {m.aulas.map((a) => (
                    <li key={a.slug} className="border-b border-linesoft last:border-0">
                      <Link
                        href={`/curso/${a.slug}`}
                        className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-surface px-4 py-3.5 hover:bg-accentwash"
                      >
                        <span className="w-6 shrink-0 font-mono text-[13px] text-muted">
                          {a.numero}
                        </span>
                        <span className="min-w-0 flex-1 text-[14.5px] font-semibold text-ink">
                          {a.titulo}
                        </span>
                        <span className="font-mono text-[11.5px] text-muted">{a.minutos} min</span>
                        <span
                          className={`w-[64px] shrink-0 text-right font-mono text-[11px] ${
                            a.video ? "text-verde" : "text-muted"
                          }`}
                        >
                          {a.video ? "no ar" : `onda ${a.onda}`}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- materiais */}
      <section className="border-b border-line bg-surface2">
        <div className="mx-auto max-w-5xl px-5 py-10 md:py-14">
          <CursoMateriais materiais={MATERIAIS} />
        </div>
      </section>

      {/* ------------------------------------------------------ quem ensina */}
      <section className="border-b border-line bg-surface">
        <div className="mx-auto max-w-5xl px-5 py-10 md:py-14">
          <h2 className="text-[22px] font-bold tracking-tight text-ink">Quem dá o curso</h2>
          <div className="mt-4 max-w-[68ch] space-y-3 text-[15px] leading-relaxed text-slate2">
            <p>
              <b className="text-ink">{CURSO.autor}</b> — contador e economista, de Santo André.
              Passei os últimos anos ensinando escritório contábil a cobrar por valor em vez de
              brigar por preço, e escrevendo sobre isso.
            </p>
            <p>
              Fiz este curso porque a decisão de setembro é o caso mais claro que eu já vi da
              tese: um trabalho técnico, com prazo, que quase ninguém está entregando — e que o
              contador já tem os dados para fazer.
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- FAQ */}
      <section className="border-b border-line bg-surface2">
        <div className="mx-auto max-w-5xl px-5 py-10 md:py-14">
          <h2 className="text-[22px] font-bold tracking-tight text-ink">Perguntas diretas</h2>
          <div className="mt-5 space-y-2">
            {[
              [
                "É gratuito mesmo?",
                "É. As nove aulas abrem e rodam sem cadastro. Para baixar as planilhas e os modelos, peço o seu e-mail uma vez.",
              ],
              [
                "Qual é a pegadinha?",
                "Eu vendo um sistema que faz esse trabalho em escala, e espero que parte de quem terminar o curso queira testar. O método das aulas 1 a 7 funciona na planilha que você baixa aqui, de graça. O sistema aparece na aula 8, uma vez, e eu digo que é meu.",
              ],
              [
                "Serve para quem não é contador?",
                "Serve para entender a decisão, mas o curso pressupõe que você lê uma tabela do Simples sem tradução.",
              ],
              [
                "Vale para o meu cliente que é MEI?",
                "Não. O regime híbrido alcança microempresa e empresa de pequeno porte. O MEI segue com valor fixo.",
              ],
              [
                "E se a alíquota mudar depois?",
                "Muda mesmo — a referência só é fixada até 31 de outubro de 2026, depois de a janela fechar. A aula 6 é inteira sobre decidir com esse buraco, e todo cálculo do curso sai com dois cenários.",
              ],
              [
                "Tem certificado?",
                "Tem, em PDF, ao concluir as nove aulas.",
              ],
            ].map(([p, r]) => (
              <details key={p} className="rounded-lg border border-line bg-surface px-4 py-3">
                <summary className="cursor-pointer text-[15px] font-semibold text-ink">{p}</summary>
                <p className="mt-2 max-w-[68ch] text-[14px] leading-relaxed text-slate2">{r}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* O RODAPÉ PRÓPRIO TAMBÉM SAIU: a casca pública já traz um, com os
          mesmos links e a ressalva. Dois rodapés na mesma página é a marca
          aparecendo duas vezes e dizendo coisas ligeiramente diferentes. A
          RESSALVA continua — ela agora vive na casca, para valer em TODA
          página pública e não só nesta. */}
      <p className="mt-8 max-w-[80ch] text-[12px] leading-relaxed text-muted">{RESSALVA}</p>
    </CascaPublica>
  );
}
