-- ===========================================================================
-- CENTRAL DE AJUDA — artigos editáveis pelo superadmin, com aviso de novidade
-- ===========================================================================
--
-- POR QUE ESTA TABELA EXISTE, E POR QUE ELA NÃO É "SÓ CONTEÚDO".
--
-- O Enquadria vende uma decisão com prazo: 30/09. A Reforma que sustenta essa
-- decisão continua mudando — LC 214, Lei 15.270, regulamentações que ainda vão
-- sair. Conteúdo que envelhece dentro de um produto que cobra por estar certo
-- não é acessório: é parte do que foi vendido.
--
-- Duas consequências no desenho:
--
--  1. QUEM EDITA É O SUPERADMIN, pela interface, sem deploy. Se publicar uma
--     atualização da Reforma exigir passar por mim, ela não vai ser publicada
--     na semana em que importa.
--
--  2. O APP AVISA. Artigo publicado que ninguém lê é igual a artigo que não
--     existe. A leitura é rastreada POR USUÁRIO e comparada com a data de
--     ATUALIZAÇÃO do artigo — então corrigir um artigo já lido volta a marcá-lo
--     como novo, que é exatamente o comportamento que uma reforma em transição
--     exige. Marcar só "li uma vez" faria a correção passar despercebida.
--
-- MÍDIA. `video_url` e `capa_url` são endereços, não arquivos: o vídeo mora no
-- YouTube/Vimeo e a imagem no Storage. Guardar binário aqui encareceria o
-- banco para resolver um problema que uma URL resolve.
-- ---------------------------------------------------------------------------

create table if not exists public.ajuda_artigos (
  id           uuid primary key default gen_random_uuid(),
  -- endereço estável do artigo. Muda o título, o link continua valendo.
  slug         text not null unique,
  titulo       text not null,
  resumo       text,
  -- conjunto fechado: texto livre aqui vira filtro quebrado seis meses depois
  categoria    text not null default 'produto',
  -- markdown. Não guardamos HTML: conteúdo editável que vira HTML no banco é
  -- injeção esperando acontecer, e quem edita não precisa escrever tags.
  corpo        text not null default '',
  -- vídeo incorporado (YouTube ou Vimeo). Opcional.
  video_url    text,
  -- imagem de capa. As demais imagens entram no corpo, em markdown.
  capa_url     text,
  publicado    boolean not null default false,
  publicado_em timestamptz,
  -- ordem manual dentro da categoria; menor primeiro
  ordem        integer not null default 100,
  criado_em    timestamptz not null default now(),
  -- É ESTA data que decide se o artigo volta a ser "novo" para quem já leu.
  atualizado_em timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ajuda_artigos_categoria_check'
  ) then
    alter table public.ajuda_artigos
      add constraint ajuda_artigos_categoria_check
      check (categoria in ('reforma', 'produto', 'comercial'));
  end if;
end $$;

create index if not exists ajuda_artigos_cat_idx
  on public.ajuda_artigos (categoria, ordem);
create index if not exists ajuda_artigos_pub_idx
  on public.ajuda_artigos (publicado, atualizado_em desc);

-- ---------------------------------------------------------------------------
-- Quem leu o quê, e QUANDO. A data é o dado: comparada com atualizado_em, ela
-- responde "há novidade para esta pessoa?" sem nenhuma flag para manter.
-- ---------------------------------------------------------------------------
create table if not exists public.ajuda_leituras (
  user_id   uuid not null,
  artigo_id uuid not null references public.ajuda_artigos(id) on delete cascade,
  lido_em   timestamptz not null default now(),
  primary key (user_id, artigo_id)
);

-- ---------------------------------------------------------------------------
-- O gatilho que mantém atualizado_em honesto.
--
-- Deixar isso na aplicação significaria que qualquer rota que esqueça de setar
-- a data quebra o aviso de novidade — e o sintoma seria silencioso: ninguém
-- reclama de aviso que NÃO apareceu.
-- ---------------------------------------------------------------------------
create or replace function public.ajuda_touch()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

drop trigger if exists ajuda_artigos_touch on public.ajuda_artigos;
create trigger ajuda_artigos_touch
  before update on public.ajuda_artigos
  for each row execute function public.ajuda_touch();

-- ---------------------------------------------------------------------------
-- RLS
--
-- Ler: qualquer usuário autenticado, e SÓ o que está publicado. Rascunho é
-- rascunho — artigo pela metade sobre a Reforma é pior que artigo nenhum.
-- Escrever: só superadmin.
-- ---------------------------------------------------------------------------
alter table public.ajuda_artigos enable row level security;
alter table public.ajuda_leituras enable row level security;

drop policy if exists ajuda_artigos_leitura on public.ajuda_artigos;
create policy ajuda_artigos_leitura on public.ajuda_artigos
  for select to authenticated
  using (
    publicado
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and coalesce(p.is_superadmin, false)
    )
  );

drop policy if exists ajuda_artigos_escrita on public.ajuda_artigos;
create policy ajuda_artigos_escrita on public.ajuda_artigos
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and coalesce(p.is_superadmin, false)
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and coalesce(p.is_superadmin, false)
    )
  );

drop policy if exists ajuda_leituras_propria on public.ajuda_leituras;
create policy ajuda_leituras_propria on public.ajuda_leituras
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Semente: um artigo da Reforma já publicado.
--
-- Central vazia ensina que a central é vazia. A pessoa entra uma vez, não acha
-- nada e não volta — e o custo disso não é o artigo faltando, é o hábito
-- perdido.
-- ---------------------------------------------------------------------------
insert into public.ajuda_artigos (slug, titulo, resumo, categoria, corpo, publicado, publicado_em, ordem)
values (
  'a-janela-de-setembro',
  'A janela de setembro: o que muda e por quê',
  'Por que 30 de setembro de 2026 decide o imposto de 2027, e quem precisa escolher.',
  'reforma',
  E'## O que está em jogo\n\nA LC 214/2025 criou o IBS e a CBS e desenhou a transição. Para o optante pelo Simples Nacional, ela abriu uma escolha que não existia: **recolher IBS/CBS por dentro do DAS** ou **por fora**, no regime não cumulativo.\n\nA escolha vale para o ano-calendário de 2027 e precisa ser feita até **30 de setembro de 2026**.\n\n## Quem precisa decidir\n\nNão é a carteira inteira. O que move a conta é o peso do crédito que o cliente PJ do seu cliente consegue aproveitar. Empresa que vende para consumidor final raramente ganha ao sair do DAS; empresa que vende para outras empresas com frequência ganha.\n\n## O que o Enquadria faz\n\nA triagem separa quem tem decisão a tomar de quem não tem. Para quem tem, o laudo mostra a conta — fórmula, números e resultado, linha a linha — para que qualquer profissional possa conferir.\n\n## O que ainda pode mudar\n\nA regulamentação continua saindo. Este artigo é atualizado quando algo relevante muda, e o app avisa você.',
  true,
  now(),
  1
)
on conflict (slug) do nothing;
