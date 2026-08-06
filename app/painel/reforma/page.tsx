import { ABAS_APRENDER } from "@/lib/nav";
import { Abas } from "@/components/Abas";
import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { temNovidade, type Artigo } from "@/lib/ajuda";
import { atingidas, ordenar, ROTULO_SEVERIDADE, COR_SEVERIDADE, diasPara, type EmpresaRadar, type ItemRadar } from "@/lib/radar";
import { unirFeed, type EntradaFeed } from "@/lib/reforma";

/**
 * A ABA REFORMA — agora com UMA linha do tempo, não duas features homônimas.
 *
 * O QUE ESTAVA ERRADO ATÉ 06/08/2026. Existiam dois lugares chamados
 * "Reforma": esta página, que lia `ajuda_artigos` (tipo notícia), e o radar,
 * que só aparecia como aviso no topo do cockpit. Publicar no radar não punha
 * nada aqui — e a tela de publicação afirmava, por escrito, que punha.
 *
 * Agora as duas fontes se encontram aqui. A diferença entre elas deixou de ser
 * de tabela e passou a ser de NATUREZA, que é o que sempre foi:
 *
 *   · a notícia explica o que mudou, para todos;
 *   · o item de radar cruza a norma com a CARTEIRA de quem está lendo, e por
 *     isso pode dizer "isto atinge 14 dos seus clientes" — a única frase deste
 *     produto que nenhum portal consegue escrever.
 *
 * A informação aqui é EMPURRADA: quem abre não sabe que precisa saber. Por
 * isso ordena por data, mostra a data em destaque e marca o que ainda não foi
 * lido — o oposto da ajuda, que é puxada por quem já tem a dúvida.
 */

export const dynamic = "force-dynamic";

export default async function ReformaPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  /* ── as notícias de sempre ─────────────────────────────────────────────── */
  const { data: artigos } = await supabase
    .from("ajuda_artigos")
    .select("id, slug, titulo, resumo, categoria, tipo, destaque, publicado, publicado_em, ordem, atualizado_em")
    .eq("tipo", "noticia")
    .eq("publicado", true)
    .order("publicado_em", { ascending: false });

  const { data: lidos } = user
    ? await supabase.from("ajuda_leituras").select("artigo_id, lido_em")
    : { data: [] };
  const leituras = Object.fromEntries(
    (lidos ?? []).map((l) => [l.artigo_id as string, l.lido_em as string])
  );

  /* ── o radar, com o alcance na carteira de quem está lendo ─────────────── */
  const { data: itens } = await supabase
    .from("radar_itens")
    .select("id, titulo, resumo, o_que_fazer, fonte, publicado_em, vigencia_em, severidade, criterio")
    .eq("ativo", true);

  const { data: empresas } = await supabase
    .from("empresas")
    .select("id, razao_social, cnpj, cnae_principal, faixa, anexo")
    .is("arquivada_em", null)
    .limit(2000);
  const { data: analises } = await supabase.from("analises").select("empresa_id, saida").limit(2000);
  const saidaDe = new Map((analises ?? []).map((a) => [a.empresa_id as string, (a.saida ?? null) as string | null]));

  /* o anexo vem de `empresas`, e isso não é detalhe: um critério por anexo
     sobre carteira sem anexo não alcança ninguém, em silêncio (ver 06/08) */
  const carteira: EmpresaRadar[] = (empresas ?? []).map((e) => ({
    id: e.id as string,
    razao_social: e.razao_social as string,
    cnpj: e.cnpj as string,
    anexo: (e as { anexo?: number | null }).anexo ?? null,
    faixa: (e.faixa ?? null) as string | null,
    cnae_principal: (e.cnae_principal ?? null) as string | null,
    saida: saidaDe.get(e.id as string) ?? null,
    tem_analise: saidaDe.has(e.id as string),
  }));

  const { data: lidosRadar } = user
    ? await supabase.from("radar_leituras").select("item_id, lido_em")
    : { data: [] };
  const lidosSet = new Set((lidosRadar ?? []).map((l) => l.item_id as string));

  const hoje = new Date().toISOString().slice(0, 10);
  const doRadar = ordenar((itens ?? []) as unknown as ItemRadar[], hoje).map((i) => ({
    item: i,
    alcance: atingidas(i, carteira).length,
    lido: lidosSet.has(i.id),
  }));

  const feed: EntradaFeed[] = unirFeed(
    ((artigos ?? []) as unknown as Artigo[]).map((a) => ({
      tipo: "artigo" as const,
      id: a.id,
      data: a.publicado_em ?? null,
      artigo: a,
      novo: temNovidade(a, leituras[a.id]),
    })),
    doRadar.map((r) => ({
      tipo: "radar" as const,
      id: r.item.id,
      data: r.item.publicado_em ?? null,
      radar: r.item,
      alcance: r.alcance,
      novo: !r.lido,
    }))
  );

  const dataBR = (d: string | null) =>
    d
      ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
      : "—";

  return (
    <div className="max-w-[74ch]">
      <Abas itens={ABAS_APRENDER} />
      <h1 className="text-[19px] font-bold tracking-tight">Reforma tributária — o que mudou</h1>
      <p className="mt-0.5 text-[13px] text-muted">
        A regulamentação continua saindo. Publicamos aqui o que muda a decisão do seu cliente, com
        a data em que passou a valer — e, quando dá para saber, <b>quantos clientes seus</b> a
        mudança alcança. O que você ainda não leu aparece marcado.
      </p>

      {feed.length === 0 && (
        <p className="mt-6 rounded border border-line bg-surface p-5 text-[13px] text-muted">
          Nenhuma novidade publicada ainda.
        </p>
      )}

      <div className="mt-6 space-y-2.5">
        {feed.map((e) => {
          /* ─────────────────────────── a notícia longa, que abre numa página */
          if (e.tipo === "artigo") {
            const a = e.artigo;
            return (
              <Link
                key={`a-${a.id}`}
                href={`/painel/ajuda/${a.slug}`}
                className={`block rounded border bg-surface px-4 py-3 hover:border-accent ${
                  e.novo ? "border-accent" : "border-line"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10.5px] text-muted">{dataBR(a.publicado_em ?? null)}</span>
                  {e.novo && (
                    <span className="rounded-sm bg-accentwash px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-accentdeep">
                      novo
                    </span>
                  )}
                </div>
                <div className="mt-1 text-[14.5px] font-semibold">{a.titulo}</div>
                {a.resumo && (
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{a.resumo}</p>
                )}
              </Link>
            );
          }

          /* ───────────────────────── o item de radar, inteiro e aqui mesmo
           * Não vira link: ele não tem página própria, e o que importa dele
           * (o resumo, a ação e o alcance) cabe no cartão. Mandar para outra
           * tela para ler três frases é fricção sem contrapartida.
           * ────────────────────────────────────────────────────────────── */
          const i = e.radar;
          const dias = diasPara(i.vigencia_em, hoje);
          return (
            <div
              key={`r-${i.id}`}
              className={`rounded border bg-surface px-4 py-3 ${e.novo ? "border-accent" : "border-line"}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[10.5px] text-muted">{dataBR(i.publicado_em ?? null)}</span>
                <span className={`font-mono text-[9.5px] uppercase tracking-wider ${COR_SEVERIDADE[i.severidade] ?? "text-muted"}`}>
                  {ROTULO_SEVERIDADE[i.severidade] ?? i.severidade}
                </span>
                {e.novo && (
                  <span className="rounded-sm bg-accentwash px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-accentdeep">
                    novo
                  </span>
                )}
                {dias != null && dias >= 0 && dias <= 60 && (
                  <span className="font-mono text-[9.5px] uppercase tracking-wider text-amarelo">
                    {dias === 0 ? "vale a partir de hoje" : `faltam ${dias} dia${dias === 1 ? "" : "s"}`}
                  </span>
                )}
              </div>

              <div className="mt-1 text-[14.5px] font-semibold">{i.titulo}</div>

              {/* O NÚMERO É O PRODUTO. Sem ele isto é mais um portal de notícia. */}
              {e.alcance > 0 ? (
                <p className="mt-1 text-[12.5px] font-semibold text-accentdeep">
                  Atinge {e.alcance} {e.alcance === 1 ? "cliente seu" : "clientes seus"}.
                </p>
              ) : (
                <p className="mt-1 text-[12px] text-muted">
                  Não atinge nenhum cliente da sua carteira — fica aqui só para você saber que
                  existe.
                </p>
              )}

              <p className="mt-1 text-[12.5px] leading-relaxed text-slate2">{i.resumo}</p>

              {i.o_que_fazer && (
                <div className="mt-2 rounded-sm border-l-[3px] border-accent bg-surface2 px-3 py-2">
                  <div className="font-mono text-[9.5px] uppercase tracking-wider text-muted">
                    O que fazer
                  </div>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate2">{i.o_que_fazer}</p>
                </div>
              )}

              {i.fonte && (
                <p className="mt-1.5 text-[11px] text-muted">Fonte: {i.fonte}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
