import { ABAS_APRENDER } from "@/lib/nav";
import { Abas } from "@/components/Abas";
import { createClient } from "@/lib/supabase-server";
import { temNovidade, type Artigo } from "@/lib/ajuda";
import { atingidas, ordenar, type EmpresaRadar, type ItemRadar } from "@/lib/radar";
import { achatar, unirFeed, type EntradaFeed } from "@/lib/reforma";
import { FeedReforma } from "@/components/FeedReforma";

/**
 * A ABA REFORMA — uma linha do tempo, não duas features homônimas.
 *
 * O QUE ESTAVA ERRADO ATÉ 06/08/2026. Existiam dois lugares chamados
 * "Reforma": esta página, que lia `ajuda_artigos` (tipo notícia), e o radar,
 * que só aparecia como aviso no topo do cockpit. Publicar no radar não punha
 * nada aqui — e a tela de publicação afirmava, por escrito, que punha.
 *
 * As duas fontes se encontram aqui. A diferença entre elas deixou de ser de
 * tabela e passou a ser de NATUREZA, que é o que sempre foi:
 *
 *   · a notícia explica o que mudou, para todos;
 *   · o item de radar cruza a norma com a CARTEIRA de quem está lendo, e por
 *     isso pode dizer "isto atinge 14 dos seus clientes" — a única frase deste
 *     produto que nenhum portal consegue escrever.
 *
 * ESTA PÁGINA SÓ BUSCA E CRUZA. A lista, os filtros, a paginação e o marcar
 * como lido vivem em `components/FeedReforma`, no cliente: filtrar dezenas de
 * linhas no navegador responde na hora, e ida ao servidor a cada tecla digitada
 * seria pior em toda medida que interessa.
 */

export const dynamic = "force-dynamic";

export default async function ReformaPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  /* ── as notícias ───────────────────────────────────────────────────────── */
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
  // schema-ok: radar_itens vem da 0053, ampliada pela 0056 e pela 0064 (slug)
  const { data: itens } = await supabase
    .from("radar_itens")
    .select("id, slug, titulo, resumo, o_que_fazer, fonte, publicado_em, vigencia_em, severidade, criterio")
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

  return (
    <div className="max-w-[104ch]">
      <Abas itens={ABAS_APRENDER} />
      <h1 className="text-[19px] font-bold tracking-tight">Reforma tributária — o que mudou</h1>
      <p className="mt-0.5 text-[13px] text-muted">
        A regulamentação continua saindo. Aqui fica o que muda a decisão do seu cliente, com a{" "}
        <b>data em que passa a valer</b> e — quando dá para saber — <b>quantos clientes seus</b> a
        mudança alcança. Em negrito o que você ainda não leu; clique na linha para abrir.
      </p>

      <FeedReforma linhas={achatar(feed)} hoje={hoje} />
    </div>
  );
}
