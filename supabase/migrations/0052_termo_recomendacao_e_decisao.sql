-- ===========================================================================
-- 0052 — O TERMO PASSA A REGISTRAR A RECOMENDAÇÃO, NÃO SÓ A DECISÃO
-- ===========================================================================
--
-- O termo dizia "Decisão: Permanecer no regime tradicional" e mais nada. Ou
-- seja: o caso em que o contador recomendou permanecer e todos concordaram
-- produzia EXATAMENTE o mesmo documento que o caso em que ele recomendou optar
-- e o empresário decidiu o contrário.
--
-- A divergência ciente é a única coisa que um termo de ciência precisa
-- capturar — e era justamente a que não aparecia. No "você não me avisou", seis
-- meses depois, aquele papel não ajudava nem o contador (não prova que
-- recomendou) nem o empresário (não prova que decidiu informado).
--
-- ---------------------------------------------------------------------------
-- TRÊS ESTADOS, e o terceiro é o que mais faltava.
--
--   seguir   · a decisão é a recomendada. O caso comum.
--   divergir · a decisão é a outra. O motivo é OBRIGATÓRIO, e é do empresário.
--   adiar    · não decidir nesta janela. É o mais comum e o que menos deixava
--              rastro: quem não opta por omissão fica no tradicional, e nada
--              distinguia "decidi ficar" de "esqueci".
--
-- `adiar` resolve para `decisao = 'permanecer'`, porque é o que a lei faz com
-- quem não opta. Mas o TIPO fica gravado: no papel os dois produzem o mesmo
-- regime; na conversa de março, não produzem a mesma conversa.
-- ===========================================================================

alter table public.termos
  add column if not exists tipo_decisao text,
  add column if not exists motivo_divergencia text,
  /* a recomendação CONGELADA no momento da assinatura — não recalculada.
     Se o motor mudar depois, o termo continua dizendo o que foi recomendado
     naquele dia, que é a única coisa que ele pode afirmar com honestidade. */
  add column if not exists recomendacao text,
  add column if not exists recomendacao_saida text;

comment on column public.termos.tipo_decisao is
  'seguir | divergir | adiar. Distingue "decidi ficar" de "decidi não decidir agora" — no papel dão o mesmo regime, na conversa de março não dão a mesma conversa.';
comment on column public.termos.motivo_divergencia is
  'Escrito pelo EMPRESÁRIO quando decide diferente do recomendado. Obrigatório nesse caso. Se o contador escrever no lugar dele, é o contador caracterizando a razão do cliente — e é essa frase que se contesta depois.';
comment on column public.termos.recomendacao is
  'optar | permanecer, congelado na emissão. Não recalcular: o termo afirma o que foi recomendado NAQUELE dia.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'termos_tipo_decisao_check') then
    alter table public.termos add constraint termos_tipo_decisao_check
      check (tipo_decisao is null or tipo_decisao in ('seguir', 'divergir', 'adiar'));
  end if;
end $$;

/**
 * A TRAVA NO BANCO, e não só na tela.
 *
 * "Decidiu diferente do recomendado" sem o motivo é PIOR que o termo antigo:
 * documenta o conflito e não documenta a razão, que é a única coisa capaz de
 * explicá-lo depois. A tela já exige; o banco exige também, porque a tela é uma
 * das portas e a API é outra.
 *
 * `length >= 15` e não `<> ''`: um ponto final não é motivo.
 */
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'termos_divergencia_exige_motivo') then
    alter table public.termos add constraint termos_divergencia_exige_motivo
      check (
        tipo_decisao is distinct from 'divergir'
        or (motivo_divergencia is not null and length(btrim(motivo_divergencia)) >= 15)
      );
  end if;
end $$;

create index if not exists termos_tipo_decisao on public.termos (tipo_decisao)
  where tipo_decisao is not null;

-- ═══════════════════════════════════════════════════════════════════════════
-- QUEM DECIDIU CONTRA A RECOMENDAÇÃO — a lista que o contador precisa ver
--
-- Não é vigilância do cliente: é a fila de acompanhamento. Empresa que decidiu
-- diferente do recomendado é a que mais precisa de conversa em março, e a que
-- mais rápido some da memória — justamente porque a reunião dela terminou com
-- um "não" e ninguém agenda retorno de "não".
-- ═══════════════════════════════════════════════════════════════════════════
drop function if exists public.termos_divergentes(uuid);

create function public.termos_divergentes(p_tenant uuid default null)
returns table (
  termo_id uuid,
  analise_id uuid,
  empresa text,
  cnpj text,
  recomendacao text,
  decisao text,
  tipo_decisao text,
  motivo_divergencia text,
  assinado_em timestamptz,
  criado_em timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  alvo uuid;
begin
  /* superadmin vê tudo (ou o tenant pedido); contador vê só o dele. A trava é
     do servidor: `auth.uid()` não é enviável pelo cliente. */
  if public.e_superadmin() then
    alvo := p_tenant;
  else
    select p.tenant_id into alvo from public.profiles p where p.id = auth.uid();
    if alvo is null then
      raise exception 'sem workspace';
    end if;
  end if;

  return query
  select
    m.id, m.analise_id, e.razao_social, e.cnpj,
    m.recomendacao, m.decisao::text, m.tipo_decisao, m.motivo_divergencia,
    m.assinado_em, m.criado_em
  from public.termos m
  join public.analises a on a.id = m.analise_id
  left join public.empresas e on e.id = a.empresa_id
  where m.tipo_decisao in ('divergir', 'adiar')
    and (alvo is null or a.tenant_id = alvo)
  order by m.criado_em desc;
end;
$function$;

revoke all on function public.termos_divergentes(uuid) from public;
grant execute on function public.termos_divergentes(uuid) to authenticated;

comment on function public.termos_divergentes(uuid) is
  'Termos em que a empresa decidiu diferente do recomendado ou adiou. É a fila de acompanhamento de março — a que mais rápido some da memória, porque a reunião terminou com um "não".';
