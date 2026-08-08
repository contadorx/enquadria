-- ===========================================================================
-- 0054 — O RADAR GANHA UMA PORTA
-- ===========================================================================
--
-- O DEFEITO, medido no próprio banco em 05/08/2026: `radar_itens` tem QUATRO
-- linhas, todas publicadas em 24/04. Cento e quatro dias parado.
--
-- E a causa não é falta de assunto — é falta de porta. A tabela nasceu com uma
-- política de RLS só: leitura do que está ativo. Não existe INSERT, não existe
-- UPDATE, não existe tela. Os quatro itens entraram por SQL no Supabase.
--
-- Publicar uma notícia exigia abrir o banco de produção. Ninguém faz isso toda
-- semana, e por isso ninguém fez nenhuma vez desde abril. A feature mais
-- diferenciada do produto — a que cruza a norma com a CARTEIRA do contador —
-- está no ar mostrando notícia de quatro meses atrás, o que é pior do que não
-- existir: quem abre conclui que o produto foi abandonado.
--
-- ---------------------------------------------------------------------------
-- A TRAVA FICA NO BANCO, e não na rota.
--
-- Dava para escrever com o service role e conferir o superadmin no código da
-- rota. Seria mais rápido e teria o mesmo defeito de sempre: a regra passaria a
-- morar num arquivo, e a segunda rota que escrevesse na tabela — o importador,
-- o cron, o script de carga — não a herdaria.
--
-- `e_superadmin()` já existe e já é usada pelas funções da plataforma. Aqui ela
-- vira política. Qualquer caminho que chegue à tabela com a sessão de alguém
-- passa pela mesma porta.
-- ===========================================================================

alter table public.radar_itens enable row level security;

drop policy if exists radar_escrita on public.radar_itens;

create policy radar_escrita on public.radar_itens
  for all
  to authenticated
  using (public.e_superadmin())
  with check (public.e_superadmin());

comment on policy radar_escrita on public.radar_itens is
  'Só o dono da plataforma publica no radar. A trava é do banco, não da rota: a segunda rota que escrever aqui herda a regra sem precisar lembrar dela.';

/**
 * O ITEM PRECISA DE TÍTULO E RESUMO — no banco, não só na tela.
 *
 * Item sem resumo aparece no radar do contador como uma linha de título e mais
 * nada. Ele abre, não entende, e a próxima vez não abre. O resumo é o produto.
 *
 * `length >= 20` e não `<> ''`: "atualização" não é resumo.
 */
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'radar_itens_texto_minimo') then
    alter table public.radar_itens add constraint radar_itens_texto_minimo
      check (
        length(btrim(titulo)) >= 8
        and length(btrim(resumo)) >= 20
      );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'radar_itens_severidade_check') then
    alter table public.radar_itens add constraint radar_itens_severidade_check
      check (severidade in ('alta', 'media', 'baixa'));
  end if;
end $$;

/* a tela lista por data e o contador lê por vigência — os dois caminhos quentes */
create index if not exists radar_itens_publicado on public.radar_itens (publicado_em desc);
create index if not exists radar_itens_vigencia on public.radar_itens (vigencia_em)
  where vigencia_em is not null;

-- ═══════════════════════════════════════════════════════════════════════════
-- QUANTAS EMPRESAS ESTE CRITÉRIO ALCANÇA — a pergunta que a tela precisa fazer
-- ANTES de publicar.
--
-- O valor do radar não é a notícia: é "isso atinge 14 dos seus clientes". Um
-- critério errado não dá erro — dá um item que não alcança ninguém, ou que
-- alcança todo mundo. Os dois são silenciosos e os dois queimam a feature.
--
-- Esta função responde na hora da redação, com a base real, para o item não
-- nascer sem alcance.
-- ═══════════════════════════════════════════════════════════════════════════
drop function if exists public.radar_alcance(jsonb);

create function public.radar_alcance(p_criterio jsonb)
returns table (empresas bigint, escritorios bigint, com_analise bigint)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  anexos int[];
  faixas text[];
  saidas text[];
  divisoes text[];
  so_analise boolean;
begin
  if not public.e_superadmin() then
    raise exception 'acesso restrito ao dono da plataforma';
  end if;

  /* critério vazio = alcança todo mundo, igual a `afeta()` em lib/radar.ts.
     As duas implementações precisam concordar; a de lá é a que o contador vê,
     a daqui é a que estima antes de publicar. */
  anexos := case when p_criterio ? 'anexos'
    then array(select (jsonb_array_elements_text(p_criterio->'anexos'))::int) end;
  faixas := case when p_criterio ? 'faixas'
    then array(select jsonb_array_elements_text(p_criterio->'faixas')) end;
  saidas := case when p_criterio ? 'saidas'
    then array(select jsonb_array_elements_text(p_criterio->'saidas')) end;
  divisoes := case when p_criterio ? 'divisoes_cnae'
    then array(select jsonb_array_elements_text(p_criterio->'divisoes_cnae')) end;
  so_analise := coalesce((p_criterio->>'somente_com_analise')::boolean, false);

  return query
  with alvo as (
    select e.id, e.tenant_id,
           exists (select 1 from public.analises a where a.empresa_id = e.id) as tem_analise
      from public.empresas e
      left join lateral (
        select a.saida from public.analises a
         where a.empresa_id = e.id
         order by a.calculado_em desc nulls last limit 1
      ) ult on true
     where (anexos is null or e.anexo = any(anexos))
       and (faixas is null or e.faixa::text = any(faixas))
       and (saidas is null or ult.saida = any(saidas))
       and (divisoes is null or left(regexp_replace(coalesce(e.cnae_principal,''), '\D', '', 'g'), 2) = any(divisoes))
       and (not so_analise or exists (select 1 from public.analises a where a.empresa_id = e.id))
  )
  select count(*)::bigint,
         count(distinct tenant_id)::bigint,
         count(*) filter (where tem_analise)::bigint
    from alvo;
end;
$function$;

revoke all on function public.radar_alcance(jsonb) from public;
grant execute on function public.radar_alcance(jsonb) to authenticated;

comment on function public.radar_alcance(jsonb) is
  'Quantas empresas o critério alcança, na base real. Existe para o item não nascer sem alcance: critério errado não dá erro, dá um item que não atinge ninguém — e isso é silencioso.';
