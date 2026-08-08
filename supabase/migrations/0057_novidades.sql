-- ===========================================================================
-- 0057 — NOVIDADES: o e-mail que ANUNCIA, e a porta de saída dele
-- ===========================================================================
--
-- O QUE FALTAVA. As réguas (0020) mandam e-mail por COMPORTAMENTO: importou,
-- não importou, esbarrou no limite, venceu a fatura. Não havia como dizer
-- "saiu uma coisa nova no produto" para quem já usa — e essa é justamente a
-- mensagem que segura assinante.
--
-- DUAS TABELAS, E A SEGUNDA É A QUE IMPORTA MAIS.
--
--   `plataforma_novidades`  — o que foi escrito e quando foi disparado.
--   `plataforma_descadastros` — quem pediu para não receber mais.
--
-- Disparo em massa sem descadastro não é campanha: é o caminho mais curto para
-- o domínio ser marcado como spam e os e-mails TRANSACIONAIS pararem de
-- chegar. Quem não recebe o laudo por causa de uma newsletter perde o produto,
-- não a newsletter. Por isso a porta de saída nasce junto, na mesma migration,
-- e não "depois".
--
-- O descadastro NÃO alcança e-mail transacional (laudo, termo, cobrança,
-- senha): esses continuam saindo, porque são a conta da pessoa, não marketing.
-- A separação está no código, em `lib/novidade.ts`.
-- ===========================================================================

create table if not exists public.plataforma_novidades (
  id            uuid primary key default gen_random_uuid(),
  assunto       text not null,
  titulo        text not null,
  corpo         text not null,
  /* a imagem é OPCIONAL e por URL: e-mail com imagem embutida pesa, é cortado
     pelo Gmail e some quando o cliente bloqueia anexo. URL pública funciona
     em todo lugar e mantém o HTML leve. */
  imagem_url    text,
  imagem_alt    text,
  link_url      text,
  link_texto    text,
  criado_em     timestamptz not null default now(),
  /* a primeira vez que um envio de verdade aconteceu */
  enviado_em    timestamptz,
  destinatarios int not null default 0,
  falhas        int not null default 0
);

comment on table public.plataforma_novidades is
  'Comunicados de produto enviados à base de contadores. O envio real é registrado em plataforma_envios, com chave única por (novidade, e-mail) — a trava contra disparo duplicado é o índice de lá, não a boa vontade do código.';

create index if not exists plataforma_novidades_recentes
  on public.plataforma_novidades (criado_em desc);

alter table public.plataforma_novidades enable row level security;

/* Só o dono da plataforma enxerga. O escritório não tem nada a fazer aqui: o
   que ele recebe é o e-mail. */
drop policy if exists novidades_superadmin on public.plataforma_novidades;
create policy novidades_superadmin on public.plataforma_novidades
  for select to authenticated using (public.e_superadmin());


-- ---------------------------------------------------------------------------
-- A PORTA DE SAÍDA
-- ---------------------------------------------------------------------------
create table if not exists public.plataforma_descadastros (
  email      text primary key,
  motivo     text,
  /* de qual novidade a pessoa saiu — serve para descobrir QUAL texto queimou */
  novidade_id uuid references public.plataforma_novidades(id) on delete set null,
  criado_em  timestamptz not null default now()
);

comment on table public.plataforma_descadastros is
  'Quem pediu para não receber mais comunicados. Vale para novidades; NÃO alcança e-mail transacional (laudo, termo, cobrança, senha), que é a conta da pessoa e continua saindo.';

alter table public.plataforma_descadastros enable row level security;

/* Ninguém lê pela sessão comum: quem grava é o servidor (service role), na
   rota pública de descadastro, e quem lê é o painel do dono. */
drop policy if exists descadastros_superadmin on public.plataforma_descadastros;
create policy descadastros_superadmin on public.plataforma_descadastros
  for select to authenticated using (public.e_superadmin());
