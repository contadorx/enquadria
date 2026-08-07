/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ENTREGA GARANTIDA — confirmação em vez de aceite.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O DEFEITO QUE ESTE ARQUIVO CORRIGE, e ele estava documentado no próprio
 * código sem que a consequência tivesse sido tirada:
 *
 *   `lib/mailer/postal.ts` avisa que "success" significa que o Postal ACEITOU
 *   a mensagem na fila dele, não que o destino recebeu.
 *
 * E `lib/email.ts` cai para a Brevo quando o Postal RECUSA. Ou seja: a queda
 * cobre o Postal estar fora do ar — e NÃO cobre o Postal aceitar e não
 * conseguir entregar. Que é exatamente o que acontece quando o provedor da VPS
 * bloqueia a porta 25: a API responde "success", o app registra sucesso, e a
 * mensagem apodrece na fila. O termo de ciência não chega ao cliente do
 * contador e ninguém fica sabendo.
 *
 * Falha silenciosa em e-mail transacional é a pior classe de defeito que
 * existe neste produto: não quebra nada, não aparece em log de erro, e o
 * prejuízo é um documento jurídico que o cliente jurou ter recebido.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * A ARQUITETURA, em quatro peças:
 *
 *  1. REGISTRO. Toda mensagem que sai vira uma linha em `emails_saida`, com
 *     chave idempotente. Sem registro não há como saber o que não chegou.
 *
 *  2. CONFIRMAÇÃO ASSÍNCRONA. O webhook do provedor marca a linha como
 *     entregue. O que fica "aceito" além da janela é considerado PERDIDO.
 *
 *  3. REENVIO. Perdido pelo Postal é reenviado pela Brevo — e só o perdido.
 *     Bounce NÃO se reenvia: endereço que não existe pela Postal também não
 *     existe pela Brevo, e insistir queima o segundo caminho também.
 *
 *  4. DISJUNTOR. Se a taxa de perda passa do limite, o caminho de TODOS vira
 *     Brevo até alguém religar ou uma sonda confirmar que o Postal voltou.
 *     Sem isso, cada mensagem é descoberta perdida uma a uma, com 20 minutos
 *     de atraso cada.
 *
 * Este arquivo é só decisão — puro, testado, sem banco e sem rede. Quem grava
 * é a rota; quem varre é o cron.
 */

export type Caminho = "postal" | "brevo" | "nenhum";

/** o ciclo de vida de uma mensagem, e nada além disso */
export type StatusSaida =
  /** o provedor aceitou; ainda não há confirmação de entrega */
  | "aceito"
  /** o provedor confirmou a entrega — fim de linha feliz */
  | "entregue"
  /** o destino recusou (caixa inexistente, bloqueio): NÃO se reenvia */
  | "falhou"
  /** aceito e sem notícia além da janela: candidato a reenvio */
  | "perdido"
  /** foi reenviado por outro caminho; a linha nova é que vale */
  | "reenviado";

export interface LinhaSaida {
  id: string;
  chave: string;
  para: string;
  tag: string;
  caminho: Caminho;
  status: StatusSaida;
  mensagem_id: string | null;
  criado_em: string;
  confirmado_em: string | null;
  tentativas: number;
}

/* ══════════════════════════ 1 · A IDEMPOTÊNCIA ═══════════════════════════ */

/**
 * A CHAVE que impede o mesmo documento de sair duas vezes.
 *
 * Reenvio automático sem idempotência é como um cliente recebe seis vezes o
 * mesmo termo de ciência — e desconfia dos seis. A chave é (tag, destinatário,
 * referência): a referência é o id do documento quando existe, e é isso que
 * distingue "o segundo laudo desta empresa" de "o mesmo laudo de novo".
 */
export function chaveSaida(tag: string, para: string, referencia?: string | null): string {
  const ref = (referencia ?? "").trim() || "sem-ref";
  return `${tag}:${para.trim().toLowerCase()}:${ref}`;
}

/* ═══════════════════════ 2 · A JANELA DE CONFIRMAÇÃO ═════════════════════ */

/**
 * QUANTO ESPERAR ANTES DE CONSIDERAR PERDIDA.
 *
 * Curto demais gera reenvio de mensagem que só estava na fila — o cliente
 * recebe duas. Longo demais é o mesmo que não ter proteção: o contador liga
 * perguntando do termo antes de o sistema perceber.
 *
 * 20 minutos é o meio: entrega normal do Postal acontece em segundos, e
 * fila represada por greylisting do destino raramente passa de 15.
 */
export const JANELA_CONFIRMACAO_MIN = 20;

/** Quantas vezes tentar, no total, antes de desistir e gritar. */
export const TENTATIVAS_MAX = 2;

export function estaPerdida(
  linha: Pick<LinhaSaida, "status" | "criado_em" | "caminho">,
  agora: Date,
  janelaMin = JANELA_CONFIRMACAO_MIN
): boolean {
  if (linha.status !== "aceito") return false;
  /* só o caminho próprio precisa de vigilância: a Brevo não tem fila nossa
     para represar, e se ela recusar isso vem síncrono */
  if (linha.caminho !== "postal") return false;
  const idadeMin = (agora.getTime() - new Date(linha.criado_em).getTime()) / 60000;
  return idadeMin >= janelaMin;
}

/**
 * O QUE FAZER COM UMA LINHA — a decisão inteira, num lugar só.
 *
 * Devolver "nada" é resultado legítimo e o mais comum: mensagem entregue,
 * mensagem recente, mensagem que já falhou por bounce.
 */
export type Acao = "nada" | "reenviar" | "desistir";

export function acaoPara(
  linha: Pick<LinhaSaida, "status" | "criado_em" | "caminho" | "tentativas">,
  agora: Date,
  janelaMin = JANELA_CONFIRMACAO_MIN
): Acao {
  if (!estaPerdida(linha, agora, janelaMin)) return "nada";
  /* esgotou as tentativas: parar de tentar e deixar visível. Reenviar em laço
     transforma um problema de entrega num problema de reputação. */
  if (linha.tentativas >= TENTATIVAS_MAX) return "desistir";
  return "reenviar";
}

/* ════════════════ 2b · A TRAVA CONTRA A CONCLUSÃO FALSA ══════════════════
 *
 * O RETORNO SILENCIOSO QUE ESTA ARQUITETURA CRIOU — e que quase passou.
 *
 * Toda a garantia depende do webhook confirmar entrega. Se o webhook não
 * estiver ligado (segredo ausente no ambiente, URL não cadastrada no painel do
 * provedor, endpoint mudado), NENHUMA confirmação chega. E aí a leitura do
 * sistema fica assim, toda ela plausível e toda ela errada:
 *
 *   · nenhuma mensagem confirma → todas viram "perdidas" aos 20 minutos;
 *   · a varredura reenvia a base inteira pela Brevo, a cada 15 minutos;
 *   · a taxa de perda dá 100% → o disjuntor abre e desliga o envio próprio.
 *
 * Ou seja: um webhook desconfigurado derrubaria o servidor que está
 * funcionando perfeitamente, duplicaria todo e-mail enviado e queimaria a cota
 * da Brevo — sem uma linha de erro em lugar nenhum. O remédio matando o
 * paciente, em silêncio.
 *
 * A trava é simples e não tem exceção: **sem NENHUMA confirmação registrada,
 * não se conclui perda de ninguém.** Ausência total de sinal é falta de
 * instrumento, não evidência de falha. */

export interface Instrumento {
  /** houve ao menos uma confirmação de entrega na janela observada? */
  temConfirmacoes: boolean;
  /** quantas mensagens saíram na janela — para distinguir "silêncio" de "vazio" */
  totalObservado: number;
}

export function instrumentoConfiavel(i: Instrumento): boolean {
  /* base vazia é um caso legítimo e diferente: não há o que concluir, e também
     não há o que reenviar. Confiável por vacuidade. */
  if (i.totalObservado === 0) return true;
  return i.temConfirmacoes;
}

export const AVISO_SEM_INSTRUMENTO =
  "Nenhuma confirmação de entrega foi registrada na janela. Isso quase sempre significa " +
  "webhook desconfigurado, não mensagem perdida — e por isso nada foi reenviado e o " +
  "disjuntor não se mexeu. Confira EMAIL_WEBHOOK_SEGREDO e a URL cadastrada no provedor.";

/* ══════════════════════ 2c · O QUE SE GUARDA DO CORPO ════════════════════
 *
 * Para reenviar o DOCUMENTO (e não um aviso dizendo que existe um documento),
 * é preciso guardar o HTML. Isso é dado de cliente parado no banco, então tem
 * regra:
 *
 *  1. Guarda só o que pode precisar de reenvio — o caminho próprio. Mensagem
 *     da Brevo resolve síncrono e nunca entra na fila de vigilância.
 *  2. APAGA na confirmação. O corpo existe exatamente enquanto pode ser útil;
 *     confirmada a entrega, a linha continua (auditoria) e o conteúdo some.
 *  3. Some por idade de qualquer jeito, mesmo sem confirmação — senão um
 *     webhook quebrado viraria um arquivo permanente de dados de terceiros. */

export function deveGuardarCorpo(caminho: Caminho): boolean {
  return caminho === "postal";
}

/** Dias após os quais o corpo é apagado mesmo sem confirmação. */
export const DIAS_ATE_APAGAR_CORPO = 7;

export function corpoExpirado(criadoEm: string, agora: Date, dias = DIAS_ATE_APAGAR_CORPO): boolean {
  const d = (agora.getTime() - new Date(criadoEm).getTime()) / 86_400_000;
  return d >= dias;
}

/* ═══════════════════════════ 3 · O DISJUNTOR ═════════════════════════════ */

export type EstadoDisjuntor = "fechado" | "aberto";

export interface Disjuntor {
  /** fechado = Postal na frente; aberto = tudo pela Brevo */
  estado: EstadoDisjuntor;
  motivo: string | null;
  desde: string | null;
}

/** Abaixo disto não se conclui nada: três mensagens não fazem uma taxa. */
export const AMOSTRA_MINIMA = 5;
/** Perda acima disto na janela recente abre o disjuntor. */
export const LIMITE_PERDA = 0.4;
/** Depois disto, vale sondar se o Postal voltou. */
export const HORAS_ATE_SONDAR = 6;

export interface Amostra {
  /** mensagens pelo Postal na janela recente */
  total: number;
  /** quantas dessas não confirmaram entrega dentro da janela */
  perdidas: number;
}

/**
 * A DECISÃO DE ABRIR OU FECHAR, a partir do que se observou.
 *
 * Só ABRE por evidência. Só FECHA por evidência — nunca por tempo. Disjuntor
 * que fecha sozinho no relógio volta a mandar tudo por um caminho quebrado e
 * refaz o estrago em silêncio; o que a passagem do tempo autoriza é SONDAR,
 * que é outra coisa (ver `deveSondar`).
 */
export function avaliarDisjuntor(atual: Disjuntor, a: Amostra, agoraISO: string): Disjuntor {
  if (a.total < AMOSTRA_MINIMA) return atual;

  const taxa = a.perdidas / a.total;

  if (atual.estado === "fechado" && taxa >= LIMITE_PERDA) {
    return {
      estado: "aberto",
      motivo: `${a.perdidas} de ${a.total} mensagens não confirmaram entrega (${Math.round(taxa * 100)}%)`,
      desde: agoraISO,
    };
  }

  /* fecha só com prova do contrário: nenhuma perda na amostra recente */
  if (atual.estado === "aberto" && a.perdidas === 0) {
    return {
      estado: "fechado",
      motivo: `${a.total} mensagens seguidas confirmaram entrega`,
      desde: agoraISO,
    };
  }

  return atual;
}

/**
 * Passou tempo suficiente para arriscar UMA mensagem pelo Postal e ver se
 * volta? A sonda é o único jeito honesto de fechar o disjuntor: sem tráfego
 * pelo caminho suspeito, nunca haverá amostra para provar que ele voltou.
 */
export function deveSondar(d: Disjuntor, agora: Date, horas = HORAS_ATE_SONDAR): boolean {
  if (d.estado !== "aberto" || !d.desde) return false;
  const h = (agora.getTime() - new Date(d.desde).getTime()) / 3_600_000;
  return h >= horas;
}

/**
 * POR ONDE ESTA MENSAGEM SAI — a única função que o envio precisa chamar.
 *
 * `postalDisponivel` é configuração (as variáveis existem?); o disjuntor é
 * observação (ele está entregando?). As duas coisas precisam ser verdadeiras.
 */
export function caminhoDeSaida(
  postalDisponivel: boolean,
  brevoDisponivel: boolean,
  d: Disjuntor
): Caminho {
  if (postalDisponivel && d.estado === "fechado") return "postal";
  if (brevoDisponivel) return "brevo";
  /* sem Brevo configurada, o Postal aberto ainda é melhor que não mandar:
     mensagem na fila de um servidor com problema tem alguma chance; mensagem
     não enviada tem zero. */
  if (postalDisponivel) return "postal";
  return "nenhum";
}

/* ═════════════════════════ 4 · A LEITURA HUMANA ══════════════════════════ */

export interface ResumoSaida {
  total: number;
  entregues: number;
  aceitos: number;
  perdidos: number;
  falhas: number;
  reenviados: number;
  /** % de entrega confirmada; null sem base — nunca 0% por falta de dado */
  taxaEntrega: number | null;
  leitura: string;
}

export function resumirSaida(linhas: LinhaSaida[], d: Disjuntor): ResumoSaida {
  const conta = (s: StatusSaida) => linhas.filter((l) => l.status === s).length;
  const total = linhas.length;
  const entregues = conta("entregue");
  const perdidos = conta("perdido");
  const falhas = conta("falhou");
  const reenviados = conta("reenviado");
  const aceitos = conta("aceito");

  /* o denominador exclui o que ainda está em trânsito: contar "aceito há dois
     minutos" como não-entregue faria a taxa despencar toda vez que alguém
     abrisse a tela logo depois de um envio */
  const decididos = entregues + perdidos + falhas;
  const taxaEntrega = decididos === 0 ? null : Math.round((entregues / decididos) * 100);

  let leitura: string;
  if (d.estado === "aberto") {
    leitura =
      `O envio próprio está DESLIGADO automaticamente e tudo sai pela Brevo. Motivo: ${d.motivo ?? "não registrado"}. ` +
      "Nada foi perdido — o desvio existe para isso —, mas enquanto estiver assim você não tem log por mensagem nem controle de bounce.";
  } else if (total === 0) {
    leitura = "Nenhuma mensagem no período.";
  } else if (perdidos > 0) {
    leitura =
      `${perdidos} ${perdidos === 1 ? "mensagem não confirmou" : "mensagens não confirmaram"} entrega na janela e ` +
      `${reenviados > 0 ? `${reenviados} já ${reenviados === 1 ? "foi reenviada" : "foram reenviadas"} pela Brevo` : "estão na fila de reenvio"}. ` +
      "Se isso repetir, o disjuntor abre sozinho.";
  } else {
    leitura = `${entregues} de ${decididos} mensagens confirmaram entrega. Envio próprio saudável.`;
  }

  return { total, entregues, aceitos, perdidos, falhas, reenviados, taxaEntrega, leitura };
}

/* ═══════════════════ 5 · O MONITOR — o que a tela mostra ════════════════════
 *
 * A trava do instrumento (2b) impede o sistema de fazer besteira quando o
 * webhook cai. Ela NÃO devolve a proteção: enquanto o webhook estiver mudo,
 * mensagem pode se perder sem ninguém saber — exatamente como antes de tudo
 * isto existir.
 *
 * Por isso o estado cego precisa DOER. O aviso vivia no JSON de retorno do
 * cron e no log da Vercel, dois lugares onde ninguém passa; aqui ele vira o
 * que a tela de Negócio → E-mails mostra em vermelho.
 *
 * E existe um quarto silêncio que só esta função enxerga: **o cron parar de
 * rodar.** Se ele morrer, nada muda em lugar nenhum — não há erro, não há
 * estado novo, a ausência é o próprio sintoma. Só a DATA da última varredura
 * denuncia, e é por isso que ela entra na conta.
 */

export type NivelMonitor = "ok" | "atencao" | "critico";

export interface EstadoVarredura {
  em: string | null;
  cega: boolean;
  aviso: string | null;
}

export interface Monitor {
  nivel: NivelMonitor;
  titulo: string;
  detalhe: string;
  /** o que fazer agora — vazio quando não há nada a fazer */
  acao: string | null;
}

/** A varredura roda de 15 em 15; três ciclos sem notícia é cron parado. */
export const MINUTOS_ATE_SUSPEITAR_DO_CRON = 45;

export function monitorar(
  v: EstadoVarredura,
  d: Disjuntor,
  agora: Date,
  minutosLimite = MINUTOS_ATE_SUSPEITAR_DO_CRON
): Monitor {
  /* NUNCA RODOU. Estado legítimo logo depois de subir — e que vira problema se
     ficar assim. Não é crítico porque ainda não há promessa quebrada. */
  if (!v.em) {
    return {
      nivel: "atencao",
      titulo: "A varredura de entrega ainda não rodou",
      detalhe:
        "Enquanto ela não rodar, mensagem que o servidor próprio aceitar e não entregar não será detectada nem reenviada.",
      acao: "Confira se o cron /api/cron/email está agendado e se CRON_SECRET está no ambiente.",
    };
  }

  const minutos = (agora.getTime() - new Date(v.em).getTime()) / 60000;

  /* CRON PARADO — o silêncio que nenhuma outra coluna denuncia. Vem antes da
     cegueira porque, se o cron morreu, o dado de cegueira também está velho e
     não se pode confiar nele. */
  if (minutos >= minutosLimite) {
    const horas = Math.floor(minutos / 60);
    return {
      nivel: "critico",
      titulo: `A varredura não roda há ${horas >= 1 ? `${horas}h` : `${Math.round(minutos)} min`}`,
      detalhe:
        "Ela deveria rodar a cada 15 minutos. Parada, nada é reenviado e o disjuntor não muda de estado — a proteção de entrega está fora do ar.",
      acao: "Verifique o cron /api/cron/email na Vercel e o CRON_SECRET.",
    };
  }

  /* CEGA — a trava agiu. O sistema está intacto e desprotegido ao mesmo tempo,
     e essa combinação é a que mais precisa aparecer. */
  if (v.cega) {
    return {
      nivel: "critico",
      titulo: "A varredura está cega — nenhuma entrega foi confirmada",
      /* o texto NÃO reaproveita `v.aviso`: ele termina justamente com a
         instrução que vai no campo "o que fazer", e repetir a mesma frase duas
         vezes na mesma caixa faz o leitor parar de ler as duas */
      detalhe:
        "Nenhuma mensagem confirmou entrega na janela — o que quase sempre significa webhook desconfigurado, e não base perdida. " +
        "Nada foi reenviado e o disjuntor não se mexeu, de propósito: concluir perda sem nenhuma confirmação reenviaria a base inteira e desligaria um servidor que pode estar são. " +
        "Enquanto estiver assim, porém, a proteção de entrega não existe — mensagem pode se perder sem ninguém saber.",
      acao: "Confira EMAIL_WEBHOOK_SEGREDO e a URL do webhook cadastrada no provedor.",
    };
  }

  /* DESVIADO — funcionando, no plano B. Não é falha: é a proteção agindo. */
  if (d.estado === "aberto") {
    return {
      nivel: "atencao",
      titulo: "O envio próprio está desligado — tudo sai pela Brevo",
      detalhe: `${d.motivo ?? "sem motivo registrado"}. As mensagens estão sendo entregues; o que se perde enquanto isso é o log por mensagem e o controle de bounce do servidor próprio.`,
      acao: "O disjuntor fecha sozinho quando as entregas pelo servidor próprio voltarem a confirmar.",
    };
  }

  return {
    nivel: "ok",
    titulo: "Entrega monitorada",
    detalhe: `Última varredura há ${Math.round(minutos)} min. O que o servidor próprio aceitar e não entregar em ${JANELA_CONFIRMACAO_MIN} minutos é reenviado pela Brevo automaticamente.`,
    acao: null,
  };
}
