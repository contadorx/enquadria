# Auditoria de UX e usabilidade — Enquadria

**Data:** 21/08/2026  
**Escopo:** aplicação autenticada, onboarding, cockpit, ficha da empresa, análise,
importação, Reforma, estudos, documentos públicos, mobile e área administrativa.

## 1. Resumo executivo

O Enquadria já tem uma boa orientação por tarefa: o onboarding deriva o próximo
passo dos dados reais, o cockpit concentra o trabalho da carteira e o mobile tem
navegação própria. A maior oportunidade já não é acrescentar telas, mas reduzir a
carga cognitiva das telas densas, tornar estado e próxima ação inequívocos e
completar a acessibilidade dos fluxos interativos.

**Nota geral heurística: 6,7/10.** É um produto funcional e coerente para usuários
experientes, mas ainda exige leitura, memória e precisão acima do necessário para
um usuário novo ou operando sob pressão.

### Notas por dimensão

| Dimensão | Nota | Diagnóstico curto |
|---|---:|---|
| Arquitetura da informação | 7,5 | Destinos principais são coerentes; desktop não mostra claramente a rota ativa. |
| Onboarding e descoberta | 8,0 | Próximo passo contextual é um ponto forte; falta medir abandono e retomada. |
| Eficiência do trabalho recorrente | 7,0 | Cockpit centraliza bem, mas concentra filtros, seleção, avisos e ações demais. |
| Clareza e carga cognitiva | 6,0 | Textos explicam muito, porém tipografia pequena e alta densidade aumentam esforço. |
| Formulários e prevenção de erro | 7,0 | Há boas travas; faltam resumo, navegação de erros e persistência de rascunho. |
| Feedback e recuperação | 6,5 | Existem mensagens locais; falta um padrão global de confirmação, erro e desfazer. |
| Mobile e toque | 7,0 | Navegação dedicada e alvos principais adequados; drawer e estados ainda têm lacunas. |
| Acessibilidade | 4,5 | Há `aria-label` pontual, mas faltam foco visível consistente, foco preso em modais e anúncios. |
| Confiança e transparência | 8,0 | Premissas, memória e segurança são bem explicadas; o excesso pode esconder o essencial. |
| Observabilidade de UX | 3,5 | Não há evidência de funil comportamental, testes com usuários ou métricas por tarefa. |

## 2. Critério de prioridade

- **P0 — bloqueador:** pode causar ação errada, perda de dados ou impedir uma tarefa essencial.
- **P1 — alta:** afeta tarefas frequentes, conversão, acessibilidade ou confiança.
- **P2 — média:** reduz tempo, dúvida ou suporte, sem bloquear o fluxo principal.
- **P3 — evolução:** refinamento e otimização depois de estabilizar o essencial.
- **Impacto:** 1 (baixo) a 5 (muito alto).
- **Esforço:** PP (horas), P (1–2 dias), M (3–5 dias), G (1–2 semanas), GG (programa contínuo).
- **Confiança:** alta, média ou baixa conforme a força da evidência estática. Itens de
  confiança baixa devem ser validados com usuários antes de construir.

## 3. Backlog priorizado

### P0 — corrigir antes de ampliar o produto

| # | Melhoria | Problema observado | Resultado esperado | Impacto | Esforço | Confiança |
|---:|---|---|---|---:|---:|---|
| 1 | Implementar foco preso e restauração de foco em drawer, gavetas e modais | O drawer mobile controla `Escape` e scroll, mas não assume/prende o foco nem o devolve ao gatilho. Usuários de teclado podem navegar pelo conteúdo encoberto. | Modais com `role="dialog"`, `aria-modal`, título associado, foco inicial, ciclo de Tab e retorno ao botão de origem. | 5 | M | alta |
| 2 | Preservar rascunho da análise | A análise é longa e reúne respostas, segmentação e premissas; recarregar ou perder sessão pode apagar trabalho ainda não salvo. | Salvamento local por empresa e recuperação explícita do rascunho, com descarte voluntário após salvar. | 5 | M | média |
| 3 | Criar resumo de erros com links para os campos | O botão é bloqueado quando faltam respostas, mas o usuário precisa procurar o que falta ao longo de um formulário extenso. | Bloco “faltam N respostas”, foco no primeiro erro e links para cada seção incompleta. | 5 | M | alta |

### P1 — maior retorno para os próximos ciclos

| # | Melhoria | Problema observado | Resultado esperado | Impacto | Esforço | Confiança |
|---:|---|---|---|---:|---:|---|
| 4 | Marcar rota ativa no menu desktop | Os links laterais têm apenas `hover`; a localização atual é evidente no mobile, mas não no desktop. | Borda, fundo e `aria-current="page"` na rota ativa, usando a mesma regra do mobile. | 4 | P | alta |
| 5 | Simplificar o topo do cockpit | A tela reúne trilha, avisos, indicadores, filtros, seleção em lote, busca, fila e gaveta. O usuário precisa decidir onde olhar antes de trabalhar. | Topo em três níveis: “próxima ação”, fila/busca e detalhes secundários recolhíveis. | 5 | G | alta |
| 6 | Tornar uma ação primária inequívoca por contexto | Algumas linhas e gavetas expõem várias ações com peso visual semelhante. | Uma CTA primária baseada no estado; ações secundárias em menu “Mais”. | 5 | M | alta |
| 7 | Padronizar feedback assíncrono | Sucesso, falha e carregamento são tratados localmente e desaparecem de maneiras diferentes. | Sistema único de status: em andamento, concluído, erro acionável e tentativa novamente; anúncios `aria-live`. | 5 | G | alta |
| 8 | Padronizar foco visível | Muitos campos removem `outline` e trocam somente a cor da borda, sinal fraco para teclado e baixo contraste. | `focus-visible` com anel de 2 px, offset e contraste AA em todos os controles. | 5 | M | alta |
| 9 | Elevar o piso tipográfico | Há muitos textos operacionais entre 9 e 11 px, inclusive metadados, cabeçalhos e estados relevantes. | Piso de 12 px para metadado e 14 px para conteúdo; preservar hierarquia por peso/cor, não por miniaturização. | 4 | G | alta |
| 10 | Adicionar rótulos persistentes aos campos | Diversos formulários dependem de `placeholder`, que desaparece durante a digitação e não substitui um nome acessível. | `label` visível, ajuda separada e exemplo opcional; placeholder apenas como formato. | 5 | G | alta |
| 11 | Exibir os contadores da Reforma também no mobile | O desktop mostra pendências/notícias no menu; o drawer e a barra inferior não recebem esses contadores. | Badge acessível no atalho e no drawer, com nome completo para leitor de tela. | 4 | P | alta |
| 12 | Separar “selecionado” de “visível” na fila | A seleção persiste fora do filtro; existe aviso, mas ações em lote sobre itens invisíveis aumentam risco. | Barra fixa com “N selecionadas, X visíveis”, visualizar seleção e limpar com um clique antes da ação. | 5 | M | alta |
| 13 | Oferecer desfazer para ações reversíveis | Arquivar, marcar como tratado/lido e mudanças de estado exigem recuperação por navegação ou nova ação. | Toast com “Desfazer” por janela curta; confirmação apenas para ações irreversíveis. | 4 | G | média |
| 14 | Tornar o resultado da análise progressivamente revelado | Resultado, memória, cenários e ressalvas competem imediatamente após o cálculo. | Primeiro: recomendação, motivo e próxima ação. Depois: números e memória em seções expansíveis. | 5 | G | alta |
| 15 | Criar navegação interna no formulário de análise | Um componente muito extenso exige rolagem e memória de posição. | Sumário sticky por seção, progresso real, estados completo/incompleto e retorno ao topo. | 4 | G | alta |
| 16 | Instrumentar o funil essencial | Sem telemetria de tarefa, decisões de UX dependem de inspeção e opinião. | Eventos sem conteúdo fiscal sensível: início/conclusão/erro/abandono de importar, analisar, emitir e assinar. | 5 | G | alta |

### P2 — reduzir esforço e chamados

| # | Melhoria | Problema observado | Resultado esperado | Impacto | Esforço | Confiança |
|---:|---|---|---|---:|---:|---|
| 17 | Salvar filtros e ordenação por usuário | O contador volta diariamente à mesma carteira e precisa reconstruir o recorte. | Preferências persistidas, com botão claro “Restaurar padrão”. | 3 | M | média |
| 18 | Mostrar filtros ativos como chips removíveis | O estado do recorte fica distribuído entre botões, busca e avisos. | Linha única “Mostrando…” com chips, contagem e “Limpar tudo”. | 4 | M | alta |
| 19 | Adicionar ordenação explícita à fila | Prioridade é útil, mas usuários também procuram nome, prazo, faturamento e etapa. | Ordenação anunciada e persistente, mantendo “prioridade recomendada” como padrão. | 3 | M | média |
| 20 | Criar densidade confortável/compacta | Uma tabela densa ajuda carteiras grandes, mas prejudica leitura e toque. | Alternância por usuário; confortável como padrão, compacta para operadores experientes. | 3 | M | média |
| 21 | Melhorar estados vazios por causa | “Sem dados”, “sem resultado para filtro”, “sem permissão” e “falha de leitura” precisam de ações diferentes. | Estado vazio com causa, próximo passo, limpeza do filtro ou tentativa novamente. | 4 | M | alta |
| 22 | Padronizar terminologia de estados | Códigos como S1–S5, faixas, ações e status internos aparecem próximos de termos de negócio. | Glossário curto contextual; nome humano primeiro, código como metadado. | 4 | M | alta |
| 23 | Resumir textos longos com detalhes sob demanda | Explicações extensas aumentam confiança, mas atrasam quem já domina a tarefa. | Frase essencial visível + “Por que pedimos isso?” expansível, lembrando o estado por usuário. | 4 | G | alta |
| 24 | Melhorar busca com realce e tolerância | Busca aceita nome, CNPJ e CNAE, mas não evidencia qual trecho casou nem orienta consulta sem resultado. | Realce do termo, normalização explícita e sugestões de limpeza. | 3 | M | média |
| 25 | Tornar importação retomável e orientada por etapas | Upload, mapeamento, avisos, prévia e gravação vivem em um componente muito grande. | Stepper: fonte → campos → validação → revisão → resultado; voltar sem perder escolhas. | 5 | G | alta |
| 26 | Distinguir erro de dado, sistema e integração | Uma mensagem genérica não diz se o usuário deve corrigir, tentar novamente ou chamar suporte. | Padrão de erro com categoria, ação recomendada, código copiável e preservação dos dados. | 4 | G | alta |
| 27 | Confirmar conclusão do fluxo documental | Emitir, enviar, assinar e verificar são etapas diferentes; o usuário precisa entender o estado final. | Linha do tempo consistente com data, responsável, entrega, abertura e pendência atual. | 4 | G | média |
| 28 | Melhorar acessibilidade das tabelas | Tabelas densas e roláveis precisam de legenda, cabeçalhos associados e alternativa mobile. | `caption`, escopos de cabeçalho, descrição do scroll e cartões em larguras estreitas. | 4 | G | alta |
| 29 | Respeitar preferências de movimento e contraste | Não há uma camada explícita para `prefers-reduced-motion`, alto contraste ou cores forçadas. | Estados perceptíveis sem depender só de cor e CSS para preferências do sistema. | 3 | M | média |
| 30 | Reduzir interrupções globais | Assistente flutuante e NPS podem aparecer durante tarefas críticas e disputar atenção. | Não interromper análise/importação; solicitar NPS após sucesso ou em retorno posterior. | 4 | M | média |

### P3 — evolução e refinamento

| # | Melhoria | Problema observado | Resultado esperado | Impacto | Esforço | Confiança |
|---:|---|---|---|---:|---:|---|
| 31 | Criar paleta semântica documentada | Cores comunicam alerta, estado e categoria em vários componentes. | Tokens para sucesso/atenção/erro/info com contraste testado e uso consistente. | 3 | M | alta |
| 32 | Criar biblioteca de padrões | Botões, campos, banners, badges, drawers e estados são compostos diretamente em muitos arquivos. | Componentes base acessíveis com variações limitadas e documentação visual. | 4 | GG | alta |
| 33 | Dividir componentes monolíticos por tarefa | Cockpit, ficha, análise e importador têm mais de mil linhas e dificultam manter consistência. | Módulos por etapa/estado e hooks testáveis; menor risco ao evoluir a UX. | 4 | GG | alta |
| 34 | Oferecer atalhos para operadores frequentes | Usuários de carteira repetem busca, abrir, avançar e voltar muitas vezes. | `/` busca, setas navegam, Enter abre, atalhos visíveis e desativáveis. | 2 | M | baixa |
| 35 | Criar visão de “trabalho do dia” | Cockpit representa a carteira inteira; o usuário pode querer uma fila curta e terminável. | Recorte recomendado com volume, prazo e definição de concluído. | 4 | G | baixa |
| 36 | Testar linguagem com contadores reais | Comentários de código registram muitas decisões, mas não substituem compreensão observada. | Testes moderados de cinco usuários por rodada, com sucesso, tempo e dúvidas anotados. | 5 | GG | alta |

## 4. Plano recomendado

### Primeiros 30 dias — segurança de uso e acessibilidade

1. Corrigir foco dos overlays e criar padrão de `focus-visible`.
2. Acrescentar rota ativa no desktop e badges no mobile.
3. Criar resumo navegável de erros na análise.
4. Implementar rascunho local e recuperação da análise.
5. Definir o padrão global de feedback assíncrono.
6. Instrumentar apenas os quatro funis essenciais, sem dados fiscais no evento.

**Critério de saída:** todas as tarefas essenciais podem ser concluídas por
teclado; uma interrupção não apaga a análise; todo erro informa a próxima ação.

### 31–60 dias — reduzir carga cognitiva

1. Reorganizar o cockpit por hierarquia e ação primária.
2. Adicionar navegação interna e revelação progressiva na análise.
3. Transformar filtros ativos em uma frase/chips e esclarecer seleção invisível.
4. Elevar o piso tipográfico e substituir placeholders usados como rótulo.
5. Padronizar vazios, erros e confirmações.

**Critério de saída:** usuário encontra a próxima empresa e conclui uma análise
sem depender de explicação externa; nenhum texto essencial fica abaixo de 12 px.

### 61–90 dias — eficiência e validação

1. Refatorar a importação como fluxo em etapas retomável.
2. Persistir preferências de fila e oferecer densidade confortável/compacta.
3. Consolidar a linha do tempo documental.
4. Rodar testes com cinco contadores novos e cinco experientes.
5. Comparar tempo, conclusão, erros e retorno antes/depois.

**Critério de saída:** importação e primeira análise têm taxa de conclusão
mensurável; as cinco principais causas de abandono possuem ação corretiva.

## 5. Métricas de sucesso

| Tarefa | Métrica principal | Meta inicial |
|---|---|---:|
| Primeiro valor | cadastro → primeira empresa válida | ≥ 70% |
| Primeira análise | empresa válida → análise salva | ≥ 60% |
| Produção | tempo mediano para concluir uma análise já preenchida | reduzir 25% |
| Importação | cargas iniciadas que terminam com ao menos uma empresa | ≥ 85% |
| Recuperação | erros com nova tentativa bem-sucedida na mesma sessão | ≥ 70% |
| Acessibilidade | tarefas essenciais concluídas só com teclado | 100% |
| Documentos | laudos emitidos que chegam ao estado esperado | ≥ 95% |
| Suporte | chamados “não achei / não sei o próximo passo” | reduzir 40% |

Eventos devem carregar apenas identificadores técnicos, etapa, resultado, duração
e classe do erro. Não devem carregar CNPJ, razão social, respostas, valores ou
conteúdo de documentos.

## 6. Como validar sem redesenhar por opinião

Usar cinco tarefas em protótipo ou ambiente de homologação:

1. adicionar uma empresa por CNPJ;
2. localizar a empresa prioritária e completar a análise;
3. corrigir uma premissa incompleta;
4. emitir e localizar o documento;
5. encontrar e tratar um ponto da Reforma.

Registrar conclusão sem ajuda, tempo, retornos, erros e a frase dita pelo usuário
ao explicar “o que faço agora”. Uma melhoria só deve entrar no roadmap se elevar
uma dessas medidas ou atender uma obrigação de acessibilidade — não apenas por
preferência estética.

## 7. Limites desta auditoria

Esta é uma auditoria heurística baseada no código e na estrutura das telas. Não
inclui analytics de produção, entrevistas, gravações de sessão, teste com leitor
de tela real nem observação de contadores trabalhando. Por isso os itens marcados
com confiança baixa são hipóteses, não conclusões. Antes de um redesenho amplo,
devem ser confrontados com tarefas reais e dados de uso.
