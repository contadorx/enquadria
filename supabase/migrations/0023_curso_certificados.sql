-- ============================================================================
-- Enquadria — Migration 0023 (certificados do curso gratuito)
--
-- O QUE ESTA MIGRATION FAZ
--   Cria a tabela dos certificados de conclusão do curso "A decisão de
--   setembro". Cada certificado tem um CÓDIGO PÚBLICO: quem receber o
--   documento confere em app.enquadria.com.br/certificado/CODIGO e vê nome,
--   curso e data. Certificado que ninguém pode conferir é enfeite.
--
-- POR QUE O MÍNIMO DE DADOS
--   Nome e e-mail porque vão impressos e servem para reenviar o link. CRC é
--   opcional, e existe só porque o participante costuma querer o registro
--   profissional no documento. Nada além disso — a Política de Privacidade
--   declara exatamente estes campos.
--
-- SEGURANÇA
--   RLS LIGADA e SEM policy: nem anon nem authenticated leem a tabela. A
--   emissão e a leitura pública passam pelo servidor (service role), que
--   devolve só o que vai no documento. Assim o código do certificado não vira
--   um caminho para listar e-mails de quem fez o curso.
--
-- IDEMPOTENTE: roda duas vezes sem erro, e descobre o que já existe.
-- ============================================================================

create table if not exists public.curso_certificados (
  id          uuid primary key default gen_random_uuid(),
  codigo      text not null,
  nome        text not null,
  email       text not null,
  crc         text,
  curso       text not null default 'A decisão de setembro',
  aulas       integer not null default 0,
  minutos     integer not null default 0,
  emitido_em  timestamptz not null default now()
);

-- colunas que podem faltar num banco que já tinha uma versão da tabela
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='curso_certificados' and column_name='crc') then
    alter table public.curso_certificados add column crc text;
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='curso_certificados' and column_name='minutos') then
    alter table public.curso_certificados add column minutos integer not null default 0;
  end if;
end $$;

-- o código é a chave pública do documento: não pode repetir
create unique index if not exists curso_certificados_codigo on public.curso_certificados (codigo);

-- um certificado por pessoa por curso — pedir de novo devolve o mesmo código,
-- em vez de encher a tabela e dar dois números para a mesma conclusão
create unique index if not exists curso_certificados_email_curso
  on public.curso_certificados (lower(email), curso);

create index if not exists curso_certificados_emitido_em
  on public.curso_certificados (emitido_em desc);

alter table public.curso_certificados enable row level security;

-- conferência: falha alto e com o nome exato do que não ficou de pé
do $$
declare faltando text := '';
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema='public' and table_name='curso_certificados') then
    faltando := faltando || 'tabela curso_certificados; ';
  end if;
  if not exists (select 1 from pg_indexes
                 where schemaname='public' and indexname='curso_certificados_codigo') then
    faltando := faltando || 'índice curso_certificados_codigo; ';
  end if;
  if not exists (select 1 from pg_tables
                 where schemaname='public' and tablename='curso_certificados' and rowsecurity) then
    faltando := faltando || 'RLS de curso_certificados; ';
  end if;
  if faltando <> '' then
    raise exception 'Migration 0023 incompleta — faltou: %', faltando;
  end if;
end $$;
