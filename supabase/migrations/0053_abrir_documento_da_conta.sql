-- ===========================================================================
-- 0053 — O PAINEL MOSTRA O LAUDO E NÃO CONSEGUE ABRIR
-- ===========================================================================
--
-- O DEFEITO, encontrado abrindo uma conta gratuita em 05/08/2026.
--
-- A tela de registros por conta lista os laudos de qualquer escritório: ela lê
-- por `plataforma_conta()`, que é `security definer` e portanto enxerga o banco
-- inteiro. O número do laudo aparece, vira link — e o link vai para
-- `/doc/laudo/[id]`, que lê `laudos` com o cliente da SESSÃO.
--
-- E a RLS de `laudos` é `tenant_id = tenant_atual()`. Nenhuma linha volta, a
-- página chama `notFound()`, e o resultado é uma tela que mostra que o
-- documento existe e se recusa a abri-lo. Não é bug de permissão: é o painel
-- lendo por uma porta e navegando por outra.
--
-- ---------------------------------------------------------------------------
-- O QUE NÃO FIZEMOS: abrir exceção de superadmin na RLS de `laudos`.
--
-- Seria uma linha e resolveria — e passaria a valer para TODA consulta a
-- `laudos` feita com a sessão dele, em qualquer tela, hoje e em todo código
-- futuro. Uma política de tabela é ampla demais para atender uma navegação.
--
-- O QUE FIZEMOS: cada laudo e cada termo JÁ tem um token público de 122 bits —
-- é por ele que o cliente do contador abre o documento, sem login, e a página
-- pública lê com o cliente admin. O dono da plataforma passa pela mesma porta.
-- Nada de novo é exposto: o documento já era alcançável por quem tem o token.
--
-- ---------------------------------------------------------------------------
-- E FICA REGISTRADO. `plataforma_conta()` grava em `acessos_plataforma` que
-- alguém abriu a conta; abrir um DOCUMENTO de um cliente do escritório é um
-- passo a mais e merece a própria linha. O dia em que um contador perguntar
-- "quem viu o laudo do meu cliente?", a resposta precisa existir — e precisa
-- ser mais específica que "a conta foi consultada".
-- ===========================================================================

drop function if exists public.plataforma_documento_token(text, uuid);

create function public.plataforma_documento_token(p_tipo text, p_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path to 'public'
as $function$
declare
  achado text;
  tenant uuid;
  rotulo text;
begin
  if not public.e_plataforma() then
    raise exception 'acesso restrito ao dono da plataforma';
  end if;

  if p_tipo = 'laudo' then
    select l.token, l.tenant_id, 'laudo nº ' || lpad(l.numero::text, 4, '0')
      into achado, tenant, rotulo
      from public.laudos l where l.id = p_id;
  elsif p_tipo = 'termo' then
    /* o termo não tem número próprio: identifica-se pela análise que ele
       fecha, que é como ele aparece na tela de quem está perguntando */
    select m.token, a.tenant_id, 'termo da análise ' || left(m.analise_id::text, 8)
      into achado, tenant, rotulo
      from public.termos m
      join public.analises a on a.id = m.analise_id
     where m.id = p_id;
  else
    raise exception 'tipo de documento desconhecido: %', p_tipo;
  end if;

  if achado is null then
    /* distingue "não existe" de "existe sem token" — o segundo é documento
       antigo, anterior ao token público, e a tela precisa dizer isso em vez de
       mostrar um link quebrado */
    return null;
  end if;

  insert into public.acessos_plataforma (quem, quem_email, tenant_id, acao, detalhe)
  values (auth.uid(),
          (select p.email from public.profiles p where p.id = auth.uid()),
          tenant, 'documento', rotulo);

  return achado;
end;
$function$;

revoke all on function public.plataforma_documento_token(text, uuid) from public;
grant execute on function public.plataforma_documento_token(text, uuid) to authenticated;

comment on function public.plataforma_documento_token(text, uuid) is
  'Devolve o token público do laudo/termo para o dono da plataforma navegar do painel até o documento, e REGISTRA o acesso. Existe para não abrir exceção de superadmin na RLS de laudos — política de tabela é ampla demais para atender uma navegação.';
