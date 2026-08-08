-- ===========================================================================
-- 0027 — CNPJ ALFANUMÉRICO: solta qualquer trava "só dígito" no banco
--
-- Em vigor desde 31/07/2026 (IN RFB 2.229/2024): as 12 primeiras posições do
-- CNPJ aceitam letra maiúscula; só os 2 dígitos verificadores seguem
-- numéricos. CNPJ já existente NÃO muda.
--
-- O código do app já foi corrigido. Falta garantir que o BANCO não recuse.
-- Como as tabelas iniciais não estão versionadas aqui, esta migration
-- DESCOBRE o schema em vez de assumi-lo: varre as constraints CHECK de
-- qualquer tabela que tenha coluna `cnpj` e derruba as que exigem dígito.
--
-- Só derruba constraint que EXIJA formato numérico. Uma checagem de tamanho
-- (length = 14) continua valendo, porque continua verdadeira.
--
-- Idempotente: rodar duas vezes não faz diferença.
-- ===========================================================================

do $$
declare
  r record;
  soltas int := 0;
begin
  for r in
    select c.conname, c.conrelid::regclass as tabela, pg_get_constraintdef(c.oid) as def
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where c.contype = 'c'
       and n.nspname = 'public'
       and exists (
             select 1 from information_schema.columns col
              where col.table_schema = 'public'
                and col.table_name = t.relname
                and col.column_name = 'cnpj')
       -- só as que falam de dígito: \d, [0-9], ~ '^[0-9]', numeric...
       and (pg_get_constraintdef(c.oid) ~ '\[0-9\]'
         or pg_get_constraintdef(c.oid) ~ '\\d'
         or pg_get_constraintdef(c.oid) ilike '%::numeric%')
       and pg_get_constraintdef(c.oid) ilike '%cnpj%'
  loop
    raise notice 'soltando %.% -> %', r.tabela, r.conname, r.def;
    execute format('alter table %s drop constraint %I', r.tabela, r.conname);
    soltas := soltas + 1;
  end loop;

  if soltas = 0 then
    raise notice 'nenhuma trava numerica de CNPJ encontrada — nada a fazer';
  else
    raise notice '% constraint(s) soltas', soltas;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- VERIFICAÇÃO: o banco tem mesmo de aceitar letra na coluna cnpj.
-- Grava e apaga na mesma transação, sem deixar rastro. Se o tipo da coluna
-- for numérico (e não text/varchar), isto falha AQUI — que é onde tem de
-- falhar, e não no meio de uma importação do contador.
-- ---------------------------------------------------------------------------
do $$
declare
  tipo text;
begin
  select data_type into tipo
    from information_schema.columns
   where table_schema = 'public' and table_name = 'empresas' and column_name = 'cnpj';

  if tipo is null then
    raise notice 'tabela empresas sem coluna cnpj — nada a verificar';
  elsif tipo not in ('text', 'character varying', 'character') then
    raise exception 'empresas.cnpj é % — precisa ser text para aceitar CNPJ alfanumerico', tipo;
  else
    raise notice 'empresas.cnpj é % — aceita alfanumerico', tipo;
  end if;
end $$;
