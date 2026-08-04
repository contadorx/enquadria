-- ===========================================================================
-- 0040 — O CPF/CNPJ DE QUEM PAGA
-- ===========================================================================
--
-- POR QUE ESTA COLUNA EXISTE — e o bug que ela fecha.
--
-- O Asaas EXIGE `cpfCnpj` para criar um cliente. A aplicação mandava só nome
-- e e-mail. O Asaas recusava, o erro era engolido num `catch`, a cobrança
-- voltava sem link de pagamento — e a tela de planos, que só sabia tratar
-- "tem link" e "Asaas desligado", não fazia nada.
--
-- Sintoma para quem usa: clica em "Assinar" e NÃO ACONTECE NADA. Sem erro,
-- sem aviso. O caminho do dinheiro inteiro parado por um campo que nunca foi
-- pedido.
--
-- Fica em `tenants` porque é dado do ESCRITÓRIO, não da pessoa: quem paga a
-- assinatura é a empresa do contador, e quem contrata pode ser um sócio hoje
-- e outro amanhã. Pedido uma vez, reaproveitado em toda cobrança seguinte.
--
-- Não é dado sensível além do que já existe no cadastro, e não vai para
-- documento nenhum: serve só para identificar o pagador no meio de pagamento.
--
-- Idempotente.
-- ===========================================================================

alter table public.tenants add column if not exists cpf_cnpj text;

comment on column public.tenants.cpf_cnpj is
  'CPF ou CNPJ do responsável pelo pagamento. Obrigatório pelo Asaas para criar o cliente e gerar a cobrança.';
