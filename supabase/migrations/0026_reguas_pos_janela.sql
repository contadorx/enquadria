-- ============================================================================
-- 0026 — as duas réguas do PÓS-JANELA
--
-- POR QUE ELAS EXISTEM
--
-- Até aqui o produto sabia falar até 30/09 e depois emudecia. Só que o
-- calendário não acaba ali:
--
--   · até 31/10 a alíquota de referência é FIXADA por Resolução do Senado.
--     Todo laudo emitido em setembro saiu com estimativa declarada — quando o
--     número real sai, cada um vira uma REVISÃO COBRÁVEL da mesma carteira;
--   · até 30/11 dá para CANCELAR a opção. Quem optou e viu a conta virar tem
--     saída, e quem não olhar perde o prazo em silêncio;
--   · a opção é semestral, então a carteira volta à mesa em 2027.
--
-- Sem isto, o contador que assinou o anual em setembro passa outubro e
-- novembro sem receber nada — e chega em dezembro achando que pagou por um mês
-- de uso. A retenção do plano anual mora nestes dois e-mails.
--
-- CONDIÇÃO DE DISPARO (no planejador, não aqui): só para quem EMITIU laudo.
-- Sem laudo não há revisão a vender, e o e-mail viraria propaganda de uma coisa
-- que a pessoa não fez.
--
-- IDEMPOTENTE: `on conflict (chave) do nothing` — nunca sobrescreve texto que
-- você já tenha editado no painel.
-- ============================================================================

do $$
declare
  n int;
begin
  if to_regclass('public.plataforma_reguas') is null then
    raise notice '[0026] tabela plataforma_reguas não existe — nada a fazer.';
    return;
  end if;

  insert into public.plataforma_reguas
    (chave, nome, categoria, descricao, ativa, dias, assunto, corpo, ordem)
  values
  ('pos_janela_revisao', 'Segunda onda: revisão pós-janela', 'janela',
   'De 01/10 a 30/11, para quem emitiu laudo. A alíquota real transforma cada laudo em revisão cobrável.',
   true, 0,
   'A alíquota saiu. Seus laudos viraram trabalho novo.',
   E'Olá, {{nome}}.\n\nA janela fechou, mas a parte mais tranquila do serviço começa agora.\n\nOs {{laudos}} laudos que você emitiu saíram com a alíquota de referência ESTIMADA — não dava para ser diferente, porque ela só é fixada até 31 de outubro, depois do fechamento. Agora que o número existe, cada um desses laudos pode ser refeito com o valor real.\n\nDuas coisas saem daí:\n\n1. Uma revisão por cliente, com o número definitivo. É serviço novo sobre trabalho que você já fez — a análise está pronta, muda a premissa.\n\n2. Para quem optou e a conta virou, ainda dá para CANCELAR a opção até 30 de novembro. Depois dessa data, não dá mais.\n\nAbra a carteira e refaça as contas dos que optaram:\n{{link_carteira}}\n\nOs valores continuam sendo estimativa de cenário e a decisão, com a responsabilidade técnica, é sua.\n\nEquipe Enquadria',
   70),

  ('proxima_janela', 'A próxima janela', 'janela',
   'Enquanto o regime escolhido está em vigor, apontando para a janela seguinte.',
   true, 0,
   'A mesma carteira volta à mesa',
   E'Olá, {{nome}}.\n\nO regime que os seus clientes escolheram vale de janeiro a junho de 2027. Depois disso a decisão volta — a opção pelo regime regular é semestral, e a próxima janela é esperada para março.\n\nA diferença é que desta vez você chega pronto: a carteira já está triada, as análises estão salvas e cada cliente que optou tem seis meses de histórico real para comparar com o cenário. O que em setembro era estimativa, em março é conferência.\n\nSua carteira:\n{{link_carteira}}\n\nA data da próxima janela ainda não foi publicada — quando sair, você recebe aqui.\n\nEquipe Enquadria',
   75)

  on conflict (chave) do nothing;
  get diagnostics n = row_count;
  raise notice '[0026] % regra(s) de pós-janela inserida(s).', n;
end $$;

-- ---------------------------------------------------------------- verificação
do $$
begin
  if to_regclass('public.plataforma_reguas') is null then
    return;
  end if;

  if not exists (select 1 from public.plataforma_reguas where chave = 'pos_janela_revisao')
     or not exists (select 1 from public.plataforma_reguas where chave = 'proxima_janela') then
    raise exception '[0026] as réguas de pós-janela não foram criadas';
  end if;

  -- a mesma trava da 0025: link morto em e-mail é pior do que e-mail nenhum
  if exists (select 1 from public.plataforma_reguas
              where corpo ~ '/painel/(entrega|fila|lote|radar)\M') then
    raise exception '[0026] há regra apontando para rota removida';
  end if;

  raise notice '[0026] OK — o produto agora fala depois de setembro.';
end $$;
