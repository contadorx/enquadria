-- ===========================================================================
-- 0064 — CADA MATÉRIA DA REFORMA GANHA ENDEREÇO PRÓPRIO
-- ===========================================================================
--
-- O QUE MUDA NA TELA, para situar quem lê isto daqui a um ano: /reforma deixa
-- de ser uma página única com onze matérias inteiras empilhadas e vira um
-- índice paginado — título, resumo e data. O texto completo, o "o que fazer" e
-- a fonte passam a morar em /reforma/<endereco>, uma página por matéria.
--
-- ---------------------------------------------------------------------------
-- POR QUE ISSO PRECISA DE UMA COLUNA, E NÃO DE UMA FUNÇÃO NA LEITURA
--
-- Dava para derivar o endereço do título a cada requisição — zero migration,
-- zero campo novo. E teria um defeito que só aparece meses depois: no dia em
-- que alguém corrigir uma vírgula num título, a URL daquela matéria muda.
--
-- URL publicada é dívida. O buscador indexou, alguém colou num grupo, um
-- contador salvou nos favoritos. Trocar o endereço não dá erro em lugar
-- nenhum: dá 404 para quem vinha de fora e zera o que a página tinha juntado.
-- Num produto cujo plano de aquisição é ser achado no Google, é o pior tipo de
-- defeito — o que não aparece em teste, em log nem em build.
--
-- Com a coluna, o endereço é DECIDIDO uma vez, na publicação, e fica. O título
-- vira texto editável como qualquer outro.
--
-- ---------------------------------------------------------------------------
-- A FUNÇÃO `slugify_pt` ABAIXO É DE MUDANÇA, NÃO DE REGIME.
--
-- A derivação de verdade mora em `lib/slug.ts`, é pura e tem 21 asserções
-- escritas por extenso. Duas implementações da mesma regra é exatamente o tipo
-- de duplicata que este repositório evita — a exceção aqui é deliberada e
-- limitada: esta função existe para dar endereço às linhas que JÁ estão no
-- banco, uma vez, agora. Nenhuma escrita futura passa por ela; quem publica
-- manda o endereço junto.
--
-- Se um dia ela for chamada de novo, é sinal de que alguém está publicando por
-- SQL — que é o defeito que a 0054 já tinha corrigido.
-- ===========================================================================

alter table public.radar_itens
  add column if not exists slug text;

comment on column public.radar_itens.slug is
  'O endereço público da matéria em /reforma/<slug>. Decidido na publicação e estável para sempre: o título pode ser corrigido sem quebrar o que já foi indexado ou compartilhado.';

-- ---------------------------------------------------------------------------
-- a derivação de mudança — espelha lib/slug.ts, e só roda neste arquivo
create or replace function public.slugify_pt(p_texto text)
returns text
language sql
immutable
as $$
  select
    /* 4) corta em 80 sem partir palavra ao meio: tira a última palavra
          incompleta; se não houver hífen nenhum, corta seco mesmo */
    case
      when length(s) <= 80 then s
      else regexp_replace(left(s, 80), '-[^-]*$', '')
    end
  from (
    select trim(both '-' from regexp_replace(
      /* 3) o que não é letra nem número vira separador */
      regexp_replace(
        /* 2) acentos viram a letra sem acento */
        translate(
          /* 1) símbolos que carregam significado viram palavra antes de sumir */
          replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
            lower(coalesce(p_texto, '')),
            '/', '-'), '\', '-'), '|', '-'),
            'º', ''), 'ª', ''), '°', ''),
            '§', ' par '), '%', ' pct '), '&', ' e '), '+', ' mais '),
          'áàãâäéèêëíìîïóòõôöúùûüçñý',
          'aaaaaeeeeiiiiooooouuuucny'
        ),
        '[^a-z0-9]+', '-', 'g'
      ),
      '-+', '-', 'g'
    )) as s
  ) t;
$$;

comment on function public.slugify_pt(text) is
  'DE MUDANÇA, não de regime: dá endereço às matérias que já existiam. A regra viva é lib/slug.ts. Ver o cabeçalho da migration 0064.';

-- ---------------------------------------------------------------------------
-- o preenchimento, com desempate.
--
-- Dois títulos podem produzir o mesmo endereço ("CBS entra em vigor" numa fase
-- e noutra). O desempate é `-2`, `-3`, na ordem de publicação — o mais antigo
-- fica com o endereço limpo, porque é o que tem mais chance de já estar
-- referenciado em algum lugar.
with numerada as (
  select
    id,
    public.slugify_pt(titulo) as base,
    row_number() over (
      partition by public.slugify_pt(titulo)
      order by publicado_em asc, id asc
    ) as n
  from public.radar_itens
  where slug is null or btrim(slug) = ''
)
update public.radar_itens r
set slug = case
             when numerada.base = '' then 'materia-' || left(r.id::text, 8)
             when numerada.n = 1     then numerada.base
             else numerada.base || '-' || numerada.n
           end
from numerada
where numerada.id = r.id;

-- ---------------------------------------------------------------------------
-- ÍNDICE ÚNICO, e ele é PARCIAL de propósito.
--
-- `where slug is not null` deixa a coluna aceitar nulo — uma linha inserida
-- por um caminho que ainda não conhece o campo entra sem endereço em vez de
-- estourar. O que não pode existir são DUAS matérias no mesmo endereço, e é
-- isso que o índice impede.
--
-- Cuidado herdado da 0063: índice parcial não serve para `on conflict` inferir
-- o alvo. Quem escrever aqui usa `update` explícito, não upsert.
create unique index if not exists radar_itens_slug_unico
  on public.radar_itens (slug)
  where slug is not null;

/**
 * A LEITURA PÚBLICA JÁ EXISTE E NÃO MUDA.
 *
 * A política de leitura de `radar_itens` (o que está `ativo`) foi criada com a
 * tabela e continua valendo; a página nova lê pelo cliente de serviço, como as
 * demais páginas públicas. Nada aqui abre acesso novo — o `criterio`, que é a
 * inteligência do produto, continua fora de toda consulta pública.
 */
