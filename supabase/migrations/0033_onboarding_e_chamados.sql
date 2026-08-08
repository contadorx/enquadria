-- ===========================================================================
-- RÉGUA DE ONBOARDING + resposta de chamado
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. QUANDO A CONTA NASCEU
--
-- `tenants` não tinha data de criação — o que só se descobre quando alguém
-- tenta ancorar uma régua nela.
-- ---------------------------------------------------------------------------
alter table public.tenants
  add column if not exists criado_em timestamptz not null default now();

-- `laudos.tenant_id` existe em produção desde uma migration anterior à 0020,
-- que não está neste repositório. Declarada aqui pelo mesmo motivo do
-- `logo_url` na 0031: coluna usada no código e ausente das migrations é dívida
-- que só aparece no dia em que alguém monta o banco do zero.
alter table public.laudos
  add column if not exists tenant_id uuid;

-- ---------------------------------------------------------------------------
-- 2. A RÉGUA DE ONBOARDING
--
-- Diferente da de cobrança em NATUREZA, e por isso em tabela própria:
--
--   COBRANÇA ancora numa DATA (o vencimento) e o eixo é o calendário.
--   ONBOARDING ancora num EVENTO (cadastrou, importou, emitiu o primeiro
--   laudo) e o eixo é o que a pessoa fez — ou deixou de fazer.
--
-- Forçar as duas na mesma tabela obrigaria um campo `momento` que significa
-- coisas diferentes em cada linha. Seis meses depois ninguém lembra qual é qual.
-- ---------------------------------------------------------------------------
create table if not exists public.onboarding_passos (
  id        uuid primary key default gen_random_uuid(),
  chave     text not null unique,
  -- o evento âncora
  evento    text not null,
  -- dias APÓS o evento (0 = na hora)
  dias      integer not null default 0,
  assunto   text not null,
  corpo     text not null,
  ativo     boolean not null default true,
  ordem     integer not null default 100,
  criado_em timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'onboarding_passos_evento_check') then
    alter table public.onboarding_passos add constraint onboarding_passos_evento_check
      check (evento in ('cadastro', 'sem_carteira', 'sem_analise', 'sem_laudo', 'primeiro_laudo'));
  end if;
end $$;

create table if not exists public.onboarding_envios (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  passo_chave text not null,
  para        text not null,
  status      text not null default 'enviado',
  erro        text,
  criado_em   timestamptz not null default now(),
  -- um passo de onboarding acontece UMA vez por conta. Não há competência
  -- aqui: a pessoa só entra no produto uma vez.
  unique (tenant_id, passo_chave)
);

insert into public.onboarding_passos (chave, evento, dias, assunto, corpo, ordem) values
  ('boas_vindas', 'cadastro', 0,
   'Bem-vindo ao Enquadria',
   E'Sua conta está pronta.\n\nO primeiro passo leva dois minutos: cole os CNPJs da sua carteira e a triagem separa, na hora, quem tem decisão a tomar até 30 de setembro.\n\n{{link_importar}}\n\nQualquer dúvida, é só responder este e-mail.', 10),
  ('sem_carteira_2d', 'sem_carteira', 2,
   'Comece com dez CNPJs',
   E'Vi que a carteira ainda não subiu. Não precisa ser a carteira inteira: cole dez CNPJs e você já vê a triagem funcionando.\n\n{{link_importar}}\n\nSe algo travou, me conte o que aconteceu — respondo pessoalmente.', 20),
  ('sem_analise_3d', 'sem_analise', 3,
   'A carteira está lá. E agora?',
   E'Sua carteira já está no Enquadria. O próximo passo é escolher UMA empresa — de preferência a que mais vende para outras empresas — e rodar a análise.\n\nSão seis perguntas. O laudo sai no fim.\n\n{{link_painel}}', 30),
  ('sem_laudo_5d', 'sem_laudo', 5,
   'Falta emitir o primeiro laudo',
   E'A análise está feita, o laudo ainda não saiu.\n\nO laudo é o que sustenta o honorário: traz a memória de cálculo completa, para que qualquer profissional possa conferir a conta.\n\n{{link_painel}}', 40),
  ('primeiro_laudo', 'primeiro_laudo', 0,
   'Primeiro laudo emitido',
   E'Saiu o primeiro laudo do seu escritório pelo Enquadria.\n\nDois caminhos daqui:\n\n1. Enviar ao cliente — o botão está na aba Decisão e no Dossiê.\n2. Repetir para o resto da carteira. O cockpit já ordena por prioridade.\n\nA janela fecha em 30 de setembro.', 50)
on conflict (chave) do nothing;

-- ---------------------------------------------------------------------------
-- 3. A TRAVA QUE IMPEDE UM DISPARO RETROATIVO
--
-- Sem isto, no dia seguinte a rodar esta migration TODA conta já existente
-- receberia "Bem-vindo ao Enquadria" — inclusive quem usa há semanas. Não é
-- hipótese: é o comportamento normal de uma régua ancorada em data de
-- criação que acabou de ser preenchida com `now()`.
--
-- Marcamos as contas atuais como já tendo recebido cada passo. Elas entram no
-- regime novo sem receber nada do passado; contas criadas a partir de agora
-- fluem normalmente.
-- ---------------------------------------------------------------------------
insert into public.onboarding_envios (tenant_id, passo_chave, para, status, erro)
select t.id, p.chave, 'migration', 'ignorado', 'conta anterior à régua de onboarding'
from public.tenants t
cross join public.onboarding_passos p
on conflict (tenant_id, passo_chave) do nothing;

-- ---------------------------------------------------------------------------
-- 4. RESPOSTA DE CHAMADO — o aviso que fechava o ciclo pela metade
--
-- O chamado já guardava as mensagens. Faltava registrar que o cliente foi
-- avisado: sem isso, responder no painel e o cliente nunca souber são estados
-- indistinguíveis.
-- ---------------------------------------------------------------------------
alter table public.chamado_mensagens
  add column if not exists notificado_em timestamptz;

comment on column public.chamado_mensagens.notificado_em is
  'Quando o cliente foi avisado por e-mail desta mensagem. Nulo em mensagem do próprio cliente e em resposta cujo e-mail falhou.';
