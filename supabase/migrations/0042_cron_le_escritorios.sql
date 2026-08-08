-- ===========================================================================
-- 0042 — O CRON NÃO CONSEGUIA LER A BASE DE ESCRITÓRIOS
-- ===========================================================================
--
-- O SINTOMA, e por que ele enganou por dias:
--
--   Negócio → E-mails mostrava 16 "próximos disparos".
--   O motor rodava e devolvia: {"reguas":{"planejados":0,...},"erros":[]}
--
-- Zero planejados, zero erros. A leitura óbvia é "não havia nada a mandar" —
-- e ela estava errada.
--
-- ---------------------------------------------------------------------------
-- A CAUSA.
--
-- `negocio_escritorios()` é SECURITY DEFINER e começa assim:
--
--     if not public.e_superadmin() then
--       raise exception 'acesso restrito ao dono da plataforma';
--
-- E `e_superadmin()` é `select coalesce((select is_superadmin from profiles
-- where id = auth.uid()), false)`.
--
-- O CRON não tem sessão de usuário: ele usa a service role. Para ela,
-- `auth.uid()` é NULL, não existe linha em `profiles`, o `coalesce` devolve
-- FALSE — e a função levanta a exceção. Conferido no banco de produção:
--
--     set local role service_role;
--     select public.e_superadmin();   ->  false
--
-- Ou seja: a única chamada que precisa passar sem usuário é justamente a que
-- é barrada. E o painel funcionava porque ali quem chama é a SESSÃO do
-- superadmin — a mesma função, dois resultados opostos.
--
-- (Do lado da aplicação, o erro ainda era descartado: `carregarContexto`
-- desestruturava só o `data`. Sem escritórios, `planejar()` devolve lista
-- vazia, e "0 planejados" é indistinguível de "nada a fazer". Isso está
-- corrigido em lib/reguas.ts, que agora propaga a falha.)
--
-- ---------------------------------------------------------------------------
-- A CORREÇÃO, e por que ela NÃO afrouxa nada.
--
-- A service role já ignora RLS por definição: ela lê `tenants`, `profiles` e
-- `assinaturas` diretamente, sem passar por aqui. Barrá-la nesta função não
-- protegia dado nenhum — só quebrava o cron. O que a guarda existe para
-- impedir é um USUÁRIO comum ler a base inteira de escritórios, e isso
-- continua valendo.
--
-- O sinal usado é o claim `role` do JWT, que o PostgREST publica em
-- `request.jwt.claims`. Não dá para usar `current_user`: dentro de uma função
-- SECURITY DEFINER ele é o DONO da função, não quem chamou — checar por ali
-- daria "postgres" para todo mundo e liberaria geral.
--
-- Idempotente.
-- ===========================================================================

create or replace function public.e_plataforma()
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare
  papel text;
begin
  -- 1) dono da plataforma logado na aplicação
  if coalesce((select p.is_superadmin from public.profiles p where p.id = auth.uid()), false) then
    return true;
  end if;

  -- 2) o servidor, agindo sem usuário (cron, webhook, rotinas internas)
  papel := nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role';
  return coalesce(papel, '') = 'service_role';

exception when others then
  -- ---------------------------------------------------------------------
  -- GUARDA QUE EXPLODE NÃO É GUARDA.
  --
  -- `auth.uid()` faz o parse de `request.jwt.claims` como JSON; um claim
  -- malformado levanta 22P02 e derruba a chamada inteira. Verificado num
  -- Postgres 16: sem este bloco, `request.jwt.claims = 'isto nao e json'`
  -- rebenta em vez de responder.
  --
  -- Erro numa checagem de permissão tem que virar NEGATIVA, nunca exceção —
  -- e nunca liberação. É a mesma lição que originou esta migration: uma
  -- falha silenciosa no caminho de autorização custou dias.
  -- ---------------------------------------------------------------------
  return false;
end;
$fn$;

comment on function public.e_plataforma() is
  'Dono da plataforma OU a service role. A service role já ignora RLS; barrá-la nas RPC de negócio só quebrava o cron. Ver 0042.';

-- ---------------------------------------------------------------------------
-- As duas RPC de plataforma passam a usar a guarda nova. O corpo continua
-- idêntico: muda só quem tem direito de chamar.
-- ---------------------------------------------------------------------------

create or replace function public.negocio_escritorios()
returns table(
  id uuid, nome text, email text, criado_em timestamptz,
  plano_id text, plano_nome text, plano_ciclo text, status text,
  valor_centavos integer, vencimento date, assinatura_id uuid,
  checkout_url text, asaas_id text,
  usuarios bigint, empresas bigint, faixa_a bigint, analises bigint,
  laudos bigint, termos bigint, assinados bigint,
  ultima_analise timestamptz, ultimo_laudo timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
begin
  if not public.e_plataforma() then
    raise exception 'acesso restrito ao dono da plataforma';
  end if;

  return query
  select
    t.id,
    t.nome,
    (select p.email from public.profiles p where p.tenant_id = t.id order by p.email limit 1),
    t.criado_em,
    a.plano_id,
    pl.nome,
    pl.ciclo,
    -- ::text ANTES do coalesce. Sem isso o Postgres tenta converter
    -- 'gratis' para o enum status_assinatura e derruba a consulta.
    coalesce(a.status::text, 'gratis'),
    a.valor_centavos,
    coalesce(a.vencimento, a.valido_ate),
    a.id,
    a.checkout_url,
    a.asaas_id,
    (select count(*) from public.profiles x where x.tenant_id = t.id),
    (select count(*) from public.empresas  x where x.tenant_id = t.id),
    (select count(*) from public.empresas  x where x.tenant_id = t.id and x.faixa::text = 'A'),
    (select count(*) from public.analises  x where x.tenant_id = t.id),
    (select count(*) from public.laudos    x where x.tenant_id = t.id),
    (select count(*) from public.termos m join public.analises n2 on n2.id = m.analise_id where n2.tenant_id = t.id),
    (select count(*) from public.termos m join public.analises n2 on n2.id = m.analise_id where n2.tenant_id = t.id and m.assinado_em is not null),
    (select max(n3.criado_em)  from public.analises n3 where n3.tenant_id = t.id),
    (select max(l3.emitido_em) from public.laudos   l3 where l3.tenant_id = t.id)
  from public.tenants t
  left join lateral (
    select x.* from public.assinaturas x
     where x.tenant_id = t.id
       -- assinatura cancelada não representa mais o escritório: com a regra de
       -- plano único (ver lib/assinatura.ts) elas passam a existir de verdade
       and x.status::text <> 'cancelada'
     order by (x.status::text = 'ativa') desc, coalesce(x.vencimento, x.valido_ate) desc nulls last
     limit 1
  ) a on true
  left join public.planos pl on pl.id = a.plano_id
  order by t.criado_em desc nulls last;
end;
$fn$;

-- o snapshot mensal roda no mesmo cron, e travava pelo mesmo motivo
do $ajuste$
declare
  corpo text;
begin
  select pg_get_functiondef(p.oid) into corpo
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'negocio_snapshot' and p.prokind = 'f'
   limit 1;

  if corpo is null then
    raise notice 'negocio_snapshot não existe neste banco — nada a ajustar';
  elsif corpo like '%e_plataforma()%' then
    raise notice 'negocio_snapshot já usa e_plataforma()';
  else
    execute replace(corpo, 'public.e_superadmin()', 'public.e_plataforma()');
    raise notice 'negocio_snapshot passou a usar e_plataforma()';
  end if;
end;
$ajuste$;
