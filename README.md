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

Testes do núcleo (funções puras, sem banco): `testes/cockpit.test.mjs` (esteira
e próxima ação) e `testes/motor.test.mjs` (cenários, reais, sensibilidade,
sublimite, fator R, partilha por exercício e as seções do laudo). Instruções de
execução no cabeçalho de cada arquivo.

## O laudo (fatias 5, 6 e 7)

O documento passou a ter DEZ seções e a sustentar honorário: identificação ·
objeto e base legal (EC 132/2023, LC 214/2025, LC 227/2026 e Res. CGSN 186/2026)
· premissas com a ORIGEM marcada · MEMÓRIA DE CÁLCULO com fórmula, substituição
numérica e resultado em cada passo · quadro comparativo em % e em R$ ·
sensibilidade · resultado com o que precisa continuar verdadeiro · riscos e
limites · responsabilidade técnica · anexo do Simples com a faixa destacada.
Sai em ~4 páginas mais o anexo.

Faixas C, D, MEI e FORA recebem o LAUDO CURTO (2 páginas): documenta o descarte
com a mesma numeração e a mesma verificação pública, sem simular uma decisão
que não existe.

Todo laudo traz DOIS CENÁRIOS de alíquota — 8,8% (estimativa de trabalho) e
9,4% (sensibilidade declarada, sem norma) — porque a decisão é tomada antes de
a alíquota existir: a Resolução do Senado tem prazo até 31/10/2026, depois do
fechamento da janela. O carimbo da alíquota, com fonte e data de consulta, vai
no corpo do documento.

Nada disso exigiu migration: tudo o que o laudo imprime é congelado em
`analises.parametros` (jsonb) no momento de salvar a análise, e `parametros` já
é copiado para o snapshot do laudo na emissão. Revisar a análise depois NÃO
altera um laudo já entregue.

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

## Documentos legais (fonte única)

`lib/legal.json` guarda o texto de Termos de Uso, Política de Privacidade,
Segurança e Políticas internas. Duas coisas leem esse arquivo:

- o app, em `/termos`, `/privacidade`, `/seguranca` e `/politicas`
  (componente `components/DocumentoLegal.tsx`), com `noindex` e canonical
  apontando para o site — a versão pública é a do site;
- o site estático, pelo gerador `ferramentas/gerar-legal.py`.

    python3 ferramentas/gerar-legal.py ../enquadria-site

Editou o JSON? Rode o gerador e recoloque os quatro HTML no site. **Nunca edite
o texto direto no HTML**: texto jurídico escrito em dois lugares é texto
jurídico que diverge, e divergir aqui é pior do que não ter documento.

A tela de login exibe o aceite dos Termos ao criar conta, e o rodapé do app
aponta para os quatro documentos.

## Curso: progresso e certificado

O curso público mora no site estático. O **progresso** (quais aulas foram
concluídas) vive no navegador do participante — o site não tem login, e exigir
cadastro para marcar uma aula seria a fricção que o curso existe para evitar. A
página diz isso na tela.

O **certificado** é do app: `POST /api/curso/certificado` grava em
`curso_certificados` (migration **0023**) e devolve um código público no formato
`EQ-XXXX-XXXX`. O documento fica em `/certificado/[codigo]`, é rota pública,
imprimível em A4 paisagem, e serve como a própria verificação — quem receber o
certificado confere o código sem login.

Emitir duas vezes com o mesmo e-mail devolve o MESMO código: dois números para a
mesma conclusão seria bug, não recurso.

### Compartilhar o certificado

- `/certificado/[codigo]/opengraph-image` — a previa que LinkedIn, WhatsApp e
  Telegram mostram ao colar o link (1200x630).
- `/certificado/[codigo]/imagem` — a mesma arte para BAIXAR e postar;
  `?f=quadrado` devolve 1080x1080.
- Botao **Adicionar ao perfil do LinkedIn** no formato oficial
  (`startTask=CERTIFICATION_NAME`), ja com nome, data, `certId` e `certUrl`.
  Usa `organizationName=Enquadria`; se um dia existir pagina da empresa no
  LinkedIn, trocar por `organizationId=<id numerico>` faz o logo aparecer no
  perfil de quem adicionou. Os dois parametros nao podem ir juntos.

O desenho das imagens vive em `lib/cert-imagem.tsx`, usado pelas duas rotas —
imagem de previa diferente da imagem baixada e o tipo de detalhe que faz o
material parecer improvisado.

**Armadilha registrada:** a busca da fonte Plus Jakarta Sans tem queda para a
fonte padrao, e a queda devolve `undefined`, nao `[]`. Passar `fonts: []` para o
`ImageResponse` derruba a renderizacao inteira com "No fonts are loaded" — nao
cai no padrao.

## Pedir dados à empresa (migration 0024)

Das oito perguntas da análise, três o contador responde olhando a escrituração
(folha, faturamento, anexo). As outras cinco não estão em lugar nenhum da
contabilidade: quanto das vendas vai para outra empresa, se essas empresas são
grandes, se algum cliente já cobrou nota com crédito, se dá para repassar preço,
se o concorrente é maior. A nota fiscal traz o CNPJ do cliente, mas não traz o
regime dele — e nenhum livro registra "o cliente avisou que em 2027 vai exigir
crédito". Sem esses cinco, o contador estima; e a estimativa entra no laudo com
a mesma cara de um número apurado.

O fluxo:

1. Na gaveta da empresa, **Gerar o link para a empresa** cria uma coleta
   (`POST /api/coleta`) com token de 20 caracteres.
2. O contador copia a **mensagem pronta** (ou abre no WhatsApp). Se ele
   precisasse redigir o convite, não mandaria.
3. A empresa abre `/coleta/[token]` — rota **pública**, fora do middleware.
   Pedir cadastro ao dono da empresa para responder seis perguntas é garantir
   que ele não responda. Seis perguntas, celular, sem jargão.
4. `POST /api/coleta/[token]` valida no servidor (só os valores declarados em
   `lib/coleta.ts` passam), grava as respostas cruas e as derivadas.
5. O painel mostra as respostas **em texto**, e **Usar estas respostas na
   análise** preenche o formulário. Não salva sozinho: quem assina é o contador.

`lib/coleta.ts` é a única definição do questionário — a página pública desenha a
partir dele e o painel lê a partir dele. Duas listas divergiriam no primeiro
ajuste de texto, e aí a pergunta respondida deixaria de ser a pergunta usada na
conta.

**Acesso.** `coletas` tem RLS ligada e **nenhuma policy**. Quem autoriza é o
servidor: antes de criar uma coleta, a empresa é buscada com o cliente do
usuário, sujeito à RLS que já existe em `empresas`. Se o contador não enxerga a
empresa, a coleta não nasce. A regra de quem-vê-o-quê continua morando num lugar
só, em vez de ser reescrita aqui e divergir depois.

**Linguagem.** `testes/coleta.test.mjs` reprova sigla e jargão no questionário —
IBS, CBS, DAS, anexo, alíquota, regime, Lucro Real. Pergunta que precisa de
glossário volta em branco ou volta errada.

## Testes

Não há runner: são funções puras compiladas na hora.

```
npx tsc lib/cockpit.ts lib/triagem.ts lib/motor.ts lib/premissas-padrao.ts \
  lib/laudo.ts lib/coleta.ts --outDir .tmp-testes --module esnext \
  --target es2020 --moduleResolution bundler --skipLibCheck
cd .tmp-testes && sed -i -E 's|from "\./([a-z-]+)"|from "./\1.js"|g' *.js
cp ../testes/*.test.mjs . && for t in *.test.mjs; do node "$t"; done
```

`cockpit.test.mjs` (fila e próxima ação) · `motor.test.mjs` (árvore de decisão,
cenários, sensibilidade) · `coleta.test.mjs` (tradução da resposta da empresa
para a conta, e a proibição de jargão).

## Planilhas de teste

Fora do repositório, entregues à parte: `Enquadria_Massa_Empresas_Teste.xlsx`
(+ o `.csv` que se importa de verdade) e `Enquadria_Cenarios_Teste.xlsx`. O
gabarito das duas foi **gerado rodando `triar()` e `decidir()`**, não escrito à
mão — planilha de teste com resultado esperado digitado de cabeça valida a
memória de quem escreveu, não o sistema.
