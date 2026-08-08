-- ===========================================================================
-- 0047 — UMA FONTE SÓ PARA O DINHEIRO
-- ===========================================================================
--
-- O PROBLEMA, e ele é pior do que "duas telas parecidas".
--
-- Negócio → Contas e Negócio → Cobranças mostram o mesmo escritório com fontes
-- DIFERENTES, e as duas são editáveis:
--
--   Contas    lê `tenants` direto e escreve em `tenants`
--             (status, valor_mensal, ultimo_pagamento, proximo_vencimento)
--   Cobranças lê a RPC `negocio_escritorios()` e escreve em `assinaturas`
--             (status, valor_centavos, vencimento, plano)
--
-- Ou seja: o mesmo escritório tem STATUS em dois lugares e VALOR em dois. Mudar
-- num não muda no outro. E o MRR sai de `tenants` enquanto a cobrança real sai
-- de `assinaturas` — os dois números podem discordar sem que ninguém veja.
--
-- ---------------------------------------------------------------------------
-- QUEM É A VERDADE.
--
-- Não é nenhuma das duas telas: é a FATURA. `faturas.status = 'pago'` vem do
-- webhook do Asaas — é o único registro que ninguém digita. Depois dela vem
-- `assinaturas`, que é o contrato. `tenants.ultimo_pagamento` e
-- `tenants.valor_mensal` são cópias mantidas à mão do que a fatura já sabe.
--
-- Esta migration NÃO apaga esses campos. Eles continuam valendo para o que a
-- fatura não cobre: PIX combinado por fora, cortesia negociada, o pagamento que
-- entrou antes de o webhook existir. O que muda é a ORDEM: a fatura paga vence
-- o campo digitado, e quando os dois discordam a tela DIZ.
--
-- ---------------------------------------------------------------------------
-- O QUE ESTA FUNÇÃO PASSA A DEVOLVER.
--
-- Tudo que as duas telas precisavam, de uma vez, para que exista uma tela só:
--
--   · o lado do CONTRATO (assinaturas + planos) — já vinha;
--   · o lado do PAGAMENTO REAL (faturas pagas) — novo;
--   · o lado da CONTA (cortesia, obs, cancelamento, CRC) — novo;
--   · os campos DIGITADOS de `tenants`, com prefixo `t_`, para a tela poder
--     comparar e mostrar a divergência em vez de escolher um em silêncio.
--
-- Nada aqui decide qual valor usar. A decisão é do `lib/cobranca.ts`, onde ela
-- é testável. O banco entrega os dois lados e o rótulo de quem é quem.
-- ===========================================================================

drop function if exists public.negocio_escritorios();

create function public.negocio_escritorios()
returns table (
  id uuid, nome text, email text, criado_em timestamptz,
  plano_id text, plano_nome text, plano_ciclo text,
  status text, valor_centavos integer, vencimento date,
  assinatura_id uuid, checkout_url text, asaas_id text,
  usuarios bigint, empresas bigint, faixa_a bigint, analises bigint,
  laudos bigint, termos bigint, assinados bigint,
  ultima_analise timestamptz, ultimo_laudo timestamptz,
  is_teste boolean, emails_optout boolean, status_conta text,
  -- ── pagamento REAL, vindo da fatura (o que ninguém digita) ──────────────
  pago_em date, pago_valor_centavos integer, pagas bigint,
  fatura_aberta_centavos integer, fatura_aberta_vence date,
  -- ── a conta, do lado que não é contrato ─────────────────────────────────
  crc text, acesso_cortesia boolean, cortesia_ate date, cortesia_motivo text,
  obs_admin text, cancelado_em timestamptz, cancelado_motivo text,
  -- ── o que foi DIGITADO em tenants, para comparar ────────────────────────
  t_valor_mensal numeric, t_ultimo_pagamento date,
  t_ultimo_pagamento_valor numeric, t_ciclo text, t_proximo_vencimento date
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
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
    coalesce(t.status, 'ativa'),

    /* ── O PAGAMENTO REAL ───────────────────────────────────────────────────
       A última fatura PAGA. `pago_em` cai para `vencimento` quando o webhook
       não trouxe a data — melhor uma data aproximada que um pagamento
       invisível, e a tela marca a diferença. */
    f.pago_em::date,
    f.valor_centavos,
    (select count(*) from public.faturas x where x.tenant_id = t.id and x.status = 'pago'),

    /* a cobrança em aberto mais próxima — é o que a régua persegue */
    ab.valor_centavos,
    ab.vencimento,

    t.crc,
    coalesce(t.acesso_cortesia, false),
    t.cortesia_ate,
    t.cortesia_motivo,
    t.obs_admin,
    t.cancelado_em,
    t.cancelado_motivo,

    t.valor_mensal,
    t.ultimo_pagamento,
    t.ultimo_pagamento_valor,
    t.ciclo_cobranca,
    t.proximo_vencimento

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
  left join lateral (
    /* a última entrada de dinheiro CONFIRMADA */
    select coalesce(x.pago_em, x.vencimento) as pago_em, x.valor_centavos
      from public.faturas x
     where x.tenant_id = t.id and x.status = 'pago'
     order by coalesce(x.pago_em, x.vencimento) desc nulls last
     limit 1
  ) f on true
  left join lateral (
    /* a cobrança em aberto mais próxima de vencer */
    select x.valor_centavos, x.vencimento
      from public.faturas x
     where x.tenant_id = t.id and x.status in ('pendente', 'vencido')
     order by x.vencimento asc nulls last
     limit 1
  ) ab on true
  order by t.criado_em desc nulls last;
end;
$function$;

revoke all on function public.negocio_escritorios() from public;
grant execute on function public.negocio_escritorios() to authenticated, service_role;

comment on function public.negocio_escritorios() is
  'Fonte única da tela de Contas: contrato (assinaturas), pagamento real (faturas pagas) e os campos digitados em tenants, lado a lado, para a tela poder mostrar divergência em vez de escolher em silêncio.';
