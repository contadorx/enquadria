-- Reproduz o estado do banco de produção ANTES da 0045:
-- 7 tabelas com FK cascade, 11 com tenant_id e sem FK nenhuma.

create schema if not exists auth;

-- auth.uid() e e_plataforma() controláveis pelo teste
create table auth.contexto (uid uuid, plataforma boolean default true);
insert into auth.contexto values (null, true);

create or replace function auth.uid() returns uuid
language sql stable as $$ select uid from auth.contexto limit 1 $$;

create or replace function public.e_plataforma() returns boolean
language sql stable as $$ select coalesce((select plataforma from auth.contexto limit 1), false) $$;

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  nome text,
  criado_em timestamptz default now(),
  is_teste boolean default false,
  status text default 'ativa',
  asaas_subscription_id text
);

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  email text, nome text, is_superadmin boolean default false
);

-- as outras 6 COM FK
create table public.empresas    (id uuid primary key default gen_random_uuid(), tenant_id uuid references public.tenants(id) on delete cascade);
create table public.analises    (id uuid primary key default gen_random_uuid(), tenant_id uuid references public.tenants(id) on delete cascade);
create table public.laudos      (id uuid primary key default gen_random_uuid(), tenant_id uuid references public.tenants(id) on delete cascade);
create table public.termos      (id uuid primary key default gen_random_uuid(), tenant_id uuid references public.tenants(id) on delete cascade);
create table public.importacoes (id uuid primary key default gen_random_uuid(), tenant_id uuid references public.tenants(id) on delete cascade);
create table public.assinaturas (id uuid primary key default gen_random_uuid(), tenant_id uuid references public.tenants(id) on delete cascade);

-- as 11 SEM FK — o defeito que a migration conserta
create table public.faturas          (id uuid primary key default gen_random_uuid(), tenant_id uuid, status text default 'pendente', valor_centavos int default 0);
create table public.aberturas        (id uuid primary key default gen_random_uuid(), tenant_id uuid);
create table public.chamados         (id uuid primary key default gen_random_uuid(), tenant_id uuid);
create table public.coletas          (id uuid primary key default gen_random_uuid(), tenant_id uuid);
create table public.comparativos     (id uuid primary key default gen_random_uuid(), tenant_id uuid);
create table public.convites         (id uuid primary key default gen_random_uuid(), tenant_id uuid);
create table public.envios_cliente   (id uuid primary key default gen_random_uuid(), tenant_id uuid);
create table public.indicacoes       (id uuid primary key default gen_random_uuid(), tenant_id uuid);
create table public.nps_respostas    (id uuid primary key default gen_random_uuid(), tenant_id uuid);
create table public.plataforma_envios(id uuid primary key default gen_random_uuid(), tenant_id uuid);
create table public.radar_leituras   (id uuid primary key default gen_random_uuid(), tenant_id uuid);
