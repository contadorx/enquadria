-- ===========================================================================
-- GESTÃO DO NEGÓCIO — ciclo de vida da conta, régua de cobrança, NPS→indicação,
-- chamados e assistente
-- ===========================================================================
--
-- Levantado das três aplicações em produção analisadas em 03/08. O documento
-- Gestao_SaaS_Referencia_Unica.md registra o porquê de cada campo; aqui fica
-- só o que o Enquadria adota agora.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. CICLO DE VIDA DA CONTA
--
-- `is_teste` já veio na 0030. Aqui entram os estados que existem para que uma
-- exceção comercial não vire receita fantasma nem bloqueio indevido.
--
-- CORTESIA É ESTADO, NÃO DESCONTO. O aluno do curso que ganha 12 meses precisa
-- de acesso pleno sem entrar no MRR. Tratar isso como plano de R$ 0 faria a
-- conta aparecer como pagante de zero e puxar o ticket médio para baixo; tratar
-- como trial eterno esconderia a data em que o acesso deve acabar.
-- ---------------------------------------------------------------------------
alter table public.tenants
  add column if not exists status text not null default 'ativa',
  add column if not exists acesso_cortesia boolean not null default false,
  add column if not exists cortesia_ate date,
  add column if not exists cortesia_motivo text,
  add column if not exists trial_ate date,
  add column if not exists proximo_vencimento date,
  add column if not exists ultimo_pagamento date,
  add column if not exists ultimo_pagamento_valor numeric(12,2),
  add column if not exists valor_mensal numeric(12,2),
  add column if not exists ciclo_cobranca text not null default 'mensal',
  add column if not exists cancelado_em timestamptz,
  add column if not exists cancelado_motivo text,
  -- por que ESTA conta é exceção. É a memória que some quando a pessoa que
  -- combinou a exceção não está mais por perto.
  add column if not exists obs_admin text,
  add column if not exists asaas_customer_id text,
  add column if not exists asaas_subscription_id text,
  add column if not exists emails_optout boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tenants_status_check') then
    alter table public.tenants add constraint tenants_status_check
      check (status in ('ativa', 'trial', 'cortesia', 'inadimplente', 'cancelada', 'suspensa'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tenants_ciclo_check') then
    alter table public.tenants add constraint tenants_ciclo_check
      check (ciclo_cobranca in ('mensal', 'anual'));
  end if;
end $$;

comment on column public.tenants.ultimo_pagamento is
  'DATA DO ÚLTIMO PAGAMENTO CONFIRMADO. É este campo — e não o status do gateway — que qualifica uma conta como pagante no MRR. O Asaas cria assinatura ACTIVE antes do primeiro pagamento; usar o status inflaria a receita com quem assinou e nunca pagou.';

-- ---------------------------------------------------------------------------
-- 2. RÉGUA DE COBRANÇA
--
-- Existe porque os e-mails do Asaas serão DESLIGADOS. Quem desliga o gateway
-- precisa desta régua: sem ela, a primeira notícia que o cliente tem do
-- vencimento é o corte de acesso.
--
-- Os passos vivem em TABELA, não em código: a copy de cobrança muda com a
-- estação e com o humor da base, e deploy para trocar frase não acontece.
--
-- `dias` é relativo ao vencimento — negativo antes, zero no dia, positivo
-- depois. O nascimento da fatura é o momento `emissao`, que não tem distância
-- do vencimento e por isso não cabe no mesmo eixo.
-- ---------------------------------------------------------------------------
create table if not exists public.cobranca_passos (
  id         uuid primary key default gen_random_uuid(),
  chave      text not null unique,
  momento    text not null default 'vencimento',
  dias       integer not null default 0,
  assunto    text not null,
  corpo      text not null,
  ativo      boolean not null default true,
  ordem      integer not null default 100,
  criado_em  timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cobranca_passos_momento_check') then
    alter table public.cobranca_passos add constraint cobranca_passos_momento_check
      check (momento in ('emissao', 'vencimento'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- O REGISTRO DE ENVIO — e a trava contra cobrar duas vezes.
--
-- A chave única (tenant, passo, competência) é o que impede que um
-- reprocessamento mande a mesma cobrança de novo. É o e-mail mais caro de
-- errar: cliente que recebe segunda cobrança do mesmo mês liga achando que foi
-- cobrado em dobro, e a confiança custa mais que a fatura.
-- ---------------------------------------------------------------------------
create table if not exists public.cobranca_envios (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  passo_chave text not null,
  -- 'AAAA-MM' do vencimento a que este envio se refere
  competencia text not null,
  para        text not null,
  status      text not null default 'enviado',
  erro        text,
  caminho     text,
  criado_em   timestamptz not null default now(),
  unique (tenant_id, passo_chave, competencia)
);

create index if not exists cobranca_envios_tenant_idx
  on public.cobranca_envios (tenant_id, criado_em desc);

-- Passos iniciais. Cobrem o que foi pedido: nascimento da fatura, avisos
-- proativos antes e cobrança depois.
insert into public.cobranca_passos (chave, momento, dias, assunto, corpo, ordem) values
  ('emissao', 'emissao', 0,
   'Sua fatura do Enquadria foi gerada',
   E'Sua fatura de {{competencia}} foi gerada e vence em {{vencimento}}.\n\nValor: {{valor}}\n\n{{link}}\n\nSe já pagou, ignore esta mensagem.', 10),
  ('antes_5', 'vencimento', -5,
   'Sua assinatura do Enquadria vence em 5 dias',
   E'Passando para avisar: sua fatura de {{valor}} vence em {{vencimento}}.\n\n{{link}}', 20),
  ('antes_1', 'vencimento', -1,
   'Vence amanhã',
   E'Sua fatura do Enquadria vence amanhã, {{vencimento}}.\n\n{{link}}', 30),
  ('no_dia', 'vencimento', 0,
   'Vence hoje',
   E'Sua fatura do Enquadria vence hoje.\n\n{{link}}', 40),
  ('apos_3', 'vencimento', 3,
   'Sua fatura está em aberto',
   E'A fatura de {{competencia}} venceu em {{vencimento}} e continua em aberto.\n\n{{link}}\n\nSe houve algum problema no pagamento, é só responder este e-mail.', 50),
  ('apos_10', 'vencimento', 10,
   'Seu acesso ao Enquadria será suspenso',
   E'A fatura de {{competencia}} está em aberto há 10 dias. Para não perder o acesso — e as análises da sua carteira — regularize por aqui:\n\n{{link}}\n\nSe preferir conversar, responda este e-mail.', 60)
on conflict (chave) do nothing;

-- ---------------------------------------------------------------------------
-- 3. NPS QUE VIRA INDICAÇÃO
--
-- A pergunta do NPS É "você indicaria". Quem responde 9 ou 10 acabou de
-- declarar intenção de indicar, por escrito, naquele segundo — e é o único
-- instante em que pedir a indicação não é interrupção.
--
-- Nenhum dos três apps analisados fecha esse ciclo. Aqui a nota decide o que
-- vem depois: promotor recebe o convite para indicar, detrator vai para
-- conversa (nunca para pedido), neutro recebe pedido de melhoria.
-- ---------------------------------------------------------------------------
create table if not exists public.nps_respostas (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid,
  user_id    uuid not null,
  nota       smallint not null check (nota between 0 and 10),
  comentario text,
  criado_em  timestamptz not null default now()
);

create index if not exists nps_respostas_user_idx on public.nps_respostas (user_id, criado_em desc);

create table if not exists public.indicacoes (
  id            uuid primary key default gen_random_uuid(),
  -- quem indicou
  tenant_id     uuid,
  user_id       uuid not null,
  -- de qual resposta de NPS ela nasceu (null = indicação espontânea)
  nps_id        uuid references public.nps_respostas(id) on delete set null,
  nome          text not null,
  email         text not null,
  telefone      text,
  -- convidado → cadastrou → virou cliente
  status        text not null default 'convidado',
  convite_em    timestamptz not null default now(),
  cadastrou_em  timestamptz,
  virou_cliente_em timestamptz
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'indicacoes_status_check') then
    alter table public.indicacoes add constraint indicacoes_status_check
      check (status in ('convidado', 'cadastrou', 'cliente', 'recusou'));
  end if;
end $$;

alter table public.nps_respostas enable row level security;
alter table public.indicacoes enable row level security;

drop policy if exists nps_propria on public.nps_respostas;
create policy nps_propria on public.nps_respostas
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists nps_gestor on public.nps_respostas;
create policy nps_gestor on public.nps_respostas
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_superadmin, false)));

drop policy if exists indicacoes_propria on public.indicacoes;
create policy indicacoes_propria on public.indicacoes
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists indicacoes_gestor on public.indicacoes;
create policy indicacoes_gestor on public.indicacoes
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_superadmin, false)));

-- ---------------------------------------------------------------------------
-- 4. CHAMADOS DE SUPORTE
--
-- Padrão do Contatia e do app: a IA responde e ESCALA o que não resolveu.
-- Falha da IA também escala — o cliente nunca fica sem resposta, e o humano só
-- vê o que a máquina não deu conta.
-- ---------------------------------------------------------------------------
create table if not exists public.chamados (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid,
  user_id     uuid not null,
  assunto     text not null,
  status      text not null default 'aberto',
  -- veio de escalonamento da IA, ou a pessoa abriu direto
  escalado_ia boolean not null default false,
  criado_em   timestamptz not null default now(),
  respondido_em timestamptz,
  resolvido_em  timestamptz
);

create table if not exists public.chamado_mensagens (
  id         uuid primary key default gen_random_uuid(),
  chamado_id uuid not null references public.chamados(id) on delete cascade,
  autor      text not null,
  corpo      text not null,
  criado_em  timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chamados_status_check') then
    alter table public.chamados add constraint chamados_status_check
      check (status in ('aberto', 'respondido', 'resolvido'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chamado_mensagens_autor_check') then
    alter table public.chamado_mensagens add constraint chamado_mensagens_autor_check
      check (autor in ('cliente', 'suporte', 'ia'));
  end if;
end $$;

alter table public.chamados enable row level security;
alter table public.chamado_mensagens enable row level security;

drop policy if exists chamados_proprio on public.chamados;
create policy chamados_proprio on public.chamados
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists chamados_gestor on public.chamados;
create policy chamados_gestor on public.chamados
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_superadmin, false)));

drop policy if exists chamado_msg_proprio on public.chamado_mensagens;
create policy chamado_msg_proprio on public.chamado_mensagens
  for all to authenticated
  using (exists (select 1 from public.chamados c where c.id = chamado_id and (c.user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_superadmin, false)))))
  with check (exists (select 1 from public.chamados c where c.id = chamado_id and (c.user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_superadmin, false)))));

-- ---------------------------------------------------------------------------
-- 5. ASSISTENTE DE IA — com a chave para ligar e desligar
--
-- Linha única (id fixo). Nasce DESLIGADO de propósito: a chave da API é
-- configuração de servidor e o custo é real. Ligar é decisão consciente, não
-- efeito colateral de rodar uma migration.
--
-- A persona vive aqui e não no código pelo mesmo motivo da régua: ajustar tom
-- ou limite de uma IA que está respondendo errado precisa levar minutos, não
-- um deploy.
--
-- `teto_dia` existe porque assistente sem teto é fatura sem teto.
-- ---------------------------------------------------------------------------
create table if not exists public.assistente_config (
  id         smallint primary key default 1,
  ativo      boolean not null default false,
  modelo     text not null default 'claude-haiku-4-5',
  persona    text not null default '',
  teto_dia   integer not null default 200,
  atualizado_em timestamptz not null default now(),
  constraint assistente_config_linha_unica check (id = 1)
);

insert into public.assistente_config (id, ativo, persona) values (
  1, false,
  E'Você é o assistente do Enquadria, um sistema para contadores decidirem o enquadramento de IBS/CBS de clientes do Simples Nacional antes de 30 de setembro de 2026.\n\nResponda em português do Brasil, com objetividade e sem enrolação. Use APENAS o conteúdo dos artigos fornecidos como contexto.\n\nSe a resposta não estiver nos artigos, diga que não sabe e ofereça abrir um chamado — nunca invente número, prazo ou regra tributária. Errar um número aqui vira laudo errado na mão de um cliente.\n\nNão dê consultoria tributária personalizada: quem assina o laudo é o contador.'
) on conflict (id) do nothing;

alter table public.assistente_config enable row level security;

-- todo mundo lê (o app precisa saber se está ligado); só superadmin escreve
drop policy if exists assistente_leitura on public.assistente_config;
create policy assistente_leitura on public.assistente_config
  for select to authenticated using (true);

drop policy if exists assistente_escrita on public.assistente_config;
create policy assistente_escrita on public.assistente_config
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_superadmin, false)))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_superadmin, false)));

-- Uso e custo, INCLUSIVE as falhas: contar só sucesso esconde exatamente o que
-- precisa de conserto.
create table if not exists public.ia_uso (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid,
  contexto  text,
  ok        boolean not null default true,
  erro      text,
  custo_usd numeric(10,5),
  criado_em timestamptz not null default now()
);

create index if not exists ia_uso_dia_idx on public.ia_uso (criado_em desc);
