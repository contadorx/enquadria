import { normalizar } from "./ajuda";

/**
 * O AGENTE DA PÁGINA PÚBLICA — quem responde antes de existir uma conta.
 *
 * Este arquivo é o cérebro do balão que aparece no site. Ele existe porque a
 * maior perda medida do funil não é no produto: é entre a pessoa se interessar
 * e criar a conta. Quem está na página com dúvida não abre um chamado nem
 * manda e-mail — ela fecha a aba.
 *
 * QUATRO DECISÕES QUE NÃO SÃO NEGOCIÁVEIS, e o motivo de cada uma:
 *
 *  1. O ROTEIRO VEM ANTES DA IA. As perguntas de venda são finitas e conhecidas
 *     (preço, prazo, o que é, serve pra mim, como começo). Resposta escrita e
 *     conferida sai na hora, custa zero e não varia. IA só para o que sobrar.
 *
 *  2. NÃO DECIDE CASO CONCRETO. "Meu cliente do Anexo III fatura 900 mil, devo
 *     optar?" não se responde num chat de vendas. Isso é laudo, tem premissa,
 *     data e assinatura. Aqui a resposta é o convite para a triagem — nunca um
 *     número. É a fronteira contra virar parecer, e ela mora no código.
 *
 *  3. TODA RESPOSTA PASSA POR REVISÃO. `revisar()` barra o vocabulário que não
 *     pode sair da nossa boca: marca de concorrente, promessa de economia,
 *     "blindagem", garantia de resultado. Vale inclusive para o texto que a IA
 *     gerar — o corpus é bom, mas a saída de um modelo não é auditada por
 *     ninguém antes de chegar na tela de um contador.
 *
 *  4. TETO EM TUDO. Página pública é endereço aberto: sem teto por sessão e
 *     por dia, o balão vira fatura de terceiro.
 *
 * O corpus mora aqui, em código, e não no banco: é texto de venda, entra em
 * revisão junto com o resto e não pode ser editado sem deixar rastro.
 */

export type Fonte = "roteiro" | "ia" | "recusa" | "captura" | "limite";

export interface RespostaAgente {
  chave: string;
  fonte: Fonte;
  resposta: string;
  /** rótulo do botão que aparece embaixo da resposta, quando faz sentido */
  cta?: { rotulo: string; url: string };
  /** pede o e-mail depois de responder (não antes — cobrar pedágio afasta) */
  pedirEmail?: boolean;
}

/** Onde o agente pode mandar a pessoa. Nada aqui é inventado na hora. */
export const DESTINOS = {
  app: { rotulo: "Fazer a triagem grátis", url: "https://app.enquadria.com.br/cadastro" },
  precos: { rotulo: "Ver os planos", url: "https://enquadria.com.br/precos.html" },
  curso: { rotulo: "Ver as nove aulas", url: "https://enquadria.com.br/curso/" },
  guia: { rotulo: "Baixar o guia", url: "https://enquadria.com.br/guia/" },
  faq: { rotulo: "Ver as dúvidas", url: "https://enquadria.com.br/faq.html" },
  comoFunciona: { rotulo: "Ver como funciona", url: "https://enquadria.com.br/como-funciona.html" },
} as const;

interface Regra {
  chave: string;
  /** TODOS estes termos precisam aparecer (já normalizados, sem acento) */
  exige?: string[];
  /** ao menos UM destes precisa aparecer */
  algum: string[];
  resposta: string;
  cta?: { rotulo: string; url: string };
  pedirEmail?: boolean;
  /**
   * Libera a regra para perguntas que citam norma. Só três regras têm isso, e
   * cada uma porque a resposta É sobre a norma e está conferida. Ver o portão
   * técnico logo abaixo de REGRAS.
   */
  tecnicoOk?: boolean;
}

/**
 * A ORDEM É PARTE DA LÓGICA — específico antes de genérico.
 *
 * "quanto custa o curso" tem que cair em curso, não em preço. A primeira regra
 * que casa vence, então toda regra que contém uma palavra genérica (preço,
 * como) precisa vir depois das que qualificam essa palavra.
 */
const REGRAS: Regra[] = [
  // ---- preço, mas qualificado por outro assunto --------------------------
  {
    chave: "curso-preco",
    exige: ["curso"],
    algum: ["quanto", "custa", "preco", "valor", "gratis", "pago", "pagar"],
    resposta:
      "O curso é gratuito e continua gratuito depois que você assinar. São nove aulas sobre a decisão de setembro, com as planilhas e os modelos. Não peço cartão, e só peço o e-mail se você quiser baixar os materiais.",
    cta: DESTINOS.curso,
  },
  {
    chave: "triagem-preco",
    exige: ["triagem"],
    algum: ["quanto", "custa", "preco", "valor", "gratis", "cartao"],
    resposta:
      "A triagem é grátis, sem cartão e sem prazo. Você sobe a carteira inteira, vê quem precisa decidir até 30 de setembro, quem pode esperar e quem está fora — e só depois escolhe se quer o plano pago. No plano grátis saem também dois laudos de degustação.",
    cta: DESTINOS.app,
  },

  // ---- fronteira: pedido de decisão sobre um caso concreto ---------------
  // (fica no topo dos assuntos técnicos de propósito: é a recusa mais cara
  //  de errar, e ela precisa vencer qualquer regra de conteúdo)
  {
    chave: "caso-concreto",
    tecnicoOk: true,
    algum: [
      "devo optar",
      "vale a pena optar",
      "compensa optar",
      "meu cliente deve",
      "e melhor optar",
      "calcula pra mim",
      "faz a conta",
      "qual a melhor opcao para",
    ],
    resposta:
      "Essa eu não respondo por chat, e o motivo é o mesmo que faz o produto existir: a resposta muda por empresa (anexo, faixa, quanto ela vende para quem aproveita crédito) e ela precisa sair com premissa, data e a sua assinatura em cima — não como opinião solta de uma janela de conversa.\n\nO caminho curto é colar esse CNPJ na triagem grátis: em poucos minutos você vê o cálculo com a memória passo a passo e decide você, com o papel na mão.",
    cta: DESTINOS.app,
  },

  // ---- o que é ------------------------------------------------------------
  {
    chave: "o-que-e",
    algum: [
      "o que e o enquadria",
      "enquadria faz",
      "o que e isso",
      "o que voces fazem",
      "como funciona",
      "pra que serve",
      "para que serve",
      "o que faz",
    ],
    resposta:
      "O Enquadria é a ferramenta que resolve, cliente por cliente, a decisão de IBS/CBS da sua carteira do Simples.\n\nEm quatro passos: você importa a carteira (CNPJ ou planilha) e ele triava quem precisa decidir; calcula a decisão de cada empresa; emite o laudo com a marca do seu escritório; e gera o termo de ciência para o cliente assinar. Depois, o radar avisa quando uma norma nova muda a conta e quantos clientes seus ela atinge.",
    cta: DESTINOS.comoFunciona,
  },

  // ---- preço genérico -----------------------------------------------------
  {
    chave: "preco",
    algum: ["quanto custa", "preco", "preços", "valor", "plano", "mensalidade", "assinatura", "quanto e"],
    resposta:
      "Tem plano grátis para sempre: importar a carteira, triagem completa, mapa de risco e dois laudos de degustação — sem cartão.\n\nO PRO é R$ 47 por mês, ou R$ 470 no ano (dois meses a menos), com laudos e termos ilimitados, dossiê por empresa, radar da transição e todas as janelas do período. Sem fidelidade.",
    cta: DESTINOS.precos,
  },
  {
    chave: "gratis",
    algum: ["e gratis", "tem gratis", "gratuito", "teste gratis", "trial", "sem cartao", "periodo de teste"],
    resposta:
      "Sim, e não é teste com prazo: o plano grátis é para sempre. Ele cobre importar a carteira inteira, a triagem completa, o mapa de risco e dois laudos de degustação, sem pedir cartão. O pago começa quando você precisa emitir laudo e termo sem limite.",
    cta: DESTINOS.app,
  },

  // ---- prazo e janela -----------------------------------------------------
  {
    chave: "depois-de-setembro",
    algum: ["depois de setembro", "depois da janela", "acaba em setembro", "e depois", "2033", "transicao"],
    resposta:
      "A janela de setembro é a primeira decisão, não a única. A opção vale por semestre e a transição muda a conta até 2033.\n\nNo intervalo o sistema trabalha em três frentes: o radar avisa o que mudou e quais clientes seus são afetados; o recálculo reprocessa a carteira salva na janela seguinte; e o dossiê guarda laudos e termos por empresa. Fora isso, há dois serviços que não dependem de janela: o comparativo de regimes e o estudo de abertura.",
    cta: DESTINOS.faq,
  },
  {
    chave: "prazo",
    algum: ["prazo", "ate quando", "quando termina", "30 de setembro", "30/09", "setembro", "data limite"],
    resposta:
      "A opção fica aberta de 1º a 30 de setembro de 2026, com efeito a partir de 1º de janeiro de 2027. É escolha por empresa: quem não avaliar dentro da janela leva a situação atual para o período inteiro.\n\nE ela volta: a opção vale por semestre, então a decisão reaparece a cada período — não é um projeto que acaba em outubro.",
    cta: DESTINOS.guia,
  },

  // ---- público ------------------------------------------------------------
  {
    chave: "lucro-presumido",
    tecnicoOk: true,
    algum: ["lucro presumido", "presumido", "lucro real", "fora do simples", "nao e do simples"],
    resposta:
      "A decisão de setembro é do optante do Simples — é ele quem escolhe apurar IBS/CBS pelo regime regular.\n\nMas a carteira não precisa ser só de Simples para o sistema servir: o radar da transição olha a carteira inteira e diz quantos clientes cada norma nova atinge, incluindo os de Presumido e Real. E o comparativo de regimes e o estudo de abertura funcionam para qualquer empresa, inclusive para quem ainda nem abriu.",
    cta: DESTINOS.comoFunciona,
  },
  {
    chave: "escritorio-pequeno",
    algum: [
      "escritorio pequeno",
      "sou sozinho",
      "poucos clientes",
      "tenho 10",
      "tenho 20",
      "vale a pena pra mim",
      "serve para a minha carteira",
      "serve pra minha carteira",
      "serve para mim",
      "serve pra mim",
      "minha carteira",
    ],
    resposta:
      "Funciona igual com carteira pequena — e a conta fica mais fácil, não mais difícil: uma única análise cobrada do cliente paga o ano inteiro do sistema.\n\nA sugestão é começar por um cliente só, do CNPJ até o laudo. Leva uns dez minutos e você já vê se o serviço se sustenta na sua carteira antes de subir o resto.",
    cta: DESTINOS.app,
  },

  // ---- objeções -----------------------------------------------------------
  {
    chave: "ja-tenho-simulador",
    algum: ["ja tenho", "simulador", "meu sistema faz", "sistema ja tem", "trocar de sistema", "substitui"],
    resposta:
      "Você não troca nada nem cancela contrato nenhum — o Enquadria entra ao lado do que você já usa.\n\nSimulador responde uma pergunta diferente: você escolhe uma empresa e ele calcula. O problema é a escolha — numa carteira de 143 clientes, por quem começar? O Enquadria começa aí (a triagem devolve quem precisa decidir) e termina depois do cálculo, no laudo com a sua marca, no termo assinado e no código público de verificação.",
    cta: DESTINOS.comoFunciona,
  },
  {
    chave: "consultoria",
    algum: ["consultoria", "voces decidem", "assume a responsabilidade", "quem assina", "parecer", "responsabilidade"],
    resposta:
      "Quem decide e quem assina é você. O sistema calcula, mostra a memória de cálculo passo a passo e produz o documento — a recomendação é do contador, e o termo de ciência registra que o cliente escolheu sabendo.\n\nÉ deliberado: não vendemos parecer nem consultoria tributária, vendemos a ferramenta que produz a sua decisão com prova.",
  },
  {
    chave: "fidelidade",
    algum: ["fidelidade", "cancelar", "cancelamento", "contrato", "carencia"],
    resposta:
      "Sem fidelidade e sem carência: cancela quando quiser, direto na conta. O anual sai por R$ 470 justamente para quem prefere não pensar mais no assunto durante o período.",
    cta: DESTINOS.precos,
  },

  // ---- entregáveis --------------------------------------------------------
  {
    chave: "laudo",
    algum: ["laudo", "relatorio", "documento", "marca do escritorio", "minha marca", "white label"],
    resposta:
      "O laudo sai com o nome e a marca do seu escritório, em dez seções — e a que muda tudo é a memória de cálculo: cada passo com fórmula, substituição numérica e resultado, para que um terceiro refaça a conta no papel.\n\nEmpresas sem decisão a tomar recebem o laudo curto de duas páginas, com a mesma numeração e o mesmo código público de verificação.",
    cta: DESTINOS.comoFunciona,
  },
  {
    chave: "termo",
    algum: ["termo", "ciencia", "assinatura", "assinar", "cliente assina"],
    resposta:
      "O termo de ciência é o outro lado do laudo: o laudo mostra o que você recomendou, com quais premissas e em que data; o termo mostra que o cliente escolheu, sabendo. Ele vai por link, o cliente assina, e os dois ficam no dossiê da empresa.\n\nNa prática é o par de documentos que transforma uma conversa de WhatsApp em serviço cobrável.",
  },
  {
    chave: "importar",
    algum: ["importar", "planilha", "csv", "subir a carteira", "cadastrar", "integracao", "integra"],
    resposta:
      "Não precisa de planilha nem de integração para começar: em Importar, você cola o CNPJ de um cliente e o sistema busca razão social, CNAE, porte e situação na base da Receita.\n\nA planilha serve depois, quando quiser subir a carteira inteira de uma vez. Importar não tem limite, nem no plano grátis.",
    cta: DESTINOS.app,
  },

  // ---- conteúdo / autoridade ---------------------------------------------
  {
    chave: "curso",
    algum: ["curso", "aulas", "aula", "treinamento", "material", "materiais"],
    resposta:
      "São nove aulas gratuitas sobre a decisão de setembro, que abrem aqui no site sem cadastro, com as planilhas e os modelos para baixar. O método das aulas 1 a 7 funciona na planilha; o sistema aparece uma vez, na aula 8, e eu digo que é meu.",
    cta: DESTINOS.curso,
  },
  {
    chave: "guia",
    algum: ["guia", "ebook", "e-book", "pdf", "livro"],
    resposta:
      "Tem um guia de 25 páginas sobre a janela: o que é a decisão, quem precisa decidir e como fazer a conta por cliente — incluindo a tabela da fatia real de PIS/Cofins dentro do DAS, por anexo e faixa.",
    cta: DESTINOS.guia,
    pedirEmail: true,
  },
  {
    chave: "365",
    tecnicoOk: true,
    algum: ["3,65", "3.65", "365", "fatia", "pis cofins", "pis/cofins"],
    resposta:
      "Os 3,65% são a conta do Lucro Presumido — no Simples ela não vale. A fatia de PIS/Cofins dentro do DAS depende do anexo e da faixa: na tabela de 2027, medida no topo de cada faixa, vai de 0,62% a 4,36%.\n\nÉ exatamente a parcela que deixa de ser paga se a empresa optar pelo regime regular. Usar um número só para a carteira inteira erra a decisão, para mais e para menos.",
    cta: DESTINOS.guia,
  },
  {
    chave: "quem-e",
    algum: ["quem e voce", "quem fez", "quem esta por tras", "leandro", "contador mesmo"],
    resposta:
      "Sou o Leandro Oliveira, contador e economista em Santo André. Construí o Enquadria para a minha própria carteira, e hoje outros contadores usam. Este balão é automático, mas quem escreve as respostas e responde o que ele não sabe sou eu.",
  },

  // ---- operação -----------------------------------------------------------
  {
    chave: "seguranca",
    algum: ["seguranca", "lgpd", "dados", "privacidade", "onde ficam os dados"],
    resposta:
      "Os dados ficam separados por escritório, com acesso restrito à sua conta, e a política está publicada no site. O sistema usa dados públicos da Receita para a triagem; o que você informa (como RBT12) fica visível só para a sua conta.",
    cta: { rotulo: "Ver a política", url: "https://enquadria.com.br/privacidade.html" },
  },
  {
    chave: "comecar",
    algum: ["como comeco", "por onde", "como faco", "primeiro passo", "criar conta", "cadastro", "comecar"],
    resposta:
      "Cria a conta (é grátis e não pede cartão), entra em Importar e cola o CNPJ de UM cliente do Simples. Só isso.\n\nEm poucos minutos você vê a triagem, roda a análise e emite o laudo desse cliente. Faça um completo primeiro: leva uns dez minutos e você entende o fluxo inteiro antes de subir a carteira.",
    cta: DESTINOS.app,
  },
  {
    chave: "humano",
    algum: ["falar com", "atendente", "humano", "whatsapp", "telefone", "ligar", "suporte"],
    resposta:
      "Falo com você direto. Me deixa seu e-mail que eu respondo pessoalmente — e se quiser, faço a primeira análise junto com você, com um CNPJ da sua carteira.",
    pedirEmail: true,
  },
];

/**
 * O QUE NÃO PODE SAIR DAQUI, em nenhuma hipótese — inclusive se a IA escrever.
 *
 * Não é lista de palavrão: é a fronteira do que o produto promete. "Blindagem"
 * e "garantia de economia" são promessas que ninguém pode cumprir, e citar
 * marca de terceiro é regra de conduta que vale para tudo que publicamos.
 */
const PROIBIDO: { termo: string; motivo: string }[] = [
  { termo: "blindagem", motivo: "promessa que não se pode cumprir" },
  { termo: "blindar", motivo: "promessa que não se pode cumprir" },
  { termo: "garantimos", motivo: "garantia de resultado" },
  { termo: "garantia de economia", motivo: "garantia de resultado" },
  { termo: "economia garantida", motivo: "garantia de resultado" },
  { termo: "com certeza voce vai economizar", motivo: "garantia de resultado" },
  { termo: "sonegar", motivo: "vocabulário inaceitável" },
  { termo: "sem risco nenhum", motivo: "garantia de resultado" },
];

/** Marcas de terceiros: nunca citadas, nem bem nem mal. */
const MARCAS = ["omie", "contmatic", "dominio sistemas", "sage", "totvs", "alterdata", "questor", "iob"];

export interface Revisao {
  ok: boolean;
  motivo?: string;
}

/**
 * O último portão antes da tela. Roda em TODA resposta — a escrita à mão
 * também, porque texto revisado hoje é editado amanhã.
 */
export function revisar(texto: string): Revisao {
  const t = normalizar(texto);
  for (const p of PROIBIDO) {
    if (t.includes(normalizar(p.termo))) return { ok: false, motivo: p.motivo };
  }
  for (const m of MARCAS) {
    if (t.includes(normalizar(m))) return { ok: false, motivo: `citação de marca de terceiro (${m})` };
  }
  return { ok: true };
}

/**
 * O PORTÃO TÉCNICO — a regra que separa roteiro de curadoria.
 *
 * "O ISS continua no DAS até quando?" contém "até quando", e "até quando" é
 * gatilho da resposta sobre o prazo da janela. Sem este portão, uma pergunta
 * de norma receberia a resposta de venda — e não haveria erro visível: só um
 * contador levando embora uma informação que ninguém checou como conteúdo
 * técnico.
 *
 * Roteiro é sobre o produto e sobre a compra. Norma tem fonte, data e revisão,
 * e por isso sai daqui direto para mim.
 */
const TERMOS_TECNICOS = [
  "iss",
  "icms",
  "ipi",
  "aliquota",
  "anexo i",
  "anexo ii",
  "anexo iii",
  "anexo iv",
  "anexo v",
  "lc 214",
  "lei complementar",
  "resolucao",
  "artigo",
  "credito presumido",
  "nota fiscal",
  "nfe",
  "nf-e",
  "nfs-e",
  "split payment",
  "substituicao tributaria",
  "monofasi",
  "fator r",
  "sublimite",
  "difal",
];

function citaNorma(perguntaNormalizada: string): boolean {
  return TERMOS_TECNICOS.some((t) => perguntaNormalizada.includes(t));
}

/**
 * Casa a pergunta com o roteiro. Devolve `null` quando não sabe — e não saber
 * é um resultado legítimo: é o que aciona a IA e, depois dela, a captura.
 */
export function responderRoteiro(pergunta: string): RespostaAgente | null {
  const p = normalizar(pergunta);
  if (!p.trim()) return null;
  const tecnica = citaNorma(p);

  for (const r of REGRAS) {
    if (r.exige && !r.exige.every((e) => p.includes(normalizar(e)))) continue;
    if (!r.algum.some((a) => p.includes(normalizar(a)))) continue;
    // casou, mas a pergunta é de norma e esta regra não é de norma: não responde
    if (tecnica && !r.tecnicoOk) return null;
    return {
      chave: r.chave,
      fonte: r.chave === "caso-concreto" ? "recusa" : "roteiro",
      resposta: r.resposta,
      cta: r.cta,
      pedirEmail: r.pedirEmail,
    };
  }
  return null;
}

/** O corpus que a IA pode usar. Nada além disso entra no contexto. */
export function contextoIA(): string {
  return REGRAS.map((r) => `## ${r.chave}\n${r.resposta}`).join("\n\n");
}

/** As perguntas que aparecem prontas ao abrir. Quem não sabe perguntar, clica. */
export const SUGESTOES = [
  "O que o Enquadria faz?",
  "Quanto custa?",
  "Serve para a minha carteira?",
  "Por onde eu começo?",
];

/**
 * TETO POR SESSÃO. Não é economia mesquinha: conversa de venda que passa de
 * uma dúzia de perguntas não é venda, é ou curiosidade infinita ou abuso. Nos
 * dois casos o certo é trocar o balão por uma pessoa.
 */
export const TETO_SESSAO = 12;

export function noLimite(perguntasFeitas: number, teto = TETO_SESSAO): boolean {
  return perguntasFeitas >= teto;
}

export const RESPOSTA_LIMITE =
  "Chegamos ao limite desta conversa automática — daqui em diante vale mais falar comigo. Me deixa seu e-mail que eu respondo pessoalmente.";

export const RESPOSTA_CAPTURA =
  "Essa eu prefiro não responder no chute, porque daqui sai laudo. Me deixa seu e-mail que eu te respondo pessoalmente — em geral no mesmo dia.";

const RE_EMAIL = /[^\s@<>()[\],;:]+@[^\s@<>()[\],;:]+\.[a-z]{2,}/i;

/** Aceita o e-mail digitado no meio de uma frase ("pode mandar pra x@y.com"). */
export function extrairEmail(texto: string): string | null {
  const m = RE_EMAIL.exec(texto ?? "");
  if (!m) return null;
  const email = m[0].toLowerCase().replace(/[.,;:]+$/, "");
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email) ? email : null;
}

/**
 * Anti-abuso barato e sem estado: pergunta gigante, texto colado e repetição
 * são o que aparece quando alguém aponta um script para cá.
 */
export function perguntaValida(pergunta: string): { ok: boolean; motivo?: string } {
  const t = (pergunta ?? "").trim();
  if (t.length < 2) return { ok: false, motivo: "vazia" };
  if (t.length > 500) return { ok: false, motivo: "longa demais" };
  if ((t.match(/https?:\/\//g) ?? []).length > 0) return { ok: false, motivo: "contém link" };
  return { ok: true };
}

/* ═════════════════════════ O LADO DE DENTRO ═══════════════════════════════
 *
 * O que o agente NÃO soube responder é a coisa mais valiosa que ele produz.
 * Cada pergunta que caiu em "captura" é uma resposta que ainda não existe — e
 * a mesma pergunta vai voltar amanhã, com outra pessoa, que também vai embora.
 *
 * Este resumo é a pauta de escrita da semana, não um painel de vaidade. Por
 * isso ele destaca o que falta, e não o que acertou.
 */

export interface LinhaAgente {
  pergunta: string;
  fonte: string;
  chave?: string | null;
  email?: string | null;
  criado_em: string;
  sessao?: string | null;
}

export interface ResumoAgente {
  total: number;
  porFonte: Record<string, number>;
  /** % respondido sem custo e sem variação — o que se quer alto */
  taxaRoteiro: number | null;
  /** perguntas sem resposta escrita, mais recente primeiro, sem repetição */
  pauta: { pergunta: string; vezes: number; ultima: string }[];
  /** e-mails deixados na conversa (a única conversão direta do balão) */
  emails: string[];
  conversas: number;
}

export function resumirAgente(linhas: LinhaAgente[]): ResumoAgente {
  const porFonte: Record<string, number> = {};
  const pendentes = new Map<string, { pergunta: string; vezes: number; ultima: string }>();
  const emails = new Set<string>();
  const sessoes = new Set<string>();

  for (const l of linhas) {
    porFonte[l.fonte] = (porFonte[l.fonte] ?? 0) + 1;
    if (l.email) emails.add(l.email);
    if (l.sessao) sessoes.add(l.sessao);

    // "captura" é o que a máquina não soube; "limite" é teto, não é falta de
    // resposta — misturar os dois encheria a pauta de trabalho que não existe
    if (l.fonte !== "captura") continue;
    // e-mail digitado no chat NÃO é pergunta: entra como captura, mas colocá-lo
    // na pauta faria a lista de dúvidas virar lista de endereços
    if (l.chave === "email-recebido") continue;

    const k = normalizar(l.pergunta).replace(/[^a-z0-9 ]/g, "").trim();
    const atual = pendentes.get(k);
    if (atual) {
      atual.vezes += 1;
      if (l.criado_em > atual.ultima) atual.ultima = l.criado_em;
    } else {
      pendentes.set(k, { pergunta: l.pergunta, vezes: 1, ultima: l.criado_em });
    }
  }

  const total = linhas.length;
  // repetida primeiro: a pergunta que voltou três vezes vale mais que a nova
  const pauta = Array.from(pendentes.values()).sort(
    (a, b) => b.vezes - a.vezes || (a.ultima < b.ultima ? 1 : -1)
  );

  return {
    total,
    porFonte,
    taxaRoteiro: total === 0 ? null : Math.round(((porFonte["roteiro"] ?? 0) / total) * 100),
    pauta,
    emails: Array.from(emails),
    conversas: sessoes.size,
  };
}
