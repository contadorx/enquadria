-- ===========================================================================
-- 0037 — ESTUDO DE ABERTURA: o serviço que sobrevive a 30 de setembro
-- ===========================================================================
--
-- POR QUE ESTA TABELA EXISTE.
--
-- A janela de opção fecha em 30/09/2026 e leva junto a pergunta que trouxe o
-- contador para o Enquadria. Se o produto não responder outra pergunta a
-- partir de 01/10, vira assinatura sem uso — e assinatura sem uso não renova,
-- por melhor que tenha sido setembro.
--
-- A pergunta seguinte não tem prazo: "em que regime esta empresa deve
-- nascer?". Chega ao escritório o ano inteiro, quase sempre de quem AINDA NÃO
-- É CLIENTE, e hoje é respondida de cabeça ou numa planilha refeita toda vez.
--
-- DUAS DIFERENÇAS EM RELAÇÃO A TUDO O QUE JÁ EXISTE AQUI, e as duas moldam
-- este schema:
--
--   1. NÃO HÁ EMPRESA. O estudo é feito para um negócio que não abriu: não tem
--      CNPJ, não está na carteira, não pode pendurar em `empresas`. Por isso o
--      nome do negócio é texto solto, e não uma FK.
--
--   2. O DESTINATÁRIO É UM PROSPECTO. É por isso que o documento tem token
--      público: o estudo é a peça que o contador manda ANTES de a relação
--      existir — é ele que ganha o cliente. Um documento numerado, com a marca
--      do escritório e verificação pública, é uma proposta comercial que
--      nenhum concorrente entrega em PDF de planilha.
--
-- O CONTEÚDO É CONGELADO NA EMISSÃO, como o laudo: entrada, premissas,
-- resultado e identidade do escritório vão para JSONB. O motor muda com a
-- Reforma — o documento entregue, não.
--
-- Idempotente.
-- ===========================================================================

create table if not exists public.aberturas (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  user_id       uuid,
  numero        int  not null,
  -- endereço público do estudo; UUID em texto, como laudo e comparativo
  token         text not null default gen_random_uuid()::text,

  -- o negócio que ainda não existe
  nome_negocio  text not null,
  -- quem pediu o estudo: o futuro sócio. Vira destinatário do envio.
  responsavel   text,
  email         text,

  -- congelados na emissão
  entrada       jsonb not null,
  premissas     jsonb not null,
  resultado     jsonb not null,
  escritorio    jsonb,

  emitido_em    timestamptz not null default now()
);

-- numeração por escritório: "estudo nº 0007" é do escritório, não global
create unique index if not exists aberturas_numero_idx on public.aberturas (tenant_id, numero);
create unique index if not exists aberturas_token_idx  on public.aberturas (token);
create index        if not exists aberturas_tenant_idx on public.aberturas (tenant_id, emitido_em desc);

-- ---------------------------------------------------------------------------
-- RLS: cada escritório enxerga os próprios estudos.
--
-- A página PÚBLICA do estudo não passa por aqui — ela lê pelo cliente de
-- serviço, com o token como autorização, exatamente como o laudo público.
-- ---------------------------------------------------------------------------
alter table public.aberturas enable row level security;

drop policy if exists aberturas_do_escritorio on public.aberturas;
create policy aberturas_do_escritorio on public.aberturas
  for all to authenticated
  using (tenant_id = (select p.tenant_id from public.profiles p where p.id = auth.uid()))
  with check (tenant_id = (select p.tenant_id from public.profiles p where p.id = auth.uid()));

-- ---------------------------------------------------------------------------
-- A EMISSÃO — numeração atômica.
--
-- Numerar com `max(numero)+1` lido pela aplicação produz dois estudos nº 7 no
-- dia em que duas pessoas do mesmo escritório clicarem juntas. Aqui a leitura
-- e a escrita acontecem na mesma transação, com lock consultivo por tenant:
-- duas emissões simultâneas se enfileiram em vez de colidir.
--
-- SECURITY DEFINER porque a função precisa ler `profiles` para descobrir o
-- tenant de quem chama; o `search_path` fixo é a proteção usual contra
-- sequestro de resolução de nomes.
-- ---------------------------------------------------------------------------
create or replace function public.emitir_abertura(
  p_nome        text,
  p_responsavel text,
  p_email       text,
  p_entrada     jsonb,
  p_premissas   jsonb,
  p_resultado   jsonb,
  p_escritorio  jsonb default null
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

  -- serializa por escritório: o lock cai no fim da transação
  perform pg_advisory_xact_lock(hashtext('abertura:' || v_tenant::text));

  select coalesce(max(a.numero), 0) + 1 into v_numero
    from public.aberturas a where a.tenant_id = v_tenant;

  insert into public.aberturas
    (tenant_id, user_id, numero, nome_negocio, responsavel, email,
     entrada, premissas, resultado, escritorio)
  values
    (v_tenant, auth.uid(), v_numero, coalesce(nullif(btrim(p_nome), ''), 'Novo negócio'),
     nullif(btrim(coalesce(p_responsavel, '')), ''), nullif(btrim(coalesce(p_email, '')), ''),
     p_entrada, p_premissas, p_resultado, p_escritorio)
  returning aberturas.id into v_id;

  return query select v_id, v_numero;
end;
$$;

grant execute on function public.emitir_abertura(text, text, text, jsonb, jsonb, jsonb, jsonb)
  to authenticated;

comment on table public.aberturas is
  'Estudos de abertura de empresa — o serviço perene, para negócios que ainda não têm CNPJ. Conteúdo congelado na emissão.';
