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
