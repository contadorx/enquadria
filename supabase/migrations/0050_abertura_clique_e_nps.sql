-- ===========================================================================
-- 0050 — ABERTURA, CLIQUE, E O NPS QUE NÃO EXIGE ENTRAR NO APP
-- ===========================================================================
--
-- PARTE 1 · O E-MAIL FOI ABERTO? FOI CLICADO?
--
-- Hoje `plataforma_envios` sabe se o e-mail SAIU. Isso é metade da pergunta, e
-- é a metade que não decide nada: uma régua com 100% de entrega e 4% de
-- abertura está quebrada, e o painel diria "tudo enviado".
--
-- Postal e Brevo mandam os dois eventos por webhook. Esta migration cria a
-- tabela que os recebe e liga cada evento ao envio.
--
-- ---------------------------------------------------------------------------
-- O QUE A ABERTURA NÃO É, e isso precisa estar escrito onde o número aparece:
--
--   · o pixel de abertura é BLOQUEADO por padrão em boa parte dos clientes de
--     e-mail (Apple Mail Privacy Protection carrega TODAS as imagens, o que
--     produz o erro contrário: abertura fantasma);
--   · logo: abertura é PISO, não medida. Serve para comparar campanhas entre
--     si, não para afirmar "62% leram".
--
-- O CLIQUE é bem mais confiável — exige ação — e por isso é ele que a tela
-- destaca. Quem toma decisão com taxa de abertura está tomando decisão com um
-- número que o provedor do destinatário controla.
--
-- ---------------------------------------------------------------------------
-- PARTE 2 · NPS POR E-MAIL, FORA DA PLATAFORMA.
--
-- O NPS de hoje é um modal dentro do app: só responde quem já entrou. Ou seja,
-- ele mede a satisfação de quem está usando — e é exatamente quem está
-- deixando de usar que a gente precisa ouvir. Viés de sobrevivência puro.
--
-- O NPS por e-mail resolve isso: a nota vai como LINK, um clique responde, e a
-- página só pede o comentário. Sem login, sem app.
-- ===========================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- 1 · OS EVENTOS DO E-MAIL
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.email_eventos (
  id uuid primary key default gen_random_uuid(),
  /* o envio correspondente, quando dá para ligar. Fica NULL para e-mail que
     saiu antes desta tabela existir — e null é melhor que inventar vínculo. */
  envio_id uuid references public.plataforma_envios(id) on delete set null,
  tenant_id uuid,
  para text not null,
  /* a regra/campanha, copiada do envio: permite agrupar sem join */
  regra text,
  /* entregue | aberto | clique | bounce | spam | recusado */
  evento text not null,
  /* para clique: o destino. É o que separa "clicou no CTA" de "clicou no
     descadastro", que é a diferença entre campanha boa e campanha ruim. */
  url text,
  provedor text,
  /* id da mensagem no provedor — permite reconciliar sem depender do e-mail */
  mensagem_id text,
  ocorreu_em timestamptz not null default now(),
  criado_em timestamptz not null default now()
);

comment on table public.email_eventos is
  'Abertura, clique e falha por e-mail enviado. Abertura é PISO (pixel bloqueado por padrão em muitos clientes) e não medida; o clique é o número confiável.';

create index if not exists email_eventos_envio on public.email_eventos (envio_id);
create index if not exists email_eventos_regra on public.email_eventos (regra, evento, ocorreu_em desc);
create index if not exists email_eventos_para on public.email_eventos (para, ocorreu_em desc);
/* o mesmo evento chega mais de uma vez (retry do provedor, reabertura). Aberturas
   repetidas são informação; DUPLICATA do mesmo webhook não é. */
create unique index if not exists email_eventos_unico
  on public.email_eventos (coalesce(mensagem_id, ''), evento, ocorreu_em)
  where mensagem_id is not null;

alter table public.email_eventos enable row level security;
drop policy if exists email_eventos_super on public.email_eventos;
create policy email_eventos_super on public.email_eventos for select
  using (public.e_superadmin());

-- o webhook escreve com service_role; nenhuma policy de insert para o usuário

-- ═══════════════════════════════════════════════════════════════════════════
-- 2 · O PAINEL DA CAMPANHA — uma linha por regra
--
-- Denominador honesto: as taxas são sobre ENTREGUES, não sobre enviados. E-mail
-- que bateu (bounce) nunca teve chance de ser aberto; contá-lo no denominador
-- faz uma lista suja parecer campanha ruim, e são problemas diferentes com
-- soluções diferentes.
-- ═══════════════════════════════════════════════════════════════════════════
drop function if exists public.email_desempenho(int);

create function public.email_desempenho(p_dias int default 30)
returns table (
  regra text,
  enviados bigint,
  entregues bigint,
  aberturas bigint,
  abriram bigint,
  cliques bigint,
  clicaram bigint,
  bounces bigint,
  spam bigint,
  ultimo timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.e_superadmin() then
    raise exception 'acesso restrito ao dono da plataforma';
  end if;

  return query
  with base as (
    select e.id, e.regra, e.para, e.criado_em
    from public.plataforma_envios e
    where e.status = 'enviado'
      and e.criado_em >= now() - make_interval(days => greatest(p_dias, 1))
  ),
  ev as (
    select x.envio_id, x.para, x.regra, x.evento
    from public.email_eventos x
    where x.ocorreu_em >= now() - make_interval(days => greatest(p_dias, 1))
  )
  select
    b.regra,
    count(*)::bigint,
    /* ENTREGUE = saiu e não bateu. Sem evento de bounce, o e-mail conta como
       entregue: o provedor só avisa quando dá errado, e tratar silêncio como
       falha zeraria a base inteira. */
    count(*) filter (
      where not exists (select 1 from ev where ev.para = b.para and ev.evento in ('bounce', 'recusado'))
    )::bigint,
    (select count(*) from ev where ev.evento = 'aberto' and ev.para = any(array_agg(b.para)))::bigint,
    count(*) filter (
      where exists (select 1 from ev where ev.para = b.para and ev.evento = 'aberto')
    )::bigint,
    (select count(*) from ev where ev.evento = 'clique' and ev.para = any(array_agg(b.para)))::bigint,
    count(*) filter (
      where exists (select 1 from ev where ev.para = b.para and ev.evento = 'clique')
    )::bigint,
    count(*) filter (
      where exists (select 1 from ev where ev.para = b.para and ev.evento = 'bounce')
    )::bigint,
    count(*) filter (
      where exists (select 1 from ev where ev.para = b.para and ev.evento = 'spam')
    )::bigint,
    max(b.criado_em)
  from base b
  group by b.regra
  order by count(*) desc;
end;
$function$;

revoke all on function public.email_desempenho(int) from public;
grant execute on function public.email_desempenho(int) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3 · O NPS POR E-MAIL
--
-- O modal do app só alcança quem entra. Quem parou de entrar — a resposta mais
-- valiosa que existe — nunca é perguntado. Este convite vai por e-mail, com a
-- nota no LINK: um clique responde, e a página só pede o comentário.
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.nps_convites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  para text not null,
  /* token do link — a resposta acontece sem login */
  token text not null unique,
  enviado_em timestamptz not null default now(),
  respondido_em timestamptz,
  nota int check (nota is null or (nota between 0 and 10)),
  comentario text,
  /* a rodada, para poder comparar trimestre a trimestre */
  rodada text not null,
  expira_em timestamptz not null default (now() + interval '30 days')
);

comment on table public.nps_convites is
  'Convites de NPS enviados por e-mail. Existem porque o modal do app só alcança quem ainda entra — e quem parou de entrar é justamente quem precisa ser ouvido.';

create index if not exists nps_convites_tenant on public.nps_convites (tenant_id, enviado_em desc);
create index if not exists nps_convites_rodada on public.nps_convites (rodada, respondido_em);

alter table public.nps_convites enable row level security;
drop policy if exists nps_convites_super on public.nps_convites;
create policy nps_convites_super on public.nps_convites for select
  using (public.e_superadmin());

/**
 * RESPONDER SEM LOGIN — a função é a porta, e ela é estreita de propósito:
 * só grava nota e comentário, só uma vez, só dentro do prazo.
 */
create or replace function public.nps_responder(p_token text, p_nota int, p_comentario text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c public.nps_convites;
begin
  if p_nota is null or p_nota < 0 or p_nota > 10 then
    return jsonb_build_object('ok', false, 'erro', 'nota precisa ser de 0 a 10');
  end if;

  select * into c from public.nps_convites where token = p_token;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'convite não encontrado');
  end if;
  if c.expira_em < now() then
    return jsonb_build_object('ok', false, 'erro', 'este convite expirou');
  end if;

  /* JÁ RESPONDIDO NÃO É ERRO: é alguém que clicou de novo no mesmo e-mail, o
     que acontece o tempo todo. Devolver erro faria a pessoa achar que a
     resposta se perdeu. Deixamos ATUALIZAR o comentário e mantemos a nota — a
     primeira nota é a reação; a segunda é a lembrança. */
  update public.nps_convites
     set nota = coalesce(c.nota, p_nota),
         comentario = coalesce(nullif(trim(coalesce(p_comentario, '')), ''), comentario),
         respondido_em = coalesce(c.respondido_em, now())
   where id = c.id;

  return jsonb_build_object('ok', true, 'ja_respondido', c.respondido_em is not null);
end;
$function$;

revoke all on function public.nps_responder(text, int, text) from public;
grant execute on function public.nps_responder(text, int, text) to anon, authenticated;

/**
 * QUEM CONVIDAR NESTA RODADA — e quem NÃO convidar.
 *
 * As três exclusões são o desenho inteiro:
 *   · conta de teste (é a nossa, e a nota seria nossa);
 *   · quem já foi convidado nesta rodada (pedir duas vezes irrita e enviesa);
 *   · quem respondeu nos últimos 90 dias (mesmo em outra rodada).
 *
 * A recorrência é TRIMESTRAL por padrão. NPS mensal cansa e a série fica pior,
 * não melhor — a nota passa a medir o incômodo do pedido.
 */
create or replace function public.nps_a_convidar(p_rodada text, p_carencia_dias int default 90)
returns table (tenant_id uuid, nome text, para text)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.e_superadmin() then
    raise exception 'acesso restrito ao dono da plataforma';
  end if;

  return query
  select t.id, t.nome, p.email
  from public.tenants t
  join lateral (
    select x.email from public.profiles x
     where x.tenant_id = t.id and x.email is not null
     order by x.criado_em limit 1
  ) p on true
  where coalesce(t.is_teste, false) = false
    and coalesce(t.emails_optout, false) = false
    and not exists (
      select 1 from public.nps_convites c
       where c.tenant_id = t.id and c.rodada = p_rodada
    )
    and not exists (
      select 1 from public.nps_convites c
       where c.tenant_id = t.id
         and c.respondido_em is not null
         and c.respondido_em >= now() - make_interval(days => greatest(p_carencia_dias, 1))
    )
  order by t.criado_em;
end;
$function$;

revoke all on function public.nps_a_convidar(text, int) from public;
grant execute on function public.nps_a_convidar(text, int) to authenticated;
