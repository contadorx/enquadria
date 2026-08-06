/**
 * OS E-MAILS DO FLUXO DO CLIENTE.
 *
 * A maioria vai AO cliente do contador; dois vão ao contador SOBRE o cliente
 * (coleta respondida, termo assinado). Estão juntos porque pertencem ao mesmo
 * ciclo: pedir dados → entregar documento → colher a ciência. Separá-los por
 * destinatário separaria coisas que mudam juntas.
 *
 * Separados de lib/brevo.ts de propósito: aquele arquivo é o driver da Brevo e
 * ganhou dois templates por conveniência. Estes aqui são produto — o momento em
 * que o trabalho do contador chega a quem paga por ele — e vão mudar por
 * motivos de negócio, não de infraestrutura.
 *
 * TRÊS REGRAS QUE VALEM PARA OS QUE VÃO AO CLIENTE
 *
 * 1. A VOZ É DO CONTADOR, NÃO DO ENQUADRIA. Quem manda é o escritório; a
 *    ferramenta não aparece. O cliente não comprou software, comprou o
 *    profissional — e um e-mail que se anuncia como sistema transforma um
 *    entregável técnico em notificação automática.
 *
 * 2. NENHUMA PROMESSA DE ECONOMIA. O documento apresenta cenários sob premissas
 *    declaradas; a decisão e a responsabilidade técnica são de quem assina. Um
 *    e-mail que promete resultado cria expectativa que o laudo não sustenta, e
 *    é o contador que responde por ela.
 *
 * 3. UMA CHAMADA SÓ. O e-mail existe para o documento ser aberto. Qualquer
 *    segundo botão disputa com o primeiro.
 *
 * O link é sempre PÚBLICO e por token — o cliente não tem conta no Enquadria e
 * nunca vai criar uma para ler o que já é dele.
 */

function escapar(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface Escritorio {
  nome: string;
  crc?: string | null;
  logo_url?: string | null;
}

/**
 * A MOLDURA — o cabeçalho do e-mail é o mesmo do documento.
 *
 * Leva LOGOTIPO, NOME e CRC porque o cliente vai comparar as duas coisas lado a
 * lado: primeiro chega o e-mail, depois abre o laudo. Cabeçalhos diferentes
 * fazem a mensagem parecer de terceiro — e a tese do produto é o contador
 * parecer especialista, não a ferramenta aparecer.
 *
 * O CRC não é enfeite: é a credencial que faz o documento ser de um
 * profissional habilitado, e é o que separa este e-mail de qualquer disparo.
 *
 * O logotipo entra como <img> de URL pública — a mesma que já é usada no
 * cabeçalho do laudo. Cliente de e-mail que bloqueia imagem simplesmente não
 * mostra; nada do que importa depende dela.
 */
function moldura(params: {
  escritorio: string | Escritorio;
  corpo: string;
  /** false = destinatário é o contador, que já nos conhece e não precisa do aviso */
  paraCliente?: boolean;
}): string {
  const esc: Escritorio =
    typeof params.escritorio === "string" ? { nome: params.escritorio } : params.escritorio;

  const logo = esc.logo_url
    ? `<img src="${escapar(esc.logo_url)}" alt="" style="max-height:38px;max-width:150px;display:block;margin-bottom:8px">`
    : "";
  const crc = esc.crc
    ? `<div style="font-size:11px;color:#64748B;text-transform:uppercase;letter-spacing:.06em;margin-top:3px">${escapar(esc.crc)}</div>`
    : "";

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:540px;margin:0 auto;color:#334155;font-size:15px;line-height:1.6">
    <div style="border-bottom:2px solid #0B1220;padding-bottom:12px;margin-bottom:22px">
      ${logo}<strong style="font-size:18px;color:#0B1220">${escapar(esc.nome)}</strong>${crc}
    </div>
    ${params.corpo}
    <p style="font-size:11px;color:#94A3B8;margin-top:26px;border-top:1px solid #EEF2F7;padding-top:12px">
      Mensagem enviada por ${escapar(esc.nome)}. Se você não reconhece este envio, ignore este e-mail.
      ${params.paraCliente === false ? "" : `<br>Se esta mensagem chegou na sua caixa de spam, marque como “não é spam” para receber as próximas.`}
    </p>
  </div>`;
}

function botao(link: string, texto: string): string {
  return `
    <p style="text-align:center;margin:28px 0">
      <a href="${escapar(link)}" style="background:#06B6D4;color:#04212B;font-weight:bold;text-decoration:none;padding:14px 28px;border-radius:999px;display:inline-block;font-size:15px">${escapar(texto)}</a>
    </p>`;
}

/**
 * LAUDO DE ENQUADRAMENTO — o documento que sustenta o honorário.
 *
 * O assunto nomeia a empresa porque o cliente pode ter várias, e nomeia o
 * documento porque ele foi cobrado por ele. Nada de "seu relatório está pronto":
 * o que chega é um laudo técnico com memória de cálculo, e o e-mail diz isso.
 */
export function htmlLaudoCliente(params: {
  empresa: string;
  escritorio: string | Escritorio;
  link: string;
  numero: number;
  /** o que o motor concluiu — muda a frase, nunca a promessa */
  decisao?: "optar" | "permanecer" | null;
}): string {
  const numero = String(params.numero).padStart(4, "0");
  const frase =
    params.decisao === "optar"
      ? `A conclusão é que, no cenário analisado, <strong>vale optar</strong> pelo recolhimento de IBS/CBS por fora do DAS.`
      : params.decisao === "permanecer"
      ? `A conclusão é que, no cenário analisado, <strong>vale permanecer</strong> no regime tradicional do Simples Nacional.`
      : `O laudo traz a conclusão e o caminho que levou até ela.`;

  return moldura({
    escritorio: params.escritorio,
    corpo: `
    <p>Sobre a <strong>${escapar(params.empresa)}</strong>:</p>
    <p>Concluímos a análise do enquadramento em IBS/CBS e emitimos o
    <strong>laudo nº ${numero}</strong>. ${frase}</p>
    <p>O documento traz a memória de cálculo completa — fórmula, números e resultado, linha a
    linha — para que a conta possa ser conferida por qualquer profissional.</p>
    ${botao(params.link, "Abrir o laudo")}
    <p style="font-size:13px;color:#64748B">A janela de opção se encerra em <strong>30 de setembro</strong>.
    Qualquer dúvida sobre o documento, é só responder a este e-mail.</p>`,
  });
}

/**
 * COMPARATIVO DE REGIMES — o documento de venda.
 *
 * Chega ANTES da decisão, e é o que faz o cliente entender por que a conversa
 * existe. Por isso a chamada fala em conversar, não em concluir: o comparativo
 * abre a reunião, o laudo a fecha.
 *
 * O nome do regime de menor carga aparece porque é a informação que o cliente
 * quer — mas sempre com "no cenário analisado", que é o que o documento de fato
 * afirma. Sem essa amarra o e-mail promete mais do que o comparativo entrega.
 */
export function htmlComparativoCliente(params: {
  empresa: string;
  escritorio: string | Escritorio;
  link: string;
  numero: number;
  /** nome do regime de menor carga no cenário — não é recomendação */
  menor?: string | null;
}): string {
  const numero = String(params.numero).padStart(4, "0");
  const frase = params.menor
    ? `No cenário analisado, o regime de menor carga é o <strong>${escapar(params.menor)}</strong>.`
    : `O documento coloca os regimes lado a lado, com a composição de cada um.`;

  return moldura({
    escritorio: params.escritorio,
    corpo: `
    <p>Sobre a <strong>${escapar(params.empresa)}</strong>:</p>
    <p>Preparamos o <strong>comparativo de regimes nº ${numero}</strong>, colocando lado a lado a
    carga anual de cada regime tributário no cenário da empresa. ${frase}</p>
    <p>O documento mostra também a composição de cada regime, imposto por imposto, e as premissas
    que usamos para chegar lá.</p>
    ${botao(params.link, "Abrir o comparativo")}
    <p style="font-size:13px;color:#64748B">O comparativo é um estudo de cenários, não uma apuração:
    a decisão sobre mudança de regime depende de fatores que vão além desta conta e é sempre nossa,
    em conjunto com você. Vale marcarmos uma conversa — é só responder a este e-mail.</p>`,
  });
}


/**
 * O ESTUDO DE ABERTURA — o único e-mail deste conjunto que vai a alguém que
 * NÃO É CLIENTE de ninguém ainda.
 *
 * Isso muda o tom inteiro. Não há relação estabelecida, não há "sobre a
 * empresa X": há uma pessoa que perguntou se vale a pena abrir e recebeu, de
 * volta, um documento com nome, número e assinatura profissional. É a peça
 * comercial mais forte do produto, e ela se estraga com uma linha de venda —
 * o documento é que vende.
 *
 * O convite ao fim é explícito de propósito: sem ele, um estudo excelente
 * termina em "obrigado" e o contador nunca sabe se ganhou o cliente.
 */
export function htmlAberturaCliente(params: {
  negocio: string;
  escritorio: string | Escritorio;
  link: string;
  numero: number;
  /** o regime de menor carga no cenário projetado */
  regime?: string | null;
}): string {
  const numero = String(params.numero).padStart(4, "0");
  const frase = params.regime
    ? `No faturamento que você projetou, o regime de menor carga é o <strong>${escapar(params.regime)}</strong>.`
    : `O estudo coloca os regimes lado a lado, com a carga anual de cada um.`;

  return moldura({
    escritorio: params.escritorio,
    corpo: `
    <p>Como combinamos, preparei o <strong>estudo de abertura nº ${numero}</strong> para a
    <strong>${escapar(params.negocio)}</strong>.</p>
    <p>${frase} O estudo roda três cenários de faturamento — inclusive um bem abaixo do esperado —
    porque quem está abrindo tem projeção, não histórico: o que interessa saber é se a resposta
    muda quando o mês vem fraco.</p>
    ${botao(params.link, "Abrir o estudo")}
    <p style="font-size:13px;color:#64748B">É um comparativo de cenários a partir das projeções que
    você me passou, não uma apuração — e algumas alíquotas da reforma ainda nem foram publicadas.
    Se quiser conversar sobre o resultado antes de decidir, é só responder a este e-mail.</p>`,
  });
}


/* ═══════════════════════════════════════════════════════════════════════
   OS DOIS QUE VÃO AO CONTADOR

   Regra diferente: aqui o destinatário é quem usa o produto, então o e-mail
   PODE ser direto e operacional. O que ele não pode ser é dispensável — um
   aviso que não muda o que a pessoa vai fazer é ruído, e ruído treina o
   destinatário a ignorar a próxima mensagem. Cada um destes existe porque
   destrava um passo que estava parado esperando informação que ninguém deu.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * A COBRANÇA QUE ACABOU DE SER GERADA.
 *
 * POR QUE ESTE E-MAIL EXISTE. A cobrança nascia e ficava esperando o contador
 * lembrar de voltar à tela — ou torcendo para o aviso do meio de pagamento
 * chegar. Em 04/08/2026 aconteceu o caso extremo: a cobrança foi criada no
 * Asaas, o webhook estava apontando para um endereço errado, e do lado de cá
 * não havia fatura, nem e-mail, nem nada. O dinheiro existia e ninguém sabia.
 *
 * Este e-mail não depende de webhook nenhum: sai no mesmo instante em que o
 * link de pagamento é gerado, com o link dentro. É o comprovante de que a
 * contratação aconteceu.
 *
 * VAI PARA O CONTADOR, não para o cliente dele — é ele quem assina o Enquadria.
 */
export function htmlCobrancaGerada(params: {
  escritorio: string | Escritorio;
  plano: string;
  valor: string;
  vencimento?: string | null;
  link: string;
}): string {
  return moldura({
    escritorio: params.escritorio,
    paraCliente: false,
    corpo: `
    <p>Sua cobrança do <strong>${escapar(params.plano)}</strong> foi gerada:
    <strong>${escapar(params.valor)}</strong>${
      params.vencimento ? `, com vencimento em ${escapar(params.vencimento)}` : ""
    }.</p>
    ${botao(params.link, "Pagar agora")}
    <p style="font-size:13px;color:#64748B">Pix, boleto ou cartão — você escolhe na página. O acesso
    abre automaticamente assim que o pagamento é confirmado; no Pix costuma ser em minutos, no
    boleto pode levar um dia útil.</p>
    <p style="font-size:13px;color:#64748B">Este link fica guardado em <strong>Planos → Minhas
    faturas</strong>, junto com todo o histórico. Não precisa procurar este e-mail depois.</p>`,
  });
}

/**
 * A EMPRESA RESPONDEU A COLETA.
 *
 * Sem este aviso, o formulário voltava e ficava esperando alguém abrir o dossiê
 * por acaso. Cinco das oito perguntas da análise só existem na cabeça do
 * cliente — enquanto a resposta não é aplicada, o contador ou chuta ou trava.
 * Este é o e-mail mais operacional do conjunto: ele desbloqueia trabalho.
 */
export function htmlColetaRespondida(params: {
  empresa: string;
  escritorio: string | Escritorio;
  link: string;
  respondente?: string | null;
}): string {
  const quem = params.respondente ? ` por <strong>${escapar(params.respondente)}</strong>` : "";
  return moldura({
    paraCliente: false, // vai para o contador, que já nos conhece
    escritorio: params.escritorio,
    corpo: `
    <p><strong>${escapar(params.empresa)}</strong> respondeu o formulário de dados${quem}.</p>
    <p>As respostas já estão no dossiê da empresa, prontas para você conferir contra a
    escrituração e aplicar na análise. Nada foi alterado sozinho — quem decide o que entra
    no laudo é você.</p>
    ${botao(params.link, "Abrir o dossiê")}`,
  });
}

/**
 * O TERMO FOI ASSINADO — aviso ao contador.
 *
 * O termo assinado é o fim da esteira e a prova de que o serviço foi entregue.
 * Antes disto ele acontecia em silêncio: o cliente assinava e o contador só
 * descobria abrindo a tela. Quem cobra pelo serviço precisa saber a hora em que
 * ele fechou.
 */
export function htmlTermoAssinadoContador(params: {
  empresa: string;
  escritorio: string | Escritorio;
  link: string;
  assinante: string;
  decisao: "optar" | "permanecer";
}): string {
  const decisao =
    params.decisao === "optar"
      ? "optar pelo recolhimento de IBS/CBS por fora do DAS"
      : "permanecer no regime tradicional do Simples Nacional";
  return moldura({
    paraCliente: false, // vai para o contador, que já nos conhece
    escritorio: params.escritorio,
    corpo: `
    <p><strong>${escapar(params.assinante)}</strong> assinou o termo de ciência da
    <strong>${escapar(params.empresa)}</strong>.</p>
    <p>Decisão registrada: <strong>${decisao}</strong>.</p>
    <p>A evidência da assinatura — carimbo de tempo, hash do documento e método — está na
    trilha de auditoria do dossiê.</p>
    ${botao(params.link, "Ver o termo assinado")}`,
  });
}

/**
 * O TERMO FOI ASSINADO — comprovante a quem assinou.
 *
 * Quem assina um documento espera receber uma cópia. Não receber nada depois de
 * clicar "assinar" é a experiência que faz a pessoa ligar para o contador
 * perguntando se deu certo — e é o contador que atende essa ligação.
 */
export function htmlTermoAssinadoCliente(params: {
  empresa: string;
  escritorio: string | Escritorio;
  link: string;
  decisao: "optar" | "permanecer";
}): string {
  const decisao =
    params.decisao === "optar"
      ? "optar pelo recolhimento de IBS/CBS por fora do DAS a partir de 2027"
      : "permanecer no regime tradicional do Simples Nacional";
  return moldura({
    escritorio: params.escritorio,
    corpo: `
    <p>Recebemos sua assinatura no termo de ciência da
    <strong>${escapar(params.empresa)}</strong>. Obrigado.</p>
    <p>Decisão registrada: <strong>${decisao}</strong>.</p>
    ${botao(params.link, "Guardar uma cópia do termo")}
    <p style="font-size:13px;color:#64748B">A decisão vale pelo semestre e não pode ser alterada
    dentro do período. Guarde este e-mail: o link acima abre o documento assinado a qualquer
    momento. Qualquer dúvida, é só responder.</p>`,
  });
}

/**
 * PEDIDO DE DADOS — o formulário que destrava a análise.
 *
 * Este é o PRIMEIRO e-mail que o cliente recebe do escritório dentro do
 * Enquadria, e o único cuja resposta o contador precisa esperar para poder
 * trabalhar. Duas consequências no texto:
 *
 *  1. Diz o custo antes do pedido ("uns três minutos, pelo celular"). Pedido
 *     sem tamanho é adiado; pedido com tamanho é feito.
 *  2. Explica POR QUE existe. O cliente não pediu análise nenhuma — se o
 *     e-mail chega só com um link, parece cobrança ou golpe.
 *
 * Não fala em "contabilidade" nem em siglas: quem responde costuma ser o
 * sócio, não o financeiro.
 */
export function htmlPedidoColeta(params: {
  empresa: string;
  escritorio: string | Escritorio;
  link: string;
}): string {
  return moldura({
    escritorio: params.escritorio,
    corpo: `
    <p>Sobre a <strong>${escapar(params.empresa)}</strong>:</p>
    <p>Existe uma decisão de imposto com <strong>prazo em 30 de setembro</strong> que a
    empresa precisa tomar. Para calcular qual caminho sai mais barato, preciso de alguns
    números que só vocês têm.</p>
    <p>Montei um formulário curto — <strong>uns três minutos</strong>, dá para responder
    pelo celular. Não tem cadastro, não tem senha, e não pede nada de contabilidade:
    são perguntas sobre o dia a dia da empresa.</p>
    ${botao(params.link, "Responder o formulário")}
    <p style="font-size:13px;color:#64748B">Assim que vocês responderem, eu faço a conta e
    devolvo o comparativo. Qualquer dúvida, é só responder a este e-mail.</p>`,
  });
}

/**
 * CONVITE DE INDICAÇÃO — mandado por nós, em nome de quem indicou.
 *
 * A pessoa que indicou escreveu o nome de um colega num formulário. O que ela
 * NÃO fez foi autorizar o seu escritório a virar remetente de propaganda. Por
 * isso o e-mail sai do Enquadria, diz de quem veio, e o texto trata o indicado
 * como colega de quem indicou — não como lead.
 *
 * Sem promessa de desconto para quem indicou: transformar contador em afiliado
 * sem combinar antes estraga a relação que produziu a indicação.
 */
export function htmlConviteIndicacao(params: {
  indicado: string;
  quemIndicou: string;
  /** o escritório de quem indicou, quando é diferente do nome dele */
  escritorio?: string | null;
  link: string;
}): string {
  /* sem escritório separado, a frase não pode virar "Fulano, do Fulano," */
  const casa = params.escritorio?.trim()
    ? `, do ${escapar(params.escritorio.trim())},`
    : "";
  return moldura({
    escritorio: { nome: "Enquadria" },
    paraCliente: false,
    corpo: `
    <p>Olá, ${escapar(params.indicado)}.</p>
    <p><strong>${escapar(params.quemIndicou)}</strong>${casa} indicou você para conhecer o
    Enquadria.</p>
    <p>É um sistema para contadores decidirem, com laudo e memória de cálculo, quais clientes do
    Simples Nacional devem recolher IBS/CBS por fora do DAS a partir de 2027. A escolha precisa
    ser feita até <strong>30 de setembro</strong> e vale o ano inteiro.</p>
    ${botao(params.link, "Ver como funciona")}
    <p style="font-size:13px;color:#64748B">Se não fizer sentido para você, é só ignorar — não
    insistimos e este é o único e-mail que você recebe por esta indicação.</p>`,
  });
}

/**
 * RESPOSTA DE CHAMADO — o e-mail que fechava o ciclo pela metade.
 *
 * O assistente promete "você recebe a resposta por e-mail". Sem esta mensagem,
 * a resposta ficava esperando dentro do app que a pessoa talvez não abrisse
 * naquela semana — e a promessa virava mentira sem ninguém perceber.
 *
 * Traz a RESPOSTA INTEIRA no corpo, não um "temos novidades, acesse". Quem
 * perguntou algo operacional quer a resposta, não uma viagem até o site.
 */
export function htmlRespostaChamado(params: {
  assunto: string;
  resposta: string;
  link: string;
}): string {
  const corpoTexto = escapar(params.resposta)
    .split("\n")
    .map((l) => (l.trim() ? `<p>${l}</p>` : ""))
    .join("");

  return moldura({
    escritorio: { nome: "Enquadria" },
    paraCliente: false,
    corpo: `
    <p>Sobre o que você perguntou — <strong>${escapar(params.assunto)}</strong>:</p>
    ${corpoTexto}
    ${botao(params.link, "Ver no Enquadria")}
    <p style="font-size:13px;color:#64748B">Se ficou alguma dúvida, é só responder este e-mail.</p>`,
  });
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PAGAMENTO CONFIRMADO — o recibo que não existia.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O BURACO, medido em 06/08/2026: o webhook do Asaas recebia
 * `PAYMENT_CONFIRMED`, liberava o acesso, somava o MRR, atualizava as colunas
 * de cobrança do escritório e avisava o CRM — e não mandava uma linha a quem
 * tinha acabado de pagar. O contador pagava e ficava olhando para a tela sem
 * saber se entrou.
 *
 * Este é o único e-mail do arquivo que vai ao CONTADOR sobre a conta DELE, e
 * não ao cliente do contador. Por isso a moldura leva "Enquadria" e
 * `paraCliente: false`: aqui nós somos o fornecedor, e esconder isso seria
 * mentir sobre quem cobrou.
 *
 * A DATA DE VALIDADE É O ASSUNTO DO E-MAIL, não um detalhe. "Recebemos seu
 * pagamento" é cortesia; "seu acesso vai até 04/09" é a informação pela qual
 * ele pagou, e é a que ele vai procurar daqui a três semanas.
 *
 * OS DIAS HERDADOS APARECEM POR ESCRITO quando existem. A tela de Planos
 * promete, na hora da troca de plano, que os dias que sobravam do plano
 * anterior vêm junto. Promessa feita na tela e nunca repetida em lugar nenhum
 * é promessa que o cliente não consegue conferir — e conferir é exatamente o
 * que ele faz quando desconfia.
 */
export function htmlPagamentoConfirmado(params: {
  plano: string;
  valor: string;
  /** já formatado dd/mm/aaaa */
  pago_em?: string | null;
  /** já formatado dd/mm/aaaa */
  valido_ate: string;
  /** dias que vieram do plano anterior, quando houve troca */
  credito_dias?: number;
  link: string;
}): string {
  const credito =
    params.credito_dias && params.credito_dias > 0
      ? `<p style="font-size:13px;color:#64748B">Incluímos os <strong>${params.credito_dias} ${
          params.credito_dias === 1 ? "dia" : "dias"
        }</strong> que ainda sobravam do seu plano anterior — eles foram somados à data acima, como
        combinado na hora da troca.</p>`
      : "";

  return moldura({
    escritorio: { nome: "Enquadria" },
    paraCliente: false,
    corpo: `
    <p>Pagamento confirmado. Seu acesso está liberado.</p>
    <table style="width:100%;border-collapse:collapse;margin:18px 0;font-size:14px">
      <tr><td style="padding:7px 0;color:#64748B">Plano</td>
          <td style="padding:7px 0;text-align:right"><strong>${escapar(params.plano)}</strong></td></tr>
      <tr><td style="padding:7px 0;color:#64748B;border-top:1px solid #EEF2F7">Valor</td>
          <td style="padding:7px 0;text-align:right;border-top:1px solid #EEF2F7"><strong>${escapar(params.valor)}</strong></td></tr>
      ${
        params.pago_em
          ? `<tr><td style="padding:7px 0;color:#64748B;border-top:1px solid #EEF2F7">Pago em</td>
                 <td style="padding:7px 0;text-align:right;border-top:1px solid #EEF2F7">${escapar(params.pago_em)}</td></tr>`
          : ""
      }
      <tr><td style="padding:7px 0;color:#64748B;border-top:1px solid #EEF2F7">Acesso até</td>
          <td style="padding:7px 0;text-align:right;border-top:1px solid #EEF2F7"><strong style="color:#0B1220">${escapar(params.valido_ate)}</strong></td></tr>
    </table>
    ${credito}
    ${botao(params.link, "Abrir o painel")}
    <p style="font-size:13px;color:#64748B">O comprovante fica em <strong>Planos → Minhas
    faturas</strong>, com todo o histórico. Precisando de nota fiscal ou de qualquer ajuste no
    cadastro, é só responder este e-mail.</p>`,
  });
}

/**
 * O ASSUNTO CARREGA A DATA.
 *
 * Fica separado do HTML porque é ele que a pessoa lê na lista da caixa de
 * entrada meses depois, procurando "até quando eu paguei". "Pagamento
 * confirmado" sozinho não responde nada; a data responde sem abrir.
 */
export function assuntoPagamentoConfirmado(plano: string, validoAte: string): string {
  return `Pagamento confirmado — ${plano} ativo até ${validoAte}`;
}
