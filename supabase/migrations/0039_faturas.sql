-- ===========================================================================
-- 0039 — CENTRAL DE FATURAS
-- ===========================================================================
--
-- POR QUE ELA EXISTE.
--
-- Até aqui o dinheiro entrava e sumia da vista: `assinaturas` guardava um
-- `checkout_url` e uma data de validade, e nada mais. Quem pagou não tinha
-- onde ver o que pagou, quando, nem como pegar a segunda via — e essas três
-- perguntas chegam por e-mail todo mês, sempre para uma pessoa só.
--
-- Uma tabela de faturas resolve isso e mais duas coisas que não são conforto:
--
--   · SEGUNDA VIA SEM PEDIR. Boleto vencido é o caso mais comum de churn
--     involuntário: o cliente QUER pagar e não acha o link.
--   · PROVA DO QUE FOI COBRADO. Quando alguém contesta um valor, a resposta
--     precisa estar no sistema, não na memória de quem atendeu.
--
-- ---------------------------------------------------------------------------
-- O ÍNDICE ÚNICO EM `asaas_id` NÃO É ENFEITE.
--
-- Duas fontes gravam a mesma fatura: a criação da cobrança (que sabe o id na
-- hora) e o webhook `PAYMENT_CREATED` (que chega segundos depois). Um "confere
-- se existe, senão insere" nos dois lados perde a corrida e grava duas linhas
-- para o mesmo pagamento — o cliente vê a mesma cobrança duplicada e liga
-- perguntando se vai pagar duas vezes.
--
-- O índice único faz o banco decidir, e o `upsert onConflict` transforma a
-- segunda escrita em atualização. É a trava que não depende de ordem de
-- chegada.
-- ---------------------------------------------------------------------------
--
-- Idempotente.
-- ===========================================================================

create table if not exists public.faturas (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  assinatura_id  uuid,
  plano_nome     text,

  -- id do pagamento no Asaas; nulo em cobrança registrada manualmente
  asaas_id       text,

  valor_centavos int  not null default 0,
  -- pendente | pago | vencido | cancelado | estornado (ver lib/faturas.ts)
  status         text not null default 'pendente',
  vencimento     date,
  pago_em        timestamptz,

  -- invoiceUrl e bankSlipUrl do Asaas: é por aqui que sai a segunda via
  link_pagamento text,
  link_boleto    text,

  descricao      text,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

-- a trava contra a fatura duplicada — ver nota acima
create unique index if not exists faturas_asaas_idx
  on public.faturas (asaas_id) where asaas_id is not null;

create index if not exists faturas_tenant_idx
  on public.faturas (tenant_id, vencimento desc);

alter table public.faturas enable row level security;

-- o escritório vê as PRÓPRIAS faturas, e só lê: quem escreve é o servidor,
-- a partir do que o Asaas confirma
drop policy if exists faturas_do_escritorio on public.faturas;
create policy faturas_do_escritorio on public.faturas
  for select to authenticated
  using (tenant_id = (select p.tenant_id from public.profiles p where p.id = auth.uid()));

drop policy if exists faturas_gestor on public.faturas;
create policy faturas_gestor on public.faturas
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_superadmin, false)))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_superadmin, false)));

comment on table public.faturas is
  'Histórico de cobranças por escritório, alimentado pelo webhook do Asaas. Índice único em asaas_id impede a fatura duplicada quando criação e webhook correm juntos.';
