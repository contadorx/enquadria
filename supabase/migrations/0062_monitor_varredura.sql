-- ===========================================================================
-- 0062 — O MONITOR DA VARREDURA: a quebra deixa de ser cega
-- ===========================================================================
--
-- A 0060 criou a trava que impede a varredura de concluir perda quando não há
-- confirmação nenhuma (webhook desligado). A trava protege o sistema de si
-- mesmo — e o aviso dela ficava em dois lugares que ninguém olha: o JSON de
-- retorno do cron e o log da Vercel.
--
-- Ou seja: o alerta mais importante da infraestrutura de e-mail estava num
-- lugar onde o dono do produto não passa. É o MESMO defeito de origem que esta
-- série inteira corrige — informação que existe e não chega a quem decide.
--
-- Estas colunas guardam o resultado da última varredura para a tela de
-- Negócio → E-mails poder mostrá-lo. Elas moram em `email_disjuntor` porque
-- essa linha já é "o estado de saúde do envio"; uma segunda tabela de uma
-- linha só seria cerimônia sem ganho.
--
-- `varredura_em` serve a um alarme que as outras colunas não dariam: se o CRON
-- parar de rodar, nada aqui muda — e a ausência de mudança é justamente o
-- sintoma. Sem a data, um cron morto seria invisível.
--
-- Idempotente.
-- ===========================================================================

alter table public.email_disjuntor
  add column if not exists varredura_em     timestamptz,
  add column if not exists varredura_cega   boolean not null default false,
  add column if not exists varredura_aviso  text,
  add column if not exists varredura_resumo jsonb;

comment on column public.email_disjuntor.varredura_cega is
  'true quando a última varredura se recusou a concluir por falta de confirmações (webhook provavelmente desligado).';
comment on column public.email_disjuntor.varredura_em is
  'Quando a varredura rodou pela última vez. Ausência de atualização é o único sintoma de cron parado.';
