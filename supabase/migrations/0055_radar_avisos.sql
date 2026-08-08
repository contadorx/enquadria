-- ===========================================================================
-- 0055 — O RADAR PASSA A AVISAR (e a lembrar que já avisou)
-- ===========================================================================
--
-- O DEFEITO, medido em 06/08/2026 no próprio banco:
--
--   o item "NFS-e nacional passa a ser obrigatória para prestadores do
--   Simples" foi publicado em 06/08 com vigência em 01/09. Alcance real:
--   55 empresas em 5 escritórios. Severidade alta.
--
--   E o contador não seria avisado. Publicar no radar não dispara nada. O
--   único e-mail que menciona o radar é o digest, agendado para `0 12 1 * *`
--   — dia 1º. Ou seja: o aviso de uma obrigação que começa em 01/09 chegaria
--   NO DIA 01/09. Vinte e seis dias de antecedência viram zero.
--
-- ---------------------------------------------------------------------------
-- POR QUE UMA TABELA, E NÃO UM `avisado_em` NA PRÓPRIA `radar_itens`.
--
-- Porque o aviso não é um fato do ITEM, é um fato do PAR (item, escritório).
-- O mesmo item alcança cinco escritórios hoje e um sexto amanhã, quando ele
-- importar a carteira. Uma coluna no item diria "já avisei" e o sexto nunca
-- receberia — silenciosamente, que é como esta feature morre.
--
-- A chave primária (item_id, tenant_id) é a trava: avisar duas vezes o mesmo
-- escritório sobre a mesma norma é o caminho mais curto para ser marcado como
-- spam, e aqui isso é impossível por construção, não por cuidado do código.
--
-- ---------------------------------------------------------------------------
-- ESTA TABELA TAMBÉM CONSERTA O DIGEST.
--
-- Hoje o digest conta TODOS os itens ativos que batem na carteira, todo mês.
-- O assunto chega com o mesmo número sempre, e o item realmente novo não se
-- destaca de nada. Com este livro-razão, "novo" passa a ter definição:
-- item que alcança este escritório e ainda não tem linha aqui.
-- ===========================================================================

create table if not exists public.radar_avisos (
  item_id    uuid        not null references public.radar_itens(id) on delete cascade,
  tenant_id  uuid        not null references public.tenants(id)     on delete cascade,
  avisado_em timestamptz not null default now(),
  canal      text        not null check (canal in ('imediato', 'digest')),
  /* quantas empresas DAQUELE escritório o item atingia no momento do aviso.
     Guardado porque a carteira muda: sem isto não dá para auditar depois por
     que um escritório recebeu e outro não. */
  empresas   int         not null default 0,
  primary key (item_id, tenant_id)
);

comment on table public.radar_avisos is
  'Livro-razão de "este escritório já foi comunicado sobre esta norma". A PK impede aviso duplicado por construção. Também define o que é NOVO para o digest mensal.';

create index if not exists radar_avisos_tenant on public.radar_avisos (tenant_id, avisado_em desc);

alter table public.radar_avisos enable row level security;

/* Quem escreve aqui é o servidor (rota de aviso com service role, e o cron do
   digest). Pela sessão, só o dono da plataforma lê — é ele que precisa ver,
   na tela do radar, quantos escritórios já foram avisados. O escritório não
   tem nada a fazer com esta tabela: o que ele vê é a aba Reforma. */
drop policy if exists radar_avisos_leitura on public.radar_avisos;

create policy radar_avisos_leitura on public.radar_avisos
  for select
  to authenticated
  using (public.e_superadmin());

comment on policy radar_avisos_leitura on public.radar_avisos is
  'Só o dono da plataforma lê. O service role (rota de aviso e cron do digest) ignora RLS e é quem escreve.';
