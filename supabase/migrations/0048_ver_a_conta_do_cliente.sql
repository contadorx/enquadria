-- ===========================================================================
-- 0048 — VER A CONTA DO CLIENTE, E SABER O QUE O MOTOR MUDOU
-- ===========================================================================
--
-- DUAS PERGUNTAS QUE O PAINEL NÃO SABIA RESPONDER, e a segunda é a mais cara.
--
-- 1. "O que exatamente tem dentro daquela conta?" Hoje o painel mostra MRR,
--    plano, último pagamento — e nada do TRABALHO. Se um contador escreve
--    dizendo que a análise dele está errada, não há como olhar sem pedir print.
--
-- 2. "Eu mexi no motor. O que isso fez com o que já estava salvo?"
--
-- A SEGUNDA MERECE O PARÁGRAFO INTEIRO, porque é um risco de produto.
--
-- As análises gravam NÚMEROS (rq, ch, cl, re, fc, saída) e os parâmetros
-- congelados. Esses números NÃO mudam quando o motor muda: ninguém reprocessa
-- nada. Os laudos emitidos guardam snapshot completo, e o documento entregue
-- continua o que era.
--
-- Mas a análise VIVA continua na tela do contador com a saída antiga, enquanto
-- o motor de hoje daria outra. Medido em 05/08/2026 sobre a base real: de 43
-- análises, 7 mudariam de saída se recalculadas — e 6 delas já têm laudo
-- emitido. Quatro sairiam de "não optar" para "zona de fronteira".
--
-- Isso não é bug: é o preço de corrigir o motor, e corrigir foi certo. O que
-- não pode é ser INVISÍVEL. Estas funções existem para o dono da plataforma
-- ver o estoque e decidir caso a caso — nunca para reprocessar em massa, que
-- reescreveria em silêncio recomendações que já foram entregues e assinadas.
--
-- ---------------------------------------------------------------------------
-- POR QUE LEITURA E NÃO "ENTRAR NA CONTA".
--
-- Assumir a identidade do usuário — trocar auth.uid(), emitir sessão em nome
-- dele — é a versão perigosa: passa a valer para ESCRITA, não deixa rastro
-- distinguível no banco e transforma qualquer erro do suporte em ação do
-- cliente. Aqui o dono da plataforma LÊ, por funções que checam
-- `e_plataforma()` no servidor, e cada leitura fica registrada em
-- `acessos_plataforma`. É menos poder e é a quantidade certa de poder.
-- ===========================================================================

-- ─────────────────────────────────────────────── a trilha, antes do acesso
create table if not exists public.acessos_plataforma (
  id uuid primary key default gen_random_uuid(),
  em timestamptz not null default now(),
  quem uuid references auth.users(id) on delete set null,
  quem_email text,
  tenant_id uuid,
  /* 'conta' = abriu a conta de um cliente · 'deriva' = rodou o comparativo */
  acao text not null,
  detalhe text
);

comment on table public.acessos_plataforma is
  'Trilha de quando o dono da plataforma leu dados de um cliente. Existe para que "eu só olhei" seja verificável.';

create index if not exists acessos_plataforma_em on public.acessos_plataforma (em desc);
create index if not exists acessos_plataforma_tenant on public.acessos_plataforma (tenant_id, em desc);

alter table public.acessos_plataforma enable row level security;

-- ninguém lê pelo cliente comum; a leitura é pela função abaixo
drop policy if exists acessos_plataforma_le on public.acessos_plataforma;
create policy acessos_plataforma_le on public.acessos_plataforma
  for select to authenticated using (public.e_plataforma());

-- ═══════════════════════════════════════════════════════════════════════════
-- 1 · O RETRATO DE CADA CONTA — o que existe lá dentro
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
  termos bigint,
  termos_assinados bigint,
  coletas bigint,
  s1 bigint, s2 bigint, s3 bigint, s4 bigint, s5 bigint,
  primeira_analise timestamptz,
  ultima_analise timestamptz,
  ultimo_laudo timestamptz,
  /* quantas análises ainda não viraram laudo — é a fila de trabalho parada */
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
-- 2 · A MATÉRIA-PRIMA DA DERIVA
--
-- Devolve o que o motor precisa para RECALCULAR — e não recalcula aqui.
--
-- Reimplementar a árvore de decisão em SQL criaria uma segunda verdade que
-- diverge da primeira na semana seguinte. Foi exatamente esse erro que
-- produziu a divergência entre Contas e Cobranças. A página chama `decidir()`,
-- o mesmo do produto, sobre estas linhas.
-- ═══════════════════════════════════════════════════════════════════════════
drop function if exists public.plataforma_analises_cruas();

create function public.plataforma_analises_cruas()
returns table (
  id uuid,
  tenant_id uuid,
  tenant_nome text,
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
  termo_assinado boolean
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
    a.id, a.tenant_id, t.nome, a.empresa_id, e.razao_social, a.calculado_em,
    /* a ORDEM tem de bater com `returns table` acima — rq, ch, cl, re, fc.
       A primeira versão trazia `a.re` antes de `a.cl` e o Postgres aceita:
       são os dois numeric. O resultado seria a página inteira lendo repasse
       onde há custo líquido, sem erro nenhum em lugar nenhum. */
    a.saida::text, a.rq, a.ch, a.cl, a.re, a.fc,
    a.respostas, a.parametros,
    l.id is not null, l.numero, l.emitido_em,
    exists (select 1 from public.termos m where m.analise_id = a.id and m.assinado_em is not null)
  from public.analises a
  left join public.tenants t on t.id = a.tenant_id
  left join public.empresas e on e.id = a.empresa_id
  left join lateral (
    select x.id, x.numero, x.emitido_em from public.laudos x
     where x.analise_id = a.id order by x.emitido_em desc limit 1
  ) l on true
  order by a.calculado_em desc nulls last;
end;
$function$;

revoke all on function public.plataforma_analises_cruas() from public;
grant execute on function public.plataforma_analises_cruas() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3 · A CONTA DE UM CLIENTE, VISTA DE FORA — leitura, e com rastro
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

  /* O REGISTRO VEM ANTES DA LEITURA, de propósito. Gravar depois significa que
     um erro no meio do caminho apaga o rastro justamente da vez que deu
     problema — que é a única vez em que alguém vai procurar por ele. */
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
        select a.id, a.empresa_id, a.saida, a.rq, a.cl, a.re, a.fc, a.calculado_em,
               a.respostas, a.parametros,
               (select e.razao_social from public.empresas e where e.id = a.empresa_id) as empresa,
               exists(select 1 from public.laudos l where l.analise_id = a.id) as tem_laudo
        from public.analises a where a.tenant_id = p_tenant
        order by a.calculado_em desc limit 300) x), '[]'::jsonb),
    'laudos', coalesce((select jsonb_agg(to_jsonb(x)) from (
        select l.id, l.numero, l.emitido_em, l.analise_id
        from public.laudos l where l.tenant_id = p_tenant
        order by l.emitido_em desc limit 300) x), '[]'::jsonb)
  ) into resultado;

  return resultado;
end;
$function$;

revoke all on function public.plataforma_conta(uuid) from public;
grant execute on function public.plataforma_conta(uuid) to authenticated;

comment on function public.plataforma_conta(uuid) is
  'Leitura da conta de um cliente pelo dono da plataforma. NÃO assume a identidade do usuário: lê e registra em acessos_plataforma. Escrita continua sendo do cliente.';
