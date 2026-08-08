-- ===========================================================================
-- 0064 — MUDANÇAS DE CADASTRO: a carteira para de envelhecer em silêncio
-- ===========================================================================
--
-- A carteira é consultada na base da Receita UMA VEZ, na importação. Depois
-- disso a empresa pode ser baixada, trocar de CNAE, virar MEI ou sair do
-- Simples — e o produto segue recomendando sobre uma foto de meses atrás, com
-- a mesma confiança de quando a foto era de hoje.
--
-- O contador não tem como perceber sozinho: ninguém acompanha a situação
-- cadastral de duzentos clientes. E o custo de não perceber não é técnico — é
-- ele recomendando decisão de setembro para uma empresa que foi baixada em
-- julho, na frente do cliente.
--
-- ---------------------------------------------------------------------------
-- POR QUE UMA TABELA SEPARADA DE `apontamentos`
--
-- São fatos de naturezas diferentes e confundi-los custaria caro:
--
--   apontamento         → uma NORMA atinge esta empresa      (o mundo mudou)
--   mudança de cadastro → o CADASTRO desta empresa mudou     (a empresa mudou)
--
-- O primeiro se resolve lendo e decidindo; o segundo se resolve ATUALIZANDO um
-- dado — e pode invalidar a triagem e a análise já salvas. Misturar os dois
-- numa lista só faria o contador tratar "leia esta resolução" e "seu cliente
-- foi baixado" com o mesmo gesto.
--
-- ---------------------------------------------------------------------------
-- O QUE ESTA TABELA NÃO FAZ: não altera a empresa. A detecção é automática, a
-- APLICAÇÃO é do contador — um clique, com o antes e o depois na tela.
--
-- A razão é a mesma que impede o recálculo automático das análises antigas:
-- atualizar o CNAE muda a faixa, a faixa muda a fila, e a fila pode mudar a
-- decisão de uma empresa que já tem laudo assinado. Dado que se corrige sozinho
-- por trás de quem assina é pior que dado velho, porque dado velho pelo menos
-- se denuncia.
--
-- Idempotente.
-- ===========================================================================

-- quando esta empresa foi conferida pela última vez contra a base
alter table public.empresas
  add column if not exists cadastro_conferido_em timestamptz;

comment on column public.empresas.cadastro_conferido_em is
  'Última conferência do cadastro contra a base da Receita. Ordena a fila da '
  'varredura: quem foi conferido há mais tempo vai primeiro, e quem nunca foi, '
  'antes de todos.';

create table if not exists public.mudancas_cadastro (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  empresa_id    uuid not null references public.empresas(id) on delete cascade,

  campo         text not null,   -- situacao · cnae_principal · porte · regime
  valor_antigo  text,
  valor_novo    text not null,
  muda_triagem  boolean not null default false,
  texto         text not null,

  -- nova · aplicada · ignorada
  status        text not null default 'nova',

  detectado_em  timestamptz not null default now(),
  decidido_em   timestamptz,
  decidido_por  uuid references auth.users(id) on delete set null
);

-- a mesma mudança não pode ser detectada duas vezes enquanto ninguém decidir.
-- Sem isto, a varredura de amanhã recriaria a de hoje — todo dia, para sempre,
-- porque o cadastro continua diferente até alguém aplicar.
create unique index if not exists mudancas_cadastro_pendente_unica
  on public.mudancas_cadastro (empresa_id, campo, valor_novo)
  where status = 'nova';

create index if not exists mudancas_cadastro_por_empresa
  on public.mudancas_cadastro (tenant_id, empresa_id, status);

create index if not exists mudancas_cadastro_recentes
  on public.mudancas_cadastro (tenant_id, detectado_em desc);

alter table public.mudancas_cadastro enable row level security;

drop policy if exists mudancas_do_tenant on public.mudancas_cadastro;
create policy mudancas_do_tenant on public.mudancas_cadastro
  for all
  using (
    tenant_id in (select p.tenant_id from public.profiles p where p.id = auth.uid())
  )
  with check (
    tenant_id in (select p.tenant_id from public.profiles p where p.id = auth.uid())
  );

comment on table public.mudancas_cadastro is
  'O que mudou na base da Receita depois da importação. Detectado pela '
  'varredura; aplicado pelo contador, nunca sozinho.';
