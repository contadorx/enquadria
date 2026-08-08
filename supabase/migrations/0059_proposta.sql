-- ===========================================================================
-- 0059 — A PROPOSTA DE HONORÁRIOS: o documento entre a decisão e o dinheiro
-- ===========================================================================
--
-- POR QUE ESTA TABELA EXISTE.
--
-- O produto entregava a decisão (laudo) e a prova (termo), e parava exatamente
-- antes do ato que faz o contador ganhar com isso: cobrar. A proposta ficava
-- para depois, escrita à mão em editor de texto — e serviço que depende de
-- sobrar tempo não acontece. O laudo justifica o honorário; a proposta é o
-- honorário.
--
-- TRÊS DECISÕES DE SCHEMA, e o motivo de cada uma:
--
--   1. CONTEÚDO CONGELADO. Como no laudo e no estudo de abertura: o que foi
--      proposto num dia não pode mudar porque o motor, o valor sugerido ou o
--      texto padrão mudaram depois. Proposta é oferta com data e validade.
--
--   2. TOKEN PÚBLICO. O destinatário é o cliente do contador, que não tem
--      conta aqui. Ele abre por link, como já abre o laudo e o termo.
--
--   3. NÃO CONSOME COTA DE PLANO. De propósito, e é decisão comercial, não
--      esquecimento: a proposta é o documento que faz o contador querer emitir
--      o laudo. Cobrar pela proposta é cobrar pedágio na porta de entrada do
--      próprio funil.
--
-- Idempotente.
-- ===========================================================================

create table if not exists public.propostas (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  user_id       uuid,
  numero        int  not null,
  token         text not null default gen_random_uuid()::text,

  empresa_id    uuid,
  -- pode não existir: propor ANTES de analisar é o caminho mais comum
  analise_id    uuid,

  -- para quem foi mandada (o contato pode ser corrigido na hora do envio)
  destinatario_nome  text,
  destinatario_email text,

  -- congelados na emissão
  premissas     jsonb not null,
  conteudo      jsonb not null,
  escritorio    jsonb,

  emitido_em    timestamptz not null default now()
);

create unique index if not exists propostas_numero_idx on public.propostas (tenant_id, numero);
create unique index if not exists propostas_token_idx  on public.propostas (token);
create index        if not exists propostas_tenant_idx on public.propostas (tenant_id, emitido_em desc);
create index        if not exists propostas_empresa_idx on public.propostas (empresa_id, emitido_em desc);

alter table public.propostas enable row level security;

drop policy if exists propostas_do_escritorio on public.propostas;
create policy propostas_do_escritorio on public.propostas
  for all to authenticated
  using (tenant_id = (select p.tenant_id from public.profiles p where p.id = auth.uid()))
  with check (tenant_id = (select p.tenant_id from public.profiles p where p.id = auth.uid()));

-- ---------------------------------------------------------------------------
-- A EMISSÃO — numeração atômica por escritório.
--
-- `max(numero)+1` lido pela aplicação produz duas propostas nº 7 no dia em que
-- duas pessoas do mesmo escritório clicarem juntas. Aqui leitura e escrita
-- ocorrem na mesma transação, com lock consultivo por tenant.
-- ---------------------------------------------------------------------------
create or replace function public.emitir_proposta(
  p_empresa_id  uuid,
  p_analise_id  uuid,
  p_premissas   jsonb,
  p_conteudo    jsonb,
  p_escritorio  jsonb default null,
  p_nome        text  default null,
  p_email       text  default null
)
returns table (id uuid, numero int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_numero int;
  v_id     uuid;
begin
  select p.tenant_id into v_tenant from public.profiles p where p.id = auth.uid();
  if v_tenant is null then
    raise exception 'sem escritório vinculado ao usuário';
  end if;

  -- a empresa precisa ser do escritório de quem chama: SECURITY DEFINER passa
  -- por cima da RLS, então a checagem que a policy faria tem que ser feita aqui
  if p_empresa_id is not null
     and not exists (select 1 from public.empresas e
                      where e.id = p_empresa_id and e.tenant_id = v_tenant) then
    raise exception 'empresa de outro escritório';
  end if;

  perform pg_advisory_xact_lock(hashtext('proposta:' || v_tenant::text));

  select coalesce(max(pr.numero), 0) + 1 into v_numero
    from public.propostas pr where pr.tenant_id = v_tenant;

  insert into public.propostas
    (tenant_id, user_id, numero, empresa_id, analise_id,
     destinatario_nome, destinatario_email, premissas, conteudo, escritorio)
  values
    (v_tenant, auth.uid(), v_numero, p_empresa_id, p_analise_id,
     nullif(btrim(coalesce(p_nome, '')), ''), nullif(btrim(coalesce(p_email, '')), ''),
     p_premissas, p_conteudo, p_escritorio)
  returning propostas.id into v_id;

  return query select v_id, v_numero;
end;
$$;

grant execute on function public.emitir_proposta(uuid, uuid, jsonb, jsonb, jsonb, text, text)
  to authenticated;

comment on table public.propostas is
  'Propostas de honorários geradas ao fim da análise. Conteúdo congelado na emissão; não consome cota de plano, porque é o documento que leva à emissão do laudo.';
