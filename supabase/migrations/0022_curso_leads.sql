-- ============================================================================
-- Enquadria — Migration 0022 (leads do curso gratuito)
--
-- O QUE ESTA MIGRATION FAZ
--   Cria a tabela que guarda o e-mail de quem baixa os materiais do curso
--   "A decisão de setembro". É o único ponto de captura do topo de funil:
--   assistir às aulas não pede nada, baixar material pede o e-mail uma vez.
--
-- POR QUE É TÃO POUCA COISA
--   LGPD: guarda-se o mínimo que serve ao propósito declarado na página —
--   mandar o material e avisar quando a próxima aula entra no ar. Sem IP, sem
--   nome, sem telefone, sem rastreamento. O que não se guarda não vaza.
--
-- SEGURANÇA
--   RLS LIGADA e NENHUMA policy. Isso não é esquecimento: com RLS ligada e sem
--   policy, nem anon nem authenticated leem ou escrevem. Só o service role
--   (que ignora RLS) enxerga a tabela, e ele vive apenas na rota de servidor
--   /api/curso/lead. A página é pública; a tabela, não.
--
-- IDEMPOTENTE: pode rodar duas vezes seguidas sem erro. Descobre o que já
-- existe em vez de supor — a lição das migrations 0014, 0018 e 0021 desta série.
-- ============================================================================

-- 1) a tabela ------------------------------------------------------------------
create table if not exists public.curso_leads (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  origem      text,
  material    text,
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- 2) colunas que podem faltar num banco que já tinha uma versão da tabela ------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'curso_leads' and column_name = 'origem'
  ) then
    alter table public.curso_leads add column origem text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'curso_leads' and column_name = 'material'
  ) then
    alter table public.curso_leads add column material text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'curso_leads' and column_name = 'atualizado_em'
  ) then
    alter table public.curso_leads add column atualizado_em timestamptz not null default now();
  end if;
end $$;

-- 3) um e-mail, uma linha ------------------------------------------------------
--    Índice sobre lower(email) porque a mesma pessoa digita Fulano@ e fulano@ —
--    e dois cadastros do mesmo humano viram dois e-mails no disparo.
create unique index if not exists curso_leads_email_unico
  on public.curso_leads (lower(email));

create index if not exists curso_leads_criado_em
  on public.curso_leads (criado_em desc);

-- 4) RLS ligada, sem policy ----------------------------------------------------
alter table public.curso_leads enable row level security;

-- 5) toque de atualização ------------------------------------------------------
create or replace function public.curso_leads_touch()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end $$;

drop trigger if exists curso_leads_touch on public.curso_leads;
create trigger curso_leads_touch
  before update on public.curso_leads
  for each row execute function public.curso_leads_touch();

-- 6) conferência ---------------------------------------------------------------
--    Falha alto e com nome exato se algo não ficou de pé, em vez de deixar a
--    rota descobrir isso em produção com um 500 silencioso.
do $$
declare
  faltando text := '';
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema='public' and table_name='curso_leads') then
    faltando := faltando || 'tabela curso_leads; ';
  end if;
  if not exists (select 1 from pg_indexes
                 where schemaname='public' and indexname='curso_leads_email_unico') then
    faltando := faltando || 'índice curso_leads_email_unico; ';
  end if;
  if not exists (select 1 from pg_tables
                 where schemaname='public' and tablename='curso_leads' and rowsecurity) then
    faltando := faltando || 'RLS de curso_leads; ';
  end if;
  if faltando <> '' then
    raise exception 'Migration 0022 incompleta — faltou: %', faltando;
  end if;
end $$;
