import { createClient } from "@/lib/supabase-server";
import { RadarItens } from "@/components/RadarItens";
import type { ItemPublicado } from "@/lib/radar-aviso";

/**
 * NEGÓCIO → RADAR: publicar a norma sem abrir o banco.
 *
 * O diagnóstico que criou esta tela, medido em 05/08/2026: `radar_itens` tinha
 * QUATRO linhas, todas de 24/04 — 104 dias parado. Não por falta de assunto:
 * por falta de porta. A tabela nasceu com uma política de leitura e nada mais,
 * e os quatro itens entraram por INSERT no Supabase de produção.
 *
 * Um contador que abre a aba Reforma e vê notícia de quatro meses atrás conclui
 * que o produto foi abandonado. É pior do que não ter a aba.
 */
export const dynamic = "force-dynamic";

export default async function RadarNegocio() {
  const supabase = createClient();
  /* CARREGA TAMBÉM O QUE ESTÁ FORA DO AR — e isto é o conserto de um defeito
     real, encontrado em 06/08/2026.

     A tela filtrava por `ativo = true` e o único botão ao lado do item era
     "tirar do ar". Quem clicava via o item SUMIR da tela inteira, sem nenhum
     caminho de volta: porta de mão única. Foi exatamente o que aconteceu com
     o item da NFS-e nacional — publicado, correto, com alcance de 55 empresas
     em 5 escritórios, e invisível. Do lado de fora a leitura foi "não
     consegui publicar". */
  const { data, error } = await supabase
    .from("radar_itens")
    .select("id, titulo, resumo, o_que_fazer, fonte, publicado_em, vigencia_em, severidade, criterio, ativo")
    .order("publicado_em", { ascending: false });

  const itens = (data ?? []) as unknown as ItemPublicado[];

  /* quantos escritórios já foram avisados de cada item — o botão de aviso
     precisa disto para não parecer que nunca mandou nada */
  const { data: avisos } = await supabase.from("radar_avisos").select("item_id");
  const avisados: Record<string, number> = {};
  for (const a of avisos ?? []) {
    const k = a.item_id as string;
    avisados[k] = (avisados[k] ?? 0) + 1;
  }

  const noAr = itens.filter((i) => i.ativo !== false);
  const ultimo = noAr[0]?.publicado_em ?? null;
  const dias = ultimo
    ? Math.floor((Date.now() - new Date(ultimo).getTime()) / 86_400_000)
    : null;

  return (
    <div>
      <h1 className="text-[19px] font-bold tracking-tight">Radar da transição</h1>
      <p className="mt-0.5 max-w-[76ch] text-[13px] leading-relaxed text-muted">
        O que entra aqui aparece na aba <b>Reforma</b> de cada contador — e só para quem o critério
        alcança. É a única coisa do produto que cruza a norma com a <b>carteira dele</b>: nenhum
        portal de notícia consegue dizer “isto atinge 14 dos seus clientes”.
      </p>

      {/**
        * A IDADE DO ÚLTIMO ITEM, no topo e sem rodeio.
        *
        * Um painel que só lista o que existe deixa o abandono invisível: quatro
        * itens de abril parecem quatro itens. O número de dias é o que faz
        * alguém publicar.
        */}
      {dias != null && dias > 21 && (
        <div className="mt-4 rounded-sm border border-amarelo bg-amarelowash p-3 text-[12.5px] leading-relaxed text-slate2">
          <b>O último item é de {dias} dias atrás.</b> A aba Reforma está no ar mostrando isso para
          todos os contadores. Radar parado comunica produto abandonado — e o efeito não é neutro,
          é negativo.
        </div>
      )}

      {error && (
        <p className="mt-4 rounded border border-amarelo/40 bg-amarelowash p-3 text-[12.5px]">
          Não consegui ler os itens ({error.message}). A migration <code>0054_radar_publicar.sql</code>{" "}
          precisa ter rodado para publicar por aqui.
        </p>
      )}

      <div className="mt-5">
        <RadarItens itens={itens} avisados={avisados} />
      </div>
    </div>
  );
}
