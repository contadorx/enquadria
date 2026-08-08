-- ===========================================================================
-- 0040 — OS TRÊS UPSERTS QUE NUNCA GRAVARAM
-- ===========================================================================
--
-- O BUG, e ele é bonito de tão silencioso.
--
-- A fatura não aparecia na central. O e-mail da cobrança saía, o link
-- funcionava, o Asaas gerava o pagamento, o webhook chegava e era aceito — e
-- `select count(*) from faturas` devolvia ZERO. Nada no log da aplicação, nada
-- na tela, nenhuma exceção.
--
-- A causa não estava no Asaas nem na RLS. Estava aqui, numa linha de índice.
--
--   create unique index faturas_asaas_idx on faturas (asaas_id)
--     where asaas_id is not null;          <-- o "where" é o problema
--
-- O código faz `upsert(..., { onConflict: "asaas_id" })`, que vira
-- `ON CONFLICT (asaas_id) DO UPDATE`. Para resolver isso, o Postgres precisa
-- ACHAR um índice único que case com a especificação — e um índice PARCIAL só
-- casa se o comando repetir o mesmo predicado (`ON CONFLICT (asaas_id) WHERE
-- asaas_id is not null`). O PostgREST não tem como emitir esse predicado.
--
-- Resultado: 42P10, "there is no unique or exclusion constraint matching the
-- ON CONFLICT specification". Todo insert falhava. E como o supabase-js DEVOLVE
-- o erro em vez de lançá-lo, quem não lê o `error` não vê nada acontecer.
--
-- ---------------------------------------------------------------------------
-- E NÃO ERA SÓ A FATURA. Varrendo os 11 `onConflict` do repositório contra os
-- índices reais do banco, três estavam quebrados pelo mesmo motivo:
--
--   · faturas (asaas_id)        índice PARCIAL       -> central de faturas vazia
--   · curso_leads (email)       índice em lower(email) -> captura do site perdia
--                                                        TODO lead, e a rota
--                                                        devolve 200 de
--                                                        propósito, então nem
--                                                        o site reclamava
--   · convites (tenant_id,email) PARCIAL + lower()   -> convidar de novo dava
--                                                        500 na tela da equipe
--
-- Índice de EXPRESSÃO tem exatamente o mesmo problema do parcial: `lower(email)`
-- não é a coluna `email`, e a inferência não acha.
--
-- ---------------------------------------------------------------------------
-- A TROCA, e por que ela não perde nada.
--
-- 1) `faturas`: índice único simples em `asaas_id`. No Postgres, NULL é
--    distinto de NULL num índice único — várias cobranças manuais sem
--    `asaas_id` continuam convivendo. O `where` nunca protegeu nada que o
--    padrão já não protegesse; só quebrava a inferência.
--
-- 2) `curso_leads` e `convites`: índice único na COLUNA, mais um `check` que
--    exige o e-mail em minúsculas. As duas rotas já normalizam antes de
--    gravar (`emailValido` e o `.toLowerCase()` da captura); o `check`
--    transforma essa disciplina de convenção em regra do banco — que é o que o
--    `lower()` no índice tentava fazer, sem o efeito colateral.
--
-- 3) O predicado `where aceito_em is null` de `convites` também sai. A rota
--    grava `aceito_em: null` no upsert: a intenção declarada é UMA linha por
--    (escritório, e-mail), reaproveitada a cada novo convite. O índice agora
--    diz a mesma coisa que o código.
--
-- Idempotente.
-- ===========================================================================

-- ------------------------------------------------------------------ faturas
drop index if exists public.faturas_asaas_idx;
create unique index if not exists faturas_asaas_idx
  on public.faturas (asaas_id);

comment on index public.faturas_asaas_idx is
  'Único e NÃO parcial de propósito: ON CONFLICT (asaas_id) não infere índice parcial. Ver 0040.';

-- -------------------------------------------------------------- curso_leads
update public.curso_leads set email = lower(email) where email <> lower(email);

drop index if exists public.curso_leads_email_unico;
create unique index if not exists curso_leads_email_unico
  on public.curso_leads (email);

alter table public.curso_leads drop constraint if exists curso_leads_email_minusculo;
alter table public.curso_leads
  add constraint curso_leads_email_minusculo check (email = lower(email));

-- ----------------------------------------------------------------- convites
update public.convites set email = lower(email) where email <> lower(email);

-- a mesma pessoa convidada duas vezes vira duas linhas hoje; o índice novo não
-- entra com duplicata na tabela — fica a mais recente, que é a que vale
delete from public.convites c
 using public.convites d
 where c.tenant_id = d.tenant_id
   and lower(c.email) = lower(d.email)
   and (c.criado_em, c.id) < (d.criado_em, d.id);

drop index if exists public.convites_pendente;
create unique index if not exists convites_do_escritorio
  on public.convites (tenant_id, email);

alter table public.convites drop constraint if exists convites_email_minusculo;
alter table public.convites
  add constraint convites_email_minusculo check (email = lower(email));
