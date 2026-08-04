-- ===========================================================================
-- 0044 — TRÊS CAMPOS QUE A RPC NÃO DEVOLVIA, E O ESTRAGO DE CADA UM
-- ===========================================================================
--
-- `negocio_escritorios()` alimenta o painel de plataforma E o motor de e-mails
-- proativos. Três colunas que existem em `tenants` desde a 0030/0031 nunca
-- chegaram lá — e cada ausência tem um efeito concreto:
--
--   is_teste       -> conta de teste recebe e-mail de cliente. Marcar "teste"
--                     no painel não mudava NADA para as réguas: as contas
--                     criadas testando o cadastro recebem boas-vindas, "falta
--                     subir a carteira", janela e conversão como qualquer
--                     contador. Endereço de teste inexistente vira bounce, e
--                     bounce queima a reputação do domínio.
--
--   emails_optout  -> a coluna existe desde a 0031 e NINGUÉM lê. Quem pedir
--                     para não receber continua recebendo, o que é o pior
--                     resultado possível: pior do que nunca ter oferecido a
--                     opção.
--
--   status (do tenant) -> conta cancelada/suspensa segue no funil comercial.
--
-- ---------------------------------------------------------------------------
-- E O `termos`, que a RPC JÁ DEVOLVIA.
--
-- Este é o mais caro dos quatro e não é culpa do banco: `carregarContexto` em
-- lib/reguas.ts montava o objeto campo a campo e esquecia de copiar `termos`.
-- Resultado: `e.termos` era sempre 0, e a régua "laudo emitido sem termo"
-- disparava para QUEM JÁ TINHA TODOS OS TERMOS — e voltava a disparar a cada
-- laudo novo, porque a chave de dedupe inclui a contagem de laudos.
--
-- Ou seja: o cliente mais engajado da base recebia, repetidamente, uma
-- cobrança para fazer algo que ele já fazia. Corrigido no TypeScript.
--
-- ---------------------------------------------------------------------------
-- PRECISA DE DROP.
--
-- `create or replace function` não muda a assinatura de retorno. Acrescentar
-- coluna ao `returns table` exige derrubar e recriar — daí o `drop function`
-- explícito. É seguro: a função é recriada na mesma transação do arquivo.
--
-- Idempotente.
-- ===========================================================================

drop function if exists public.negocio_escritorios();

create function public.negocio_escritorios()
returns table(
  id uuid, nome text, email text, criado_em timestamptz,
  plano_id text, plano_nome text, plano_ciclo text, status text,
  valor_centavos integer, vencimento date, assinatura_id uuid,
  checkout_url text, asaas_id text,
  usuarios bigint, empresas bigint, faixa_a bigint, analises bigint,
  laudos bigint, termos bigint, assinados bigint,
  ultima_analise timestamptz, ultimo_laudo timestamptz,
  -- os três novos
  is_teste boolean, emails_optout boolean, status_conta text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
begin
  if not public.e_plataforma() then
    raise exception 'acesso restrito ao dono da plataforma';
  end if;

  return query
  select
    t.id,
    t.nome,
    (select p.email from public.profiles p where p.tenant_id = t.id order by p.email limit 1),
    t.criado_em,
    a.plano_id,
    pl.nome,
    pl.ciclo,
    -- ::text ANTES do coalesce. Sem isso o Postgres tenta converter
    -- 'gratis' para o enum status_assinatura e derruba a consulta.
    coalesce(a.status::text, 'gratis'),
    a.valor_centavos,
    coalesce(a.vencimento, a.valido_ate),
    a.id,
    a.checkout_url,
    a.asaas_id,
    (select count(*) from public.profiles x where x.tenant_id = t.id),
    (select count(*) from public.empresas  x where x.tenant_id = t.id),
    (select count(*) from public.empresas  x where x.tenant_id = t.id and x.faixa::text = 'A'),
    (select count(*) from public.analises  x where x.tenant_id = t.id),
    (select count(*) from public.laudos    x where x.tenant_id = t.id),
    (select count(*) from public.termos m join public.analises n2 on n2.id = m.analise_id where n2.tenant_id = t.id),
    (select count(*) from public.termos m join public.analises n2 on n2.id = m.analise_id where n2.tenant_id = t.id and m.assinado_em is not null),
    (select max(n3.criado_em)  from public.analises n3 where n3.tenant_id = t.id),
    (select max(l3.emitido_em) from public.laudos   l3 where l3.tenant_id = t.id),
    coalesce(t.is_teste, false),
    coalesce(t.emails_optout, false),
    coalesce(t.status, 'ativa')
  from public.tenants t
  left join lateral (
    select x.* from public.assinaturas x
     where x.tenant_id = t.id
       and x.status::text <> 'cancelada'
     -- ------------------------------------------------------------------
     -- A ASSINATURA QUE REPRESENTA O ESCRITÓRIO HOJE.
     --
     -- Era `(status = 'ativa') desc`, e uma linha ATIVA JÁ VENCIDA ganhava de
     -- uma PENDENTE nova. Efeito: cliente cujo plano venceu e que acabou de
     -- gerar uma cobrança nova continuava sendo lido pela linha velha — a
     -- régua de cobrança nunca via o boleto novo, e a de conversão o tratava
     -- como quem nunca comprou. Renovação e upgrade jamais eram cobrados.
     --
     -- Agora ativa VÁLIDA vem primeiro; depois a pendente mais recente; a
     -- ativa vencida por último, que é o que ela é: histórico.
     -- ------------------------------------------------------------------
     order by (x.status::text = 'ativa'
               and coalesce(x.valido_ate, x.vencimento, current_date) >= current_date) desc,
              (x.status::text = 'pendente') desc,
              coalesce(x.vencimento, x.valido_ate) desc nulls last
     limit 1
  ) a on true
  left join public.planos pl on pl.id = a.plano_id
  order by t.criado_em desc nulls last;
end;
$fn$;

comment on function public.negocio_escritorios() is
  'Base do painel de plataforma e do motor de réguas. is_teste/emails_optout/status_conta entraram na 0044: sem eles, conta de teste e quem pediu descadastro recebiam e-mail comercial.';
