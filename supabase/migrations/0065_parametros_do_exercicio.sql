/**
 * OS PARÂMETROS DO EXERCÍCIO PASSAM A TER ONDE SER ESCRITOS — 08/08/2026.
 *
 * O PROBLEMA. `parametros_exercicio` é lida em quatro lugares do produto
 * (analise, analise/lote, janela e o cockpit) e NUNCA era escrita: não havia
 * migration que a criasse, não havia rota, não havia tela. O único jeito de
 * mudar a alíquota era SQL direto em produção — exatamente o problema que a
 * migration 0054 diagnosticou para o radar e resolveu com uma tela.
 *
 * POR QUE ISSO É O ACHADO MAIS CARO DO PRODUTO. A alíquota de referência de
 * IBS/CBS só é fixada por Resolução do Senado até 31/10/2026. O produto vende,
 * por e-mail, que cada laudo de setembro vira revisão cobrável em outubro,
 * quando o número sair. Mas o número é a constante `0.088` cravada em
 * lib/motor.ts, e não havia onde digitar o valor real. O trabalho estava
 * vendido e a ferramenta não existia.
 *
 * A DECISÃO: VALOR ÚNICO, DO SUPERADMIN. A alíquota é uma só — é norma, não
 * preferência de escritório. Um valor por exercício, escrito por quem opera a
 * plataforma, lido por todos. Dois escritórios não podem calcular a mesma
 * empresa com números diferentes: os dois laudos são verificáveis
 * publicamente, e discordar sem explicação no papel destrói a única coisa que
 * este produto vende, que é prova.
 *
 * O QUE ESTA MIGRATION NÃO FAZ: não recalcula nada. Trocar o número aqui não
 * mexe em análise nenhuma — nem deve. Os laudos já emitidos continuam
 * congelados no snapshot da emissão, e a carteira só muda quando o contador
 * pedir uma rodada nova, que cria análises NOVAS e preserva as anteriores.
 */

create table if not exists public.parametros_exercicio (
  exercicio      int primary key,
  aliquota_cbs   numeric(6,5) not null,
  aliquota_ibs   numeric(6,5) not null,
  corte_s1       numeric(6,5) not null,
  fronteira_min  numeric(6,5) not null,
  fronteira_max  numeric(6,5) not null
);

/**
 * A PROCEDÊNCIA DO NÚMERO, junto do número.
 *
 * `fonte` não é enfeite: enquanto a Resolução não sai, o laudo precisa dizer
 * que a alíquota é sensibilidade declarada e não decorre de norma publicada —
 * e quando ela sair, precisa dizer QUAL norma. Guardar a citação ao lado do
 * valor é o que faz o carimbo do documento mudar sozinho, sem alguém lembrar
 * de editar um texto em outro arquivo.
 *
 * `atualizado_em` e `atualizado_por` existem pela mesma razão da tela de
 * registros: quando um laudo for questionado, a primeira pergunta é "com que
 * número isso foi calculado, e desde quando".
 */
alter table public.parametros_exercicio
  add column if not exists fonte           text,
  add column if not exists fixada          boolean not null default false,
  add column if not exists atualizado_em   timestamptz not null default now(),
  add column if not exists atualizado_por  uuid references auth.users(id);

comment on table public.parametros_exercicio is
  'Um valor por exercício, global. A alíquota de referência de IBS/CBS é norma, não preferência de escritório: dois laudos verificáveis do mesmo período não podem discordar sem explicação no papel.';
comment on column public.parametros_exercicio.fonte is
  'De onde veio o número. Enquanto a Resolução do Senado não sai, é a estimativa de trabalho do motor — e o laudo imprime isso.';
comment on column public.parametros_exercicio.fixada is
  'false enquanto a Resolução do Senado não for publicada. É este campo que faz o laudo parar de dizer "estimativa de trabalho" e passar a citar a norma — sem ninguém editar texto em outro arquivo.';

/* ────────────────────────────────────────────────────────────────────────────
   QUEM LÊ E QUEM ESCREVE.

   Todo mundo autenticado LÊ: a rota de análise precisa do número para calcular,
   e ele não é segredo de ninguém — está impresso no laudo.

   Só o superadmin ESCREVE, e a trava é do banco, não da rota. A segunda rota
   que escrever aqui herda a regra sem precisar lembrar dela — mesma decisão do
   radar na 0054.
   ──────────────────────────────────────────────────────────────────────────── */

alter table public.parametros_exercicio enable row level security;

drop policy if exists parametros_leitura on public.parametros_exercicio;
create policy parametros_leitura on public.parametros_exercicio
  for select
  to authenticated
  using (true);

drop policy if exists parametros_escrita on public.parametros_exercicio;
create policy parametros_escrita on public.parametros_exercicio
  for all
  to authenticated
  using (public.e_superadmin())
  with check (public.e_superadmin());

comment on policy parametros_escrita on public.parametros_exercicio is
  'A alíquota de referência é uma só. Escritório não edita; o dono da plataforma publica quando a Resolução sair.';

/**
 * A SEMENTE É O QUE O CÓDIGO JÁ USA — não um número novo.
 *
 * Estes valores são os de `PARAMETROS_2027` em lib/motor.ts. Semear com eles
 * significa que aplicar esta migration NÃO MUDA NENHUM CÁLCULO: a tela nasce
 * mostrando exatamente o que o produto já vinha praticando, e a primeira
 * mudança real vai ser deliberada, feita por alguém, com data e autor.
 *
 * Migration que altera resultado de cálculo no dia em que roda é migration que
 * ninguém consegue distinguir de um bug.
 */
insert into public.parametros_exercicio
  (exercicio, aliquota_cbs, aliquota_ibs, corte_s1, fronteira_min, fronteira_max, fixada, fonte)
values
  /* 0,087 de CBS + 0,001 de IBS = 0,088, que é `PARAMETROS_2027.aliquota`.
     `fronteira_min`/`fronteira_max` são MULTIPLICADORES do ganho do comprador
     (0,8·fc e 1,2·fc), não pontos percentuais — quem ler isto como "0,8%"
     inverte a banda de fronteira inteira. `corte_s1` está inerte desde que a
     banda passou a capturar o intervalo; fica em zero para não fingir efeito. */
  (2027, 0.08700, 0.00100, 0.00000, 0.80000, 1.20000, false,
   'Estimativa de trabalho para 2027, na forma da EC 132/2023 e da LC 214/2025. A alíquota de referência de IBS/CBS é fixada por Resolução do Senado Federal, com prazo até 31/10/2026 — depois do fechamento da janela de opção.')
on conflict (exercicio) do nothing;

/**
 * CONFERÊNCIA (rodar à mão depois de aplicar):
 *
 *   select exercicio, aliquota_cbs + aliquota_ibs as aliquota,
 *          fronteira_min, fronteira_max, fixada, atualizado_em
 *     from public.parametros_exercicio order by exercicio;
 *
 * No dia da aplicação a soma tem de dar 0.088, a banda 0.8/1.2 e `fixada` tem
 * de estar em false. Se der outra coisa, alguém mudou o número antes de a tela
 * existir — e aí a pergunta é quando, por quê, e quais laudos saíram no meio.
 */
