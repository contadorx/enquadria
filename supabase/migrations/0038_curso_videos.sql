-- ===========================================================================
-- 0038 — O LINK DO VÍDEO SAI DO CÓDIGO
-- ===========================================================================
--
-- POR QUE ESTA TABELA EXISTE, na sua palavra: "o problema é subscrever".
--
-- A grade do curso mora em `lib/curso.ts` — e ali ela está bem: título,
-- resumo, tópicos e minutos são conteúdo editorial, escritos uma vez e
-- raramente tocados. O LINK DO VÍDEO não é isso. Ele muda nove vezes só na
-- primeira leva, e cada mudança, morando no código, custa:
--
--   · editar arquivo → commit → deploy → esperar build;
--   · e, no fluxo real desta operação, extrair um zip por cima da pasta, com
--     o risco de sobrescrever trabalho que estava só de um lado.
--
-- Publicar aula não pode depender de deploy. A partir daqui, o link vive no
-- banco e se edita numa tela — o código só guarda o texto da aula.
--
-- LEITURA PÚBLICA, ESCRITA DE SUPERADMIN. A página do curso é aberta (assistir
-- nunca pede cadastro, é regra do produto), então `anon` precisa ler. Escrever
-- só quem administra a plataforma. Não há dado pessoal aqui: é uma URL de
-- vídeo público.
--
-- A CHAVE É O SLUG DA AULA, o mesmo de `lib/curso.ts`. Assim o vínculo não
-- depende de ordem nem de id gerado, e uma aula renomeada no código
-- simplesmente volta a aparecer como "em breve" em vez de exibir o vídeo
-- errado — falha segura.
--
-- Idempotente.
-- ===========================================================================

create table if not exists public.curso_videos (
  slug          text primary key,
  video_url     text,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);

alter table public.curso_videos enable row level security;

-- qualquer visitante lê: a página do curso é pública por decisão de produto
drop policy if exists curso_videos_leitura on public.curso_videos;
create policy curso_videos_leitura on public.curso_videos
  for select to anon, authenticated using (true);

-- só quem administra a plataforma escreve
drop policy if exists curso_videos_escrita on public.curso_videos;
create policy curso_videos_escrita on public.curso_videos
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_superadmin, false)))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_superadmin, false)));

comment on table public.curso_videos is
  'Link do vídeo de cada aula do curso, por slug. Fica fora do código para publicar aula sem deploy.';
