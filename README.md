# Enquadria — app

SaaS de decisão de enquadramento de IBS/CBS para a carteira do escritório contábil.

## Stack
Next.js 14 (App Router) · Supabase (Postgres + RLS) · Tailwind · Vercel

## Subir

1. Supabase → SQL Editor → rodar em ordem: `0001_init`, `0002_importacao`, `0003_laudo_termo`, `0004_billing_ddas`. (seguros de rodar 2x)
2. `.env.local` a partir do `.env.local.example`:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `RECEITA_API_URL`, `RECEITA_API_TOKEN` — OPCIONAIS. Endpoint da base da
     Receita no Contabo (mesmo padrão do Contatia). Sem eles, o app funciona:
     a triagem usa o que vier no CSV.
3. `npm install && npm run dev`
4. Criar conta em `/login`; o workspace é provisionado por trigger.
5. `/painel/importar` → subir CSV ou usar a carteira de exemplo.

Build validado:

    NEXT_PUBLIC_SUPABASE_URL="https://fake.supabase.co" \
    NEXT_PUBLIC_SUPABASE_ANON_KEY="fake" npm run build

## Fatia 4 — o que entrou (o produto completo)

- dDAS REAL por anexo e faixa, derivado da partilha oficial do Simples
  (LC 123, anexos I–V). Sai a parcela PIS/Cofins do DAS; ICMS/ISS permanecem
  até 2029. Ressalva que resta: a alíquota nominal de topo superestima a
  efetiva nas faixas baixas — para laudo de produção, trocar pela efetiva
  calculada da RBT12. É o piso defensável, não mais um placeholder.
- Billing Asaas (`lib/asaas.ts` + `/api/checkout` + webhook `/api/asaas`):
  pacotes da janela (Essencial R$297, Escritório R$597, Carteira R$997) e
  assinatura recorrente R$97/mês. Degrada sem ASAAS_API_KEY.
- Configurações (`/painel/config`): edição de nome/CRC e UPLOAD DE LOGO
  (Supabase Storage). A logo entra na capa de laudo e termo — white-label completo.
- Webhook ZapSign (`/api/zapsign`): marca o termo assinado e a análise decidida.
- Página de planos (`/painel/planos`) com checkout.

## Integrações opcionais (env) — todas degradam com elegância

    RECEITA_API_URL / RECEITA_API_TOKEN   enriquecimento contra a Receita
    ZAPSIGN_API_TOKEN                      assinatura eletrônica do termo
    ASAAS_API_KEY / ASAAS_ENV             cobrança dos pacotes (sandbox|production)

## Webhooks a apontar nos painéis externos

    Asaas   → POST {app}/api/asaas    (PAYMENT_CONFIRMED / PAYMENT_RECEIVED)
    ZapSign → POST {app}/api/zapsign   (evento signed)

## Fatia 3 — o que entrou

- Laudo white-label: rota de impressão `/doc/laudo/[id]` com a marca do
  escritório (nome, CRC), premissas, resultado e recomendação. Numeração
  sequencial por tenant via RPC atômica. Botão "Baixar PDF" (print-to-PDF).
- Termo de ciência: `/doc/termo/[id]` com a decisão registrada e o rastro de
  assinatura. Integração ZapSign (`lib/zapsign.ts`) que degrada com elegância:
  sem token, o termo é impresso e assinado presencialmente; com token, cria o
  envelope e devolve o link de assinatura.
- Régua da janela no cabeçalho e linha de produção no cockpit (a antiga tela
  `/painel/janela` foi absorvida; o relatório do escritório continua em
  `/doc/relatorio`, linkado do cockpit).
- Ações de laudo e termo na própria linha da fila e na gaveta da empresa.

## RPCs (migration 0003)

    emitir_laudo(analise)          numera por tenant, muda status, atômico
    registrar_termo(analise, ...)  cria/atualiza termo, avança status
    assinar_termo(termo, ref)      marca assinatura concluída (webhook futuro)

## Integrações opcionais (env)

    RECEITA_API_URL / RECEITA_API_TOKEN   enriquecimento contra a Receita
    ZAPSIGN_API_TOKEN                      assinatura eletrônica do termo

Sem nenhuma delas o app funciona ponta a ponta.

## Fatia 2 — o que entrou

- Importação de CSV ponta a ponta: parse no navegador (papaparse), reconhecimento
  de colunas por sinônimos, validação de CNPJ (dígito verificador), dedup.
- Enriquecimento contra a base da Receita (`lib/receita.ts`): adaptador HTTP que
  degrada com elegância se o endpoint não estiver configurado.
- Triagem gravada; mapa de risco e carteira agora saem do estado vazio.
- Fila de análise (faixas A/B) com status por empresa e link para o motor.
- Persistência da análise: o motor recalcula NO SERVIDOR e congela os
  parâmetros usados (`analises.parametros`), com dDAS afinado pelo anexo.
- Auditoria: cada carga vira um registro em `importacoes`.

## Fluxo (a partir da simplificação de 28/07/2026)

    /painel/importar  → CSV → prévia da triagem → gravar
    /painel           → COCKPIT: linha de produção + fila única
                        cada linha traz a PRÓXIMA AÇÃO e executa ali:
                        analisar → confirmar → emitir laudo → enviar termo
                        → cobrar assinatura
                        seleção múltipla = as mesmas ações em lote
                        a empresa abre em GAVETA sobre a fila (dossiê,
                        análise e comparativo), sem sair da lista
    /painel/empresa/[id] → o mesmo dossiê como página, para link direto
    /painel/config    → Escritório (configurações · equipe · planos ·
                        abrir a próxima janela)

O menu do contador tem TRÊS itens: Cockpit · Escritório · (Negócio, só
superadmin). As rotas `carteira`, `fila`, `lote`, `entrega`, `janela`,
`radar`, `revisao`, `comparativo` e `motor` foram APAGADAS — o que elas
faziam acontece dentro do cockpit ou da gaveta. Radar e revisão da carteira
viraram AVISOS no topo da fila, e cada aviso injeta as empresas atingidas na
fila; aviso que não gera trabalho não aparece.

Teste do núcleo (funções puras): `testes/cockpit.test.mjs` — instruções de
execução no cabeçalho do arquivo.

## Contrato do endpoint da Receita (se for ligar)

    POST {RECEITA_API_URL}
    entrada: { "cnpjs": ["11222333000181", ...] }
    saída:   { "11222333000181": { cnae_principal, cnaes_secundarios,
               porte, situacao, anexo }, ... }

## Sobre o número no laudo

`das_por_anexo` agora traz a partilha REAL do Simples por anexo e faixa (LC 123).
O motor usa a alíquota nominal de topo da faixa como aproximação conservadora da
efetiva — o que é o piso defensável. Para o laudo de máxima precisão, calcular a
alíquota efetiva a partir da RBT12 de cada empresa (a coluna de faixa de
faturamento entra numa próxima fatia). A interpretação do que sai do DAS no
híbrido (só PIS/Cofins, ICMS/ISS até 2029) segue confirmada pela partilha oficial.
