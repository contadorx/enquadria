-- ============================================================================
-- 0036 — IDENTIDADE: o nome da pessoa e o logo que já tem nome
-- ============================================================================
--
-- Duas colunas, dois problemas que só aparecem no papel entregue ao cliente.
--
-- 1. profiles.nome — QUEM ASSINA É UMA PESSOA.
--    Não existia nome pessoal em lugar nenhum do cadastro. Consequências reais:
--    o rodapé do laudo assinava uma razão social (peça técnica é assinada por
--    quem tem CRC); o convite de indicação saía com o nome do escritório no
--    lugar do nome de quem indicou; e a tela de Equipe listava "—" para todo
--    mundo, porque a coluna era lida e nunca preenchida.
--
--    A coluna talvez já exista neste banco (a tela de Equipe a consulta desde
--    sempre). Por isso `if not exists`: rodar de novo não custa nada.
--
-- 2. tenants.logo_com_nome — O CABEÇALHO DUPLICADO.
--    A maioria dos logos de escritório já traz o nome escrito dentro da imagem.
--    O documento imprimia o logo e repetia o nome ao lado; quando os dois textos
--    não batem exatamente ("Oliveira Contabilidade" no logo, "Oliveira
--    Contabilidade e Assessoria" no cadastro), a capa parece montada por engano.
--
--    O padrão é FALSE — imprimir o nome. Silêncio não pode apagar o nome de
--    quem assina o documento: quem tem logo com nome marca a caixa e some com a
--    repetição, quem não tem continua identificado.
--
-- Idempotente. Não mexe em RLS: as duas colunas herdam as políticas das tabelas.
-- ============================================================================

alter table public.profiles add column if not exists nome text;

alter table public.tenants
  add column if not exists logo_com_nome boolean not null default false;

comment on column public.profiles.nome is
  'Nome do profissional. Assina o laudo, aparece na indicação e na equipe.';
comment on column public.tenants.logo_com_nome is
  'true = o logo já traz o nome escrito; os documentos não repetem o nome ao lado.';
