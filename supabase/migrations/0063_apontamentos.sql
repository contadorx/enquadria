-- ===========================================================================
-- 0063 — APONTAMENTOS: o radar ganha memória
-- ===========================================================================
--
-- O DEFEITO QUE ISTO CORRIGE, e ele é de natureza, não de tamanho.
--
-- Até aqui o radar CALCULAVA quem é atingido por uma norma toda vez que a tela
-- abria — `atingidas()` roda em memória, mostra o número e joga fora. Funciona
-- como aviso e falha como monitor, por quatro razões:
--
--   1. NÃO HÁ HISTÓRICO. Ninguém consegue dizer "esta empresa foi atingida por
--      sete normas desde 2026" — que é exatamente o relatório que o contador
--      entrega ao cliente para justificar o honorário do ano.
--
--   2. NÃO HÁ ESTADO. O contador não marca "analisei e não se aplica" nem
--      "avisei o cliente". Toda visita mostra tudo como pendente de novo, e
--      lista que nunca diminui é lista que se para de ler.
--
--   3. NÃO EXISTE "O QUE MUDOU DESDE A ÚLTIMA VEZ" — a única pergunta que traz
--      o contador de volta ao produto fora da janela de setembro.
--
--   4. O PASSADO SE REESCREVE. Corrigir hoje o CNAE de uma empresa a remove da
--      lista de atingidas por uma norma de março. Num produto que vende PROVA,
--      é o defeito mais grave dos quatro: o registro de ontem muda porque o
--      cadastro de hoje mudou.
--
-- A tabela abaixo resolve os quatro guardando o CASAMENTO, não recalculando-o.
--
-- ---------------------------------------------------------------------------
-- POR QUE `criterio_no_momento` É UMA COLUNA E NÃO UMA JUNÇÃO
--
-- O apontamento congela o critério que o gerou. Se a matéria for corrigida
-- depois — e ela será, porque norma se retifica —, o apontamento continua
-- dizendo por que ELE nasceu. Sem isso, "por que esta empresa foi apontada?"
-- passaria a ser respondido pela versão de hoje da regra, e não pela que valia.
-- É o mesmo princípio do snapshot do laudo.
--
-- ---------------------------------------------------------------------------
-- O QUE ESTA TABELA NÃO FAZ: não apaga. Empresa que deixa de casar com o
-- critério (mudou de anexo, saiu do Simples) NÃO tem o apontamento removido —
-- ganha o estado `superado`. Apagar seria reescrever o passado pela porta dos
-- fundos, que é o defeito nº 4 voltando com outro nome.
--
-- Idempotente.
-- ===========================================================================

create table if not exists public.apontamentos (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  item_id       uuid not null references public.radar_itens(id) on delete cascade,
  empresa_id    uuid not null references public.empresas(id) on delete cascade,

  -- novo · tratado · nao_se_aplica · virou_servico · superado
  status        text not null default 'novo',
  nota          text,

  -- por que este apontamento nasceu, congelado (ver o comentário acima)
  criterio_no_momento jsonb,

  criado_em     timestamptz not null default now(),
  tratado_em    timestamptz,
  tratado_por   uuid references auth.users(id) on delete set null
);

-- UM apontamento por (matéria, empresa). A geração roda todo dia; sem esta
-- restrição, o monitor diário criaria uma linha por dia para o mesmo fato.
create unique index if not exists apontamentos_unico
  on public.apontamentos (item_id, empresa_id);

-- a consulta do cockpit: "quantos apontamentos abertos por empresa"
create index if not exists apontamentos_por_empresa
  on public.apontamentos (tenant_id, empresa_id, status);

-- a consulta do feed: "quem esta matéria atingiu"
create index if not exists apontamentos_por_item
  on public.apontamentos (tenant_id, item_id, status);

-- "o que apareceu desde a sua última visita"
create index if not exists apontamentos_recentes
  on public.apontamentos (tenant_id, criado_em desc);

alter table public.apontamentos enable row level security;

-- A CARTEIRA É DO ESCRITÓRIO. Mesma regra de todas as tabelas de dado do
-- cliente: ninguém enxerga apontamento de outro tenant, e a regra vive no
-- banco — não numa condição de tela que um dia alguém esquece.
drop policy if exists apontamentos_do_tenant on public.apontamentos;
create policy apontamentos_do_tenant on public.apontamentos
  for all
  using (
    tenant_id in (select p.tenant_id from public.profiles p where p.id = auth.uid())
  )
  with check (
    tenant_id in (select p.tenant_id from public.profiles p where p.id = auth.uid())
  );

comment on table public.apontamentos is
  'O casamento entre uma matéria do radar e uma empresa da carteira, GUARDADO. '
  'O radar avisa; o apontamento lembra.';

comment on column public.apontamentos.status is
  'novo · tratado · nao_se_aplica · virou_servico · superado. '
  '`superado` é o que deixou de casar com o critério — nunca se apaga.';

comment on column public.apontamentos.criterio_no_momento is
  'O critério congelado na geração. Norma se retifica; a razão de um '
  'apontamento nascido em março não pode passar a ser a regra de hoje.';
