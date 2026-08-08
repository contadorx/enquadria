-- ===========================================================================
-- 0060 — ENTREGA GARANTIDA: confirmação em vez de aceite
-- ===========================================================================
--
-- O DEFEITO QUE ISTO CORRIGE, e ele já estava escrito no código:
--
--   `lib/mailer/postal.ts`: "success" significa que o Postal ACEITOU a
--   mensagem na fila dele, não que o destino recebeu.
--
-- A queda para a Brevo cobria o Postal RECUSAR. Não cobria o Postal aceitar e
-- não conseguir entregar — que é o que acontece quando o provedor da VPS
-- bloqueia a porta 25. Nesse cenário a API responde "success", o app registra
-- sucesso, e a mensagem apodrece na fila. O termo de ciência não chega ao
-- cliente do contador e ninguém fica sabendo.
--
-- Falha silenciosa em e-mail transacional é a pior classe de defeito deste
-- produto: não quebra nada, não aparece em log de erro, e o prejuízo é um
-- documento jurídico que alguém jurou ter recebido.
--
-- DUAS TABELAS:
--
--   emails_saida    o registro de TODA mensagem que sai, com chave idempotente
--                   e status de ciclo de vida. Sem registro não há como saber
--                   o que não chegou.
--   email_disjuntor uma linha só: o envio próprio está de pé ou não. Quem
--                   escreve é a varredura; quem lê é o envio.
--
-- A decisão (o que é perdido, quando reenviar, quando abrir e fechar o
-- disjuntor) mora em `lib/entrega-garantida.ts`, com teste. Aqui é só a forma.
--
-- Idempotente.
-- ===========================================================================

create table if not exists public.emails_saida (
  id            uuid primary key default gen_random_uuid(),

  -- (tag, destinatário, referência) — impede o mesmo documento de sair duas
  -- vezes. Reenvio automático sem isto é como um cliente recebe seis termos
  -- iguais e desconfia dos seis.
  chave         text not null,

  para          text not null,
  tag           text not null default 'app',
  assunto       text,

  -- 'postal' | 'brevo'
  caminho       text not null,
  -- id devolvido pelo provedor; é por ele que o webhook encontra a linha
  mensagem_id   text,

  -- aceito | entregue | falhou | perdido | reenviado
  status        text not null default 'aceito',
  tentativas    int  not null default 0,
  erro          text,

  -- quando existe, liga a mensagem ao documento (laudo, termo, proposta)
  referencia    text,
  tenant_id     uuid,

  criado_em     timestamptz not null default now(),
  confirmado_em timestamptz,
  reenviado_em  timestamptz
);

-- A chave é única POR TENTATIVA: o reenvio cria linha nova com a mesma chave
-- e caminho diferente, e é isso que permite auditar "saiu duas vezes, por
-- caminhos diferentes, porque a primeira não confirmou".
create unique index if not exists emails_saida_chave_caminho_idx
  on public.emails_saida (chave, caminho);

-- os três índices que a varredura e o webhook usam a cada execução
create index if not exists emails_saida_pendentes_idx
  on public.emails_saida (status, caminho, criado_em)
  where status = 'aceito';
create index if not exists emails_saida_mensagem_idx on public.emails_saida (mensagem_id);
create index if not exists emails_saida_data_idx on public.emails_saida (criado_em desc);

alter table public.emails_saida enable row level security;

-- leitura só de superadmin: é registro de plataforma, não de escritório
drop policy if exists emails_saida_leitura on public.emails_saida;
create policy emails_saida_leitura on public.emails_saida
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_superadmin, false)));

comment on table public.emails_saida is
  'Registro de toda mensagem transacional que sai, com confirmação de ENTREGA (não de aceite). Alimenta o reenvio automático e o disjuntor.';

-- ---------------------------------------------------------------------------
-- O DISJUNTOR — uma linha, e o motivo por escrito.
--
-- `estado` fechado = envio próprio na frente. Aberto = tudo pela Brevo.
--
-- O motivo é obrigatório na prática (quem abrir esta tabela daqui a três meses
-- precisa saber por que o desvio aconteceu) e `desde` é o que autoriza a sonda:
-- o disjuntor NUNCA fecha por tempo, só por evidência de entrega.
-- ---------------------------------------------------------------------------
create table if not exists public.email_disjuntor (
  id            smallint primary key default 1,
  estado        text not null default 'fechado',
  motivo        text,
  desde         timestamptz,
  atualizado_em timestamptz not null default now(),
  constraint email_disjuntor_linha_unica check (id = 1),
  constraint email_disjuntor_estado_valido check (estado in ('fechado', 'aberto'))
);

insert into public.email_disjuntor (id, estado) values (1, 'fechado')
  on conflict (id) do nothing;

alter table public.email_disjuntor enable row level security;

-- todo mundo autenticado LÊ (a tela de diagnóstico precisa), só superadmin
-- escreve pela tela; a varredura escreve com service role
drop policy if exists email_disjuntor_leitura on public.email_disjuntor;
create policy email_disjuntor_leitura on public.email_disjuntor
  for select to authenticated using (true);

drop policy if exists email_disjuntor_escrita on public.email_disjuntor;
create policy email_disjuntor_escrita on public.email_disjuntor
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_superadmin, false)))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_superadmin, false)));

comment on table public.email_disjuntor is
  'Estado do envio próprio. Aberto = desviando tudo para a Brevo. Só abre e só fecha por evidência de entrega, nunca por tempo.';
