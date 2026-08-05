-- ===========================================================================
-- 0045 — EXCLUIR UMA CONTA (tenant) DE VERDADE
-- ===========================================================================
--
-- Hoje não existe como apagar uma conta. As contas de teste ficam para sempre,
-- e a partir de agora elas contaminam TUDO que se olha: MRR, taxa de ativação,
-- funil, quantas contas viraram pagantes. Marcar como `is_teste` resolve a
-- métrica e não resolve a bagunça.
--
-- ---------------------------------------------------------------------------
-- O DEFEITO QUE ESTA MIGRATION CONSERTA ANTES DE FAZER QUALQUER OUTRA COISA.
--
-- `tenants` tem 18 tabelas filhas. SETE têm foreign key com `on delete
-- cascade`. ONZE não têm foreign key nenhuma:
--
--   aberturas · chamados · coletas · comparativos · convites · envios_cliente
--   faturas · indicacoes · nps_respostas · plataforma_envios · radar_leituras
--
-- Ou seja: `delete from tenants where id = X` hoje apagaria a conta e deixaria
-- fatura, e-mail enviado, NPS e convite pendurados apontando para um tenant que
-- não existe mais. `faturas` é a pior: ela alimenta o caixa da aba Negócio.
-- Apagar a conta e manter a fatura significa dinheiro no relatório vindo de
-- ninguém — e ninguém ia descobrir isso olhando a tela.
--
-- Conferido no banco de produção antes de escrever: ZERO órfãos hoje nas onze
-- tabelas. Então a FK entra limpa. Se um dia não entrar, o `alter table` vai
-- falhar em vez de aceitar dado quebrado, que é o comportamento certo.
--
-- ---------------------------------------------------------------------------
-- AS TRÊS RECUSAS.
--
-- A função NÃO apaga quando:
--
--   1. existe fatura PAGA — histórico financeiro não se apaga por conveniência
--      de tela. Se a conta pagou um dia, ela vira `cancelada`, não desaparece;
--   2. existe assinatura ATIVA no Asaas — apagar aqui deixaria a cobrança
--      rodando lá, e a próxima parcela cairia sem dono. Cancele primeiro;
--   3. é a sua própria conta — o superadmin apagando o tenant do próprio
--      perfil se tranca para fora, e não há tela para desfazer.
--
-- Fora isso ela apaga, e o que apagou fica registrado em `exclusoes` — com o
-- retrato dos números ANTES do delete. Auditoria de exclusão só serve se for
-- escrita na mesma transação do delete; depois não há de onde tirar.
--
-- ---------------------------------------------------------------------------
-- O QUE ELA NÃO FAZ, DE PROPÓSITO.
--
-- Não apaga o usuário em `auth.users`. Isso é feito pela API, DEPOIS, com a
-- chave de serviço — e só para quem não pertence a nenhuma outra conta. Fazer
-- aqui exigiria que esta função escrevesse no schema `auth`, e uma função que
-- pode apagar usuário de autenticação é uma função que eu não quero SECURITY
-- DEFINER num banco que também roda RLS para contador. A lista de ids sai no
-- retorno; quem tem a chave decide.
-- ===========================================================================


-- ═══════════════════════════════════════════════════ 1 · as FKs que faltavam
do $fks$
declare
  t text;
  tabelas text[] := array[
    'aberturas','chamados','coletas','comparativos','convites','envios_cliente',
    'faturas','indicacoes','nps_respostas','plataforma_envios','radar_leituras'
  ];
  orfaos bigint;
begin
  foreach t in array tabelas loop
    -- a tabela pode não existir num banco mais antigo: pular em vez de quebrar
    if to_regclass('public.' || t) is null then
      raise notice 'pulei %: tabela não existe neste banco', t;
      continue;
    end if;

    if exists (
      select 1 from pg_constraint c
       where c.conrelid = ('public.' || t)::regclass
         and c.contype = 'f'
         and c.confrelid = 'public.tenants'::regclass
    ) then
      continue;  -- já tem
    end if;

    -- órfão existente faria o alter table falhar com uma mensagem obscura;
    -- melhor contar e dizer o número
    execute format(
      'select count(*) from public.%I x where x.tenant_id is not null
         and not exists (select 1 from public.tenants t where t.id = x.tenant_id)', t
    ) into orfaos;

    if orfaos > 0 then
      raise exception
        'public.% tem % linha(s) apontando para tenant inexistente. Resolva antes: as linhas precisam ser apagadas ou religadas.',
        t, orfaos;
    end if;

    execute format(
      'alter table public.%I add constraint %I foreign key (tenant_id)
         references public.tenants(id) on delete cascade', t, t || '_tenant_id_fkey'
    );
    raise notice 'FK criada em %', t;
  end loop;
end
$fks$;


-- ═══════════════════════════════════════════════════ 2 · o registro da exclusão
create table if not exists public.exclusoes (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,          -- SEM FK: a linha existe justamente porque o tenant não existe mais
  nome          text,
  criado_em     timestamptz,            -- quando a conta nasceu
  excluido_em   timestamptz not null default now(),
  excluido_por  uuid,                   -- profiles.id de quem mandou apagar
  motivo        text,
  /* o retrato: quantas linhas foram embora em cada tabela, e os e-mails que
     estavam na conta. Sem isto, "apaguei a conta X" é uma frase sem prova. */
  retrato       jsonb not null default '{}'::jsonb
);

alter table public.exclusoes enable row level security;

drop policy if exists exclusoes_plataforma_le on public.exclusoes;
create policy exclusoes_plataforma_le on public.exclusoes
  for select using (public.e_plataforma());

comment on table public.exclusoes is
  'Contas apagadas. Escrita só pela função excluir_conta(), na mesma transação do delete.';


-- ═══════════════════════════════════════════════════ 3 · a prévia (dry run)
--
-- Devolve exatamente o que o delete faria, sem fazer. A tela mostra isto antes
-- de pedir confirmação — e é o mesmo código que decide as recusas, para não
-- existir o caso de a prévia dizer uma coisa e a exclusão fazer outra.
--
create or replace function public.previa_exclusao_conta(p_tenant uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant       record;
  v_contagens    jsonb := '{}'::jsonb;
  v_impedimentos jsonb := '[]'::jsonb;
  v_avisos       jsonb := '[]'::jsonb;
  v_usuarios     jsonb := '[]'::jsonb;
  v_meu_tenant   uuid;
  v_pagas        bigint;
  v_asaas        text;
  v_n            bigint;
  t              text;
  tabelas text[] := array[
    'profiles','empresas','analises','laudos','termos','importacoes','assinaturas',
    'faturas','aberturas','chamados','coletas','comparativos','convites',
    'envios_cliente','indicacoes','nps_respostas','plataforma_envios','radar_leituras'
  ];
begin
  if not public.e_plataforma() then
    raise exception 'acesso restrito ao dono da plataforma';
  end if;

  select * into v_tenant from public.tenants where id = p_tenant;
  if not found then
    return jsonb_build_object('existe', false);
  end if;

  -- quantas linhas em cada tabela
  foreach t in array tabelas loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('select count(*) from public.%I where tenant_id = $1', t)
      into v_n using p_tenant;
    if v_n > 0 then
      v_contagens := v_contagens || jsonb_build_object(t, v_n);
    end if;
  end loop;

  -- quem são os usuários (a API precisa dos ids para apagar em auth.users)
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'email', p.email, 'nome', p.nome)), '[]'::jsonb)
    into v_usuarios
    from public.profiles p
   where p.tenant_id = p_tenant;

  -- ── recusa 1: fatura paga ────────────────────────────────────────────────
  select count(*) into v_pagas
    from public.faturas where tenant_id = p_tenant and status = 'pago';
  if v_pagas > 0 then
    v_impedimentos := v_impedimentos || jsonb_build_array(format(
      '%s fatura(s) paga(s). Conta que já pagou não se apaga: histórico financeiro. Marque como cancelada.', v_pagas));
  end if;

  -- ── recusa 2: assinatura viva no Asaas ───────────────────────────────────
  select t2.asaas_subscription_id into v_asaas from public.tenants t2 where t2.id = p_tenant;
  if v_asaas is not null and length(trim(v_asaas)) > 0 then
    v_impedimentos := v_impedimentos || jsonb_build_array(
      'Existe assinatura no Asaas (' || v_asaas || '). Cancele lá primeiro, ou a cobrança continua rodando sem dono.');
  end if;

  -- ── recusa 3: a sua própria conta ────────────────────────────────────────
  select p.tenant_id into v_meu_tenant from public.profiles p where p.id = auth.uid();
  if v_meu_tenant is not null and v_meu_tenant = p_tenant then
    v_impedimentos := v_impedimentos || jsonb_build_array(
      'Esta é a conta do seu próprio perfil. Apagar aqui tranca você para fora.');
  end if;

  -- ── avisos: não impedem, mas têm de estar na tela ────────────────────────
  select count(*) into v_n from public.laudos where tenant_id = p_tenant;
  if v_n > 0 then
    v_avisos := v_avisos || jsonb_build_array(format(
      '%s laudo(s) emitido(s). Os links públicos de verificação desses documentos param de funcionar — se algum foi entregue a um cliente, ele deixa de conferir.', v_n));
  end if;

  select count(*) into v_n from public.empresas where tenant_id = p_tenant;
  if v_n > 0 then
    v_avisos := v_avisos || jsonb_build_array(format(
      '%s empresa(s) importada(s) com os dados dos clientes deste escritório.', v_n));
  end if;

  select count(*) into v_n from public.faturas where tenant_id = p_tenant and status <> 'pago';
  if v_n > 0 then
    v_avisos := v_avisos || jsonb_build_array(format(
      '%s fatura(s) em aberto serão apagadas. Se houver cobrança correspondente no Asaas, ela continua lá.', v_n));
  end if;

  return jsonb_build_object(
    'existe',       true,
    'tenant_id',    p_tenant,
    'nome',         v_tenant.nome,
    'criado_em',    v_tenant.criado_em,
    'status',       v_tenant.status,
    'is_teste',     v_tenant.is_teste,
    'contagens',    v_contagens,
    'total_linhas', (select coalesce(sum(value::bigint), 0) from jsonb_each_text(v_contagens)),
    'usuarios',     v_usuarios,
    'impedimentos', v_impedimentos,
    'avisos',       v_avisos,
    'pode',         jsonb_array_length(v_impedimentos) = 0
  );
end;
$$;

revoke all on function public.previa_exclusao_conta(uuid) from public;
grant execute on function public.previa_exclusao_conta(uuid) to authenticated, service_role;


-- ═══════════════════════════════════════════════════ 4 · a exclusão
--
-- `p_confirmacao` tem de ser o NOME da conta, exatamente como está gravado.
-- Não é teatro: é a única defesa contra apagar a linha errada de uma tabela em
-- que todo id é um uuid parecido com o outro. Um clique errado numa lista de
-- dez contas é fácil; digitar "Alves Mello Assessoria Contabil" achando que é
-- "ContabilTESTE" não é.
--
create or replace function public.excluir_conta(
  p_tenant      uuid,
  p_confirmacao text,
  p_motivo      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previa   jsonb;
  v_nome     text;
  v_usuarios jsonb;
begin
  if not public.e_plataforma() then
    raise exception 'acesso restrito ao dono da plataforma';
  end if;

  /* A MESMA função que a tela usou. Se o mundo mudou entre a prévia e o
     clique — uma fatura foi paga nesse meio-tempo — a recusa aparece aqui. */
  v_previa := public.previa_exclusao_conta(p_tenant);

  if not coalesce((v_previa->>'existe')::boolean, false) then
    raise exception 'conta não encontrada (talvez já tenha sido apagada)';
  end if;

  if not coalesce((v_previa->>'pode')::boolean, false) then
    raise exception 'exclusão recusada: %',
      (select string_agg(x, ' · ') from jsonb_array_elements_text(v_previa->'impedimentos') x);
  end if;

  v_nome := v_previa->>'nome';

  /* comparação exata, sem trim e sem lower: se a tela mostra o nome com espaço
     no fim (e uma das contas tem), quem digita copia. Afrouxar aqui é afrouxar
     a única trava que existe. */
  if p_confirmacao is distinct from v_nome then
    raise exception 'confirmação não confere. Digite o nome da conta exatamente como aparece: %', coalesce(v_nome, '(sem nome)');
  end if;

  v_usuarios := v_previa->'usuarios';

  /* o registro ANTES do delete, na mesma transação: ou os dois acontecem, ou
     nenhum. Auditoria escrita depois é auditoria que some quando dá erro. */
  insert into public.exclusoes (tenant_id, nome, criado_em, excluido_por, motivo, retrato)
  values (
    p_tenant,
    v_nome,
    (v_previa->>'criado_em')::timestamptz,
    auth.uid(),
    p_motivo,
    jsonb_build_object(
      'contagens', v_previa->'contagens',
      'usuarios',  v_usuarios,
      'avisos',    v_previa->'avisos',
      'status',    v_previa->>'status'
    )
  );

  /* uma linha só: as 18 tabelas filhas agora TÊM cascade (parte 1 acima). */
  delete from public.tenants where id = p_tenant;

  return jsonb_build_object(
    'ok',           true,
    'nome',         v_nome,
    'total_linhas', v_previa->'total_linhas',
    'contagens',    v_previa->'contagens',
    /* a API usa esta lista para apagar em auth.users quem não sobrou em
       nenhuma outra conta. Aqui não se mexe no schema auth. */
    'usuarios',     v_usuarios
  );
end;
$$;

revoke all on function public.excluir_conta(uuid, text, text) from public;
grant execute on function public.excluir_conta(uuid, text, text) to authenticated, service_role;
