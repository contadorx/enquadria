/**
 * O PASSO A PASSO — o que dizer para quem está parado na tela.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DE ONDE ISTO VEIO. Uma conversa real de WhatsApp, 05-06/08/2026, com uma
 * contadora de 25 clientes no Simples. Quatro perguntas dela, na ordem:
 *
 *   1. "Como consigo acessar?"
 *   2. "Primeiro eu preencho aquela planilha que classifica a faixa?"
 *   3. (depois da resposta) "Eu estou perdida 🙈"
 *
 * Nenhuma delas é uma dúvida sobre a Reforma. Todas são sobre O QUE FAZER
 * AGORA — e todas foram feitas por WhatsApp, não pelo assistente, porque o
 * assistente só respondia quando perguntado e só sabia falar de conteúdo.
 *
 * A pergunta 2 é a mais cara das três: ela mostra que a tela ofereceu dois
 * caminhos (planilha OU colar CNPJ) sem dizer qual é o primário. Duas portas
 * do mesmo tamanho não são liberdade, são uma decisão empurrada para quem tem
 * menos informação para decidir.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * O QUE ESTE ARQUIVO FAZ, e o que ele deliberadamente NÃO faz.
 *
 * FAZ: decide o próximo passo a partir do que já existe no banco (tem
 * escritório? tem empresa? tem análise? tem laudo?), escreve a dica da tela em
 * que a pessoa está, e responde as perguntas de "por onde começo" com texto
 * FIXO — sem IA.
 *
 * NÃO FAZ: nada de tributário. Pergunta de conteúdo continua indo para os
 * artigos e para o assistente com IA, que tem a trava de "só responde com o
 * que está escrito". Roteiro de uso é determinístico; norma é curadoria. As
 * duas coisas juntas no mesmo lugar seriam o jeito mais rápido de um "clique
 * aqui" virar uma afirmação sobre a LC 214.
 */

export interface Situacao {
  temEscritorio: boolean;
  empresas: number;
  analises: number;
  laudos: number;
  termos: number;
  assinados: number;
}

export type ChavePasso =
  | "escritorio"
  | "importar"
  | "analisar"
  | "laudo"
  | "termo"
  | "assinatura"
  | "pronto";

export interface Passo {
  chave: ChavePasso;
  /** o passo em uma frase, no imperativo */
  titulo: string;
  /** por que ele vem agora, e não outro */
  porque: string;
  /** o passo a passo literal, na ordem de clique */
  comoFazer: string[];
  rota: string;
  ctaRotulo: string;
}

const PASSOS: Record<ChavePasso, Passo> = {
  escritorio: {
    chave: "escritorio",
    titulo: "Identifique o seu escritório",
    porque:
      "É o nome, o CRC e o logo que vão na capa de todo laudo e termo. Sem isso o documento sai sem dono — e o entregável é seu, não meu.",
    comoFazer: [
      "Abra Configurações, no menu.",
      "Preencha o nome do escritório e o CRC.",
      "Suba o logo, se tiver. Dá para fazer depois.",
      "Salve. Leva menos de um minuto e vale para todos os documentos.",
    ],
    rota: "/painel/config",
    ctaRotulo: "Preencher o escritório",
  },

  importar: {
    chave: "importar",
    titulo: "Comece por UM cliente",
    porque:
      "Não precisa da carteira inteira agora, e não precisa preencher planilha nenhuma antes. Com um CNPJ você vê a triagem funcionando de ponta a ponta em dois minutos.",
    comoFazer: [
      "Abra Importar, no menu.",
      "Cole o CNPJ de um cliente do Simples. Só o número, sem mais nada.",
      "Clique em Ler CNPJs — eu busco razão social, CNAE e situação na Receita.",
      "Confirme. A empresa entra na sua carteira já triada por prioridade.",
      "Depois, quando quiser subir os outros, é o mesmo campo: cole todos os CNPJs de uma vez, ou suba um CSV com a coluna de CNPJ.",
    ],
    rota: "/painel/importar",
    ctaRotulo: "Adicionar o primeiro cliente",
  },

  analisar: {
    chave: "analisar",
    titulo: "Faça a primeira análise",
    porque:
      "A triagem só diz por quem começar. Quem decide se compensa optar é a análise — e ela precisa de duas ou três informações que só você tem.",
    comoFazer: [
      "No cockpit, clique na primeira empresa da fila. Ela já está no topo por prioridade.",
      "Responda as perguntas da aba Decisão. Cada uma explica por que está sendo feita.",
      "A mais importante é a RBT12: a receita bruta dos últimos 12 meses. Está no PGDAS ou no seu sistema contábil.",
      "Não sabe a RBT12 agora? Deixe em branco. O sistema usa a estimativa conservadora e marca isso no laudo.",
      "Salve. O motor devolve a recomendação com a memória de cálculo.",
    ],
    rota: "/painel",
    ctaRotulo: "Abrir a fila",
  },

  laudo: {
    chave: "laudo",
    titulo: "Emita o primeiro laudo",
    porque:
      "O laudo é o entregável — o documento que justifica o seu honorário e que fica como prova da recomendação, com data e memória de cálculo.",
    comoFazer: [
      "Abra a empresa que você já analisou.",
      "Confira as premissas na tela: elas vão impressas no documento.",
      "Clique em Emitir laudo.",
      "O PDF sai numerado e com o seu escritório na capa. Você pode baixar ou mandar direto ao cliente.",
    ],
    rota: "/painel",
    ctaRotulo: "Ver a empresa analisada",
  },

  termo: {
    chave: "termo",
    titulo: "Mande o termo de ciência",
    porque:
      "O laudo é a recomendação; o termo é a decisão do cliente, assinada por ele. É o que separa 'eu avisei' de 'ele decidiu' — e a única peça que te protege se a conta virar contra ele em 2027.",
    comoFazer: [
      "Na empresa com laudo emitido, clique em Gerar termo.",
      "Confira o nome e o e-mail do responsável (sem e-mail o termo não sai).",
      "Envie. O cliente recebe um link, lê e assina na tela dele.",
      "A assinatura volta para o dossiê com data, IP e o carimbo de tempo.",
    ],
    rota: "/painel",
    ctaRotulo: "Ir para a fila",
  },

  assinatura: {
    chave: "assinatura",
    titulo: "Cobre as assinaturas pendentes",
    porque:
      "Termo enviado e não assinado é trabalho feito que não fecha. E o prazo é 30 de setembro: quem não assinar até lá fica no DAS por omissão.",
    comoFazer: [
      "No cockpit, filtre pela etapa Aguardando assinatura.",
      "Reenvie o termo com um clique — o link continua o mesmo.",
      "Se preferir, copie o link e mande por WhatsApp: assina do celular.",
    ],
    rota: "/painel",
    ctaRotulo: "Ver quem falta assinar",
  },

  pronto: {
    chave: "pronto",
    titulo: "Sua carteira está em dia",
    porque:
      "Não há passo pendente agora. O que sobra é ampliar a carteira e acompanhar a aba Reforma — a regulamentação continua saindo.",
    comoFazer: [
      "Suba o resto da carteira, se ainda faltar alguém.",
      "Acompanhe a aba Reforma: o que muda a decisão aparece lá, com quantos clientes seus é atingido.",
    ],
    rota: "/painel",
    ctaRotulo: "Ir para o cockpit",
  },
};

/**
 * O PRÓXIMO PASSO, derivado do banco — nunca de um flag de onboarding.
 *
 * Flag salvo mente na primeira vez que alguém apaga a carteira, entra por
 * outro caminho ou volta em outro dispositivo. E mentir sobre "onde você está"
 * é pior do que não guiar: quem é guiado para o passo errado conclui que a
 * ferramenta não entende o trabalho dele.
 *
 * A ORDEM É A DO TRABALHO, não a do cadastro. Escritório vem antes de tudo
 * porque é o que assina o documento; a assinatura vem por último porque
 * depende de outra pessoa.
 */
export function proximoPasso(s: Situacao): Passo {
  if (s.empresas === 0) return PASSOS.importar;
  if (!s.temEscritorio) return PASSOS.escritorio;
  if (s.analises === 0) return PASSOS.analisar;
  if (s.laudos === 0) return PASSOS.laudo;
  if (s.termos === 0) return PASSOS.termo;
  if (s.assinados < s.termos) return PASSOS.assinatura;
  return PASSOS.pronto;
}

/**
 * IMPORTAR VEM ANTES DE CONFIGURAR — e isso é uma decisão, não um descuido.
 *
 * A ordem "cadastre o escritório, depois use" é a ordem do sistema. A ordem de
 * quem chega é "me mostra que isto funciona, aí eu preencho meus dados". Pedir
 * CRC e logo antes de a pessoa ver uma triagem acontecer é cobrar um
 * compromisso antes de entregar qualquer valor — e é onde se perde alguém que
 * nunca vai escrever para reclamar; só fecha a aba.
 *
 * O escritório volta a ser exigido no passo do laudo, que é quando ele passa a
 * fazer diferença de verdade: é a capa do documento.
 */

/* ==========================================================================
 * A DICA DA TELA — o que dizer para quem está PARADO aqui, agora.
 *
 * Diferente do próximo passo: aqui a pergunta não é "o que fazer depois",
 * é "você está nesta tela e provavelmente travou nisto".
 * ========================================================================== */

export interface Dica {
  /** identifica a dica para não repetir a mesma duas vezes na sessão */
  chave: string;
  titulo: string;
  texto: string;
  ctaRotulo?: string;
  ctaRota?: string;
}

export function dicaDaTela(rota: string, s: Situacao): Dica | null {
  const r = (rota || "").replace(/\/+$/, "") || "/painel";

  /* IMPORTAR — a tela da pergunta que veio por WhatsApp: "primeiro eu
     preencho aquela planilha?". A resposta é não, e ela precisa estar aqui. */
  if (r.startsWith("/painel/importar") && s.empresas === 0) {
    return {
      chave: "importar-vazio",
      titulo: "Não precisa de planilha para começar",
      texto:
        "Cole o CNPJ de um cliente do Simples — só o número — e clique em Ler CNPJs. Eu busco razão social, CNAE e situação na Receita. A planilha serve para subir a carteira inteira de uma vez, depois.",
      ctaRotulo: "Ver o passo a passo",
    };
  }

  /* COCKPIT com carteira e sem análise: a fila está montada e a pessoa não
     sabe que é para clicar na primeira linha. */
  if (r === "/painel" && s.empresas > 0 && s.analises === 0) {
    return {
      chave: "cockpit-sem-analise",
      titulo: `Comece pela primeira empresa da fila`,
      texto:
        "A ordem já é a de prioridade: quem está no topo é quem tem mais a ganhar (ou a perder) com a decisão. Clique na linha para abrir e responder as perguntas da análise.",
      ctaRotulo: "Como fazer a análise",
    };
  }

  /* Analisou e não emitiu: o laudo é o que vira honorário. */
  if (r === "/painel" && s.analises > 0 && s.laudos === 0) {
    return {
      chave: "cockpit-sem-laudo",
      titulo: "Falta emitir o laudo",
      texto:
        "A análise já está salva. O laudo é o documento que você entrega ao cliente — numerado, com a memória de cálculo e o seu escritório na capa.",
      ctaRotulo: "Como emitir o laudo",
    };
  }

  /* Laudo emitido e escritório em branco: agora o pedido faz sentido, porque
     o documento existe e vai sair sem nome. */
  if (s.laudos > 0 && !s.temEscritorio) {
    return {
      chave: "sem-escritorio",
      titulo: "Seu laudo está saindo sem o nome do escritório",
      texto:
        "Preencha nome e CRC em Configurações. É o que vai na capa de todo documento que você emitir daqui em diante.",
      ctaRotulo: "Preencher agora",
      ctaRota: "/painel/config",
    };
  }

  /* Curso: quem chega pelo curso costuma não saber que a ferramenta é
     separada — foi exatamente o caso do WhatsApp. */
  if (r.startsWith("/painel/curso") && s.empresas === 0) {
    return {
      chave: "curso-sem-carteira",
      titulo: "Dá para assistir e usar ao mesmo tempo",
      texto:
        "O curso explica a decisão; a ferramenta faz a conta. Se você já tem um cliente do Simples em mente, cole o CNPJ dele em Importar e acompanhe as aulas com um caso real na tela.",
      ctaRotulo: "Adicionar um cliente",
      ctaRota: "/painel/importar",
    };
  }

  return null;
}

/* ==========================================================================
 * AS RESPOSTAS FIXAS — o assistente sem IA.
 *
 * Pergunta de USO tem resposta certa e ela não muda: responder por modelo de
 * linguagem custa dinheiro, demora e abre espaço para variação onde não deve
 * existir nenhuma. Aqui a resposta é texto escrito, conferido, e sai
 * instantânea.
 *
 * O casamento é por palavra, de propósito simples: se errar, cai no caminho
 * normal (artigos + IA + chamado). Um roteiro que não casa é um incômodo; um
 * roteiro que casa errado é uma instrução errada.
 * ========================================================================== */

const norm = (s: string) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

interface Gatilho {
  chave: string;
  /** todas as palavras de pelo menos UM dos grupos precisam aparecer */
  grupos: string[][];
  responder: (s: Situacao) => string;
}

const passoEmTexto = (p: Passo) =>
  `${p.titulo}\n\n${p.porque}\n\n${p.comoFazer.map((l, i) => `${i + 1}. ${l}`).join("\n")}`;

/**
 * A ORDEM DESTA LISTA É A REGRA, e ela é do específico para o geral.
 *
 * Dois defeitos reais que a ordem conserta, os dois pegos no teste:
 *
 *   · "como funciona o termo" casava em "por onde começo" — que tinha um
 *     gatilho "como funciona", genérico demais. Um gatilho largo engole as
 *     perguntas dos outros e responde a coisa errada com confiança;
 *   · "o ISS continua no DAS até quando?" casava em "prazo", por causa de um
 *     gatilho "ate quando". Pergunta de NORMA virando roteiro de uso é o pior
 *     caso possível: o texto de roteiro não passa por curadoria técnica.
 *
 * Por isso "por onde começo" — o mais genérico de todos — fica por último.
 */
const GATILHOS: Gatilho[] = [
  {
    chave: "planilha",
    grupos: [["planilha"], ["csv"], ["excel"], ["modelo"]],
    responder: () =>
      "Não precisa de planilha para começar, e nenhuma planilha precisa ser preenchida antes.\n\n" +
      "1. Em Importar, cole o CNPJ de um cliente — só o número.\n" +
      "2. Clique em Ler CNPJs. Eu busco razão social, CNAE e situação cadastral na Receita.\n" +
      "3. Confirme, e a empresa entra na carteira já triada.\n\n" +
      "A planilha (CSV) existe para o outro momento: subir a carteira inteira de uma vez. Basta uma coluna com o CNPJ; razão social e CNAE deixam a triagem mais precisa, mas são opcionais.\n\n" +
      "A faixa de prioridade não é você que preenche — ela é calculada aqui, a partir do CNAE e do porte.",
  },
  {
    chave: "rbt12",
    grupos: [["rbt12"], ["rbt 12"], ["receita bruta"], ["faturamento", "12"]],
    responder: () =>
      "RBT12 é a receita bruta dos últimos 12 meses da empresa — a mesma base que define a faixa no PGDAS.\n\n" +
      "Onde encontrar: no PGDAS-D da última apuração, ou no relatório de faturamento do seu sistema contábil.\n\n" +
      "Não tem o número agora? Deixe em branco e siga. O sistema usa a estimativa conservadora da 1ª faixa e o laudo registra que a premissa foi estimada — depois é só reabrir a empresa, informar o valor e salvar de novo. A recomendação se recalcula.",
  },
  {
    chave: "cnae-dados",
    grupos: [["cnae"], ["dados da empresa"], ["razao social"], ["receita federal"]],
    responder: () =>
      "Você não precisa digitar esses dados. A partir do CNPJ eu busco na Receita: razão social, CNAE principal e secundários, porte e situação cadastral.\n\n" +
      "Se algum vier errado ou desatualizado, dá para corrigir na própria empresa, na aba de dados — o que você digitar prevalece sobre o que veio da Receita.",
  },
  {
    chave: "quantos-clientes",
    grupos: [["quantos clientes"], ["quantas empresas"], ["carteira inteira"], ["todos os clientes"]],
    responder: (s) =>
      (s.empresas > 0
        ? `Você tem ${s.empresas} ${s.empresas === 1 ? "empresa" : "empresas"} na carteira agora.\n\n`
        : "") +
      "Não existe limite para importar: suba a carteira inteira quando quiser. O que tem limite é a emissão de laudo no plano gratuito — e o aviso aparece na hora, sem surpresa.\n\n" +
      "Sugestão de ordem: comece por uma para ver o fluxo inteiro, depois cole todos os CNPJs de uma vez.",
  },
  {
    chave: "laudo-o-que-e",
    grupos: [["o que e o laudo"], ["para que serve o laudo"], ["laudo", "cliente"]],
    responder: () =>
      "O laudo é o documento que você entrega ao cliente: traz a recomendação, as premissas usadas e a memória de cálculo, numerado e com o seu escritório na capa.\n\n" +
      "Ele é o que justifica o honorário — e o que registra, com data, o que se sabia quando a decisão foi tomada.\n\n" +
      "Depois dele vem o termo de ciência, que é a decisão assinada pelo cliente. O laudo é a sua recomendação; o termo é a escolha dele.",
  },
  {
    chave: "termo",
    grupos: [["termo"], ["assinatura"], ["assinar"]],
    responder: () =>
      "O termo de ciência é a decisão do cliente, assinada por ele — é o que separa 'eu avisei' de 'ele decidiu'.\n\n" +
      "1. Na empresa com laudo emitido, clique em Gerar termo.\n" +
      "2. Confira nome e e-mail do responsável (sem e-mail ele não sai).\n" +
      "3. Envie. O cliente abre um link, lê e assina na tela dele — funciona no celular.\n" +
      "4. A assinatura volta para o dossiê com data, IP e carimbo de tempo.",
  },
  {
    chave: "prazo",
    grupos: [["prazo"], ["30 de setembro"], ["data limite"], ["ate quando posso"]],
    responder: () =>
      "O prazo para optar por apurar IBS e CBS pelo regime regular é 30 de setembro de 2026, com efeito de janeiro a junho de 2027.\n\n" +
      "Quem não decidir fica no DAS por omissão — a escolha não feita também é uma escolha. Por isso o cockpit ordena a fila por prioridade: dá para começar por quem tem mais em jogo.",
  },
  {
    chave: "curso",
    grupos: [["curso"], ["aula"], ["treinamento"]],
    responder: () =>
      "O curso está no menu, em Curso — as aulas explicam a decisão e o método; a ferramenta faz a conta.\n\n" +
      "Não precisa terminar o curso para usar. O caminho mais rápido é o contrário: cadastre um cliente real, faça a primeira análise e assista às aulas com o caso na tela.",
  },
  {
    /* POR ÚLTIMO, sempre: é o gatilho mais largo da lista. Qualquer pergunta
       mais específica precisa ter a chance de casar antes dele. */
    chave: "por-onde-comeco",
    grupos: [
      ["por onde"], ["comeco"], ["comecar"], ["primeiro passo"],
      ["perdida"], ["perdido"], ["nao sei o que fazer"],
    ],
    responder: (s) => {
      const p = proximoPasso(s);
      return (
        `Sem problema — o caminho inteiro tem quatro paradas: cadastrar um cliente, analisar, emitir o laudo e colher a assinatura do termo.\n\n` +
        `No seu caso, o próximo é este:\n\n${passoEmTexto(p)}`
      );
    },
  },
];

/**
 * Devolve a resposta pronta quando a pergunta é de USO, ou `null` quando não
 * é. `null` não é falha: é "isto não é comigo", e quem chama segue para os
 * artigos e para a IA.
 */
export function respostaLocal(pergunta: string, s: Situacao): { chave: string; texto: string } | null {
  const q = norm(pergunta);
  if (q.length < 3) return null;

  for (const g of GATILHOS) {
    for (const grupo of g.grupos) {
      if (grupo.every((palavra) => q.includes(norm(palavra)))) {
        return { chave: g.chave, texto: g.responder(s) };
      }
    }
  }
  return null;
}

/** as três perguntas que fazem sentido oferecer AGORA, pelo estado da conta */
export function sugestoes(s: Situacao): string[] {
  if (s.empresas === 0) {
    return ["Por onde eu começo?", "Preciso preencher a planilha antes?", "Como o sistema pega os dados da empresa?"];
  }
  if (s.analises === 0) {
    return ["Por onde eu começo?", "O que é a RBT12 e onde eu acho?", "Quantos clientes posso importar?"];
  }
  if (s.laudos === 0) {
    return ["Para que serve o laudo?", "O que é a RBT12 e onde eu acho?", "Qual é o prazo mesmo?"];
  }
  if (s.assinados < s.termos || s.termos === 0) {
    return ["Como funciona o termo de assinatura?", "Qual é o prazo mesmo?", "Por onde eu começo?"];
  }
  return ["Qual é o prazo mesmo?", "Como funciona o termo de assinatura?", "Quantos clientes posso importar?"];
}

export { PASSOS, passoEmTexto };
