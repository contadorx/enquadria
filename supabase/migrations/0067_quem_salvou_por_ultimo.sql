/**
 * O TRABALHO DO COLEGA DEIXA DE SUMIR EM SILÊNCIO — 08/08/2026.
 *
 * O DEFEITO. `analises` tem índice único por (empresa_id, janela_id), e a rota
 * grava com `upsert`. Dois contadores do mesmo escritório abrem a mesma empresa
 * às 9h: o primeiro salva às 9h10, o segundo às 9h12 — e o segundo substitui
 * respostas, parâmetros e origens do primeiro por inteiro. Nenhum dos dois
 * recebe qualquer sinal. O bloco "Histórico de decisões" da tela só aparece com
 * mais de uma rodada, e rodada é por JANELA, não por revisão: o trabalho
 * sobrescrito não deixa rastro em lugar nenhum do sistema.
 *
 * O produto é vendido para escritório com equipe, e a colisão não é hipótese
 * remota — é a segunda-feira de quem dividiu a carteira entre duas pessoas.
 *
 * O QUE ESTA MIGRATION NÃO FAZ: não bloqueia, não cria lock, não abre presença
 * em tempo real. Bloqueio em ferramenta de escritório vira campo travado por
 * quem esqueceu a aba aberta, e presença é infraestrutura cara para um aviso.
 * O que faltava era NOME e HORA — com os dois, a rota consegue dizer "isto foi
 * salvo por Fulano às 9h10, depois de você abrir a tela", e a decisão de
 * recarregar ou gravar por cima volta a ser de gente.
 */

alter table public.analises
  add column if not exists atualizado_por uuid references auth.users(id) on delete set null;

comment on column public.analises.atualizado_por is
  'Quem gravou esta análise por último. Existe para o aviso de conflito ter nome: sem ele, a tela só sabe dizer que "alguém" salvou no meio, e aviso sem autor não ajuda ninguém a decidir.';

/**
 * `calculado_em` já existia e já era gravado a cada salvamento — é ele que a
 * tela devolve para a rota detectar que houve gravação no meio. O índice
 * abaixo existe porque a checagem de conflito passa a ler esse par em toda
 * gravação, e ela roda no caminho mais quente do produto.
 */
create index if not exists analises_conflito
  on public.analises (empresa_id, janela_id, calculado_em desc);

/**
 * CONFERÊNCIA (rodar à mão depois de aplicar):
 *
 *   select count(*) filter (where atualizado_por is null) as sem_autor,
 *          count(*)                                        as total
 *     from public.analises;
 *
 * As análises anteriores a esta data ficam sem autor, e isso está certo: não há
 * de onde inventar. O aviso de conflito cai em "outra pessoa do escritório"
 * nesses casos, que é verdade, e passa a ter nome a partir da próxima gravação.
 */
