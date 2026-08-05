\set ON_ERROR_STOP on
\pset pager off

create or replace function pg_temp.checa(cond boolean, msg text) returns void
language plpgsql as $$
begin
  if cond then raise notice 'ok: %', msg;
  else raise exception 'FALHOU: %', msg; end if;
end $$;

/* tenta executar e devolve a mensagem de erro (ou null se não deu erro) */
create or replace function pg_temp.erro_de(sql text) returns text
language plpgsql as $$
begin
  execute sql;
  return null;
exception when others then
  return sqlerrm;
end $$;

do $teste$
declare
  a uuid; b uuid; c uuid; d uuid; e uuid;
  u_a uuid; u_d uuid;
  previa jsonb; res jsonb; msg text; n bigint; t text;
  tabelas text[] := array[
    'profiles','empresas','analises','laudos','termos','importacoes','assinaturas',
    'faturas','aberturas','chamados','coletas','comparativos','convites',
    'envios_cliente','indicacoes','nps_respostas','plataforma_envios','radar_leituras'
  ];
begin
  update auth.contexto set plataforma = true, uid = null;

  -- ══════════════════════════════════════════ conta A: cheia, sem impedimento
  insert into tenants (nome) values ('ContabilTESTE') returning id into a;
  insert into profiles (tenant_id, email, nome) values (a, 'a@x.com', 'Fulano') returning id into u_a;
  foreach t in array tabelas loop
    if t = 'profiles' then continue; end if;
    execute format('insert into public.%I (tenant_id) values ($1)', t) using a;
  end loop;
  -- uma fatura pendente, para o aviso
  update faturas set status = 'pendente' where tenant_id = a;

  previa := previa_exclusao_conta(a);
  perform pg_temp.checa((previa->>'existe')::boolean,        'A · prévia encontra a conta');
  perform pg_temp.checa((previa->>'pode')::boolean,          'A · sem impedimento, pode apagar');
  perform pg_temp.checa((previa->>'total_linhas')::int = 18, 'A · conta as 18 linhas filhas (veio ' || (previa->>'total_linhas') || ')');
  perform pg_temp.checa(jsonb_array_length(previa->'usuarios') = 1, 'A · devolve o usuário para a API apagar em auth.users');
  perform pg_temp.checa(previa->'usuarios'->0->>'email' = 'a@x.com', 'A · com o e-mail junto');
  perform pg_temp.checa(jsonb_array_length(previa->'avisos') >= 2,  'A · avisa sobre laudo e empresa');

  -- confirmação errada
  msg := pg_temp.erro_de(format('select excluir_conta(%L, %L)', a, 'ContabilTeste'));
  perform pg_temp.checa(msg like '%confirmação não confere%', 'A · recusa nome com caixa diferente');
  perform pg_temp.checa((select count(*) from tenants where id = a) = 1, 'A · e NÃO apagou nada');

  -- confirmação certa
  res := excluir_conta(a, 'ContabilTESTE', 'limpeza de teste');
  perform pg_temp.checa((res->>'ok')::boolean, 'A · apagou');

  -- tudo mesmo? as 11 sem FK eram o risco
  foreach t in array tabelas loop
    execute format('select count(*) from public.%I where tenant_id = $1', t) into n using a;
    perform pg_temp.checa(n = 0, 'A · ' || t || ' ficou sem órfão');
  end loop;
  perform pg_temp.checa((select count(*) from tenants where id = a) = 0, 'A · o tenant sumiu');

  -- auditoria
  perform pg_temp.checa((select count(*) from exclusoes where tenant_id = a) = 1, 'A · gravou em exclusoes');
  perform pg_temp.checa((select motivo from exclusoes where tenant_id = a) = 'limpeza de teste', 'A · guardou o motivo');
  perform pg_temp.checa((select (retrato->'contagens'->>'faturas')::int from exclusoes where tenant_id = a) = 1,
                        'A · o retrato preservou a contagem de faturas');
  perform pg_temp.checa((select retrato->'usuarios'->0->>'email' from exclusoes where tenant_id = a) = 'a@x.com',
                        'A · o retrato preservou o e-mail do usuário');

  -- ══════════════════════════════════════════ conta B: fatura paga
  insert into tenants (nome) values ('Pagante') returning id into b;
  insert into faturas (tenant_id, status) values (b, 'pago');
  previa := previa_exclusao_conta(b);
  perform pg_temp.checa(not (previa->>'pode')::boolean, 'B · fatura paga impede');
  perform pg_temp.checa(previa->'impedimentos'->>0 like '%paga%', 'B · e diz por quê');
  msg := pg_temp.erro_de(format('select excluir_conta(%L, %L)', b, 'Pagante'));
  perform pg_temp.checa(msg like '%recusada%', 'B · a exclusão recusa mesmo com o nome certo');
  perform pg_temp.checa((select count(*) from tenants where id = b) = 1, 'B · continua lá');

  -- ══════════════════════════════════════════ conta C: assinatura no Asaas
  insert into tenants (nome, asaas_subscription_id) values ('ComAsaas', 'sub_123') returning id into c;
  previa := previa_exclusao_conta(c);
  perform pg_temp.checa(not (previa->>'pode')::boolean, 'C · assinatura no Asaas impede');
  perform pg_temp.checa(previa->'impedimentos'->>0 like '%sub_123%', 'C · nomeia a assinatura');

  -- e string vazia NÃO pode impedir (campo preenchido com "" é comum)
  update tenants set asaas_subscription_id = '   ' where id = c;
  previa := previa_exclusao_conta(c);
  perform pg_temp.checa((previa->>'pode')::boolean, 'C · asaas_subscription_id em branco não impede');

  -- ══════════════════════════════════════════ conta D: a minha própria
  insert into tenants (nome) values ('Minha') returning id into d;
  insert into profiles (tenant_id, email) values (d, 'eu@x.com') returning id into u_d;
  update auth.contexto set uid = u_d;
  previa := previa_exclusao_conta(d);
  perform pg_temp.checa(not (previa->>'pode')::boolean, 'D · recusa apagar a própria conta');
  msg := pg_temp.erro_de(format('select excluir_conta(%L, %L)', d, 'Minha'));
  perform pg_temp.checa(msg like '%recusada%', 'D · e a exclusão também recusa');
  update auth.contexto set uid = null;

  -- ══════════════════════════════════════════ nome com espaço no fim
  insert into tenants (nome) values ('Alves Mello ') returning id into e;
  msg := pg_temp.erro_de(format('select excluir_conta(%L, %L)', e, 'Alves Mello'));
  perform pg_temp.checa(msg like '%confirmação não confere%', 'E · nome sem o espaço final é recusado');
  res := excluir_conta(e, 'Alves Mello ');
  perform pg_temp.checa((res->>'ok')::boolean, 'E · com o espaço final, apaga');

  -- ══════════════════════════════════════════ conta inexistente
  previa := previa_exclusao_conta('00000000-0000-0000-0000-000000000000');
  perform pg_temp.checa(not (previa->>'existe')::boolean, 'F · conta inexistente devolve existe=false');
  msg := pg_temp.erro_de('select excluir_conta(''00000000-0000-0000-0000-000000000000'', ''x'')');
  perform pg_temp.checa(msg like '%não encontrada%', 'F · e a exclusão diz que não encontrou');

  -- ══════════════════════════════════════════ sem ser dono da plataforma
  update auth.contexto set plataforma = false;
  msg := pg_temp.erro_de(format('select previa_exclusao_conta(%L)', b));
  perform pg_temp.checa(msg like '%acesso restrito%', 'G · prévia barra quem não é dono');
  msg := pg_temp.erro_de(format('select excluir_conta(%L, %L)', b, 'Pagante'));
  perform pg_temp.checa(msg like '%acesso restrito%', 'G · exclusão barra quem não é dono');
  update auth.contexto set plataforma = true;

  raise notice '=== TODOS OS TESTES PASSARAM ===';
end
$teste$;
