-- ============================================================================
-- 0069 — a régua da fase `proxima`: o e-mail que faltava depois de 01/03/2027
--
-- O DEFEITO. A categoria `janela` cobria três fases do calendário e parava ali:
-- `aliquota` e `cancelamento` (0026, `pos_janela_revisao`) e `efeito` (0026,
-- `proxima_janela`). A sexta fase de lib/janela.ts — `proxima`, que começa na
-- data prevista da janela seguinte — não tinha régua nenhuma. E ela é a fase em
-- que o calendário FICA: não existe fase depois dela.
--
-- Na prática, a partir de 02/03/2027 o contador para de receber qualquer coisa
-- sobre a decisão que o trouxe até aqui. O que continua saindo é cutucada de
-- inatividade e cobrança — a mistura exata que ensina alguém a arquivar o
-- remetente sem abrir. O produto atravessa a janela e emudece na véspera da
-- seguinte, que é quando ele volta a ter o que dizer.
--
-- O QUE ESTE E-MAIL NÃO FAZ, e por quê:
--
--   · não anuncia a janela como aberta. A data de 01/03/2027 é PREVISÃO
--     (`MARCOS.proxima_confirmada = false`): enquanto não houver norma
--     publicada, dizer "abriu" é inventar prazo — e o produto inteiro se
--     sustenta em separar "prepare-se" de "está na lei";
--   · não cita alíquota de referência como número disponível, nem promete
--     resultado. O gancho é o trabalho que existe ANTES de qualquer data sair:
--     a carteira já triada e o semestre de histórico que o cliente acumulou.
--
-- CONDIÇÃO DE DISPARO (no planejador, não aqui): fase `proxima` e carteira
-- importada. A chave de deduplicação carrega o mês da janela prevista, então
-- quando a data for confirmada e mudar, é outra janela e vale um toque novo.
--
-- IDEMPOTENTE: `on conflict (chave) do nothing` — nunca sobrescreve texto que
-- você já tenha editado no painel.
-- ============================================================================

do $$
declare
  n int;
begin
  if to_regclass('public.plataforma_reguas') is null then
    raise notice '[0069] tabela plataforma_reguas não existe — nada a fazer.';
    return;
  end if;

  insert into public.plataforma_reguas
    (chave, nome, categoria, descricao, ativa, dias, assunto, corpo, ordem)
  values
  ('nova_janela', 'Nova janela: a carteira volta à mesa', 'janela',
   'A partir da data prevista para a janela seguinte, para quem tem carteira importada. O gancho é o histórico do semestre, não o prazo — que ainda depende de publicação.',
   true, 0,
   'A carteira triada volta à mesa',
   E'Olá, {{nome}}.\n\nPassamos da data prevista para a janela seguinte de opção pelo regime regular de IBS e CBS. A data oficial depende de publicação — quando ela sair, você recebe aqui e ela aparece na aba Reforma.\n\nO que não depende dela é o trabalho que já dá para adiantar, e desta vez ele começa bem mais adiante do que da última:\n\n1. Os clientes que optaram têm um semestre de apuração real. Reabra cada um e compare o que aconteceu com o cenário que foi estimado na análise — as premissas continuam salvas.\n\n2. Quem ficou de fora pode ter mudado de perfil: CNAE novo, faturamento diferente, cliente novo na carteira. A triagem refaz a fila com o que existe hoje.\n\n3. Com a fila pronta antes da data, a decisão de cada cliente deixa de disputar espaço com o prazo.\n\nSua carteira, com {{empresas}} empresas:\n{{link_carteira}}\n\nOs números são estimativa de cenário a partir das premissas informadas. A decisão de cada cliente, e a responsabilidade técnica, são de quem assina.\n\nEquipe Enquadria',
   80)

  on conflict (chave) do nothing;
  get diagnostics n = row_count;
  raise notice '[0069] % regra(s) da nova janela inserida(s).', n;
end $$;

-- ---------------------------------------------------------------- verificação
do $$
declare
  c text;
begin
  if to_regclass('public.plataforma_reguas') is null then
    return;
  end if;

  if not exists (select 1 from public.plataforma_reguas where chave = 'nova_janela') then
    raise exception '[0069] a régua da nova janela não foi criada';
  end if;

  select corpo into c from public.plataforma_reguas where chave = 'nova_janela';

  -- a mesma trava da 0025 e da 0026: link morto em e-mail é pior do que e-mail
  -- nenhum
  if c ~ '/painel/(entrega|fila|lote|radar)\M' then
    raise exception '[0069] a régua aponta para rota removida';
  end if;

  -- e a trava desta migration: prazo que ainda não foi publicado não pode ser
  -- anunciado como aberto, e alíquota de referência não é número de e-mail
  if c ~* '(janela (já |ja )?(está|esta) aberta|abriu a janela|nova janela aberta)' then
    raise exception '[0069] o corpo anuncia como aberta uma janela cuja data é previsão';
  end if;

  raise notice '[0069] OK — a categoria janela deixa de emudecer em março.';
end $$;
