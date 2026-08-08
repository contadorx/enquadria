-- ============================================================================
-- 0025 — conserta os links mortos das réguas e cria a regra do termo pendente
--
-- DOIS PROBLEMAS, UM ARQUIVO.
--
-- 1. LINKS MORTOS. As réguas semeadas na 0020 apontam para /painel/entrega,
--    /painel/fila, /painel/lote e /painel/radar. Essas rotas foram removidas
--    quando o painel virou uma tela só (o cockpit em /painel). Hoje TODO
--    e-mail de ativação e de conversão manda o contador para um 404 — o que é
--    pior do que não mandar e-mail nenhum: quebra a confiança exatamente na
--    hora em que a pessoa resolveu agir.
--
--    A troca é textual e conservadora: só os caminhos que sumiram, para
--    /painel, que é onde o trabalho passou a acontecer.
--
-- 2. LAUDO SEM TERMO. Era o único gatilho da régua comportamental que não
--    existia. Ele não aparece na conta de receita, mas é o que decide a
--    RENOVAÇÃO: laudo que fica no computador do contador o cliente final nunca
--    vê. O termo assinado é o que faz o cliente perceber que pagou por alguma
--    coisa — e é a prova de que o contador avaliou e comunicou.
--
-- IDEMPOTENTE. Rodar duas vezes não duplica regra nem re-troca link já trocado.
-- ============================================================================

do $$
declare
  n_links int;
  n_regra int;
begin
  -- ------------------------------------------------------------ 1. links
  if to_regclass('public.plataforma_reguas') is null then
    raise notice '[0025] tabela plataforma_reguas não existe — nada a fazer.';
    return;
  end if;

  update public.plataforma_reguas
     set corpo = regexp_replace(corpo, '/painel/(entrega|fila|lote|radar)\M', '/painel', 'g')
   where corpo ~ '/painel/(entrega|fila|lote|radar)\M';
  get diagnostics n_links = row_count;
  raise notice '[0025] % regras tiveram links mortos corrigidos.', n_links;

  -- --------------------------------------------------- 2. regra do termo
  insert into public.plataforma_reguas
    (chave, nome, categoria, descricao, ativa, dias, assunto, corpo, ordem)
  values (
    'uso_laudo_sem_termo',
    'Laudo emitido sem termo',
    'ativacao',
    'Há laudo emitido e nenhum termo gerado. Não olha idade da conta: é fato de uso.',
    true,
    2,
    'Laudo sem termo é meio serviço',
    E'Olá, {{nome}}.\n\nVocê tem {{laudos}} laudo(s) emitido(s) e nenhum termo de ciência gerado.\n\nA diferença entre os dois importa mais do que parece. O laudo é o seu trabalho; o termo é a prova de que o cliente foi informado e decidiu. Sem ele, em 2027, a conversa vira a sua palavra contra a memória dele.\n\nE tem o lado prático: laudo que fica no seu computador o cliente nunca vê. O termo é o que chega até ele — com código de verificação pública, que qualquer pessoa confere sem login.\n\nGerar os termos que faltam:\n{{link_carteira}}\n\nEquipe Enquadria',
    45
  )
  on conflict (chave) do nothing;
  get diagnostics n_regra = row_count;
  raise notice '[0025] regra uso_laudo_sem_termo: % inserida(s).', n_regra;
end $$;

-- ---------------------------------------------------------------- verificação
-- Falhar alto é melhor do que seguir com a régua meio consertada.
do $$
begin
  if to_regclass('public.plataforma_reguas') is null then
    return;
  end if;

  if exists (select 1 from public.plataforma_reguas
              where corpo ~ '/painel/(entrega|fila|lote|radar)\M') then
    raise exception '[0025] ainda há regra apontando para rota removida';
  end if;

  if not exists (select 1 from public.plataforma_reguas where chave = 'uso_laudo_sem_termo') then
    raise exception '[0025] a regra uso_laudo_sem_termo não foi criada';
  end if;

  raise notice '[0025] OK — links vivos e regra do termo no lugar.';
end $$;
