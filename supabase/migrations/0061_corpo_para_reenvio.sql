-- ===========================================================================
-- 0061 — O CORPO GUARDADO: reenviar o documento, não um aviso
-- ===========================================================================
--
-- A 0060 garantiu que a mensagem perdida seja detectada e reenviada. Mas o
-- reenvio ia sem o conteúdo original — um aviso dizendo "existe algo para
-- você, responda que eu mando". Melhor que silêncio, e longe de bom: quem
-- devia receber o termo de ciência recebia um bilhete pedindo contato.
--
-- Para reenviar o DOCUMENTO é preciso guardar o HTML. Isso é dado de cliente
-- parado no banco, então vem com três regras — e as três estão implementadas,
-- não só escritas aqui:
--
--   1. GUARDA SÓ O QUE PODE PRECISAR. Corpo só para o caminho próprio; a
--      Brevo resolve síncrono e nunca entra na fila de vigilância.
--
--   2. APAGA NA CONFIRMAÇÃO. Confirmada a entrega, a linha continua para
--      auditoria e o conteúdo some no mesmo instante. O corpo existe
--      exatamente enquanto pode ser útil.
--
--   3. APAGA POR IDADE DE QUALQUER JEITO (7 dias). Sem isto, um webhook
--      quebrado transformaria a tabela num arquivo permanente de dados de
--      terceiros — que é o oposto de minimização.
--
-- Idempotente.
-- ===========================================================================

alter table public.emails_saida
  -- o HTML original. NULL depois de confirmada a entrega ou de 7 dias.
  add column if not exists corpo_html text,
  -- o resto do envelope, para o reenvio ser idêntico e não "parecido"
  add column if not exists nome_destinatario text,
  add column if not exists responder_para text,
  add column if not exists responder_nome text,
  -- quando o corpo foi descartado, e por quê. Sem isto, "corpo nulo" seria
  -- ambíguo entre "nunca guardei", "já entreguei" e "expirou".
  add column if not exists corpo_apagado_em timestamptz,
  add column if not exists corpo_apagado_motivo text;

-- o índice da faxina: só as linhas que ainda têm corpo interessam
create index if not exists emails_saida_corpo_idx
  on public.emails_saida (criado_em)
  where corpo_html is not null;

comment on column public.emails_saida.corpo_html is
  'HTML original, guardado apenas para reenvio. Apagado na confirmação de entrega ou após 7 dias — o que vier primeiro.';

-- ---------------------------------------------------------------------------
-- A FAXINA COMO FUNÇÃO, e não só como código de aplicação.
--
-- Retenção que depende do cron rodar é retenção que some quando o cron falha.
-- Esta função é chamada pela varredura E pode ser chamada à mão em qualquer
-- momento; o efeito é o mesmo e não depende de deploy.
-- ---------------------------------------------------------------------------
create or replace function public.limpar_corpos_expirados(p_dias int default 7)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  update public.emails_saida
     set corpo_html = null,
         corpo_apagado_em = now(),
         corpo_apagado_motivo = 'expirou (' || p_dias || ' dias)'
   where corpo_html is not null
     and criado_em < now() - make_interval(days => p_dias);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function public.limpar_corpos_expirados(int) is
  'Apaga o HTML guardado de mensagens antigas. Chamada pela varredura e disponível à mão.';
