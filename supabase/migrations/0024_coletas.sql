-- ============================================================================
-- Enquadria — Migration 0024 (coleta de dados com a empresa)
--
-- O QUE ESTA MIGRATION FAZ
--   Cria a tabela das coletas: o formulário curto que o contador manda para o
--   cliente responder. Cinco das oito perguntas da análise não estão em lugar
--   nenhum da contabilidade — quanto das vendas vai para outra empresa, se
--   essas empresas são grandes, se alguém já cobrou nota com crédito, se dá
--   para repassar preço, se o concorrente é maior. Sem isso o contador chuta,
--   e o chute entra no laudo com a mesma cara de um dado apurado.
--
-- O TOKEN É A CHAVE
--   A página de resposta é pública e não pede login: pedir cadastro ao dono da
--   empresa para responder seis perguntas é garantir que ele não responda. A
--   proteção é o token de 20 caracteres (100 bits) e o fato de a coleta poder
--   ser fechada a qualquer momento pelo contador.
--
-- SEGURANÇA
--   RLS LIGADA e SEM policy: nem anon nem authenticated tocam nesta tabela
--   direto. Tudo passa pelo servidor (service role), e o servidor só cria e só
--   lista uma coleta depois de confirmar — com o cliente do USUÁRIO, sujeito à
--   RLS de `empresas` — que aquela empresa é visível para quem pediu. Assim a
--   RLS que já existe na carteira continua sendo a única fonte da verdade
--   sobre quem enxerga qual empresa, e esta tabela não abre um caminho lateral.
--
-- IDEMPOTENTE: roda duas vezes sem erro, e descobre o que já existe.
-- ============================================================================

create table if not exists public.coletas (
  id                uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null,
  token             text not null,
  status            text not null default 'aberta',
  criado_em         timestamptz not null default now(),
  respondido_em     timestamptz,
  respondente_nome  text,
  respondente_cargo text,
  respostas         jsonb not null default '{}'::jsonb,
  derivadas         jsonb,
  observacao        text,
  aplicada_em       timestamptz
);

-- colunas que podem faltar num banco que já tinha uma versão da tabela
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='coletas' and column_name='derivadas') then
    alter table public.coletas add column derivadas jsonb;
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='coletas' and column_name='aplicada_em') then
    alter table public.coletas add column aplicada_em timestamptz;
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='coletas' and column_name='observacao') then
    alter table public.coletas add column observacao text;
  end if;
end $$;

-- a chave-de-fora só entra se `empresas` existir e ainda não houver a relação;
-- assim a migration roda num banco novo e num banco já montado
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='empresas')
     and not exists (select 1 from information_schema.table_constraints
                     where table_schema='public' and constraint_name='coletas_empresa_fk') then
    alter table public.coletas
      add constraint coletas_empresa_fk foreign key (empresa_id)
      references public.empresas (id) on delete cascade;
  end if;
end $$;

-- o token é o endereço público da coleta: não pode repetir
create unique index if not exists coletas_token on public.coletas (token);
create index if not exists coletas_empresa on public.coletas (empresa_id, criado_em desc);

-- status é um conjunto fechado; texto livre aqui vira bug silencioso no painel
do $$
begin
  if not exists (select 1 from information_schema.table_constraints
                 where table_schema='public' and constraint_name='coletas_status_ck') then
    alter table public.coletas add constraint coletas_status_ck
      check (status in ('aberta', 'respondida', 'cancelada'));
  end if;
end $$;

alter table public.coletas enable row level security;

-- conferência: falha alto e com o nome exato do que não ficou de pé
do $$
declare faltando text := '';
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema='public' and table_name='coletas') then
    faltando := faltando || 'tabela coletas; ';
  end if;
  if not exists (select 1 from pg_indexes
                 where schemaname='public' and indexname='coletas_token') then
    faltando := faltando || 'índice coletas_token; ';
  end if;
  if not exists (select 1 from information_schema.table_constraints
                 where table_schema='public' and constraint_name='coletas_status_ck') then
    faltando := faltando || 'check de status; ';
  end if;
  if not exists (select 1 from pg_tables
                 where schemaname='public' and tablename='coletas' and rowsecurity) then
    faltando := faltando || 'RLS de coletas; ';
  end if;
  if faltando <> '' then
    raise exception 'Migration 0024 incompleta — faltou: %', faltando;
  end if;
end $$;
