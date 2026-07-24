# Enquadria — app

SaaS de decisão de enquadramento de IBS/CBS para a carteira do escritório contábil.
Fatia 1: esqueleto, schema, motor e autenticação.

## Stack
Next.js 14 (App Router) · Supabase (Postgres + RLS) · Tailwind · Vercel

## Subir

1. Criar projeto no Supabase.
2. SQL Editor → colar `enquadria_0001_init.sql` → Run. (seguro rodar 2x)
3. Copiar `.env.local.example` para `.env.local` e preencher:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. `npm install && npm run dev`
5. Criar conta em `/login` — o workspace do escritório é provisionado por trigger.

Build validado com env fake:

    NEXT_PUBLIC_SUPABASE_URL="https://fake.supabase.co" \
    NEXT_PUBLIC_SUPABASE_ANON_KEY="fake" npm run build

## Mapa do código

    lib/motor.ts        o motor de decisão. Puro, sem I/O. É o produto.
    lib/triagem.ts      classificação automática por CNAE, porte e situação.
    components/Regua    a régua da janela (assinatura visual).
    components/Gauge    repasse × folga do comprador — a decisão em uma linha.
    app/painel          mapa de risco da carteira.
    app/painel/motor    a análise rodando ponta a ponta.

## O que já funciona

- Login, cadastro e provisionamento automático de workspace
- RLS por tenant em todas as tabelas
- Motor de decisão completo (S1–S4 + selo de prioridade)
- Triagem por CNAE pronta para receber a importação
- Mapa de risco lendo do banco, com estado vazio

## O que NÃO existe ainda

- Importação de CSV e enriquecimento contra a base da Receita (fatia 2)
- Persistência das análises (hoje o motor calcula em memória)
- Laudo em PDF, termo de ciência e assinatura (fatia 3)
- Billing

## Pendência que bloqueia laudo real

`das_por_anexo` em `parametros_exercicio` está **provisório**. Substituir pela
repartição de PIS/Cofins por anexo e faixa antes de emitir qualquer laudo.
Confirmar em: art. 516 da LC 214/2025 e Resolução CGSN 186/2026.
Enquanto isso, o motor roda, mas o número não é defensável em reunião.
