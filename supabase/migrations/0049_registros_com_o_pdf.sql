-- ===========================================================================
-- 0049 — O QUE O PDF DIZ, O QUE O MOTOR DIRIA, E QUEM CALCULOU
-- ===========================================================================
--
-- A tela de Registros comparava DUAS coisas: a saída gravada na análise e a
-- que o motor de hoje daria. Faltava a terceira, e ela é a única que o cliente
-- tem na mão: a saída que está dentro do PDF EMITIDO.
--
-- Por que as três podem discordar:
--
--   · a análise pode ter sido REVISADA depois do laudo (o contador mexeu numa
--     premissa e recalculou) — aí gravada ≠ PDF, e ninguém precisa de motor
--     novo para isso acontecer;
--   · o motor pode ter mudado — aí gravada ≠ hoje;
--   · as duas coisas juntas, que é o caso perigoso e o que ninguém enxerga.
--
-- O snapshot do laudo já guarda a análise inteira em `laudos.snapshot`. Esta
-- migration só passa a DEVOLVÊ-LO na leitura, para a tela poder mostrar as três
-- colunas lado a lado em vez de duas.
--
-- ---------------------------------------------------------------------------
-- E as contas de TESTE saem da conta. Uma conta marcada como teste é onde a
-- gente quebra coisas de propósito; contar as análises dela na deriva do motor
-- é encher o alarme de ruído que a própria casa produziu — e alarme com ruído
-- é alarme que ninguém lê. Elas continuam vindo, marcadas, para a tela poder
-- mostrá-las à parte.
-- ===========================================================================

drop function if exists public.plataforma_analises_cruas();

create function public.plataforma_analises_cruas()
returns table (
  id uuid,
  tenant_id uuid,
  tenant_nome text,
  tenant_teste boolean,
  empresa_id uuid,
  empresa_nome text,
  calculado_em timestamptz,
  saida text,
  rq numeric, ch numeric, cl numeric, re numeric, fc numeric,
  respostas jsonb,
  parametros jsonb,
  tem_laudo boolean,
  laudo_numero integer,
  laudo_emitido_em timestamptz,
  termo_assinado boolean,
  -- ── o que está DENTRO do PDF emitido ─────────────────────────────────────
  pdf_saida text,
  pdf_re numeric,
  pdf_fc numeric,
  pdf_motor text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.e_plataforma() then
    raise exception 'acesso restrito ao dono da plataforma';
  end if;

  return query
  select
    a.id, a.tenant_id, t.nome, coalesce(t.is_teste, false),
    a.empresa_id, e.razao_social, a.calculado_em,
    /* a ORDEM tem de bater com `returns table` — rq, ch, cl, re, fc.
       Uma versão anterior trocou `re` e `cl` de lugar: o Postgres aceita (os
       dois são numeric) e a tela inteira leria repasse onde há custo líquido,
       sem erro em lugar nenhum. */
    a.saida::text, a.rq, a.ch, a.cl, a.re, a.fc,
    a.respostas, a.parametros,
    l.id is not null, l.numero, l.emitido_em,
    exists (select 1 from public.termos m where m.analise_id = a.id and m.assinado_em is not null),
    /* o snapshot é jsonb e pode ser de qualquer época — daí os `->>` defensivos
       em vez de um cast que derrubaria a consulta inteira por causa de uma
       linha antiga */
    l.snapshot->'analise'->>'saida',
    nullif(l.snapshot->'analise'->>'re', '')::numeric,
    nullif(l.snapshot->'analise'->>'fc', '')::numeric,
    l.snapshot->'analise'->'parametros'->>'motor'
  from public.analises a
  left join public.tenants t on t.id = a.tenant_id
  left join public.empresas e on e.id = a.empresa_id
  left join lateral (
    select x.id, x.numero, x.emitido_em, x.snapshot from public.laudos x
     where x.analise_id = a.id order by x.emitido_em desc limit 1
  ) l on true
  order by a.calculado_em desc nulls last;
end;
$function$;

revoke all on function public.plataforma_analises_cruas() from public;
grant execute on function public.plataforma_analises_cruas() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- O RETRATO DE CADA CONTA ganha os laudos ASSINADOS
--
-- "30 laudos" e "30 laudos com termo assinado" são negócios diferentes: o
-- primeiro é produção, o segundo é decisão fechada. Contar só o primeiro faz o
-- painel parecer melhor do que está.
-- ═══════════════════════════════════════════════════════════════════════════
drop function if exists public.plataforma_registros();

create function public.plataforma_registros()
returns table (
  tenant_id uuid,
  nome text,
  criado_em timestamptz,
  is_teste boolean,
  usuarios bigint,
  empresas bigint,
  empresas_faixa_a bigint,
  analises bigint,
  laudos bigint,
  laudos_assinados bigint,
  termos bigint,
  termos_assinados bigint,
  coletas bigint,
  s1 bigint, s2 bigint, s3 bigint, s4 bigint, s5 bigint,
  primeira_analise timestamptz,
  ultima_analise timestamptz,
  ultimo_laudo timestamptz,
  sem_laudo bigint
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.e_plataforma() then
    raise exception 'acesso restrito ao dono da plataforma';
  end if;

  return query
  select
    t.id, t.nome, t.criado_em, coalesce(t.is_teste, false),
    (select count(*) from public.profiles x where x.tenant_id = t.id),
    (select count(*) from public.empresas x where x.tenant_id = t.id),
    (select count(*) from public.empresas x where x.tenant_id = t.id and x.faixa::text = 'A'),
    (select count(*) from public.analises x where x.tenant_id = t.id),
    (select count(*) from public.laudos x where x.tenant_id = t.id),
    /* LAUDO ASSINADO = laudo cujo termo foi assinado. É a decisão fechada, e é
       o número que conta como serviço entregue de verdade. */
    (select count(*) from public.laudos x
      where x.tenant_id = t.id
        and exists (select 1 from public.termos m
                     where m.analise_id = x.analise_id and m.assinado_em is not null)),
    (select count(*) from public.termos m join public.analises n on n.id = m.analise_id where n.tenant_id = t.id),
    (select count(*) from public.termos m join public.analises n on n.id = m.analise_id where n.tenant_id = t.id and m.assinado_em is not null),
    (select count(*) from public.coletas x where x.tenant_id = t.id),
    (select count(*) from public.analises x where x.tenant_id = t.id and x.saida = 'S1'),
    (select count(*) from public.analises x where x.tenant_id = t.id and x.saida = 'S2'),
    (select count(*) from public.analises x where x.tenant_id = t.id and x.saida = 'S3'),
    (select count(*) from public.analises x where x.tenant_id = t.id and x.saida = 'S4'),
    (select count(*) from public.analises x where x.tenant_id = t.id and x.saida = 'S5'),
    (select min(x.calculado_em) from public.analises x where x.tenant_id = t.id),
    (select max(x.calculado_em) from public.analises x where x.tenant_id = t.id),
    (select max(x.emitido_em) from public.laudos x where x.tenant_id = t.id),
    (select count(*) from public.analises x
      where x.tenant_id = t.id
        and not exists (select 1 from public.laudos l where l.analise_id = x.id))
  from public.tenants t
  order by t.criado_em desc nulls last;
end;
$function$;

revoke all on function public.plataforma_registros() from public;
grant execute on function public.plataforma_registros() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- A CONTA DO CLIENTE também mostra o que está dentro do PDF
--
-- Mesma razão da função acima: a tela por conta comparava a saída gravada com a
-- que o motor daria hoje, e ficava calada sobre a única que o cliente tem na
-- mão. Três colunas ou nenhuma — duas escondem justamente o caso em que a
-- análise foi revisada depois do laudo.
-- ═══════════════════════════════════════════════════════════════════════════
drop function if exists public.plataforma_conta(uuid);

create function public.plataforma_conta(p_tenant uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  resultado jsonb;
begin
  if not public.e_plataforma() then
    raise exception 'acesso restrito ao dono da plataforma';
  end if;

  insert into public.acessos_plataforma (quem, quem_email, tenant_id, acao, detalhe)
  values (auth.uid(),
          (select p.email from public.profiles p where p.id = auth.uid()),
          p_tenant, 'conta', null);

  select jsonb_build_object(
    'tenant', (select to_jsonb(x) from (
        select t.id, t.nome, t.criado_em, t.crc, t.status, t.is_teste
        from public.tenants t where t.id = p_tenant) x),
    'usuarios', coalesce((select jsonb_agg(to_jsonb(x)) from (
        select p.id, p.email, p.nome, p.role, p.is_superadmin, p.criado_em
        from public.profiles p where p.tenant_id = p_tenant order by p.criado_em) x), '[]'::jsonb),
    'empresas', coalesce((select jsonb_agg(to_jsonb(x)) from (
        select e.id, e.razao_social, e.cnpj, e.anexo, e.faixa, e.rbt12, e.regime, e.criado_em,
               (select count(*) from public.analises a where a.empresa_id = e.id) as analises
        from public.empresas e where e.tenant_id = p_tenant
        order by e.criado_em desc limit 300) x), '[]'::jsonb),
    'analises', coalesce((select jsonb_agg(to_jsonb(x)) from (
        select a.id, a.empresa_id, a.saida, a.rq, a.ch, a.cl, a.re, a.fc, a.calculado_em,
               a.respostas, a.parametros,
               (select e.razao_social from public.empresas e where e.id = a.empresa_id) as empresa,
               l.id is not null as tem_laudo,
               l.numero as laudo_numero,
               l.snapshot->'analise'->>'saida' as pdf_saida,
               l.snapshot->'analise'->'parametros'->>'motor' as pdf_motor,
               exists(select 1 from public.termos m
                       where m.analise_id = a.id and m.assinado_em is not null) as termo_assinado
        from public.analises a
        left join lateral (
          select x2.id, x2.numero, x2.snapshot from public.laudos x2
           where x2.analise_id = a.id order by x2.emitido_em desc limit 1
        ) l on true
        where a.tenant_id = p_tenant
        order by a.calculado_em desc limit 300) x), '[]'::jsonb),
    'laudos', coalesce((select jsonb_agg(to_jsonb(x)) from (
        select l.id, l.numero, l.emitido_em, l.analise_id,
               exists(select 1 from public.termos m
                       where m.analise_id = l.analise_id and m.assinado_em is not null) as assinado
        from public.laudos l where l.tenant_id = p_tenant
        order by l.emitido_em desc limit 300) x), '[]'::jsonb)
  ) into resultado;

  return resultado;
end;
$function$;

revoke all on function public.plataforma_conta(uuid) from public;
grant execute on function public.plataforma_conta(uuid) to authenticated;
