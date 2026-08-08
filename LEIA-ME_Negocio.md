# Enquadria — aba Negócio (receita, cobrança, réguas, planos e Asaas)

Ordem de instalação, o que mudou e o que conferir antes de soltar.

---

## 1. Rodar a migration (uma vez, no SQL Editor do Supabase)

`supabase/migrations/0020_negocio.sql`

Idempotente. Testada rodando do zero e rodando de novo, em dois bancos com
nomes de coluna diferentes (`tenants.criado_em` e `tenants.created_at`) — a
migration **pergunta** ao banco qual coluna de data existe e monta as funções
em cima do nome verdadeiro, em vez de supor.

O que ela cria:

- `profiles.is_superadmin` + `e_superadmin()` — quem enxerga a aba.
- **Desenho de plano** em `planos`: ciclo, dias de acesso, chamada, visibilidade,
  destaque, limites (laudos / empresas / usuários) e `recursos` em jsonb.
- `plataforma_recursos` — o catálogo de 15 recursos com nome legível. Fonte
  única: a vitrine do contador e o painel leem daqui.
- `plataforma_reguas` — as 17 réguas com assunto e corpo. Texto no banco,
  editável pela tela, sem deploy.
- `plataforma_envios` — log de tudo que a plataforma manda ao contador, com
  `chave_unica` em índice **único**.
- `plataforma_mrr` — foto mensal da receita.
- `plataforma_config` — parâmetros (janela, carência, metas).
- **Contabilidade da assinatura**: `assinaturas` ganha `valor_centavos`,
  `vencimento`, `pago_em`, `cancelada_em`, `origem`. Sem o valor gravado no ato,
  mudar o preço do plano reescreveria o histórico de receita.
- `negocio_escritorios()` e `negocio_snapshot()` — a fonte do painel, via RPC.
  Funciona **sem** `SUPABASE_SERVICE_ROLE_KEY`.

### Bootstrap (uma vez)

```sql
update public.profiles set is_superadmin = true where email = 'SEU_EMAIL';
```

### ⚠️ O vazamento de receita que a migration conserta

O webhook do Asaas dava **365 dias de acesso a qualquer pagamento confirmado** —
inclusive ao PRO mensal de R$ 47. Um pagamento de um mês liberava um ano, e isso
não aparecia em lugar nenhum do painel.

Agora cada plano declara **dias de acesso por pagamento** (mensal 31, anual 365)
e o webhook respeita esse número. O fallback passou de 365 para 31: errar para
menos é um cliente que escreve reclamando; errar para mais é receita que some
sem ninguém notar.

A **parte 9 da migration** é uma consulta de leitura que lista quem hoje está com
validade esticada. Ela só mostra — corrigir cada caso é decisão sua, e dá para
fazer pela tela de Cobranças.

---

## 2. Subir o código

Sem dependência nova. Build conferido com env fake.

Arquivos novos:

```
lib/negocio.ts                        métricas do negócio
lib/reguas.ts                         motor de e-mails proativos
app/painel/negocio/                   as 4 telas
app/api/negocio/route.ts              endpoint único da aba
app/api/cron/negocio/route.ts         cron do negócio (aceita ?teste=1)
components/NegocioAbas.tsx
components/NegocioUI.tsx
```

Alterados:

- `lib/asaas.ts` — ganhou `statusAsaas()` (diagnóstico real, batendo na API) e
  `reconciliarAssinatura()` (puxa do Asaas e alinha o banco quando o webhook
  falha).
- `app/api/asaas/route.ts` — o webhook agora respeita `dias_acesso` e conta a
  partir da data do pagamento, não de "agora": se o webhook chegar atrasado, o
  cliente não perde os dias que já eram dele.
- `lib/nav.ts` + `app/painel/layout.tsx` + `components/NavMobile.tsx` — o grupo
  **Plataforma** aparece só para quem tem `is_superadmin`, no desktop e no
  celular.
- `vercel.json` — cron diário `/api/cron/negocio` às 11h UTC.

---

## 3. Variáveis de ambiente

| Variável | Sem ela | Onde confere |
|---|---|---|
| `ASAAS_API_KEY` | nenhuma cobrança é gerada; link tem de ser colado à mão | Negócio → Planos |
| `ASAAS_ENV` | **cuidado: em branco significa `sandbox`**, não produção | Negócio → Planos |
| `BREVO_API_KEY` | nenhum e-mail sai | Negócio → E-mails |
| `SUPABASE_SERVICE_ROLE_KEY` | painel lê normalmente (RPC), mas gravar assinatura de outro escritório falha | banner em Cobranças |
| `CRON_SECRET` | o cron se recusa a rodar | — |
| `NEXT_PUBLIC_APP_URL` | os links dos e-mails caem no domínio padrão | — |

No Asaas: **Integrações → Webhooks**, URL `https://SEU-APP/api/asaas`, eventos
`PAYMENT_CONFIRMED` e `PAYMENT_RECEIVED`.

---

## 4. Primeiro disparo — a ordem segura

1. Abra **Negócio → E-mails**.
2. Confira a **janela de ativação** (padrão 30 dias). É a trava que impede
   mandar "Bem-vindo ao Enquadria" para quem se cadastrou há seis meses no
   primeiro disparo.
3. Clique em **Só prever**. Nada é enviado; a tela mostra quem receberia o quê
   e por quê.
4. Leia a lista. Se algo parecer errado, corrija o texto ou desligue a regra.
5. Só então **Enviar agora** — ou deixe o cron das 11h UTC fazer.

Para testar sem tocar em nada:
`GET /api/cron/negocio?segredo=CRON_SECRET&teste=1` devolve o plano em JSON.

---

## 5. O que cada tela faz

**Visão** — a janela de setembro no topo (é ela que dita o ritmo do negócio),
MRR normalizado, ARR, MRR em risco, funil de ativação e a fila **"o que fazer
hoje"**: quem bateu no limite gratuito, carteira grande ainda no gratuito,
assinatura vencendo, vencida sem baixa, carteira parada na triagem, assinante
parado e validade esticada.

**Cobranças** — a régua em quatro degraus, os escritórios com edição inline de
plano/status/valor/validade, geração de cobrança no Asaas e o botão de
sincronizar.

**E-mails proativos** — as 17 réguas em cinco grupos, com assunto e corpo
editáveis, envio de teste, e a **prévia real** dos próximos disparos (o mesmo
planejamento que o cron executa). Mais o log, onde cada linha é também a trava
de dedupe — e o botão "liberar reenvio" apaga a trava quando você quiser.

**Planos & Asaas** — diagnóstico da conexão (bate na API de verdade), o alerta
dos dias de acesso, o editor de planos (preço, ciclo, dias de acesso, limites,
recursos) e a tabela comparativa do jeito que o contador vê.

---

## 6. Decisões que vale conhecer

**A conversão que o painel mede é provou→pago, não cadastro→pago.** Quem emitiu
um laudo viu o produto inteiro. Se não assinou depois disso, o problema é preço
ou valor percebido, não onboarding — e a ação é outra.

**As réguas de conversão não dependem da idade da conta.** Bater no limite dos
2 laudos é o lead mais quente que existe, tenha a conta um dia ou um ano. As de
ativação, sim, têm janela de 30 dias.

**Quem já tem cobrança em aberto não recebe pitch de conversão.** Já decidiu.
Mandar "assine o PRO" para quem está com o boleto na mão faz o sistema parecer
cego.

**A régua de cobrança é escada.** Só o degrau mais alto atingido dispara —
testado nos atrasos 0, 1, 3, 5 e 12. Nunca dois avisos no mesmo dia.

**Cobrança sem link de pagamento não entra na régua.** Aviso sem meio de pagar
irrita mais do que resolve.

**A retenção só cutuca quem tem algo pendente.** Assinante parado com zero
empresas na faixa A não recebe nada — herdado da regra do digest: só se manda
e-mail quando há algo concreto da carteira dele.

**A chave de dedupe é reservada ANTES do envio.** Duas execuções simultâneas: a
segunda morre no índice único.

**Envio que falha não é repetido sozinho.** A linha vira erro e a trava
permanece. Reenviar é decisão sua, pelo botão.

**Nada é bloqueado automaticamente.** `bloquear_automatico` existe em
`plataforma_config → cobranca` e vem `false`. O cron conta as assinaturas
vencidas e mostra; tirar acesso continua sendo decisão humana.

**Mexer no preço de um plano não altera quem já assinou** — o valor é gravado na
assinatura no ato da compra. O cartão do plano mostra quantos assinantes e
quanto MRR ele carrega, para você não mexer às cegas.

---

## 7. Verificação feita

- Migration rodada do zero e repetida, em dois bancos com nomes de coluna de
  data diferentes: sem erro nos dois.
- RPCs testadas com dados de exemplo: `negocio_escritorios()` devolveu os três
  escritórios com uso correto; `negocio_snapshot()` normalizou o MRR
  (R$ 47 mensal + R$ 470 anual ÷ 12 = R$ 86,16) e é idempotente no mês.
- A consulta do vazamento identificou corretamente o assinante mensal com 365
  dias de acesso.
- Motor de réguas: 20 cenários em teste puro (ativação, os dois estados do
  freemium, janela, escada de cobrança em cinco níveis de atraso, renovação,
  retenção, dedupe, regra desligada, interpolação de variáveis e montagem do
  HTML), todos passando.
- `next build` com env fake: compila limpo, 41 rotas.
