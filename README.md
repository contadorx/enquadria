# Enquadria — app

SaaS de decisão de enquadramento de IBS/CBS para a carteira do escritório contábil.

## Stack
Next.js 14 (App Router) · Supabase (Postgres + RLS) · Tailwind · Vercel

## Subir

1. Supabase → SQL Editor → rodar em ordem: `enquadria_0001_init.sql`, depois `enquadria_0002_importacao.sql`. (seguros de rodar 2x)
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

## Fluxo

    /painel/importar  → CSV → prévia da triagem → gravar
    /painel           → mapa de risco (contagem por faixa)
    /painel/fila      → fila A/B → "Analisar"
    /painel/motor?empresa=ID → responder → "Salvar análise"

## Contrato do endpoint da Receita (se for ligar)

    POST {RECEITA_API_URL}
    entrada: { "cnpjs": ["11222333000181", ...] }
    saída:   { "11222333000181": { cnae_principal, cnaes_secundarios,
               porte, situacao, anexo }, ... }

## O que NÃO existe ainda (fatia 3)

- Laudo em PDF white-label, termo de ciência, assinatura (ZapSign)
- Painel da janela com contagem regressiva e pendências
- Billing (Asaas)

## Pendência que bloqueia laudo real

`das_por_anexo` em `parametros_exercicio` é PROVISÓRIO. Substituir pela
repartição de PIS/Cofins por anexo e faixa antes de emitir qualquer laudo.
Confirmar em: art. 516 da LC 214/2025 e Resolução CGSN 186/2026.
