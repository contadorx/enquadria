-- ===========================================================================
-- 0046 — A DURAÇÃO DA AULA SAI DO CÓDIGO
-- ===========================================================================
--
-- O link do vídeo já mora em `curso_videos` desde a 0038: publicar aula deixou
-- de ser um deploy. A DURAÇÃO ficou para trás — e ela é o campo que mais muda,
-- porque só se sabe o número certo depois de gravar.
--
-- Hoje o minuto está escrito em DOIS lugares: `lib/curso.ts` e o gerador
-- `gerar_curso.py`. Dois lugares com o mesmo dado é uma divergência esperando
-- a data. E os dois estão errados desde sempre: a ementa publica 9, 9 e 8
-- minutos para as aulas 4, 5 e 6, enquanto o roteiro, a 155 palavras por
-- minuto, mede cerca de 16 minutos cada.
--
-- Com o campo aqui, o número certo entra pela tela depois da gravação, ao lado
-- do link — que é o momento em que ele é conhecido. O valor do código vira o
-- que sempre deveria ter sido: uma ESTIMATIVA de planejamento, usada só
-- enquanto a aula não foi gravada.
--
-- Por que na mesma tabela e não numa nova: a chave é a mesma (`slug`), o dono é
-- o mesmo, e os dois campos são preenchidos no mesmo minuto, pela mesma pessoa,
-- olhando para o mesmo vídeo. Tabela separada seria um join para nada.
-- ===========================================================================

alter table public.curso_videos
  add column if not exists minutos integer;

comment on column public.curso_videos.minutos is
  'Duração real da aula, em minutos, medida depois de gravar. Nulo = ainda não medida, e vale a estimativa de lib/curso.ts.';

/**
 * A trava existe porque o campo é digitado à mão numa tela de admin, e os dois
 * erros prováveis são o dedo escorregando (0) e o segundo virando minuto
 * (5.400). Nenhuma aula deste curso tem 0 nem 10 horas.
 */
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'curso_videos_minutos_plausivel'
       and conrelid = 'public.curso_videos'::regclass
  ) then
    alter table public.curso_videos
      add constraint curso_videos_minutos_plausivel
      check (minutos is null or (minutos > 0 and minutos <= 600));
  end if;
end
$$;
