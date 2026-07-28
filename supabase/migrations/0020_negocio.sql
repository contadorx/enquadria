-- ============================================================================
-- Enquadria — Migration 0020 (Aba NEGÓCIO)
--
-- O console do dono do Enquadria: receita, cobrança, réguas de e-mail proativo
-- e desenho dos planos. Tudo em cima do que já existe (planos, assinaturas,
-- laudos, análises) — nenhuma tabela do produto é alterada em comportamento.
--
-- O QUE ENTRA
--   1) profiles.is_superadmin + e_superadmin()  — quem enxerga a aba.
--   2) planos ganha DESENHO: ciclo, dias de acesso, chamada, visibilidade,
--      destaque, limites (empresas/usuários) e recursos (jsonb).
--   3) assinaturas ganha CONTABILIDADE: valor pago, vencimento, pago_em,
--      cancelada_em e o id da assinatura recorrente no Asaas.
--   4) plataforma_reguas / plataforma_envios — e-mails proativos com texto no
--      banco e deduplicação por índice único.
--   5) plataforma_mrr — foto mensal da receita.
--   6) plataforma_config — parâmetros do negócio, sem deploy.
--   7) negocio_escritorios() e negocio_snapshot() — a fonte do painel, via RPC
--      (funciona sem SUPABASE_SERVICE_ROLE_KEY).
--
-- ⚠️ CONSERTA UM VAZAMENTO DE RECEITA
--    O webhook do Asaas dava **365 dias** de acesso em qualquer pagamento
--    confirmado — inclusive no PRO mensal de R$ 47. Um pagamento de um mês
--    liberava um ano. Agora cada plano declara `dias_acesso` (mensal 31,
--    anual 365) e o webhook passa a respeitar isso. Veja a PARTE 9: ela LISTA
--    as assinaturas que hoje estão com validade esticada, sem alterar nada.
--
-- Idempotente. Roda depois de 0001..0019.
-- ============================================================================


-- ============================================================================
-- 0) FERRAMENTA: descobrir o nome real de uma coluna
--    Lição das migrations desta série: nunca supor o schema. Aqui a gente
--    PERGUNTA ao banco qual coluna de data existe, e monta as funções em cima
--    do nome verdadeiro.
-- ============================================================================
create or replace function public.primeira_coluna(p_tabela text, p_candidatas text[])
returns text
language sql stable as $$
  select c.column_name
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name = p_tabela
     and c.column_name = any(p_candidatas)
   order by array_position(p_candidatas, c.column_name)
   limit 1;
$$;


-- ============================================================================
-- 1) QUEM É O DONO DA PLATAFORMA
-- ============================================================================
alter table public.profiles add column if not exists is_superadmin boolean not null default false;

create or replace function public.e_superadmin()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_superadmin from public.profiles p where p.id = auth.uid()), false);
$$;

grant execute on function public.e_superadmin() to authenticated;

-- BOOTSTRAP (rode UMA vez, com o seu e-mail):
--   update public.profiles set is_superadmin = true where email = 'SEU_EMAIL';


-- ============================================================================
-- 2) DESENHO DOS PLANOS
-- ============================================================================
alter table public.planos add column if not exists ciclo            text;      -- mensal | anual | avulso
alter table public.planos add column if not exists dias_acesso      int;       -- quantos dias cada pagamento libera
alter table public.planos add column if not exists chamada          text;      -- uma linha, para a vitrine
alter table public.planos add column if not exists publico          boolean not null default true;
alter table public.planos add column if not exists destaque         boolean not null default false;
alter table public.planos add column if not exists limite_empresas  int;       -- null = ilimitado
alter table public.planos add column if not exists limite_usuarios  int;       -- null = ilimitado
alter table public.planos add column if not exists recursos         jsonb not null default '[]'::jsonb;
alter table public.planos add column if not exists atualizado_em    timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- 2b) CATÁLOGO DE RECURSOS — a fonte dos nomes que aparecem na vitrine
-- ---------------------------------------------------------------------------
create table if not exists public.plataforma_recursos (
  chave     text primary key,
  nome      text not null,
  descricao text,
  categoria text not null default 'geral',   -- triagem | decisao | entrega | acompanhamento | escritorio
  ordem     int  not null default 0
);

alter table public.plataforma_recursos enable row level security;
drop policy if exists recursos_leitura on public.plataforma_recursos;
create policy recursos_leitura on public.plataforma_recursos for select using (auth.uid() is not null);
drop policy if exists recursos_escrita on public.plataforma_recursos;
create policy recursos_escrita on public.plataforma_recursos for all
  using (public.e_superadmin()) with check (public.e_superadmin());

insert into public.plataforma_recursos (chave, nome, descricao, categoria, ordem) values
  ('importar',     'Importar a carteira',        'CSV do seu sistema, com validação de CNPJ e deduplicação.',            'triagem',         10),
  ('triagem',      'Triagem da carteira',        'Classifica cada CNPJ em faixas A/B/C/D, MEI e fora de escopo.',        'triagem',         20),
  ('mapa_risco',   'Mapa de risco e potencial',  'Quantas empresas precisam decidir e quanto isso vale em honorário.',   'triagem',         30),
  ('analise',      'Análise empresa a empresa',  'Alíquota efetiva, receita qualificada e repasse de equilíbrio.',       'decisao',         40),
  ('lote',         'Análise em lote',            'Roda a fila inteira de uma vez, com as mesmas premissas.',             'decisao',         50),
  ('comparativo',  'Comparativo de regimes',     'Cenário dentro e fora do DAS, lado a lado, com a premissa carimbada.', 'decisao',         60),
  ('laudo',        'Laudo white-label',          'O documento com a sua marca — o entregável que se cobra.',             'entrega',         70),
  ('termo',        'Termo de ciência assinado',  'Assinatura eletrônica com trilha, hash e verificação pública.',        'entrega',         80),
  ('verificacao',  'Verificação pública',        'Qualquer pessoa confere o documento pelo código, a qualquer tempo.',   'entrega',         90),
  ('dossie',       'Dossiê por empresa',         'Histórico de análises, laudos e termos de cada cliente.',              'acompanhamento', 100),
  ('radar',        'Radar da transição',         'O que mudou na reforma e quais clientes seus isso atinge.',            'acompanhamento', 110),
  ('revisao',      'Revisão da carteira',        'Recalcula a carteira a cada janela até 2033.',                         'acompanhamento', 120),
  ('digest',       'Resumo mensal por e-mail',   'O pulso da carteira sem precisar lembrar de abrir o sistema.',         'acompanhamento', 130),
  ('equipe',       'Equipe do escritório',       'Convide sócios e analistas para o mesmo escritório.',                  'escritorio',     140),
  ('logo',         'Marca do escritório',        'Sua logo nos laudos, termos e relatórios.',                            'escritorio',     150)
on conflict (chave) do update set
  nome = excluded.nome, descricao = excluded.descricao,
  categoria = excluded.categoria, ordem = excluded.ordem;

-- ---------------------------------------------------------------------------
-- 2c) O DESENHO DOS TRÊS PLANOS QUE EXISTEM HOJE
--     Preço mantido: Grátis · PRO R$ 47/mês · PRO anual R$ 470.
--     O que muda é o que estava implícito virar explícito.
-- ---------------------------------------------------------------------------
update public.planos set
  ciclo           = 'avulso',
  dias_acesso     = null,
  chamada         = 'Veja a sua carteira inteira antes de pagar qualquer coisa.',
  publico         = true,
  destaque        = false,
  limite_empresas = null,
  limite_usuarios = 2,
  recursos        = '["importar","triagem","mapa_risco","analise","lote","comparativo","laudo","termo","verificacao"]'::jsonb,
  atualizado_em   = now()
where id = 'gratis';

update public.planos set
  ciclo           = 'mensal',
  dias_acesso     = 31,
  chamada         = 'Uma análise cobrada do seu cliente paga o ano inteiro.',
  publico         = true,
  destaque        = true,
  limite_empresas = null,
  limite_usuarios = null,
  recursos        = '["importar","triagem","mapa_risco","analise","lote","comparativo","laudo","termo","verificacao","dossie","radar","revisao","digest","equipe","logo"]'::jsonb,
  atualizado_em   = now()
where id = 'assinatura';

update public.planos set
  ciclo           = 'anual',
  dias_acesso     = 365,
  chamada         = 'Dois meses grátis e todas as janelas do período cobertas.',
  publico         = true,
  destaque        = false,
  limite_empresas = null,
  limite_usuarios = null,
  recursos        = '["importar","triagem","mapa_risco","analise","lote","comparativo","laudo","termo","verificacao","dossie","radar","revisao","digest","equipe","logo"]'::jsonb,
  atualizado_em   = now()
where id = 'pro_anual';

-- planos antigos desativados na 0010: marca o ciclo para o painel não os tratar
-- como assinatura recorrente.
update public.planos
   set ciclo = coalesce(ciclo, 'avulso'), publico = false
 where coalesce(ativo, false) = false;

-- qualquer plano que sobrou sem ciclo declarado
update public.planos set ciclo = case when coalesce(recorrente, false) then 'mensal' else 'avulso' end
 where ciclo is null;
update public.planos set dias_acesso = case ciclo when 'mensal' then 31 when 'anual' then 365 else null end
 where dias_acesso is null and ciclo in ('mensal','anual');


-- ============================================================================
-- 3) CONTABILIDADE DA ASSINATURA
--    A tabela `assinaturas` guardava só status e validade. Sem o valor pago,
--    o MRR teria de ser inferido do plano de hoje — e mudar o preço do plano
--    reescreveria o histórico. O valor passa a ser gravado no ato.
-- ============================================================================
alter table public.assinaturas add column if not exists valor_centavos       int;
alter table public.assinaturas add column if not exists vencimento           date;
alter table public.assinaturas add column if not exists pago_em              timestamptz;
alter table public.assinaturas add column if not exists cancelada_em         timestamptz;
alter table public.assinaturas add column if not exists asaas_assinatura_id  text;   -- id da recorrência (sub_...)
alter table public.assinaturas add column if not exists origem               text;   -- painel | manual | cortesia

-- backfill: valor a partir do preço atual do plano (é o melhor dado disponível)
update public.assinaturas a
   set valor_centavos = p.preco_centavos
  from public.planos p
 where a.plano_id = p.id
   and a.valor_centavos is null;

-- backfill: vencimento a partir da validade já registrada
update public.assinaturas
   set vencimento = valido_ate
 where vencimento is null and valido_ate is not null;

create index if not exists assinaturas_status_idx on public.assinaturas(status, vencimento);


-- ============================================================================
-- 4) RÉGUAS DE E-MAIL PROATIVO
-- ============================================================================
create table if not exists public.plataforma_reguas (
  chave       text primary key,
  nome        text not null,
  categoria   text not null,               -- ativacao | conversao | janela | cobranca | retencao
  descricao   text,                        -- quando dispara, em português
  ativa       boolean not null default true,
  dias        int not null default 0,      -- o parâmetro de dias da regra
  assunto     text not null,
  corpo       text not null,               -- TEXTO puro; o HTML é montado pela casa
  ordem       int  not null default 0,
  atualizado_em timestamptz not null default now()
);

alter table public.plataforma_reguas enable row level security;
drop policy if exists reguas_super on public.plataforma_reguas;
create policy reguas_super on public.plataforma_reguas for all
  using (public.e_superadmin()) with check (public.e_superadmin());

-- Log de tudo o que a plataforma manda ao contador. `chave_unica` é a trava:
-- índice único, então a garantia de não enviar duas vezes é do BANCO.
create table if not exists public.plataforma_envios (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid,
  regra        text not null,
  chave_unica  text not null,
  para         text not null,
  assunto      text,
  status       text not null default 'enviado',   -- enviado | erro | teste
  erro         text,
  criado_em    timestamptz not null default now()
);
create unique index if not exists plataforma_envios_chave_idx on public.plataforma_envios(chave_unica);
create index if not exists plataforma_envios_tenant_idx on public.plataforma_envios(tenant_id, criado_em desc);
create index if not exists plataforma_envios_regra_idx on public.plataforma_envios(regra, criado_em desc);

alter table public.plataforma_envios enable row level security;
drop policy if exists envios_super on public.plataforma_envios;
create policy envios_super on public.plataforma_envios for all
  using (public.e_superadmin()) with check (public.e_superadmin());

-- ---------------------------------------------------------------------------
-- O CONTEÚDO INICIAL
--
-- Variáveis: {{nome}} {{escritorio}} {{plano}} {{valor}} {{vencimento}}
--            {{dias}} {{empresas}} {{faixa_a}} {{laudos}} {{restantes}}
--            {{link_pagamento}} {{link_app}} {{link_planos}} {{link_carteira}}
--
-- Regras de linguagem (valem para TODO texto daqui):
--   · nunca citar sistema/ERP de terceiro, nem para comparar;
--   · nunca prometer economia — todo número é estimativa de cenário;
--   · a decisão e a responsabilidade técnica são do contador que assina.
-- ---------------------------------------------------------------------------
insert into public.plataforma_reguas (chave, nome, categoria, descricao, ativa, dias, assunto, corpo, ordem) values

('ativacao_boas_vindas', 'Boas-vindas', 'ativacao',
 'No dia em que o escritório é criado.', true, 0,
 'Bem-vindo ao Enquadria',
 E'Olá, {{nome}}.\n\nO Enquadria existe para responder uma pergunta: quais clientes da sua carteira precisam decidir o IBS/CBS até 30 de setembro.\n\nPrimeiro passo, leva 2 minutos: suba o CSV da sua carteira.\n{{link_app}}/painel/importar\n\nA triagem é completa e gratuita. Você vê a carteira inteira classificada antes de pagar qualquer coisa.\n\nEquipe Enquadria',
 10),

('ativacao_sem_carteira', 'Carteira não importada', 'ativacao',
 'D+1 do cadastro, se nenhuma empresa foi importada.', true, 1,
 'Falta subir a carteira',
 E'Olá, {{nome}}.\n\nSua conta está pronta, mas a carteira ainda não foi importada — e é dela que sai tudo.\n\nSubir agora:\n{{link_app}}/painel/importar\n\nO arquivo mínimo é uma coluna de CNPJ. Se o seu sistema exporta razão social e CNAE junto, melhor ainda: a triagem fica mais precisa.\n\nEquipe Enquadria',
 20),

('ativacao_triagem_parada', 'Triagem sem análise', 'ativacao',
 'D+2 do cadastro, com empresas nas faixas A/B e nenhuma análise feita.', true, 2,
 'Você tem {{faixa_a}} empresas que precisam decidir',
 E'Olá, {{nome}}.\n\nA triagem da sua carteira apontou {{faixa_a}} empresa(s) na faixa A — as que precisam de decisão antes de 30 de setembro. As outras já ficaram documentadas como descarte, e não custam mais o seu tempo.\n\nA próxima etapa é a análise: oito perguntas por empresa, e o sistema calcula a alíquota efetiva, a receita qualificada e o repasse de equilíbrio.\n\nComeçar pela fila:\n{{link_app}}/painel/fila\n\nEquipe Enquadria',
 30),

('ativacao_sem_laudo', 'Análise sem laudo', 'ativacao',
 'D+4 do cadastro, com análise feita e nenhum laudo emitido.', true, 4,
 'A análise está pronta. Falta o papel.',
 E'Olá, {{nome}}.\n\nVocê já tem análise salva, mas nenhum laudo emitido. O laudo é o que transforma a conta em serviço: sai com a sua marca, traz a premissa de alíquota carimbada com fonte e data, e vem acompanhado do termo de ciência para o cliente assinar.\n\nÉ o documento que responde "por que você não me avisou?" antes de a pergunta existir.\n\nEmitir o primeiro:\n{{link_app}}/painel/entrega\n\nOs dois primeiros são gratuitos.\n\nEquipe Enquadria',
 40),

('conversao_um_laudo', 'Usou 1 dos 2 laudos', 'conversao',
 'Quando o primeiro laudo gratuito é emitido.', true, 0,
 'Primeiro laudo emitido',
 E'Olá, {{nome}}.\n\nPrimeiro laudo emitido — resta {{restantes}} do plano gratuito.\n\nSe esse laudo virou honorário, a conta se resolve sozinha: uma análise cobrada paga o Enquadria por um ano inteiro. O PRO libera laudos e termos sem limite, o dossiê por empresa e o radar da transição.\n\n{{link_planos}}\n\nSe ainda não virou honorário, responda este e-mail contando o que travou. Isso ajuda mais do que qualquer funcionalidade nova.\n\nEquipe Enquadria',
 50),

('conversao_limite', 'Limite gratuito atingido', 'conversao',
 'Quando os 2 laudos gratuitos foram usados.', true, 0,
 'Seus 2 laudos de degustação acabaram',
 E'Olá, {{nome}}.\n\nVocê emitiu os dois laudos do plano gratuito. Nada foi perdido: a carteira, a triagem e as análises continuam onde estão — o que fica bloqueado é emitir documento novo.\n\nPara liberar, o PRO custa R$ 47 por mês (ou R$ 470 no ano, com dois meses grátis) e não tem limite de laudo nem de termo.\n\n{{link_planos}}\n\nA conta que importa: com {{faixa_a}} empresa(s) na sua faixa A, uma única análise cobrada já paga o ano.\n\nEquipe Enquadria',
 60),

('conversao_carteira_grande', 'Carteira grande no gratuito', 'conversao',
 'Escritório no plano gratuito com 10+ empresas na faixa A.', true, 10,
 '{{faixa_a}} clientes seus precisam decidir até 30/09',
 E'Olá, {{nome}}.\n\nA triagem da sua carteira apontou {{faixa_a}} empresa(s) na faixa A. É bastante — e é trabalho cobrável que tem data para acabar.\n\nO plano gratuito cobre 2 laudos. Para as outras, o PRO libera a emissão sem limite por R$ 47/mês.\n\n{{link_planos}}\n\nOs números do sistema são estimativa de cenário; a decisão e a responsabilidade técnica são de quem assina.\n\nEquipe Enquadria',
 70),

('janela_30', 'Faltam 30 dias', 'janela',
 'Quando faltam 30 dias para 30 de setembro.', true, 30,
 'Faltam {{dias}} dias da janela de setembro',
 E'Olá, {{nome}}.\n\nA janela de opção pelo regime regular de IBS/CBS fecha em 30 de setembro. Faltam {{dias}} dias.\n\nSua carteira hoje: {{empresas}} empresa(s) importada(s), {{faixa_a}} na faixa A, {{laudos}} laudo(s) emitido(s).\n\nO que ainda não foi decidido continua na fila:\n{{link_app}}/painel/fila\n\nEquipe Enquadria',
 80),

('janela_7', 'Reta final', 'janela',
 'Quando faltam 7 dias para o fechamento.', true, 7,
 'Reta final: {{dias}} dias até 30/09',
 E'Olá, {{nome}}.\n\nFaltam {{dias}} dias para a janela fechar. Depois de 30 de setembro, quem não optou não optou — e a próxima janela é só no semestre seguinte.\n\nSua fila:\n{{link_app}}/painel/fila\n\nSe alguma empresa ficou sem decisão por falta de dado do cliente, o termo de ciência também serve para registrar isso: fica documentado que a orientação foi dada.\n\nEquipe Enquadria',
 90),

('janela_fechou', 'Janela encerrada', 'janela',
 'No dia seguinte ao fechamento da janela.', true, 1,
 'A janela fechou. O trabalho não.',
 E'Olá, {{nome}}.\n\nA janela de setembro fechou. O que foi decidido está documentado, com laudo e termo verificáveis.\n\nSetembro era o primeiro marco, não o último: a opção é semestral e a transição vai até 2033. O radar acompanha o que muda e diz quais dos seus clientes cada mudança atinge.\n\n{{link_app}}/painel/radar\n\nEquipe Enquadria',
 100),

('cobranca_gerada', 'Cobrança emitida', 'cobranca',
 'Assim que a cobrança é gerada com link de pagamento.', true, 0,
 'Sua cobrança Enquadria — {{valor}}',
 E'Olá, {{nome}}.\n\nSegue a cobrança do plano {{plano}}.\n\nValor: {{valor}}\nVencimento: {{vencimento}}\n\nPagar (Pix, boleto ou cartão):\n{{link_pagamento}}\n\nA liberação é automática assim que o pagamento é confirmado.\n\nEquipe Enquadria',
 110),

('cobranca_pre_vencimento', 'Aviso antes de vencer', 'cobranca',
 '3 dias antes do vencimento.', true, 3,
 'Sua cobrança Enquadria vence em {{dias}} dias',
 E'Olá, {{nome}}.\n\nA cobrança de {{valor}} vence em {{vencimento}}.\n\nPagar agora:\n{{link_pagamento}}\n\nSe já pagou nas últimas horas, pode ignorar este aviso.\n\nEquipe Enquadria',
 120),

('cobranca_d1', 'Vencida — D+1', 'cobranca',
 '1 dia após o vencimento.', true, 1,
 'Cobrança Enquadria em aberto ({{valor}})',
 E'Olá, {{nome}}.\n\nA cobrança de {{valor}} venceu em {{vencimento}} e continua em aberto.\n\nPagar:\n{{link_pagamento}}\n\nSe houve algum problema no pagamento, responda este e-mail que a gente resolve junto.\n\nEquipe Enquadria',
 130),

('cobranca_d5', 'Vencida — D+5', 'cobranca',
 '5 dias após o vencimento.', true, 5,
 'Seu acesso PRO está prestes a expirar',
 E'Olá, {{nome}}.\n\nA cobrança de {{valor}} está com {{dias}} dias de atraso.\n\nNada é apagado quando o acesso expira: carteira, análises, laudos e termos continuam guardados, e os documentos já emitidos seguem verificáveis pelo código. O que para é a emissão de documento novo.\n\nRegularizar:\n{{link_pagamento}}\n\nSe o momento está apertado, responda este e-mail. Conversar é melhor que bloquear.\n\nEquipe Enquadria',
 140),

('cobranca_renovacao', 'Renovação chegando', 'cobranca',
 'N dias antes de a assinatura ativa expirar.', true, 10,
 'Sua assinatura Enquadria vence em {{dias}} dias',
 E'Olá, {{nome}}.\n\nSeu plano {{plano}} vence em {{vencimento}} — daqui a {{dias}} dias.\n\nNo período você emitiu {{laudos}} laudo(s). A transição segue até 2033 e cada janela traz uma revisão nova da carteira.\n\nRenovar:\n{{link_planos}}\n\nEquipe Enquadria',
 150),

('retencao_parado', 'Escritório parado', 'retencao',
 'Assinante ativo sem nenhuma análise nova há N dias.', true, 21,
 'Podemos ajudar a destravar a carteira?',
 E'Olá, {{nome}}.\n\nSua assinatura está ativa, mas não há análise nova há {{dias}} dias — e ainda há {{faixa_a}} empresa(s) na faixa A esperando decisão.\n\nSe faltou tempo, a análise em lote roda a fila inteira com as mesmas premissas:\n{{link_app}}/painel/lote\n\nSe travou em alguma dúvida técnica, responda este e-mail dizendo qual. É o retorno mais útil que você pode dar.\n\nEquipe Enquadria',
 160),

('retencao_cancelou', 'Pós-cancelamento', 'retencao',
 'D+2 do cancelamento ou do vencimento sem renovação.', false, 2,
 'Uma pergunta só, se você puder',
 E'Olá, {{nome}}.\n\nVi que sua assinatura do Enquadria não foi renovada. Sem discurso de retenção: só uma pergunta.\n\nO que faltou?\n\nResponda com uma frase. Se o motivo for algo que já está resolvido, eu te aviso.\n\nSeus documentos continuam verificáveis pelo código, e a carteira continua guardada.\n\nEquipe Enquadria',
 170)

on conflict (chave) do nothing;   -- nunca sobrescreve texto que você já editou


-- ============================================================================
-- 5) FOTO MENSAL DA RECEITA
-- ============================================================================
create table if not exists public.plataforma_mrr (
  mes            date primary key,          -- sempre dia 1
  mrr_centavos   bigint not null default 0, -- receita mensal normalizada
  assinantes     int    not null default 0,
  gratuitos      int    not null default 0,
  novos          int    not null default 0,
  capturado_em   timestamptz not null default now()
);

alter table public.plataforma_mrr enable row level security;
drop policy if exists mrr_super on public.plataforma_mrr;
create policy mrr_super on public.plataforma_mrr for all
  using (public.e_superadmin()) with check (public.e_superadmin());


-- ============================================================================
-- 6) PARÂMETROS DO NEGÓCIO
-- ============================================================================
create table if not exists public.plataforma_config (
  chave        text primary key,
  valor        jsonb not null,
  descricao    text,
  atualizado_em timestamptz not null default now()
);

alter table public.plataforma_config enable row level security;
drop policy if exists config_super on public.plataforma_config;
create policy config_super on public.plataforma_config for all
  using (public.e_superadmin()) with check (public.e_superadmin());

insert into public.plataforma_config (chave, valor, descricao) values
  ('reguas',  '{"ativas": true, "limite_por_execucao": 200, "janela_dias": 30}'::jsonb,
              'Motor de e-mails proativos. janela_dias: não manda e-mail de ativação para escritório mais velho que isso — evita saudar a base antiga no primeiro disparo.'),
  ('cobranca','{"aviso_pre_vencimento_dias": 3, "dias_renovacao": 10, "bloquear_automatico": false}'::jsonb,
              'Régua de cobrança. bloquear_automatico=false: o sistema avisa, você decide.'),
  ('janela',  '{"abre": "2026-09-01", "fecha": "2026-09-30"}'::jsonb,
              'A janela vigente. As réguas de janela leem daqui.'),
  ('negocio', '{"meta_assinantes": 60, "meta_mrr_centavos": 300000}'::jsonb,
              'Metas exibidas no painel de Negócio.')
on conflict (chave) do nothing;


-- ============================================================================
-- 7) A FONTE DE DADOS DA ABA — um escritório por linha
--    Montada com `execute format` porque os nomes das colunas de data variam
--    entre as tabelas deste banco. A função pergunta antes de escrever.
-- ============================================================================
do $$
declare
  c_tenant   text := coalesce(public.primeira_coluna('tenants',   array['criado_em','created_at','inserted_at']), 'null');
  c_empresa  text := coalesce(public.primeira_coluna('empresas',  array['criado_em','created_at','importado_em']), 'null');
  c_analise  text := coalesce(public.primeira_coluna('analises',  array['criado_em','created_at','atualizado_em']), 'null');
  c_laudo    text := coalesce(public.primeira_coluna('laudos',    array['emitido_em','criado_em','created_at']), 'null');
  c_perfil   text := coalesce(public.primeira_coluna('profiles',  array['email']), 'null');
  sql        text;
begin
  if c_tenant = 'null' then
    raise notice '[0020] tenants não tem coluna de data conhecida — a idade do escritório virá vazia.';
  end if;

  sql := format($f$
    create or replace function public.negocio_escritorios()
    returns table (
      id             uuid,
      nome           text,
      email          text,
      criado_em      timestamptz,
      plano_id       text,
      plano_nome     text,
      plano_ciclo    text,
      status         text,
      valor_centavos int,
      vencimento     date,
      assinatura_id  uuid,
      checkout_url   text,
      asaas_id       text,
      usuarios       bigint,
      empresas       bigint,
      faixa_a        bigint,
      analises       bigint,
      laudos         bigint,
      termos         bigint,
      assinados      bigint,
      ultima_analise timestamptz,
      ultimo_laudo   timestamptz
    )
    language plpgsql stable security definer set search_path = public as $body$
    begin
      if not public.e_superadmin() then
        raise exception 'acesso restrito ao dono da plataforma';
      end if;

      return query
      select
        t.id,
        t.nome,
        (select p.%2$s from public.profiles p where p.tenant_id = t.id order by p.%2$s limit 1),
        %1$s,
        a.plano_id,
        pl.nome,
        pl.ciclo,
        coalesce(a.status::text, 'gratis'),   -- ::text ANTES: status pode ser enum
        a.valor_centavos,
        coalesce(a.vencimento, a.valido_ate),
        a.id,
        a.checkout_url,
        a.asaas_id,
        (select count(*) from public.profiles p  where p.tenant_id = t.id),
        (select count(*) from public.empresas e  where e.tenant_id = t.id),
        (select count(*) from public.empresas e  where e.tenant_id = t.id and e.faixa::text = 'A'),
        (select count(*) from public.analises n  where n.tenant_id = t.id),
        (select count(*) from public.laudos   l  where l.tenant_id = t.id),
        (select count(*) from public.termos   m  join public.analises n2 on n2.id = m.analise_id where n2.tenant_id = t.id),
        (select count(*) from public.termos   m  join public.analises n2 on n2.id = m.analise_id where n2.tenant_id = t.id and m.assinado_em is not null),
        %3$s,
        %4$s
      from public.tenants t
      left join lateral (
        select x.* from public.assinaturas x
         where x.tenant_id = t.id
         order by (x.status::text = 'ativa') desc, coalesce(x.vencimento, x.valido_ate) desc nulls last
         limit 1
      ) a on true
      left join public.planos pl on pl.id = a.plano_id
      order by %1$s desc nulls last;
    end;
    $body$;
  $f$,
    case when c_tenant  = 'null' then 'null::timestamptz' else 't.' || quote_ident(c_tenant) end,
    case when c_perfil  = 'null' then 'null::text'        else quote_ident(c_perfil) end,
    case when c_analise = 'null' then 'null::timestamptz'
         else format('(select max(n3.%I) from public.analises n3 where n3.tenant_id = t.id)', c_analise) end,
    case when c_laudo   = 'null' then 'null::timestamptz'
         else format('(select max(l3.%I) from public.laudos l3 where l3.tenant_id = t.id)', c_laudo) end
  );

  execute sql;
  raise notice '[0020] negocio_escritorios() criada. datas: tenants.%, analises.%, laudos.%', c_tenant, c_analise, c_laudo;
end $$;

grant execute on function public.negocio_escritorios() to authenticated;


-- ============================================================================
-- 8) FOTO DO MÊS
--    MRR normalizado: o anual entra dividido por 12, senão dezembro parece um
--    milagre e janeiro, uma catástrofe.
-- ============================================================================
drop function if exists public.negocio_snapshot();
create or replace function public.negocio_snapshot()
returns table (snap_mes date, snap_mrr bigint, snap_assinantes int, snap_gratuitos int)
language plpgsql security definer set search_path = public as $$
declare
  v_mes    date := date_trunc('month', now())::date;
  v_mrr    bigint;
  v_ass    int;
  v_gratis int;
  v_novos  int;
begin
  if auth.uid() is not null and not public.e_superadmin() then
    raise exception 'acesso restrito ao dono da plataforma';
  end if;

  select
    coalesce(sum(
      case pl.ciclo
        when 'anual'  then coalesce(a.valor_centavos, pl.preco_centavos) / 12
        when 'mensal' then coalesce(a.valor_centavos, pl.preco_centavos)
        else 0
      end
    ), 0),
    count(*)
  into v_mrr, v_ass
  from public.assinaturas a
  join public.planos pl on pl.id = a.plano_id
  where a.status::text = 'ativa'
    and coalesce(a.vencimento, a.valido_ate, current_date) >= current_date;

  select count(*) into v_gratis
    from public.tenants t
   where not exists (
     select 1 from public.assinaturas a
      where a.tenant_id = t.id and a.status::text = 'ativa'
        and coalesce(a.vencimento, a.valido_ate, current_date) >= current_date
   );

  select coalesce(count(*), 0) into v_novos
    from public.assinaturas a
   where a.status::text = 'ativa' and a.pago_em >= v_mes;

  insert into public.plataforma_mrr (mes, mrr_centavos, assinantes, gratuitos, novos, capturado_em)
  values (v_mes, coalesce(v_mrr,0), coalesce(v_ass,0), coalesce(v_gratis,0), coalesce(v_novos,0), now())
  on conflict (mes) do update set
    mrr_centavos = excluded.mrr_centavos,
    assinantes   = excluded.assinantes,
    gratuitos    = excluded.gratuitos,
    novos        = excluded.novos,
    capturado_em = now();

  return query select v_mes, coalesce(v_mrr,0)::bigint, coalesce(v_ass,0), coalesce(v_gratis,0);
end;
$$;

grant execute on function public.negocio_snapshot() to authenticated;


-- ============================================================================
-- 9) O VAZAMENTO DE RECEITA — só LISTA, não altera nada
--
-- Todo pagamento confirmado dava 365 dias de acesso, mesmo no plano mensal.
-- A consulta abaixo mostra quem está com validade maior do que o plano concede.
-- Leia, decida, e ajuste manualmente se quiser. O código novo respeita
-- `dias_acesso` daqui em diante.
-- ============================================================================
select
  t.nome                                        as escritorio,
  pl.nome                                       as plano,
  pl.ciclo,
  pl.dias_acesso                                as dias_que_o_plano_da,
  a.pago_em::date                               as pago_em,
  coalesce(a.vencimento, a.valido_ate)          as valido_ate,
  coalesce(a.vencimento, a.valido_ate) - coalesce(a.pago_em::date, current_date) as dias_concedidos,
  (coalesce(a.vencimento, a.valido_ate) - coalesce(a.pago_em::date, current_date)) - coalesce(pl.dias_acesso, 0) as dias_a_mais
from public.assinaturas a
join public.planos pl on pl.id = a.plano_id
join public.tenants t on t.id = a.tenant_id
where a.status::text = 'ativa'
  and pl.dias_acesso is not null
  and coalesce(a.vencimento, a.valido_ate) is not null
  and (coalesce(a.vencimento, a.valido_ate) - coalesce(a.pago_em::date, current_date)) > pl.dias_acesso + 5
order by dias_a_mais desc;


-- ============================================================================
-- CONFERÊNCIA (rode e leia — não altera nada)
-- ============================================================================
-- select id, nome, ciclo, dias_acesso, preco_centavos, publico, destaque,
--        jsonb_array_length(recursos) as n_recursos, limite_analises
--   from public.planos order by ordem;
--
-- select chave, categoria, ativa, dias, assunto from public.plataforma_reguas order by ordem;
--
-- select * from public.negocio_escritorios();
-- select * from public.negocio_snapshot();
-- ============================================================================
