-- ===========================================================================
-- CONSOLIDAÇÃO DAS RÉGUAS — um motor só
-- ===========================================================================
--
-- Em 03/08 foram criadas `cobranca_passos` e `onboarding_passos` sem que se
-- tivesse olhado que `plataforma_reguas` (migration 0020) JÁ fazia as duas
-- coisas — com copy editável em tabela, tela de edição e `chave_unica` como
-- índice único no log de envios.
--
-- Ficaram dois motores capazes de mandar a mesma cobrança, cada um com a
-- própria trava, nenhuma enxergando a outra. Esta migration desfaz a
-- duplicação e leva para o motor que fica os dois degraus que só o novo tinha.
-- ---------------------------------------------------------------------------

-- 1. os degraus que faltavam na escada de cobrança
insert into public.plataforma_reguas (chave, nome, categoria, descricao, ativa, dias, assunto, corpo, ordem) values

('cobranca_no_dia', 'Vence hoje', 'cobranca',
 'No dia do vencimento, se a fatura continua pendente. Fechava um buraco: a escada começava em D+1 e o dia do vencimento era o único silencioso.',
 true, 0,
 'Sua assinatura do Enquadria vence hoje',
 E'Olá, {{nome}}.\n\nA fatura de {{valor}} vence hoje, {{vencimento}}.\n\nPagar agora:\n{{link_pagamento}}\n\nSe já pagou, ignore esta mensagem — a confirmação leva algumas horas.\n\nEquipe Enquadria',
 55),

('cobranca_d10', 'Aviso de suspensão', 'cobranca',
 'D+10 do vencimento. É o último degrau: sem ele, o corte de acesso chega sem ter sido anunciado.',
 true, 10,
 'Seu acesso ao Enquadria será suspenso',
 E'Olá, {{nome}}.\n\nA fatura de {{valor}}, vencida em {{vencimento}}, está em aberto há {{dias}} dias.\n\nPara não perder o acesso — e as análises da sua carteira — regularize por aqui:\n{{link_pagamento}}\n\nSe houve algum problema, responda este e-mail: a gente resolve antes de qualquer suspensão.\n\nEquipe Enquadria',
 70)

on conflict (chave) do nothing;

-- 2. as tabelas do motor paralelo saem.
--
-- Tabela sem uso não é inofensiva: seis meses depois alguém a encontra, supõe
-- que está viva e escreve código contra ela. Como nasceram hoje e nunca
-- dispararam nada, não há dado a preservar.
drop table if exists public.cobranca_envios;
drop table if exists public.cobranca_passos;
drop table if exists public.onboarding_envios;
drop table if exists public.onboarding_passos;
