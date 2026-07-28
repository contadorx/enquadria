-- ============================================================================
-- Enquadria — Migration 0021 (conserto: status da assinatura é ENUM)
--
-- O QUE QUEBROU
--   A função negocio_escritorios() fazia `coalesce(a.status, 'gratis')` para
--   dizer "este escritório não tem assinatura nenhuma". Só que
--   `assinaturas.status` não é texto neste banco: é o enum status_assinatura.
--   O Postgres tenta então converter 'gratis' para o enum, não acha o rótulo, e
--   derruba a consulta inteira:
--
--     invalid input value for enum status_assinatura: "gratis"
--
--   Erro meu, e da classe que já apareceu nesta série: escrevi SQL supondo o
--   tipo da coluna em vez de perguntar ao banco.
--
-- O QUE ESTA MIGRATION FAZ
--   1) Descobre se `status` é enum e quais rótulos existem;
--   2) acrescenta os rótulos que a aba Negócio precisa e que faltarem
--      (vencida, cancelada) — sem apagar nem renomear nada;
--   3) recria negocio_escritorios() convertendo o status para texto ANTES do
--      coalesce, que é o conserto de fato;
--   4) recria negocio_snapshot() comparando por texto, pelo mesmo motivo.
--
-- Idempotente. Rodar depois da 0020.
-- ============================================================================


-- ============================================================================
-- PARTE 1 — os rótulos que faltam no enum
--
-- Se o SQL Editor reclamar de "ALTER TYPE ... cannot run inside a transaction
-- block", rode SÓ este bloco sozinho e depois o resto do arquivo.
-- ============================================================================
do $$
declare
  v_tipo   text;
  v_enum   boolean;
  v_labels text[];
  r        text;
begin
  select format_type(a.atttypid, a.atttypmod), t.typtype = 'e', t.typname
    into v_tipo, v_enum, v_tipo
    from pg_attribute a
    join pg_type t on t.oid = a.atttypid
   where a.attrelid = 'public.assinaturas'::regclass
     and a.attname = 'status' and a.attnum > 0 and not a.attisdropped;

  if v_tipo is null then
    raise exception '[0021] a tabela assinaturas não tem coluna status.';
  end if;

  if not coalesce(v_enum, false) then
    raise notice '[0021] assinaturas.status é % (não é enum) — nada a acrescentar.', v_tipo;
    return;
  end if;

  select array_agg(e.enumlabel::text order by e.enumsortorder)
    into v_labels
    from pg_enum e join pg_type t on t.oid = e.enumtypid
   where t.typname = v_tipo;

  raise notice '[0021] enum % tem hoje: %', v_tipo, array_to_string(v_labels, ', ');

  -- A aba Negócio precisa destes dois para marcar quem venceu e quem cancelou.
  -- Se você já usa outros nomes para a mesma ideia, NÃO rode este bloco:
  -- me mande a lista acima que eu ajusto o código aos seus rótulos.
  foreach r in array array['vencida', 'cancelada'] loop
    if not (v_labels @> array[r]) then
      execute format('alter type public.%I add value if not exists %L', v_tipo, r);
      raise notice '[0021] rótulo % acrescentado ao enum %.', r, v_tipo;
    end if;
  end loop;
end $$;


-- ============================================================================
-- PARTE 2 — negocio_escritorios() com o status convertido para texto
--
-- Mantém a descoberta dinâmica das colunas de data da 0020: os nomes variam
-- entre tabelas deste banco, e a função pergunta antes de escrever.
-- ============================================================================
do $$
declare
  c_tenant   text := coalesce(public.primeira_coluna('tenants',   array['criado_em','created_at','inserted_at']), 'null');
  c_analise  text := coalesce(public.primeira_coluna('analises',  array['criado_em','created_at','atualizado_em']), 'null');
  c_laudo    text := coalesce(public.primeira_coluna('laudos',    array['emitido_em','criado_em','created_at']), 'null');
  c_perfil   text := coalesce(public.primeira_coluna('profiles',  array['email']), 'null');
  sql        text;
begin
  sql := format($f$
    create or replace function public.negocio_escritorios()
    returns table (
      id             uuid,
      nome           text,
      email          text,
      criado_em      timestamptz,
      plano_id       text,
      plano_nome     text,
      plano_ciclo    text,
      status         text,
      valor_centavos int,
      vencimento     date,
      assinatura_id  uuid,
      checkout_url   text,
      asaas_id       text,
      usuarios       bigint,
      empresas       bigint,
      faixa_a        bigint,
      analises       bigint,
      laudos         bigint,
      termos         bigint,
      assinados      bigint,
      ultima_analise timestamptz,
      ultimo_laudo   timestamptz
    )
    language plpgsql stable security definer set search_path = public as $body$
    begin
      if not public.e_superadmin() then
        raise exception 'acesso restrito ao dono da plataforma';
      end if;

      return query
      select
        t.id,
        t.nome,
        (select p.%2$s from public.profiles p where p.tenant_id = t.id order by p.%2$s limit 1),
        %1$s,
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
        (select count(*) from public.profiles      x where x.tenant_id = t.id),
        (select count(*) from public.empresas      x where x.tenant_id = t.id),
        (select count(*) from public.empresas      x where x.tenant_id = t.id and x.faixa::text = 'A'),
        (select count(*) from public.analises      x where x.tenant_id = t.id),
        (select count(*) from public.laudos        x where x.tenant_id = t.id),
        (select count(*) from public.termos        m join public.analises n2 on n2.id = m.analise_id where n2.tenant_id = t.id),
        (select count(*) from public.termos        m join public.analises n2 on n2.id = m.analise_id where n2.tenant_id = t.id and m.assinado_em is not null),
        %3$s,
        %4$s
      from public.tenants t
      left join lateral (
        select x.* from public.assinaturas x
         where x.tenant_id = t.id
         order by (x.status::text = 'ativa') desc, coalesce(x.vencimento, x.valido_ate) desc nulls last
         limit 1
      ) a on true
      left join public.planos pl on pl.id = a.plano_id
      order by %1$s desc nulls last;
    end;
    $body$;
  $f$,
    case when c_tenant  = 'null' then 'null::timestamptz' else 't.' || quote_ident(c_tenant) end,
    case when c_perfil  = 'null' then 'null::text'        else quote_ident(c_perfil) end,
    case when c_analise = 'null' then 'null::timestamptz'
         else format('(select max(n3.%I) from public.analises n3 where n3.tenant_id = t.id)', c_analise) end,
    case when c_laudo   = 'null' then 'null::timestamptz'
         else format('(select max(l3.%I) from public.laudos l3 where l3.tenant_id = t.id)', c_laudo) end
  );

  execute sql;
  raise notice '[0021] negocio_escritorios() recriada com status::text.';
end $$;

grant execute on function public.negocio_escritorios() to authenticated;


-- ============================================================================
-- PARTE 3 — negocio_snapshot() comparando status por texto
-- ============================================================================
drop function if exists public.negocio_snapshot();
create or replace function public.negocio_snapshot()
returns table (snap_mes date, snap_mrr bigint, snap_assinantes int, snap_gratuitos int)
language plpgsql security definer set search_path = public as $$
declare
  v_mes    date := date_trunc('month', now())::date;
  v_mrr    bigint;
  v_ass    int;
  v_gratis int;
  v_novos  int;
begin
  if auth.uid() is not null and not public.e_superadmin() then
    raise exception 'acesso restrito ao dono da plataforma';
  end if;

  select
    coalesce(sum(
      case pl.ciclo
        when 'anual'  then coalesce(a.valor_centavos, pl.preco_centavos) / 12
        when 'mensal' then coalesce(a.valor_centavos, pl.preco_centavos)
        else 0
      end
    ), 0),
    count(*)
  into v_mrr, v_ass
  from public.assinaturas a
  join public.planos pl on pl.id = a.plano_id
  where a.status::text = 'ativa'
    and coalesce(a.vencimento, a.valido_ate, current_date) >= current_date;

  select count(*) into v_gratis
    from public.tenants t
   where not exists (
     select 1 from public.assinaturas a
      where a.tenant_id = t.id and a.status::text = 'ativa'
        and coalesce(a.vencimento, a.valido_ate, current_date) >= current_date
   );

  select coalesce(count(*), 0) into v_novos
    from public.assinaturas a
   where a.status::text = 'ativa' and a.pago_em >= v_mes;

  insert into public.plataforma_mrr (mes, mrr_centavos, assinantes, gratuitos, novos, capturado_em)
  values (v_mes, coalesce(v_mrr,0), coalesce(v_ass,0), coalesce(v_gratis,0), coalesce(v_novos,0), now())
  on conflict (mes) do update set
    mrr_centavos = excluded.mrr_centavos,
    assinantes   = excluded.assinantes,
    gratuitos    = excluded.gratuitos,
    novos        = excluded.novos,
    capturado_em = now();

  return query select v_mes, coalesce(v_mrr,0)::bigint, coalesce(v_ass,0), coalesce(v_gratis,0);
end;
$$;

grant execute on function public.negocio_snapshot() to authenticated;


-- ============================================================================
-- CONFERÊNCIA
--
-- NÃO dá para testar negocio_escritorios() aqui no SQL Editor: a função exige
-- superadmin, e o editor roda sem sessão de usuário (auth.uid() é nulo). Ela
-- responderia "acesso restrito" — o que é o comportamento certo, não uma falha.
-- Manter essa guarda é o que impede um pedido anônimo de ler todos os
-- escritórios de uma vez.
--
-- O teste de verdade é abrir SEU-APP/painel/negocio depois de rodar isto.
--
-- O que dá para conferir aqui, sem sessão:
-- ============================================================================
select
  (select count(*) from public.plataforma_reguas)   as reguas,
  (select count(*) from public.plataforma_recursos) as recursos,
  (select count(*) from public.planos where ciclo is not null) as planos_com_ciclo,
  (select string_agg(e.enumlabel::text, ', ' order by e.enumsortorder)
     from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'status_assinatura')          as rotulos_do_status;
