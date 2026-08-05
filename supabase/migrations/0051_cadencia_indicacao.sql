-- ===========================================================================
-- 0051 — A CADÊNCIA DE RECUPERAÇÃO DOS INDICADOS
-- ===========================================================================
--
-- Um contador indica um colega; o colega recebe UM convite e não entra. Hoje a
-- indicação morre ali: fica `status = 'convidado'` para sempre e ninguém volta.
-- É o lead mais barato e mais quente do produto — veio de alguém em quem a
-- pessoa confia — e é o que menos recebe atenção.
--
-- O planejamento fica em `lib/reguas-indicacao.ts` (testado, com as quatro
-- travas). Esta migration traz o que é do banco: os TEXTOS, a leitura para o
-- painel, e o índice que faz o dedupe custar barato.
--
-- ---------------------------------------------------------------------------
-- SOBRE O TOM DOS TEXTOS, porque é o que decide se isto funciona ou vira spam:
--
-- O indicado NÃO pediu e-mail nosso. Todo e-mail aqui nomeia quem indicou já no
-- assunto, e o corpo é curto o bastante para ser lido na prévia. O terceiro
-- avisa que é o último — quem não responde a três não responde a dez, e dizer
-- que a régua acabou é a diferença entre "parou de me incomodar" e "sumiu".
-- ===========================================================================

/* o dedupe do cron procura por chave_unica; sem índice isso vira varredura */
create index if not exists plataforma_envios_regra_chave
  on public.plataforma_envios (regra, chave_unica);

/* as indicações são lidas por e-mail e por status na hora de planejar */
create index if not exists indicacoes_status_convite
  on public.indicacoes (status, convite_em);
create index if not exists indicacoes_email
  on public.indicacoes (lower(email));

-- ═══════════════════════════════════════════════════════════════════════════
-- OS TEXTOS
--
-- Entram como regras normais, na mesma tabela da régua de cobrança, para
-- poderem ser editados na tela de E-mails proativos sem deploy.
-- ═══════════════════════════════════════════════════════════════════════════
insert into public.plataforma_reguas (chave, nome, categoria, descricao, ativa, dias, assunto, corpo, ordem)
values
  ('indicacao_d3',
   'Indicado sem cadastro · 3 dias',
   'indicacao',
   'Primeiro retorno ao indicado que não criou conta. Nomeia quem indicou já no assunto.',
   true, 3,
   '{{nome}}, o {{indicador}} te indicou o Enquadria',
   'Olá, {{nome}}.

O {{indicador}} passou o seu contato porque achou que isto aqui resolve um problema que você tem agora: decidir, empresa por empresa, se vale apurar IBS e CBS fora do DAS antes de 30 de setembro.

Não é um convite para "conhecer a plataforma". É para você rodar a conta de UMA empresa da sua carteira e ver se a resposta muda alguma coisa. Leva dez minutos e não precisa de cartão.

Se não for o seu caso, é só ignorar este e-mail — não insisto muito.',
   1),

  ('indicacao_d10',
   'Indicado sem cadastro · 10 dias',
   'indicacao',
   'Segundo toque. Traz o número, não o produto — é a única coisa que muda a decisão de quem ignorou o primeiro.',
   true, 10,
   '{{nome}}, o número que faz o {{indicador}} usar isto',
   'Olá, {{nome}}.

Escrevi há uns dias por indicação do {{indicador}} e você não respondeu — sem problema. Deixo só o número, que é o que interessa.

A janela de opção fecha em 30 de setembro de 2026 e vale para janeiro a junho de 2027. Quem opta transfere crédito integral ao cliente PJ no ato — e negocia o preço DEPOIS, sem nada para trocar. Quem não olha a carteira antes de setembro descobre isso pelo cliente.

O sistema responde isso empresa por empresa, com memória de cálculo e laudo assinável.

Se não for útil, ignore. Se for, respondo este e-mail.',
   2),

  ('indicacao_d21',
   'Indicado sem cadastro · último toque',
   'indicacao',
   'O terceiro e ÚLTIMO. Diz que é o último — e a régua para de verdade aqui.',
   true, 21,
   '{{nome}}, último e-mail meu',
   'Olá, {{nome}}.

Este é o terceiro e último e-mail — não escrevo de novo.

Você foi indicado pelo {{indicador}} há {{dias}} dias. Se em algum momento a janela de setembro virar assunto no seu escritório, o endereço é enquadria.com.br e a conta demora um minuto.

Obrigado pelo tempo, e desculpe se atrapalhei.',
   3),

  ('indicacao_cadastrou_parado',
   'Indicado cadastrou e parou · 7 dias',
   'indicacao',
   'Criou a conta e não voltou. Aqui o assunto é o primeiro passo concreto, não o produto inteiro.',
   true, 7,
   '{{nome}}, faltou o primeiro passo',
   'Olá, {{nome}}.

Você criou a conta depois da indicação do {{indicador}} e parou antes de rodar a primeira empresa — que é justamente onde o sistema deixa de ser promessa e vira número.

O caminho curto: importe a carteira (ou cadastre UMA empresa à mão), responda oito perguntas e veja a saída. Dez minutos.

Se travou em alguma coisa, responda este e-mail dizendo onde. Eu leio.',
   4)
on conflict (chave) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- O FUNIL, para o painel
--
-- Devolve o cru; a leitura e as taxas ficam em `lib/reguas-indicacao.ts`, onde
-- são testadas. Repetir a regra aqui criaria a segunda verdade de sempre.
-- ═══════════════════════════════════════════════════════════════════════════
drop function if exists public.indicacoes_para_recuperar();

create function public.indicacoes_para_recuperar()
returns table (
  id uuid,
  tenant_id uuid,
  indicador_nome text,
  nome text,
  email text,
  status text,
  convite_em timestamptz,
  cadastrou_em timestamptz,
  virou_cliente_em timestamptz,
  /* quantos e-mails da cadência já saíram para esta indicação */
  ja_enviados bigint,
  /* o e-mail já existe como usuário? é a reconciliação da trava 4 */
  ja_e_usuario boolean,
  /* bateu, marcou spam ou pediu para sair */
  queimado boolean
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.e_superadmin() then
    raise exception 'acesso restrito ao dono da plataforma';
  end if;

  return query
  select
    i.id, i.tenant_id, t.nome, i.nome, i.email, i.status,
    i.convite_em, i.cadastrou_em, i.virou_cliente_em,
    (select count(*) from public.plataforma_envios e
      where e.chave_unica like '%:' || i.id::text and e.status = 'enviado'),
    exists (select 1 from public.profiles p where lower(p.email) = lower(i.email)),
    exists (
      select 1 from public.email_eventos x
       where lower(x.para) = lower(i.email)
         and x.evento in ('bounce', 'spam', 'recusado')
    )
  from public.indicacoes i
  left join public.tenants t on t.id = i.tenant_id
  order by i.convite_em;
end;
$function$;

revoke all on function public.indicacoes_para_recuperar() from public;
grant execute on function public.indicacoes_para_recuperar() to authenticated;

comment on function public.indicacoes_para_recuperar() is
  'As indicações com o que a cadência precisa saber: quantos e-mails já saíram, se o e-mail já virou usuário e se está queimado. A decisão de enviar é de lib/reguas-indicacao.ts.';
