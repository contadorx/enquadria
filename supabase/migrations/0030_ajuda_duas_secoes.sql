-- ===========================================================================
-- DUAS SEÇÕES, NÃO UMA — ajuda do sistema e quadro da Reforma
-- ===========================================================================
--
-- A 0029 tratou "como usar o Enquadria" e "o que mudou na Reforma" como
-- categorias da mesma lista. São coisas com NATUREZA diferente e o desenho
-- estava errado:
--
--   AJUDA é consultada sob demanda. A pessoa chega com uma dúvida específica,
--   quer achar rápido e ir embora. O que importa é busca, ordem estável e o
--   artigo continuar valendo por meses.
--
--   NOTÍCIA da Reforma é empurrada. A pessoa não sabe que precisa saber. O que
--   importa é cronologia, aviso de novidade e o item mais recente no topo.
--
-- Misturar as duas faz a ajuda envelhecer (enche de notícia velha) e a notícia
-- se perder (ordenada por relevância em vez de data).
--
-- ADOTADO DOS APPS ANALISADOS (Contatia, app, BPOx):
--   · `destaque` — as perguntas frequentes sobem para o topo da ajuda. Nos três
--     apps é o que faz a central resolver antes da busca.
--   · `no_assistente` — marca o artigo como material de resposta automática.
--     A ideia vinda do BPOx: escrever uma vez e servir dois canais. Ainda não
--     há assistente aqui; a coluna nasce agora para o conteúdo já ir marcado.
--   · `ajuda_feedback` — "isso ajudou?". É o único sinal barato de artigo que
--     existe mas não resolve, e sem ele a central cresce sem ninguém saber
--     quais páginas estão falhando.
-- ---------------------------------------------------------------------------

alter table public.ajuda_artigos
  add column if not exists tipo text not null default 'ajuda';

alter table public.ajuda_artigos
  add column if not exists destaque boolean not null default false;

alter table public.ajuda_artigos
  add column if not exists no_assistente boolean not null default true;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ajuda_artigos_tipo_check') then
    alter table public.ajuda_artigos
      add constraint ajuda_artigos_tipo_check check (tipo in ('ajuda', 'noticia'));
  end if;
end $$;

-- o que era categoria 'reforma' vira NOTÍCIA; o resto continua ajuda
update public.ajuda_artigos set tipo = 'noticia' where categoria = 'reforma';

create index if not exists ajuda_artigos_tipo_idx
  on public.ajuda_artigos (tipo, publicado, publicado_em desc);

-- ---------------------------------------------------------------------------
-- "Isso ajudou?" — um voto por pessoa por artigo, trocável.
--
-- Guardar voto anônimo agregado num contador seria mais simples e mediria
-- errado: a mesma pessoa votando duas vezes, ou votando de novo depois da
-- correção do artigo, distorce justamente o número que deveria orientar a
-- reescrita.
-- ---------------------------------------------------------------------------
create table if not exists public.ajuda_feedback (
  user_id   uuid not null,
  artigo_id uuid not null references public.ajuda_artigos(id) on delete cascade,
  ajudou    boolean not null,
  criado_em timestamptz not null default now(),
  primary key (user_id, artigo_id)
);

alter table public.ajuda_feedback enable row level security;

drop policy if exists ajuda_feedback_propria on public.ajuda_feedback;
create policy ajuda_feedback_propria on public.ajuda_feedback
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- o gestor precisa ver o placar de TODO mundo para saber o que reescrever
drop policy if exists ajuda_feedback_gestor on public.ajuda_feedback;
create policy ajuda_feedback_gestor on public.ajuda_feedback
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and coalesce(p.is_superadmin, false)
    )
  );

-- ---------------------------------------------------------------------------
-- CONTA DE TESTE — vinda dos três apps, e urgente aqui.
--
-- Este banco tem cinco tenants, quatro deles criados hoje testando o cadastro.
-- No dia em que a primeira métrica de receita for calculada, eles entram na
-- conta e o MRR nasce mentindo. Os três apps analisados têm exatamente esta
-- flag pelo mesmo motivo, e em todos ela é EXCLUÍDA de toda métrica.
--
-- Marcar depois é pior: quando a métrica existir, ninguém vai lembrar quais
-- contas eram teste.
-- ---------------------------------------------------------------------------
alter table public.tenants
  add column if not exists is_teste boolean not null default false;

comment on column public.tenants.is_teste is
  'Conta interna de teste. DEVE ser excluída de qualquer métrica de negócio (MRR, churn, contagem de clientes).';
