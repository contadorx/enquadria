/**
 * "VIROU SERVIÇO" DEIXA DE SER SÓ UM RÓTULO — 08/08/2026.
 *
 * O DIAGNÓSTICO. `virou_servico` aparecia nove vezes no código, todas como
 * tipo, rótulo ou filtro. Nenhuma criava proposta, registrava cobrança ou
 * somava em qualquer lugar. O próprio componente que desenha o botão trazia
 * escrito: "sem registrar isso ninguém sabe quanto a carteira rendeu de revisão
 * no ano" — e era exatamente o que acontecia. O contador marcava, o rótulo
 * mudava de cor, e a informação morria ali.
 *
 * POR QUE ISSO É CARO. O produto tem um problema de calendário: a janela fecha
 * em 30/09/2026 e a renovação da assinatura acontece meses depois, quando não
 * há prazo nenhum na tela. A pergunta do contador em março de 2027 não é "o
 * Enquadria é bom?", é "o que eu mostro ao meu cliente para cobrar de novo?".
 * A resposta é o registro do que a Reforma exigiu daquela empresa no ano e do
 * que o escritório fez a respeito — e esse registro não existia porque faltavam
 * duas colunas.
 *
 * O QUE NÃO ESTOU CRIANDO: cobrança, integração de pagamento, nota. O valor
 * aqui é DECLARAÇÃO DO CONTADOR sobre o que ele cobrou — a mesma natureza do
 * honorário de referência que ele já edita no mapa de risco. O produto não
 * fatura por ele e não promete receita; ele registra o que o escritório
 * declarou, para virar papel no fim do ano.
 */

alter table public.apontamentos
  add column if not exists honorario_centavos int,
  add column if not exists virou_servico_em   timestamptz;

comment on column public.apontamentos.honorario_centavos is
  'Quanto o escritório declarou ter cobrado por tratar este ponto. Declaração do contador, não cobrança do produto — mesma natureza do honorário de referência do mapa de risco.';
comment on column public.apontamentos.virou_servico_em is
  'Quando virou serviço. Data própria, e não `tratado_em`: um ponto pode ser tratado em março e só virar serviço em maio, e o relatório anual precisa saber em qual mês o dinheiro entrou.';

/**
 * O VALOR SÓ EXISTE COM O ESTADO QUE O JUSTIFICA.
 *
 * Sem esta trava, um apontamento marcado "não se aplica" poderia carregar
 * honorário — e o relatório anual somaria trabalho que o próprio escritório
 * disse não ter feito. Número que aparece num papel entregue ao cliente precisa
 * ter regra no banco, não só cuidado na rota.
 */
alter table public.apontamentos
  drop constraint if exists apontamentos_honorario_coerente;
alter table public.apontamentos
  add constraint apontamentos_honorario_coerente
  check (
    honorario_centavos is null
    or (status = 'virou_servico' and honorario_centavos >= 0)
  );

/* o relatório anual varre por período: (tenant, quando virou serviço) */
create index if not exists apontamentos_servico_no_periodo
  on public.apontamentos (tenant_id, virou_servico_em desc)
  where status = 'virou_servico';

/**
 * QUEM JÁ ESTAVA MARCADO GANHA A DATA QUE DÁ PARA SABER.
 *
 * Quem marcou "virou serviço" antes desta migration não tem `virou_servico_em`
 * — e sem data o registro não entra em relatório nenhum, ou seja, o trabalho
 * já feito sumiria do primeiro anuário. `tratado_em` é a melhor aproximação
 * que existe, e `criado_em` é a rede para o caso de nem essa haver.
 *
 * O honorário fica NULO de propósito: inventar um valor médio para o passado
 * seria pôr número não declarado num papel que vai para o cliente. A tela
 * mostra "valor não informado", que é verdade e é editável.
 */
update public.apontamentos
   set virou_servico_em = coalesce(tratado_em, criado_em)
 where status = 'virou_servico'
   and virou_servico_em is null;

/**
 * CONFERÊNCIA (rodar à mão depois de aplicar):
 *
 *   select status,
 *          count(*)                                as pontos,
 *          count(virou_servico_em)                 as com_data,
 *          count(honorario_centavos)               as com_valor,
 *          coalesce(sum(honorario_centavos), 0)/100 as total_reais
 *     from public.apontamentos
 *    group by status order by status;
 *
 * Só a linha `virou_servico` pode ter valor. Se qualquer outra tiver, a
 * restrição acima não foi aplicada — e o relatório anual está somando trabalho
 * que ninguém fez.
 */
