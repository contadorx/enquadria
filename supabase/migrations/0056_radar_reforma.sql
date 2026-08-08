-- ===========================================================================
-- 0056 — O RADAR E A ABA REFORMA VIRAM A MESMA COISA
-- ===========================================================================
--
-- O QUE ACONTECEU EM 06/08/2026, e que só apareceu quando o primeiro item foi
-- publicado de verdade:
--
--   existiam DUAS features chamadas "Reforma", em tabelas diferentes.
--
--     `ajuda_artigos` (tipo = 'noticia')  → a aba Reforma do contador
--     `radar_itens`                        → aviso no topo do cockpit
--
--   Publicar no radar não colocava nada na aba Reforma. Quem publicou foi
--   procurar o item onde o nome dizia que ele estaria, e não achou. Pior: a
--   própria tela do radar afirmava, por escrito, que o item apareceria lá.
--
-- A partir daqui a aba Reforma lê as DUAS fontes e mostra uma linha do tempo
-- só. O que muda no banco é pequeno de propósito: nada é migrado, nada é
-- apagado, e as notícias antigas continuam funcionando como sempre.
--
-- ---------------------------------------------------------------------------
-- `no_cockpit` — a diferença entre notícia e alerta
--
-- Nem tudo que vale publicar merece ocupar o topo da tela de trabalho. O
-- cockpit é fila; um aviso lá dentro interrompe. A aba Reforma é feed; ela
-- espera ser visitada.
--
-- Com esta coluna, uma publicação só pode ser:
--
--   no_cockpit = true   → alerta: entra no cockpit de quem o critério alcança
--                         E aparece na aba Reforma. É o comportamento de hoje.
--   no_cockpit = false  → notícia: aparece só na aba Reforma, para todo mundo.
--                         É "publicar na Reforma sem o radar".
--
-- `default true` mantém os cinco itens que já existem exatamente como estão.
-- ===========================================================================

alter table public.radar_itens
  add column if not exists no_cockpit boolean not null default true;

comment on column public.radar_itens.no_cockpit is
  'true = alerta (entra no topo do cockpit de quem o critério alcança, e na aba Reforma). false = notícia (só na aba Reforma, para todos). O cockpit é fila e interrompe; a aba Reforma é feed e espera ser visitada.';

/* a aba Reforma lista por data e o cockpit filtra por este campo — os dois
   caminhos quentes da mesma tabela */
create index if not exists radar_itens_cockpit
  on public.radar_itens (no_cockpit, publicado_em desc)
  where ativo;

-- ---------------------------------------------------------------------------
-- A LEITURA POR ESCRITÓRIO JÁ EXISTIA, e agora serve às duas telas.
--
-- `radar_leituras` era usada só para o cockpit não repetir o mesmo aviso no
-- topo. A aba Reforma passa a usá-la para marcar o que ainda não foi lido —
-- exatamente como `ajuda_leituras` faz com as notícias. Nada muda no schema;
-- fica registrado aqui porque a intenção mudou.
-- ---------------------------------------------------------------------------
