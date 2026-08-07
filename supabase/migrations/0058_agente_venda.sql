-- ---------------------------------------------------------------------------
-- 0058 — O AGENTE DA PÁGINA PÚBLICA
--
-- Três tabelas, e cada uma existe por um motivo diferente:
--
--   venda_config    o interruptor. Um agente público que responde errado
--                   precisa ser desligado em segundos, sem deploy.
--   venda_mensagens o registro. Cada pergunta que o roteiro NÃO soube é uma
--                   resposta que falta escrever — esta tabela é a pauta.
--   venda_conversas o e-mail capturado e a ligação com a sessão.
--
-- O QUE NÃO ENTRA AQUI: endereço de IP em claro. Só o HMAC dele, porque a
-- pergunta é "esse mesmo navegador voltou?" e não "quem é essa pessoa".
--
-- RLS: leitura só de superadmin. A escrita vem da rota pública, que usa service
-- role e passa por cima de RLS de propósito — quem escreve não tem sessão.
-- ---------------------------------------------------------------------------

create table if not exists public.venda_config (
  id            smallint primary key default 1,
  ativo         boolean not null default false,
  modelo        text not null default 'claude-haiku-4-5',
  persona       text not null default '',
  teto_dia      integer not null default 100,
  atualizado_em timestamptz not null default now(),
  constraint venda_config_linha_unica check (id = 1)
);

insert into public.venda_config (id, ativo, persona) values (
  1, false,
  E'Você é o atendimento da página pública do Enquadria, um sistema para contadores decidirem o enquadramento de IBS/CBS dos clientes do Simples Nacional.\n\nFale em português do Brasil, na segunda pessoa, curto e direto, como um contador falando com outro. Nada de saudação longa nem de linguagem de vendedor.\n\nUse APENAS o material fornecido. Se a resposta não estiver nele, responda exatamente NAO_SEI — nunca invente número, prazo, preço ou regra tributária.\n\nVocê NÃO decide caso concreto: se pedirem cálculo ou recomendação para uma empresa específica, explique que isso sai como laudo, com premissa e data, e convide para a triagem gratuita.\n\nNunca cite marcas de outros sistemas, nem para comparar. Nunca prometa economia, resultado ou proteção.'
) on conflict (id) do nothing;

alter table public.venda_config enable row level security;

drop policy if exists venda_config_leitura on public.venda_config;
create policy venda_config_leitura on public.venda_config
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_superadmin, false)));

drop policy if exists venda_config_escrita on public.venda_config;
create policy venda_config_escrita on public.venda_config
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_superadmin, false)))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_superadmin, false)));

-- ---------------------------------------------------------------------------

create table if not exists public.venda_conversas (
  id            uuid primary key default gen_random_uuid(),
  sessao        text not null unique,
  ip_hash       text,
  email         text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.venda_mensagens (
  id        uuid primary key default gen_random_uuid(),
  sessao    text not null,
  ip_hash   text,
  pergunta  text not null,
  resposta  text,
  -- roteiro | ia | recusa | captura | limite — 'captura' é a lista de tarefas:
  -- toda pergunta que caiu ali é uma resposta que ainda não existe
  fonte     text not null,
  chave     text,
  email     text,
  criado_em timestamptz not null default now()
);

-- os dois índices que as contagens de teto usam a cada pergunta
create index if not exists venda_mensagens_sessao_idx on public.venda_mensagens (sessao);
create index if not exists venda_mensagens_ip_hora_idx on public.venda_mensagens (ip_hash, criado_em desc);
create index if not exists venda_mensagens_data_idx on public.venda_mensagens (criado_em desc);

alter table public.venda_conversas enable row level security;
alter table public.venda_mensagens enable row level security;

drop policy if exists venda_conversas_leitura on public.venda_conversas;
create policy venda_conversas_leitura on public.venda_conversas
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_superadmin, false)));

drop policy if exists venda_mensagens_leitura on public.venda_mensagens;
create policy venda_mensagens_leitura on public.venda_mensagens
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_superadmin, false)));
