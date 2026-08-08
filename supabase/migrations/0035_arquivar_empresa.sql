-- ===========================================================================
-- ARQUIVAR EMPRESA — descartar da lista sem perder o que já foi produzido
-- ===========================================================================
--
-- Hoje não existe como tirar uma empresa da carteira. Subiu errado, digitou um
-- CNPJ trocado, ou o cliente saiu do escritório: a linha fica lá para sempre,
-- poluindo a fila e a contagem.
--
-- POR QUE ARQUIVAR E NÃO APAGAR — a pergunta que você fez, e a resposta importa.
--
-- Uma empresa não é um registro isolado: dela penduram análises, laudos e
-- termos. E o laudo e o termo JÁ FORAM ENTREGUES ao cliente final, com código
-- de verificação público. Apagar a empresa transformaria um documento assinado
-- num link quebrado — e quem abriria esse link é justamente quem tem motivo
-- para desconfiar: o Fisco, o herdeiro, o advogado da outra parte.
--
-- Documento entregue é um fato do mundo. O sistema não pode desfazê-lo.
--
-- Então: `arquivada_em` tira da fila, das contagens e da triagem, e mantém o
-- histórico verificável. Reversível com um clique.
--
-- APAGAR DE VERDADE fica reservado para o caso em que NADA foi produzido —
-- nenhuma análise, nenhum laudo, nenhum termo. Aí não há prova a preservar, e é
-- o caso do "subi errado agora há pouco". A regra vive no código, com teste.
-- ---------------------------------------------------------------------------

alter table public.empresas
  add column if not exists arquivada_em timestamptz,
  add column if not exists arquivada_motivo text;

create index if not exists empresas_arquivada_idx
  on public.empresas (tenant_id, arquivada_em);

comment on column public.empresas.arquivada_em is
  'Quando a empresa saiu da carteira ativa. Preenchido = fora da fila, das contagens e da triagem, mas com laudos e termos ainda verificáveis. Apagar de vez só é permitido quando não há nenhum documento emitido.';
