# Plano completo de builds — Enquadria

**Data:** 22/08/2026  
**Objetivo:** converter as auditorias técnica, de UX e de produto em uma sequência
executável, deixando claro o que construir primeiro, por que, dependências e
critério de conclusão.

## 1. Regra de priorização

Este plano não ordena features pelo quanto parecem interessantes. A ordem é:

1. **impedir fraude, perda de trabalho e cálculo sem governança**;
2. **medir o funil antes de redesenhá-lo**;
3. **concluir com segurança o ciclo principal** — carteira, decisão, documento,
   ciência e revisão;
4. **reduzir esforço operacional e aumentar retenção**;
5. **monetizar por segmento**;
6. **só então construir escala, integrações e enterprise**.

### Classificação

- **P0 — obrigatório:** risco operacional, segurança, integridade ou bloqueio do
  ciclo principal. Não deve esperar feature comercial.
- **P1 — necessário:** melhora materialmente ativação, conclusão, retenção ou
  capacidade de cobrar.
- **P2 — importante:** eficiência, expansão e diferenciação depois do núcleo.
- **P3 — opcional/experimental:** hipótese que precisa de sinal real antes de virar
  compromisso de roadmap.
- **Esforço:** PP (horas), P (1–2 dias), M (3–5 dias), G (1–2 semanas), GG (épico).

## 2. Ordem executiva

Se houver capacidade para apenas dez builds, fazer exatamente estes, nesta ordem:

1. segurança dos webhooks e rotas administrativas;
2. CI confiável com testes, lint, build e migrations;
3. governança pública e operacional do motor;
4. telemetria privada do funil e integridade;
5. rascunho/recuperação da análise;
6. erros navegáveis e acessibilidade dos fluxos críticos;
7. timeline de integridade do documento;
8. importação incremental com reconciliação;
9. diff e fila de revisão do recálculo;
10. campanha de coleta de premissas.

Esses dez builds não são os mais chamativos. São os que transformam o produto em
uma operação confiável, mensurável e recorrente.

## 3. Backlog completo, na ordem de execução

### Onda 0 — integridade antes de crescimento

#### B01 · Autenticação de webhooks e fail-closed — P0 · M

**Necessidade:** eventos externos alteram assinatura, análise e cobrança. Uma rota
administrativa não pode aceitar origem não comprovada nem continuar quando o
segredo obrigatório estiver ausente.

**Escopo mínimo:**

- validar assinatura/segredo oficial dos webhooks ZapSign e Asaas;
- comparação em tempo constante onde aplicável;
- rejeitar configuração ausente em produção com resposta 5xx;
- idempotência por identificador do evento;
- log de recebido, aceito, recusado, repetido e processado;
- testes de assinatura válida, inválida, ausente, replay e corpo adulterado.

**Dependências:** nenhuma.  
**Pronto quando:** evento forjado não altera banco; evento repetido não repete
efeito; falha de configuração é observável e provoca reenvio do provedor.

#### B02 · Proteção das rotas públicas e administrativas — P0 · M

**Necessidade:** verificação, assinatura, coleta, diagnóstico e rotas de dev têm
perfis de risco diferentes e precisam de política explícita.

**Escopo mínimo:**

- inventário de todas as rotas e classificação pública/sessão/admin/cron/webhook;
- rate limit fail-closed para consultas enumeráveis;
- segredo próprio para cada finalidade, sem fallback previsível;
- desligar rotas de desenvolvimento em produção;
- limites de tamanho de corpo e timeout;
- cabeçalhos de segurança e logs sem PII.

**Dependência:** B01.  
**Pronto quando:** cada rota possuir modelo de autorização testado e nenhuma rota
de service role depender apenas de dados enviados no corpo.

#### B03 · CI não interativa e porta de qualidade — P0 · M

**Necessidade:** typecheck e testes existem, mas lint ainda depende de configuração
interativa e parte da suíte depende de arquivos externos.

**Escopo mínimo:**

- ESLint configurado e executável sem prompt;
- `typecheck`, testes puros e build em todo pull request;
- fixture do CSV dentro do repositório;
- Playwright instalado com pelo menos os smoke tests existentes;
- cache de dependências sem cachear artefato inválido;
- bloquear merge por falha real e separar teste opcional de teste obrigatório.

**Dependências:** nenhuma.  
**Pronto quando:** clone limpo executa um único comando e produz saída verde ou
erro acionável sem depender de `/root/work`, perguntas ou serviços implícitos.

#### B04 · Banco efêmero, migrations e testes de RLS — P0 · G

**Necessidade:** a suíte pura não prova isolamento entre escritórios, policies,
RPCs, concorrência ou compatibilidade das migrations.

**Escopo mínimo:**

- Supabase local/efêmero na CI;
- aplicar migrations do zero e validar upgrade sequencial;
- tenants A/B com tentativa de leitura e mutação cruzada;
- testes de emissão concorrente, cota, revogação e idempotência;
- teste de service role separado do cliente de sessão;
- verificação de rollback ou procedimento documentado de correção.

**Dependência:** B03.  
**Pronto quando:** isolamento, migrations e principais RPCs forem comprovados em
CI e não apenas assumidos pelo código.

#### B05 · Governança do motor e registro normativo — P0 · G

**Necessidade:** o motor é o ativo central e um erro regulatório tem impacto maior
que qualquer falha visual.

**Escopo mínimo:**

- registro de versão, vigência, fontes, revisor e status de publicação;
- golden cases por anexo, faixa, exercício e zona de decisão;
- dupla revisão antes de publicar parâmetro que altera resultado;
- changelog legível para usuário e trilha técnica completa;
- bloqueio de exercício/tabela não validado;
- runbook de correção e identificação dos documentos atingidos.

**Dependências:** B03 e B04.  
**Pronto quando:** seja possível responder quem aprovou cada parâmetro, quais
resultados ele alterou e quais clientes/documentos precisam de revisão.

#### B06 · Observabilidade técnica e alertas — P0 · M

**Necessidade:** falhas de banco, e-mail, cron, webhook e geração de documento não
podem depender de `console.error` descoberto manualmente.

**Escopo mínimo:**

- correlação por requisição/evento sem registrar conteúdo sensível;
- métricas de erro e latência por integração;
- alerta de cron atrasado, fila parada, webhook recusado e envio degradado;
- dashboard de saúde e runbook por alerta;
- retenção e acesso aos logs compatíveis com LGPD.

**Dependências:** B01–B04.  
**Pronto quando:** uma falha crítica gerar alerta com tenant/evento técnico,
impacto e ação de recuperação antes do chamado do cliente.

### Onda 1 — medir e proteger o ciclo principal

#### B07 · Telemetria de produto com privacidade — P0 · M

**Necessidade:** sem eventos de produto, urgência sazonal pode parecer retenção e
mudanças de UX continuam baseadas em opinião.

**Escopo mínimo:**

- eventos de início, conclusão, erro e abandono de importação, análise, emissão,
  envio, assinatura e revisão;
- duração, etapa, classe do erro, plano e faixa de volume;
- proibição técnica de CNPJ, razão social, respostas e valores nos eventos;
- painel por cohort e canal;
- consentimento/base legal e política de retenção documentados.

**Dependências:** B06.  
**Pronto quando:** for possível calcular o funil inteiro e identificar a etapa de
abandono sem acessar conteúdo fiscal do cliente.

#### B08 · Rascunho e recuperação da análise — P0 · M

**Necessidade:** o formulário longo concentra trabalho técnico e não pode perdê-lo
por refresh, navegação, sessão ou erro de rede.

**Escopo mínimo:**

- autosave local ou servidor por empresa/usuário;
- indicação “salvo agora / pendente / falhou”;
- recuperação explícita e descarte voluntário;
- conflito entre rascunho e versão salva;
- limpeza após confirmação sem apagar outra aba;
- teste de refresh, offline curto e sessão expirada.

**Dependência:** B07 para medir impacto.  
**Pronto quando:** nenhuma resposta válida for perdida nos cenários testados e o
usuário sempre souber qual versão está editando.

#### B09 · Resumo de erros e navegação do formulário — P0 · M

**Necessidade:** desabilitar “Salvar” evita dado incompleto, mas obriga o usuário a
procurar o campo ausente num formulário extenso.

**Escopo mínimo:**

- sumário “faltam N respostas”;
- links/foco para seções e campos incompletos;
- erro associado ao controle com `aria-describedby`;
- progressão completo/incompleto por seção;
- primeiro erro focado ao tentar continuar;
- preservar dados quando API recusar.

**Dependência:** B08.  
**Pronto quando:** usuário encontra e corrige todo erro sem varrer a página.

#### B10 · Acessibilidade dos overlays e controles — P0 · G

**Necessidade:** drawer, gavetas e modais precisam funcionar por teclado e leitor
de tela; remover `outline` sem substituto reduz orientação visual.

**Escopo mínimo:**

- foco inicial, trap e retorno do foco em overlays;
- `role="dialog"`, `aria-modal`, título e descrição associados;
- `focus-visible` consistente e contraste WCAG AA;
- labels persistentes em controles essenciais;
- `aria-live` para operações assíncronas;
- testes teclado, axe e leitor de tela nos cinco fluxos principais.

**Dependências:** B03 e componentes dos fluxos atuais.  
**Pronto quando:** importar, analisar, emitir, assinar e verificar forem concluídos
somente com teclado sem perda de contexto.

#### B11 · Timeline de integridade do documento — P0 · G

**Necessidade:** emitir, enviar, entregar, abrir, assinar, expirar e revogar são
estados diferentes; confiança depende de enxergar a cadeia inteira.

**Escopo mínimo:**

- modelo canônico de eventos do documento;
- timeline por laudo/termo com data, canal e estado;
- última falha e CTA correta para reprocessar;
- distinção entre gerado, aceito pelo provedor, entregue e aberto;
- expiração/revogação visíveis ao contador e destinatário;
- export de evidência.

**Dependências:** B01, B05 e B06.  
**Pronto quando:** qualquer usuário autorizado responder “o que aconteceu com este
documento?” sem consultar logs ou suporte.

#### B12 · Exportação integral e portabilidade — P0 · G

**Necessidade:** subir a carteira exige confiança. Exportação legível reduz objeção
de aprisionamento e é parte da governança do dado.

**Escopo mínimo:**

- pacote com empresas, análises, premissas, documentos e evidências;
- manifesto de arquivos e checksums;
- export assíncrono com expiração e auditoria;
- autorização forte e notificação ao dono;
- formato documentado, além de PDFs;
- teste de conta grande e exclusão posterior.

**Dependências:** B02, B04 e B11.  
**Pronto quando:** o escritório consegue retirar uma cópia compreensível e íntegra
de seu acervo sem intervenção manual.

### Onda 2 — ativação e eficiência operacional

#### B13 · Importação incremental e reconciliação — P1 · GG

**Necessidade:** CSV único ativa bem, mas recorrência exige atualizar a carteira sem
duplicar, sobrescrever decisões humanas ou começar do zero.

**Escopo mínimo:**

- identificar nova, alterada, igual, ausente e conflitante;
- preview do que será criado/atualizado/arquivado;
- regra explícita de precedência entre arquivo, Receita e edição humana;
- aplicar por lote com rollback lógico;
- histórico da importação e relatório de rejeições;
- reprocessamento idempotente do mesmo arquivo.

**Dependências:** B04, B07 e B12.  
**Pronto quando:** nova competência da carteira puder ser reconciliada sem perder
histórico nem exigir limpeza manual.

#### B14 · Cockpit hierárquico e ação primária — P1 · G

**Necessidade:** trilha, avisos, indicadores, filtros, seleção, fila e gaveta
competem no mesmo topo.

**Escopo mínimo:**

- próxima ação e fila como primeiro nível;
- indicadores e avisos secundários recolhíveis;
- uma CTA primária por estado da empresa;
- ações secundárias em “Mais”;
- rota ativa no desktop e badges equivalentes no mobile;
- medir tempo até primeira ação antes/depois.

**Dependências:** B07 para baseline; B10 para padrões acessíveis.  
**Pronto quando:** usuário novo localizar a próxima empresa sem instrução e usuário
experiente não perder ações em lote.

#### B15 · Filtros, seleção e ordenação previsíveis — P1 · M

**Necessidade:** itens selecionados podem ficar fora do recorte visível e o estado
do filtro está distribuído em vários controles.

**Escopo mínimo:**

- chips de filtros ativos e “Limpar tudo”;
- contagem selecionadas/visíveis;
- visualizar somente seleção;
- confirmação contextual para lote invisível;
- ordenação explícita e preferência persistida;
- URL compartilhável para recortes úteis, sem dados sensíveis.

**Dependência:** B14.  
**Pronto quando:** nenhuma ação em lote surpreender o usuário sobre seu alcance.

#### B16 · Sistema de feedback e recuperação — P1 · G

**Necessidade:** cada componente implementa carregamento, erro e sucesso de forma
diferente, elevando dúvida e manutenção.

**Escopo mínimo:**

- padrões de inline status, banner e toast;
- erro classificado em dado, permissão, integração, rede e sistema;
- CTA “corrigir”, “tentar novamente” ou “falar com suporte”;
- desfazer para ações reversíveis;
- código copiável sem stack/PII;
- anúncios acessíveis e prevenção de toast duplicado.

**Dependências:** B06 e B10.  
**Pronto quando:** toda falha crítica informa causa operacional e próximo passo, e
ações reversíveis não exigem suporte.

#### B17 · Campanha de coleta de premissas — P1 · G

**Necessidade:** premissas que não existem na escrituração determinam a qualidade
da recomendação; pedir uma a uma não escala.

**Escopo mínimo:**

- selecionar empresas e disparar em lote;
- status sem contato, não enviado, entregue, aberto, respondido e expirado;
- lembrete configurável e opt-out;
- taxa de resposta e fila de divergências;
- identidade white-label e contexto do pedido;
- não substituir premissa confirmada silenciosamente.

**Dependências:** B11 e B15.  
**Pronto quando:** o escritório conduzir uma campanha completa e souber exatamente
quem precisa de contato manual.

#### B18 · Tipografia, labels e densidade — P1 · G

**Necessidade:** texto operacional de 9–11 px, placeholders usados como instrução e
tabelas densas aumentam esforço e erro.

**Escopo mínimo:**

- piso de 12 px para metadados e 14 px para conteúdo;
- label visível, ajuda e exemplo em papéis separados;
- modo confortável padrão e compacto opcional;
- tabelas com caption/cabeçalhos e cartões no mobile;
- tokens semânticos de cor/estado;
- snapshots e revisão visual nas larguras críticas.

**Dependência:** B10 e biblioteca gradual do B19.  
**Pronto quando:** conteúdo essencial não depender de fonte minúscula, placeholder
ou somente cor.

#### B19 · Biblioteca mínima de componentes — P1 · GG incremental

**Necessidade:** controles e estados repetidos diretamente em arquivos grandes
produzem inconsistência e tornam correções de acessibilidade caras.

**Escopo mínimo:** Button, Field, Select, Checkbox, Alert, Status, Dialog, Drawer,
Toast, Table e EmptyState; documentação de variantes e testes acessíveis.

**Dependências:** decisões de B10, B16 e B18.  
**Pronto quando:** novos fluxos não criarem implementações próprias desses padrões.
Não bloquear o produto esperando um design system completo.

### Onda 3 — recorrência e retenção

#### B20 · Diff de recálculo — P1 · G

**Necessidade:** recalcular sem explicar mudança produz um número novo, não uma
revisão defensável.

**Escopo mínimo:**

- versão/parâmetro/premissa anterior e atual;
- variação dos números e da saída;
- classificação sem mudança, material e decisão alterada;
- documentos vinculados potencialmente desatualizados;
- justificativa e fonte da mudança;
- confirmação humana antes de substituir estado operacional.

**Dependências:** B05 e B11.  
**Pronto quando:** todo novo resultado puder ser explicado e rastreado ao anterior.

#### B21 · Fila de revisão por norma/janela — P1 · G

**Necessidade:** radar informa, mas retenção nasce quando a mudança vira trabalho
concluído e nova ciência.

**Escopo mínimo:**

- gerar revisão a partir de norma/parâmetro/diff;
- responsável, prazo, severidade e estado;
- ações em lote para “sem impacto” e revisão individual para exceções;
- nova emissão/ciência sem reescrever documento histórico;
- relatório do período.

**Dependências:** B17 e B20.  
**Pronto quando:** uma publicação relevante terminar em uma lista fechável de
clientes revisados e evidências preservadas.

#### B22 · Dashboard de valor entregue — P1 · M

**Necessidade:** retenção e preço dependem de demonstrar trabalho produzido sem
confundir potencial com receita garantida.

**Escopo mínimo:**

- empresas triadas, descartes documentados, análises, revisões e entregas;
- tempo operacional estimado com metodologia visível;
- honorário somente quando declarado;
- itens sem valor declarado continuam contados;
- comparação por período e export para reunião de renovação.

**Dependências:** B07, B11 e B21.  
**Pronto quando:** o escritório consegue demonstrar o trabalho do período com
números auditáveis e linguagem não promocional.

#### B23 · Mensagem permanente pós-janela — P1 · M

**Necessidade:** uma data de 2026 converte perto do prazo, mas pode fazer o produto
parecer encerrado depois dele.

**Escopo mínimo:**

- home orientada ao ciclo recorrente, com urgência atual como módulo variável;
- páginas específicas por janela indexáveis e arquiváveis;
- CTA diferente por fase: mapear, revisar, acompanhar ou preparar;
- caso de uso permanente de cliente novo e abertura;
- nenhuma data futura não publicada apresentada como fato.

**Dependências:** B20–B22 para a promessa corresponder ao produto.  
**Pronto quando:** a proposta continuar verdadeira e valiosa em qualquer mês.

### Onda 4 — monetização e colaboração

#### B24 · Experimentos de preço e embalagem — P1 · M

**Necessidade:** o ilimitado a R$ 47 mistura escritórios de 40 e 4.000 empresas e
não permite provar sustentabilidade.

**Escopo mínimo:**

- custo por tenant e por 100 empresas monitoradas;
- cohorts de oferta sem alterar cliente legado;
- planos por empresas ativas, documentos ilimitados dentro da faixa;
- mensal e anual transparentes;
- feature flags, registro da oferta e análise de conversão/churn;
- regra de grandfathering antes de qualquer mudança.

**Dependências:** B07 e B22.  
**Pronto quando:** preço for decidido por receita líquida, conversão, retenção e
custo, não por opinião ou ticket de concorrente.

#### B25 · Responsável, prazo e revisão em equipe — P1 · G

**Necessidade:** escritórios com equipe precisam saber quem prepara, revisa e assina
sem transformar o Enquadria em gerenciador genérico.

**Escopo mínimo:**

- papéis preparador, revisor, signatário e gestor;
- responsável e prazo por item;
- aprovação antes de emissão configurável;
- caixa “meu trabalho” e visão do gestor;
- auditoria de atribuição/decisão;
- notificações agrupadas, não spam por evento.

**Dependências:** B04, B15, B19 e B21.  
**Pronto quando:** duas pessoas concluírem o mesmo ciclo sem compartilhar senha nem
perder autoria.

#### B26 · Proposta → aceite → entrega — P2 · G

**Necessidade:** o produto mostra potencial e já produz proposta, mas precisa provar
se ajuda o escritório a converter serviço.

**Escopo mínimo:**

- proposta ligada ao conjunto de empresas/escopo;
- aceite e valor declarado;
- status contratado/recusado/sem resposta;
- ao aceitar, criar trabalho sem duplicar empresa;
- cobrança como integração opcional;
- conversão agregada sem expor valor indevidamente.

**Dependências:** B11, B22 e B25.  
**Pronto quando:** potencial virar escopo aceito e rastreável até a entrega.

### Onda 5 — interoperabilidade e escala

#### B27 · API e webhooks de saída — P2 · GG

**Necessidade:** CSV não deve ser a única ponte recorrente, e o Enquadria não deve
tentar substituir ERP/CRM.

**Escopo mínimo:**

- API versionada para empresa, estado do ciclo e documento;
- webhooks assinados de mudança de estado;
- escopos, rotação de chave, rate limit e auditoria;
- sandbox e documentação;
- política de compatibilidade/depreciação;
- primeiro conector escolhido por demanda comprovada.

**Dependências:** B01, B02, B04, B12 e B13.  
**Pronto quando:** um sistema externo sincronizar o mínimo necessário sem service
role, scraping ou export manual.

#### B28 · Pacote enterprise — P2 · GG

**Necessidade:** grandes operações só devem entrar quando governança e economia
unitária estiverem prontas.

**Escopo mínimo:**

- SSO, SCIM opcional, unidades e papéis granulares;
- logs administrativos exportáveis;
- retenção configurável e contrato/DPA;
- SLA, status page e suporte definido;
- limites/custos por volume;
- implantação e migração documentadas.

**Dependências:** B24, B25 e B27.  
**Pronto quando:** requisitos enterprise forem produto repetível, não customização
exclusiva para um cliente.

#### B29 · Programa de parceiros — P2 · G

**Necessidade:** consultores e educadores podem distribuir método e produto, mas
comissão antes de retenção apenas compra churn.

**Escopo mínimo:**

- atribuição de origem e janela de comissão;
- material e ambiente demonstrativo;
- regras de marca, responsabilidade e promessa;
- painel simples de indicação/conversão;
- pagamento auditável;
- critérios de qualidade e encerramento.

**Dependências:** B07, B23 e retenção validada de B21.  
**Pronto quando:** canal gerar tenants ativados e retidos com CAC sustentável.

### Onda 6 — hipóteses, não compromissos

#### B30 · Visão “trabalho do dia” — P3 · M

Testar uma fila curta e terminável com prazo e definição de concluído. Construir
somente se entrevistas e telemetria mostrarem paralisia diante da carteira inteira.

#### B31 · Atalhos para operadores frequentes — P3 · M

Busca com `/`, navegação e abertura por teclado. Construir após estabilizar o
cockpit e confirmar uso diário intensivo.

#### B32 · Templates setoriais — P3 · G

Premissas e roteiro por setor somente quando houver volume e padrão comprovados;
nunca aplicar recomendação automática sem confirmação.

#### B33 · Assistente contextual restrito — P3 · G

Usar IA para localizar tela, explicar campo ou resumir dados já calculados. Não
usar para inventar premissa, interpretar caso concreto ou emitir recomendação.

#### B34 · App mobile nativo — P3 · GG

Não construir enquanto a web responsiva não demonstrar uma tarefa nativa exclusiva
(câmera, offline de campo ou push indispensável) e retenção que justifique dois
clientes adicionais.

## 4. Dependências críticas

```text
B03 CI ──→ B04 RLS/migrations ──→ B05 governança do motor
  │                                  │
  └──→ B10 acessibilidade            └──→ B20 diff de recálculo

B01 webhooks ──→ B02 rotas ──→ B06 observabilidade ──→ B07 telemetria
      │                              │
      └──→ B11 timeline documento ←─┘

B07 ──→ B08 rascunho ──→ B09 erros/navegação
B07 ──→ B14 cockpit ──→ B15 filtros/seleção

B04 + B07 + B12 ──→ B13 importação incremental
B11 + B15 ──→ B17 campanha de coleta
B05 + B11 ──→ B20 diff ──→ B21 fila de revisão ──→ B22 valor entregue

B07 + B22 ──→ B24 preço
B21 + B25 ──→ B26 proposta/aceite
B12 + B13 ──→ B27 API ──→ B28 enterprise
```

Não iniciar B24 sem B07/B22, B28 sem B24/B27 ou B29 sem retenção mensurada.

## 5. Sequência por capacidade da equipe

### Uma pessoa

Executar estritamente B01 → B03 → B02 → B05 → B06 → B07 → B08 → B09 → B10 →
B11. Evitar três frentes simultâneas. B04 pode exigir apoio específico de banco.

### Duas pessoas

- **Trilha A — plataforma:** B01, B02, B03, B04, B05, B06.
- **Trilha B — experiência:** depois de B03, B07, B08, B09, B10, B14.
- Reunir no B11 antes de iniciar Onda 2.

### Três ou mais pessoas

- segurança/plataforma;
- ciclo principal/UX;
- dados/observabilidade;
- máximo de um épico GG ativo por trilha;
- revisão semanal pelas métricas do funil e riscos, não por quantidade de tickets.

## 6. Calendário sugerido

| Período | Objetivo | Builds |
|---|---|---|
| Semanas 1–2 | Fechar portas críticas e tornar CI confiável | B01–B03 |
| Semanas 3–5 | Provar banco/motor e observar falhas | B04–B07 |
| Semanas 6–8 | Proteger trabalho e acessibilidade | B08–B12 |
| Semanas 9–13 | Melhorar ativação e operação | B13–B19 |
| Semanas 14–18 | Tornar revisão a razão de voltar | B20–B23 |
| Semanas 19–24 | Testar monetização e equipe | B24–B26 |
| Depois | Integração, enterprise e canal | B27–B29 |
| Sob evidência | Experimentos | B30–B34 |

As datas são capacidade relativa, não promessa. Um P0 incompleto impede avançar
quando a dependência protege dado, documento ou cálculo.

## 7. Métricas e gates por onda

| Onda | Métrica de saída | Gate mínimo |
|---|---|---|
| 0 | incidentes críticos detectados e CI | 100% das portas testadas; CI reproduzível |
| 1 | conclusão segura do ciclo | zero perda de rascunho nos testes; cinco fluxos por teclado |
| 2 | ativação e tempo de tarefa | baseline medido e melhoria sem aumento de erro |
| 3 | retenção por revisão | tenants retornam e concluem nova revisão |
| 4 | receita líquida e colaboração | preço sustentável; duas pessoas operam com autoria |
| 5 | sincronização e enterprise | integração segura e margem por faixa conhecida |
| 6 | hipótese individual | experimento confirma impacto antes do épico |

## 8. Builds explicitamente fora do plano necessário

Não priorizar neste ciclo:

- ERP fiscal, contábil, folha ou societário completo;
- CRM comercial genérico;
- chat tributário aberto que conclua caso concreto;
- marketplace de prestadores;
- app nativo sem tarefa exclusiva comprovada;
- motor para tributos desconectados do ciclo documentado;
- editor irrestrito de laudo que destrua o documento canônico;
- múltiplos provedores para cada integração sem necessidade de continuidade.

## 9. Definição de pronto comum

Nenhum build está concluído apenas porque a tela existe. Todo build B01–B29 exige:

1. critério de aceite automatizado quando tecnicamente possível;
2. autorização e isolamento entre tenants testados;
3. estados vazio, carregando, sucesso, erro e recuperação;
4. teclado, foco e nome acessível nos controles;
5. logs sem PII e métrica do resultado;
6. documentação operacional e de suporte;
7. migration reversível ou plano explícito de correção;
8. rollout gradual/feature flag quando altera cálculo, preço ou fluxo crítico;
9. nenhum conteúdo fiscal em analytics;
10. comparação com a métrica anterior ao lançamento.

## 10. Decisão final

O próximo build não deve ser uma nova calculadora ou uma nova tela de conteúdo.
Deve ser o primeiro item ainda não concluído nesta cadeia:

> **integridade → medição → ciclo principal → recorrência → monetização → escala**

Essa ordem protege a confiança, evita construir sobre um funil desconhecido e
mantém o Enquadria concentrado no que pode diferenciá-lo: concluir e provar a
decisão da carteira em cada período.
