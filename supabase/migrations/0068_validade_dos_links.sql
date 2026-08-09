/**
 * O LINK DO DOCUMENTO DEIXA DE SER ETERNO — 08/08/2026.
 *
 * O DEFEITO. Laudo, termo, comparativo, coleta e estudo de abertura são
 * servidos por token público. O token é bom — `gen_random_uuid()`, 122 bits,
 * consultado por `token` e nunca por `id`, sem caminho de enumeração. O que não
 * existia era VALIDADE: nenhuma coluna de expiração, nenhuma revogação, nenhuma
 * rotação. Uma busca por "expira" no projeto inteiro só encontrava o OTP da
 * assinatura e o convite de equipe.
 *
 * Na prática: um link reencaminhado por WhatsApp em setembro de 2026 abre, em
 * 2033, a razão social, o CNPJ, a RBT12 e a recomendação tributária de um
 * cliente de terceiro. Num produto cujo `app/robots.ts` abre com um comentário
 * dizendo que a regra é LGPD antes de SEO, essa era a lacuna mais
 * desproporcional que havia.
 *
 * AS TRÊS DECISÕES, e por que não são óbvias:
 *
 * 1. VALIDADE LONGA, NÃO CURTA. Dois anos, não trinta dias. O laudo é peça de
 *    prova: o cliente volta a ele quando o Fisco pergunta, e isso não acontece
 *    na semana seguinte. Link que morre cedo transforma o documento em recado, e
 *    o produto inteiro é vendido sobre o contrário disso. Dois anos cobrem a
 *    janela, o período de efeito e a janela seguinte com folga.
 *
 * 2. O TERMO NÃO ASSINADO EXPIRA ANTES. Noventa dias. Ele não é prova ainda: é
 *    um convite para assinar, e convite parado há três meses é convite que não
 *    vai ser aceito — enquanto isso, é uma porta aberta com o CNPJ do cliente
 *    atrás. Assinado, ele vira prova e passa a valer os dois anos.
 *
 * 3. REVOGAR É ATO, E ATO SE REGISTRA. `revogado_em` separado da expiração:
 *    "venceu sozinho" e "o contador cortou o acesso" são fatos diferentes, e a
 *    tela do cliente precisa dizer qual dos dois aconteceu. Revogar não apaga
 *    nada — o documento continua no banco, verificável pelo número e pelo CNPJ
 *    em /verificar, que é a via que não depende de link nenhum.
 *
 * O QUE ESTA MIGRATION NÃO FAZ: não expira nada que já existe. Todo documento
 * emitido até hoje recebe validade contada a partir de AGORA, não da emissão —
 * fechar retroativamente um link que o cliente tem na caixa de entrada seria
 * transformar uma correção de privacidade numa quebra de entrega.
 */

/* ─────────────────────────────────────────────────────────── laudos ─────── */
alter table public.laudos
  add column if not exists token_expira_em timestamptz,
  add column if not exists revogado_em     timestamptz,
  add column if not exists revogado_por    uuid references auth.users(id) on delete set null;

update public.laudos
   set token_expira_em = now() + interval '2 years'
 where token_expira_em is null;

alter table public.laudos
  alter column token_expira_em set default (now() + interval '2 years');

/* ──────────────────────────────────────────────────────────── termos ────── */
alter table public.termos
  add column if not exists token_expira_em timestamptz,
  add column if not exists revogado_em     timestamptz,
  add column if not exists revogado_por    uuid references auth.users(id) on delete set null;

/* assinado é prova e dura; pendente é convite e vence em 90 dias */
update public.termos
   set token_expira_em = case
         when assinatura_status = 'assinado' or assinado_em is not null
           then now() + interval '2 years'
         else now() + interval '90 days'
       end
 where token_expira_em is null;

alter table public.termos
  alter column token_expira_em set default (now() + interval '90 days');

/**
 * ASSINAR PROMOVE O LINK A PROVA.
 *
 * Sem isto, o termo assinado no 89º dia venceria no 90º — e a via do cliente,
 * que é o documento que ele guarda, morreria um dia depois de ele assinar.
 */
create or replace function public.termo_assinado_estende_validade()
returns trigger
language plpgsql
as $$
begin
  if (new.assinatura_status = 'assinado' or new.assinado_em is not null)
     and (old.assinatura_status is distinct from new.assinatura_status
          or old.assinado_em is distinct from new.assinado_em) then
    new.token_expira_em := greatest(coalesce(new.token_expira_em, now()), now() + interval '2 years');
  end if;
  return new;
end;
$$;

drop trigger if exists termo_assinado_estende on public.termos;
create trigger termo_assinado_estende
  before update on public.termos
  for each row execute function public.termo_assinado_estende_validade();

/* ────────────────────────────────────── comparativos, coletas, aberturas ── */
alter table public.comparativos
  add column if not exists token_expira_em timestamptz,
  add column if not exists revogado_em     timestamptz,
  add column if not exists revogado_por    uuid references auth.users(id) on delete set null;
update public.comparativos set token_expira_em = now() + interval '2 years' where token_expira_em is null;
alter table public.comparativos alter column token_expira_em set default (now() + interval '2 years');

alter table public.aberturas
  add column if not exists token_expira_em timestamptz,
  add column if not exists revogado_em     timestamptz,
  add column if not exists revogado_por    uuid references auth.users(id) on delete set null;
update public.aberturas set token_expira_em = now() + interval '2 years' where token_expira_em is null;
alter table public.aberturas alter column token_expira_em set default (now() + interval '2 years');

/* a coleta é formulário, não documento: ela já tem estado próprio e vence junto
   com o interesse — 120 dias cobrem a janela inteira com sobra */
alter table public.coletas
  add column if not exists token_expira_em timestamptz,
  add column if not exists revogado_em     timestamptz,
  add column if not exists revogado_por    uuid references auth.users(id) on delete set null;
update public.coletas set token_expira_em = now() + interval '120 days' where token_expira_em is null;
alter table public.coletas alter column token_expira_em set default (now() + interval '120 days');

comment on column public.laudos.token_expira_em is
  'Até quando o link público abre. Longo de propósito: o laudo é prova, e o cliente volta a ele quando o Fisco pergunta. Depois do vencimento, /verificar continua conferindo o documento pelo número e pelo CNPJ.';
comment on column public.termos.token_expira_em is
  'Pendente vale 90 dias (é convite); assinado passa a valer 2 anos por gatilho (virou prova).';
comment on column public.laudos.revogado_em is
  'Corte manual do acesso pelo escritório. Separado da expiração porque "venceu" e "foi cortado" são fatos diferentes, e a tela do cliente precisa dizer qual dos dois.';

/**
 * CONFERÊNCIA (rodar à mão depois de aplicar):
 *
 *   select 'laudos' t, count(*) total, count(token_expira_em) com_validade,
 *          min(token_expira_em) menor from public.laudos
 *   union all select 'termos', count(*), count(token_expira_em), min(token_expira_em) from public.termos
 *   union all select 'comparativos', count(*), count(token_expira_em), min(token_expira_em) from public.comparativos
 *   union all select 'aberturas', count(*), count(token_expira_em), min(token_expira_em) from public.aberturas
 *   union all select 'coletas', count(*), count(token_expira_em), min(token_expira_em) from public.coletas;
 *
 * `com_validade` tem de ser igual a `total` em todas as linhas, e `menor` nunca
 * pode estar no passado no dia da aplicação — se estiver, algum link já nasceu
 * fechado e alguém vai receber "link expirado" sem ter feito nada.
 */
