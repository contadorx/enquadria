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


/* ═══════════════════════════════════════════════════════════════════════
   OS DOIS QUE VÃO AO CONTADOR

   Regra diferente: aqui o destinatário é quem usa o produto, então o e-mail
   PODE ser direto e operacional. O que ele não pode ser é dispensável — um
   aviso que não muda o que a pessoa vai fazer é ruído, e ruído treina o
   destinatário a ignorar a próxima mensagem. Cada um destes existe porque
   destrava um passo que estava parado esperando informação que ninguém deu.
   ═══════════════════════════════════════════════════════════════════════ */

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
  escritorio: string;
  link: string;
}): string {
  return moldura({
    escritorio: { nome: "Enquadria" },
    paraCliente: false,
    corpo: `
    <p>Olá, ${escapar(params.indicado)}.</p>
    <p><strong>${escapar(params.quemIndicou)}</strong>, do ${escapar(params.escritorio)}, indicou
    você para conhecer o Enquadria.</p>
    <p>É um sistema para contadores decidirem, com laudo e memória de cálculo, quais clientes do
    Simples Nacional devem recolher IBS/CBS por fora do DAS a partir de 2027. A escolha precisa
    ser feita até <strong>30 de setembro</strong> e vale o ano inteiro.</p>
    ${botao(params.link, "Ver como funciona")}
    <p style="font-size:13px;color:#64748B">Se não fizer sentido para você, é só ignorar — não
    insistimos e este é o único e-mail que você recebe por esta indicação.</p>`,
  });
}
