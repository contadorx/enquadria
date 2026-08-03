-- ============================================================================
-- Enquadria — Migration 0028 (o laudo e o comparativo chegam ao cliente)
--
-- O QUE ESTA MIGRATION RESOLVE
--   O produto emitia o laudo e parava ali. Nenhum endpoint de laudo,
--   comparativo, dossiê ou coleta chamava função de envio: todos terminavam
--   devolvendo um id para a tela abrir numa aba. O único artefato que chegava
--   ao cliente era o convite de assinatura do termo — e só pela rota de lote.
--
--   O bloqueio não era de e-mail, era de ACESSO. `/doc/laudo/[id]` e
--   `/doc/comparativo/[id]` leem com o cliente do usuário e exigem sessão do
--   contador. Mandar esse link ao cliente levaria a uma tela de login. Termo
--   (`termos.token`) e coleta (`coletas.token`) já tinham endereço público;
--   laudo e comparativo não tinham.
--
-- O TOKEN COM DEFAULT, DE PROPÓSITO
--   `default gen_random_uuid()::text` na coluna faz TODO laudo novo nascer com
--   endereço público, sem alterar a RPC `emitir_laudo` nem a
--   `emitir_comparativo`. Mexer numa RPC que numera documento por tenant é
--   risco desnecessário quando um default resolve. Os documentos que já
--   existem são preenchidos no backfill abaixo.
--
--   Token não é permissão de escrita: a página pública só LÊ o snapshot
--   congelado na emissão. E o snapshot é o mesmo que o contador vê — a decisão
--   é entregar o laudo inteiro, com a memória de cálculo, porque é ela que
--   sustenta o honorário e sobrevive a uma pergunta do Fisco.
--
-- POR QUE REGISTRAR O ENVIO
--   Hoje o contador manda o convite de assinatura e não tem como saber, depois,
--   se saiu. `plataforma_envios` existe, mas é da régua comercial da plataforma
--   para o contador, com RLS de superadmin — o escritório não enxerga. Um
--   envio ao CLIENTE precisa aparecer no dossiê daquele cliente, e é isso que
--   `envios_cliente` faz.
--
-- SEGURANÇA
--   RLS LIGADA e SEM policy, igual a `coletas`: ninguém toca direto. Tudo passa
--   pelo servidor, que só grava e só lista depois de confirmar — com o cliente
--   do USUÁRIO, sujeito à RLS de `empresas` — que aquela empresa é visível para
--   quem pediu. A RLS da carteira segue sendo a única fonte da verdade sobre
--   quem enxerga qual empresa.
--
-- IDEMPOTENTE: roda duas vezes sem erro, e descobre o que já existe.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. endereço público do laudo e do comparativo
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['laudos', 'comparativos'] loop
    if not exists (select 1 from information_schema.tables
                   where table_schema='public' and table_name=t) then
      raise notice 'tabela % não existe — pulando', t;
      continue;
    end if;

    if not exists (select 1 from information_schema.columns
                   where table_schema='public' and table_name=t and column_name='token') then
      execute format(
        'alter table public.%I add column token text not null default gen_random_uuid()::text', t);
      raise notice 'coluna token criada em %', t;
    else
      -- a coluna existe mas pode ter vindo sem default de uma versão anterior
      execute format(
        'alter table public.%I alter column token set default gen_random_uuid()::text', t);
    end if;

    -- documentos anteriores à migration não têm endereço público; ganham agora
    execute format(
      'update public.%I set token = gen_random_uuid()::text where token is null or token = ''''', t);

    execute format(
      'create unique index if not exists %I on public.%I (token)', t || '_token', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 1b. o comparativo precisa carregar a MARCA de quem o emitiu
--
--   A rota com sessão lê nome/CRC/logotipo do `profiles` de quem está olhando,
--   e isso funciona porque quem olha é o dono. Na página pública não há sessão:
--   buscar "o primeiro perfil" carimbaria o documento com o nome de OUTRO
--   escritório. O laudo já resolve isso guardando `snapshot.escritorio` na
--   emissão; o comparativo não tinha onde guardar.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='comparativos')
     and not exists (select 1 from information_schema.columns
                     where table_schema='public' and table_name='comparativos'
                       and column_name='escritorio') then
    alter table public.comparativos add column escritorio jsonb;
    raise notice 'coluna escritorio criada em comparativos';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. o registro do que foi enviado ao cliente
-- ---------------------------------------------------------------------------
create table if not exists public.envios_cliente (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid,
  empresa_id   uuid not null,
  -- qual artefato foi entregue. Conjunto fechado: texto livre aqui viraria
  -- filtro quebrado no dossiê seis meses depois.
  tipo         text not null,
  documento_id uuid,
  para         text not null,
  nome         text,
  assunto      text,
  -- 'enviado' ou 'erro'. Uma falha de entrega É informação para o contador:
  -- some do dossiê e ele reenvia achando que nunca mandou.
  status       text not null default 'enviado',
  erro         text,
  -- por onde saiu (postal | brevo | nenhum) — o mesmo rótulo que lib/email
  -- devolve. Sem isso, investigar não-entrega vira adivinhação.
  caminho      text,
  criado_em    timestamptz not null default now()
);

do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='empresas')
     and not exists (select 1 from information_schema.table_constraints
                     where table_schema='public' and constraint_name='envios_cliente_empresa_fk') then
    alter table public.envios_cliente
      add constraint envios_cliente_empresa_fk foreign key (empresa_id)
      references public.empresas (id) on delete cascade;
  end if;

  if not exists (select 1 from information_schema.table_constraints
                 where table_schema='public' and constraint_name='envios_cliente_tipo_ck') then
    alter table public.envios_cliente add constraint envios_cliente_tipo_ck
      check (tipo in ('laudo', 'comparativo', 'termo'));
  end if;

  if not exists (select 1 from information_schema.table_constraints
                 where table_schema='public' and constraint_name='envios_cliente_status_ck') then
    alter table public.envios_cliente add constraint envios_cliente_status_ck
      check (status in ('enviado', 'erro'));
  end if;
end $$;

create index if not exists envios_cliente_empresa
  on public.envios_cliente (empresa_id, criado_em desc);
create index if not exists envios_cliente_doc
  on public.envios_cliente (tipo, documento_id);
create index if not exists envios_cliente_tenant
  on public.envios_cliente (tenant_id, criado_em desc);

alter table public.envios_cliente enable row level security;

-- ---------------------------------------------------------------------------
-- 3. conferência — falha alto e com o nome exato do que não ficou de pé
-- ---------------------------------------------------------------------------
do $$
declare
  faltando text := '';
  t text;
  n int;
begin
  foreach t in array array['laudos', 'comparativos'] loop
    if exists (select 1 from information_schema.tables
               where table_schema='public' and table_name=t) then
      if not exists (select 1 from information_schema.columns
                     where table_schema='public' and table_name=t and column_name='token') then
        faltando := faltando || format('coluna token em %s; ', t);
      else
        -- nenhum documento pode ficar sem endereço público, senão o botão de
        -- enviar existiria para um laudo que não abre
        execute format('select count(*) from public.%I where token is null or token = ''''', t) into n;
        if n > 0 then
          faltando := faltando || format('%s documento(s) sem token em %s; ', n, t);
        end if;
      end if;
      if not exists (select 1 from pg_indexes
                     where schemaname='public' and indexname = t || '_token') then
        faltando := faltando || format('índice único de token em %s; ', t);
      end if;
    end if;
  end loop;

  if not exists (select 1 from information_schema.tables
                 where table_schema='public' and table_name='envios_cliente') then
    faltando := faltando || 'tabela envios_cliente; ';
  end if;
  if not exists (select 1 from pg_tables
                 where schemaname='public' and tablename='envios_cliente' and rowsecurity) then
    faltando := faltando || 'RLS de envios_cliente; ';
  end if;
  if not exists (select 1 from information_schema.table_constraints
                 where table_schema='public' and constraint_name='envios_cliente_tipo_ck') then
    faltando := faltando || 'check de tipo; ';
  end if;

  if faltando <> '' then
    raise exception 'Migration 0028 incompleta — faltou: %', faltando;
  end if;
end $$;
