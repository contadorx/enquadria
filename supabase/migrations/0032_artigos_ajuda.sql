-- ===========================================================================
-- OS ARTIGOS — conteúdo inicial das duas seções
-- ===========================================================================
--
-- Central vazia ensina que a central é vazia: a pessoa entra uma vez, não acha
-- nada e não volta. O custo disso não é o artigo faltando — é o hábito perdido.
--
-- Cobrem o caminho inteiro do contador: importar → analisar → emitir → enviar →
-- termo, mais a régua comercial e o quadro da Reforma.
--
-- Todos publicados. `destaque` marca os quatro que respondem as dúvidas de
-- primeira semana e sobem para o topo.
-- ---------------------------------------------------------------------------

insert into public.ajuda_artigos
  (slug, titulo, resumo, categoria, tipo, corpo, publicado, publicado_em, destaque, ordem)
values

-- ---------------------------------------------------------- USANDO O SISTEMA
('como-importar-a-carteira',
 'Como subir sua carteira',
 'Dois caminhos: colar os CNPJs ou subir um CSV. Nenhum dos dois exige preparar arquivo.',
 'produto', 'ajuda',
 E'Existem **dois caminhos** e eles não são etapas — você escolhe um.\n\n## Caminho 1 — colar os CNPJs\n\nNão precisa exportar nada do seu sistema. Cole a lista de CNPJs, um por linha ou separados por vírgula, e o resto (razão social, CNAE, porte, situação) vem da base da Receita.\n\nÉ o caminho mais rápido para começar hoje.\n\n## Caminho 2 — subir um CSV\n\nSe você já tem a carteira exportada, suba do jeito que veio. As colunas são reconhecidas por sinônimo, sem formato rígido.\n\n**Só o CNPJ é obrigatório.** O resto, quando falta, vem do enriquecimento.\n\nDuas colunas mudam a qualidade do resultado:\n\n- **RBT12** — com ela a alíquota do laudo sai efetiva em vez de estimada.\n- **porte** ou **regime** — separam MEI e quem já saiu do Simples, dois dados que a base pública não tem.\n\n## O que acontece depois\n\nCNPJs inválidos e repetidos são descartados antes de gravar. A triagem separa quem tem decisão a tomar de quem não tem, e você vê o resultado na hora.\n\n## Subir de novo apaga o que já existe?\n\nNão. A gravação **soma**. CNPJ que já está lá tem os dados atualizados e mantém a análise, o laudo e o termo.',
 true, now(), true, 10),

('formulario-do-cliente',
 'O formulário que o cliente responde',
 'Seis perguntas, três minutos, sem cadastro. Como mandar e o que fazer com a resposta.',
 'produto', 'ajuda',
 E'A conta depende de informações que só o cliente tem: para quem ele vende, se esses clientes aproveitam crédito, como ele forma preço.\n\nO formulário faz essas perguntas na linguagem do dia a dia — nada de contabilidade.\n\n## Como mandar\n\nQuatro opções na tela da empresa:\n\n- **Copiar a mensagem pronta** — texto já escrito, é só colar.\n- **Abrir no WhatsApp** — o caminho que mais funciona.\n- **Enviar por e-mail** — sai com o nome do seu escritório e a resposta volta para você.\n- **Copiar só o link**.\n\n## Sobre o e-mail e o spam\n\nO e-mail pode cair na caixa de spam do cliente, ainda mais se for a primeira mensagem que ele recebe do seu escritório. Se a empresa for importante, mande também pelo WhatsApp.\n\n## Enquanto você espera\n\nSe o cliente responder com você na tela, o status muda sozinho — não precisa sair e entrar.\n\n## Quando a resposta chega\n\nAs respostas do cliente entram na análise marcadas com o selo **resposta do cliente**. Você vê exatamente o que veio dele e o que é padrão do sistema, e pode ajustar o que quiser: no instante em que você mexe numa pergunta, a premissa passa a ser sua.\n\nIsso também vale no laudo, que registra a origem de cada premissa.',
 true, now(), true, 20),

('emitir-e-enviar-o-laudo',
 'Emitir o laudo e enviar ao cliente',
 'São dois atos separados, de propósito. Onde fica cada botão.',
 'produto', 'ajuda',
 E'**Emitir não envia.** São dois botões porque são duas decisões: você pode emitir para conferir e só depois mandar.\n\n## Emitir\n\nNa aba **Decisão**, depois de confirmar as premissas. Se você estiver na aba **Dossiê** e o laudo ainda não existir, o botão de emitir também aparece lá.\n\n## Enviar\n\nNa aba **Decisão** ou no **Dossiê**, botão "Enviar ao cliente". Antes de sair, você confere e corrige o destinatário — e a correção fica gravada na empresa, para o próximo envio já sair certo.\n\nSe o documento já foi entregue, o botão passa a dizer **Reenviar**. Ele só muda quando houve entrega confirmada: tentativa que falhou continua como primeiro envio, porque é o caso em que você precisa insistir.\n\n## Em lote\n\nO cockpit envia para vários de uma vez. Quem não tem e-mail de contato aparece na contagem em vez de falhar em silêncio.',
 true, now(), true, 30),

('termo-de-ciencia',
 'O termo de ciência',
 'O que ele é, o que o cliente assina e por que o laudo vai junto.',
 'produto', 'ajuda',
 E'O termo registra que o cliente **soube da decisão e concordou com ela**. Não é contrato de honorário: é a prova de que a escolha foi informada.\n\n## O que o cliente vê\n\nA empresa, o CNPJ, a decisão em uma linha, as cláusulas de ciência — e o **link do laudo que embasa a decisão**.\n\nO laudo dentro do termo não é conveniência: assinar ciência de uma escolha sem poder abrir a conta que a sustenta é assinatura no escuro, que é exatamente o que um termo de ciência não pode ser.\n\n## Assinatura\n\nSimples ou avançada. Nas duas, o sistema grava o hash do documento, a data e o método — é isso que dá valor probatório.\n\n## Em lote\n\nGerar o termo em lote já manda o convite: para o termo, gerar e convidar são o mesmo ato. Empresa sem e-mail de contato entra na contagem "sem contato" e não trava as outras.',
 true, now(), false, 40),

('quem-precisa-decidir',
 'Por que a triagem exclui parte da carteira',
 'Nem todo cliente tem decisão a tomar. O critério.',
 'produto', 'ajuda',
 E'A triagem não é filtro de conveniência — ela separa quem tem escolha real de quem não tem.\n\n## Fica de fora\n\n- **MEI** — não tem a opção.\n- **Quem já saiu do Simples** — a decisão não se aplica.\n- **RBT12 acima do teto** (R$ 4,8 milhões) — a empresa já está excluída do Simples.\n\n## Entra, mas raramente compensa\n\nEmpresa que vende para **consumidor final**. O ganho de sair do DAS vem do crédito que o cliente PJ aproveita; sem cliente PJ, não há de onde vir.\n\n## O que move a conta\n\nO peso do faturamento que vem de outras empresas, e quanto dessas empresas está fora do Simples. Quanto maior os dois, maior a chance de valer a pena optar.\n\nA triagem é ponto de partida, não veredicto: o laudo é que faz a conta.',
 true, now(), false, 50),

-- ------------------------------------------------------------- COMERCIAL
('quanto-cobrar',
 'Quanto cobrar pelo laudo',
 'Ancorar no risco evitado, não nas horas gastas.',
 'comercial', 'ajuda',
 E'A pergunta errada é "quanto tempo isso me toma". A certa é **quanto custa errar**.\n\n## O que está em jogo para o cliente\n\nA escolha vale para o ano-calendário inteiro de 2027 e não se desfaz em março quando alguém perceber. Uma decisão errada custa doze meses de imposto pago a mais — e o contador que não avisou é quem responde pela conversa.\n\n## A âncora\n\nCompare com a diferença anual que o laudo mostra. Se o laudo aponta economia de R$ 40 mil ao ano, um honorário de R$ 1.500 pelo estudo é 3,75% do que ele preserva.\n\nQuando o laudo conclui **permanecer**, o valor é o mesmo: o que foi comprado é a certeza documentada de que a escolha atual é a certa — e a prova de que alguém olhou.\n\n## O erro comum\n\nCobrar por CNPJ analisado, como se fosse digitação. O trabalho não é rodar a conta: é assumir a responsabilidade técnica pela recomendação e deixar prova auditável dela.\n\n## O prazo ajuda\n\n30 de setembro é data legal, não pressão de vendas. Depois dela a conversa deixa de existir por doze meses.',
 true, now(), true, 10),

('como-apresentar-ao-cliente',
 'Como abrir a conversa com o cliente',
 'O roteiro que evita a resposta "depois eu vejo".',
 'comercial', 'ajuda',
 E'## Abra pelo prazo, não pelo produto\n\n"Existe uma decisão de imposto com prazo em 30 de setembro que a sua empresa precisa tomar" é uma frase que produz reunião. "Tenho um novo serviço de análise tributária" não é.\n\n## Mostre a conta antes do preço\n\nO comparativo existe para isso: ele abre a reunião. O laudo a fecha.\n\n## Deixe claro quem decide\n\nA escolha é do empresário. Seu papel é fazer a conta, mostrar os dois cenários e registrar. Isso reduz a resistência — ninguém está sendo empurrado — e é o que o termo de ciência formaliza depois.\n\n## Comece pelos que mais ganham\n\nO cockpit já ordena por prioridade. Empresa com faturamento alto para PJ fora do Simples é onde a diferença aparece — e onde a conversa é mais fácil.\n\n## Não prometa economia antes da conta\n\nParte da carteira vai concluir "permanecer". Prometer economia e entregar "fica como está" queima a confiança que o próximo laudo vai precisar.',
 true, now(), false, 20),

-- ------------------------------------------------------- QUADRO DA REFORMA
('lei-15270-dividendos',
 'Lei 15.270/2025: o que muda na distribuição',
 'Tributação sobre distribuição mensal acima de R$ 50 mil por pessoa física e IRRF sobre JCP.',
 'reforma', 'noticia',
 E'A Lei 15.270/2025 alterou a tributação da distribuição de lucros.\n\n## O que mudou\n\n- Distribuição mensal **acima de R$ 50 mil** por pessoa física passa a ser tributada.\n- **JCP** com IRRF de 17,5% desde janeiro de 2026.\n\n## Por que aparece aqui\n\nNão muda o cálculo do enquadramento em IBS/CBS, mas muda a conversa que vem depois dele. Cliente que sai do DAS e reorganiza a remuneração precisa considerar as duas coisas juntas.\n\n## O que fazer\n\nPara clientes com distribuição relevante, a estratégia de retirada passa a ser assunto de planejamento — fracionamento ao longo do ano, mix com JCP. É trabalho cobrável e nasce da mesma conversa do enquadramento.',
 true, now(), false, 100),

('o-que-e-a-janela-de-setembro',
 'A janela de 30 de setembro: por que ela existe',
 'A LC 214/2025 abriu uma escolha que não existia para o optante pelo Simples.',
 'reforma', 'noticia',
 E'## O que a lei criou\n\nA LC 214/2025 instituiu o IBS e a CBS e desenhou a transição. Para o optante pelo Simples Nacional, abriu uma escolha que não existia: recolher IBS/CBS **por dentro do DAS** ou **por fora**, no regime não cumulativo.\n\n## O prazo\n\nA escolha vale para o ano-calendário de **2027** e precisa ser feita até **30 de setembro de 2026**.\n\nÉ data legal. Passada, a conversa só volta a existir no ano seguinte.\n\n## Por que a decisão não é óbvia\n\nSair do DAS aumenta a complexidade da apuração e o custo operacional. Em troca, o cliente PJ do seu cliente passa a aproveitar crédito integral — o que pode virar preço melhor ou margem maior.\n\nO ponto de virada depende de quanto do faturamento vai para empresas fora do Simples. É isso que o laudo calcula.\n\n## O que ainda pode mudar\n\nA regulamentação continua saindo. Este quadro é atualizado quando algo relevante muda, e o app avisa você.',
 true, now(), false, 90)

on conflict (slug) do nothing;
