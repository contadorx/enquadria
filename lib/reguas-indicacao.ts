/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A CADÊNCIA DE RECUPERAÇÃO DOS INDICADOS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Um contador indica um colega. O colega recebe UM convite e não entra. Hoje
 * essa indicação morre ali: fica `status = 'convidado'` no banco para sempre, e
 * ninguém volta. É o lead mais barato e mais quente que o produto tem — veio
 * de alguém em quem a pessoa confia — e é o que menos recebe atenção.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * O QUE TORNA ISTO DIFERENTE DA RÉGUA DE COBRANÇA, e o que exige cuidado:
 *
 * O indicado NÃO É CLIENTE. Ele nunca pediu e-mail nosso. Recebeu um convite
 * porque um colega digitou o e-mail dele num formulário. Isso é legítimo e é
 * também o limite: uma sequência longa para quem nunca optou por nada deixa de
 * ser recuperação e vira spam — com o agravante de queimar a reputação do
 * remetente, que é o ativo que faz a régua de cobrança funcionar.
 *
 * As quatro travas, todas obrigatórias e testadas:
 *
 *   1. TETO DURO de 3 e-mails por indicação, para sempre. Não é "3 por mês".
 *   2. QUALQUER sinal negativo encerra: bounce, spam, recusa, descadastro.
 *   3. Cada e-mail NOMEIA quem indicou. Sem isso é e-mail frio de origem
 *      desconhecida, e a pessoa tem razão em marcar como spam.
 *   4. Quem já virou usuário SAI, mesmo que o status no banco diga o contrário
 *      — ver `reconciliar()`. Mandar "venha conhecer" para quem já é cliente é
 *      o erro que custa a relação com quem indicou, não só com o indicado.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * POR QUE UM PLANEJADOR PRÓPRIO E NÃO A `planejar()` DE SEMPRE: a régua existente
 * percorre ESCRITÓRIOS. Um indicado não é escritório — não tem tenant, plano,
 * vencimento nem carteira. Forçá-lo no mesmo laço exigiria campos falsos, e
 * campo falso vira número falso no painel. O formato de saída é o mesmo
 * (`Envio`), então o cron, o dedupe e o registro em `plataforma_envios` são os
 * mesmos.
 */
import { aplicar, type Envio, type Regra } from "./reguas";

/** o teto é da INDICAÇÃO inteira, não da janela. Ver trava 1. */
export const TETO_POR_INDICACAO = 3;

export interface Indicacao {
  id: string;
  /** quem indicou — o escritório */
  tenant_id: string | null;
  indicador_nome: string | null;
  nome: string;
  email: string;
  status: "convidado" | "cadastrou" | "cliente" | "recusou" | string;
  convite_em: string;
  cadastrou_em: string | null;
  virou_cliente_em: string | null;
  /**
   * true quando `cadastrou_em` foi ESTIMADO pela reconciliação, e não medido.
   * Ver `reconciliar()`: quando descobrimos por fora que a pessoa já é usuário,
   * não sabemos QUANDO ela se cadastrou — só que já está lá.
   */
  cadastro_estimado?: boolean;
}

export interface ContextoIndicacao {
  indicacoes: Indicacao[];
  regras: Regra[];
  /** chaves já enviadas (plataforma_envios.chave_unica) */
  jaEnviados: Set<string>;
  /** e-mails que já existem como usuário — a reconciliação da trava 4 */
  emailsDeUsuarios: Set<string>;
  /** e-mails que bateram, marcaram spam ou pediram para sair */
  emailsQueimados: Set<string>;
  /** falha ao carregar: nunca pode virar "nada a fazer" */
  erro?: string;
  hoje: Date;
}

const DIA = 86_400_000;
const dias = (de: string, ate: Date) =>
  Math.floor((ate.getTime() - new Date(de).getTime()) / DIA);

/**
 * OS DEGRAUS. Três, e o terceiro se despede.
 *
 * O intervalo cresce (3 · 10 · 21) porque insistir em ritmo fixo é o que faz a
 * pessoa marcar como spam. E o último e-mail diz que é o último: quem não
 * responde a três não responde a dez, e avisar que a régua acabou é a diferença
 * entre "parou de me incomodar" e "sumiu".
 */
export const DEGRAUS_INDICACAO = [
  { chave: "indicacao_d3", dias: 3, nome: "Indicado sem cadastro · 3 dias" },
  { chave: "indicacao_d10", dias: 10, nome: "Indicado sem cadastro · 10 dias" },
  { chave: "indicacao_d21", dias: 21, nome: "Indicado sem cadastro · último toque" },
] as const;

/** o degrau para quem se cadastrou e parou antes de usar */
export const DEGRAU_PAROU = {
  chave: "indicacao_cadastrou_parado",
  dias: 7,
  nome: "Indicado cadastrou e parou · 7 dias",
} as const;

/**
 * RECONCILIA O STATUS ANTES DE PLANEJAR.
 *
 * O status é escrito por um webhook e por um gatilho de cadastro; qualquer um
 * dos dois pode falhar em silêncio, e aí o banco continua dizendo "convidado"
 * para alguém que já é usuário. O e-mail sairia dizendo "venha conhecer" para
 * quem paga — e o estrago não é com o indicado, é com quem indicou.
 *
 * Aqui a verdade é a existência do usuário, não o campo.
 */
export function reconciliar(i: Indicacao, emailsDeUsuarios: Set<string>, agora = new Date()): Indicacao {
  const email = i.email.trim().toLowerCase();
  if (i.status === "convidado" && emailsDeUsuarios.has(email)) {
    /**
     * O RELÓGIO COMEÇA AGORA, e é deliberado.
     *
     * Descobrimos que a pessoa é usuária; NÃO sabemos desde quando. Usar a data
     * do convite mandaria na mesma hora um "você criou a conta e parou" para
     * quem talvez tenha se cadastrado ontem — que é pior do que esperar uma
     * semana. Marcamos a estimativa como estimativa e contamos a partir de
     * hoje: o custo é uma semana de atraso; o custo do contrário é um e-mail
     * errado para quem acabou de chegar.
     */
    return {
      ...i,
      status: "cadastrou",
      cadastrou_em: i.cadastrou_em ?? agora.toISOString(),
      cadastro_estimado: i.cadastrou_em == null,
    };
  }
  return i;
}

export interface MotivoParada {
  id: string;
  email: string;
  motivo: string;
}

export interface PlanoIndicacao {
  envios: Envio[];
  /** quem NÃO recebe, e por quê — a lista que explica o número pequeno */
  parados: MotivoParada[];
}

/**
 * O PLANO. Devolve o que sai e, tão importante quanto, o que NÃO sai com o
 * motivo — um planejador que só devolve a fila deixa quem lê concluir que o
 * resto simplesmente não existe.
 */
export function planejarIndicacoes(ctx: ContextoIndicacao): PlanoIndicacao {
  const envios: Envio[] = [];
  const parados: MotivoParada[] = [];

  /* fonte quebrada NÃO é fila vazia. Sem isto, um erro de leitura devolveria
     zero envios e zero motivos — indistinguível de um dia sem nada a fazer. */
  if (ctx.erro) return { envios, parados: [{ id: "-", email: "-", motivo: `fonte indisponível: ${ctx.erro}` }] };

  const regraDe = new Map(ctx.regras.filter((r) => r.ativa).map((r) => [r.chave, r]));

  for (const bruta of ctx.indicacoes) {
    const i = reconciliar(bruta, ctx.emailsDeUsuarios, ctx.hoje);
    const email = i.email.trim().toLowerCase();
    const parar = (motivo: string) => parados.push({ id: i.id, email, motivo });

    if (i.status === "cliente" || i.virou_cliente_em) { parar("já virou cliente"); continue; }
    if (i.status === "recusou") { parar("recusou o convite"); continue; }
    if (ctx.emailsQueimados.has(email)) { parar("e-mail queimado (bounce, spam ou descadastro)"); continue; }
    if (!email.includes("@")) { parar("e-mail inválido"); continue; }

    /* TETO DURO — da indicação inteira, não da janela */
    const jaMandados = [...DEGRAUS_INDICACAO.map((d) => d.chave), DEGRAU_PAROU.chave].filter((c) =>
      ctx.jaEnviados.has(`${c}:${i.id}`)
    ).length;
    if (jaMandados >= TETO_POR_INDICACAO) { parar(`teto de ${TETO_POR_INDICACAO} e-mails atingido`); continue; }

    const degrau =
      i.status === "cadastrou"
        ? (() => {
            const d = dias(i.cadastrou_em ?? i.convite_em, ctx.hoje);
            return d >= DEGRAU_PAROU.dias ? DEGRAU_PAROU : null;
          })()
        : (() => {
            const d = dias(i.convite_em, ctx.hoje);
            /**
             * DE TRÁS PARA A FRENTE, e isto não é estilo.
             *
             * Uma indicação de 40 dias que nunca recebeu nada precisa entrar no
             * ÚLTIMO degrau, não no primeiro. Percorrendo do menor para o maior,
             * ela receberia o "faz 3 dias que você foi indicado" quarenta dias
             * depois — e depois os outros dois, um por dia, porque todos já
             * teriam vencido. Três e-mails em três dias para quem nunca pediu
             * nada é exatamente como se queima um domínio.
             */
            for (let k = DEGRAUS_INDICACAO.length - 1; k >= 0; k--) {
              const g = DEGRAUS_INDICACAO[k];
              if (d >= g.dias && !ctx.jaEnviados.has(`${g.chave}:${i.id}`)) return g;
            }
            return null;
          })();

    if (!degrau) { parar("ainda não venceu o prazo do próximo degrau"); continue; }

    const regra = regraDe.get(degrau.chave);
    if (!regra) { parar(`o texto da regra ${degrau.chave} não está cadastrado ou está inativo`); continue; }

    const vars = {
      nome: (i.nome || "").trim().split(/\s+/)[0] || "",
      /* QUEM INDICOU vai no corpo. Sem isso o e-mail é frio de origem
         desconhecida, e marcar como spam passa a ser a reação correta. */
      indicador: i.indicador_nome ?? "um colega",
      dias: dias(i.convite_em, ctx.hoje),
    };

    envios.push({
      regra: degrau.chave,
      nome_regra: regra.nome || degrau.nome,
      categoria: "indicacao",
      tenant_id: i.tenant_id ?? "",
      escritorio: i.nome,
      para: i.email,
      assunto: aplicar(regra.assunto, vars),
      corpo: aplicar(regra.corpo, vars),
      /* a chave é degrau:indicação — é ela que sustenta o teto e o dedupe */
      chave_unica: `${degrau.chave}:${i.id}`,
      motivo: `indicado por ${vars.indicador} há ${vars.dias} dia(s), status ${i.status}`,
    });
  }

  return { envios, parados };
}

/**
 * O FUNIL DAS INDICAÇÕES — o número que decide se vale ter cadência.
 *
 * Se 30 convites viraram 1 cadastro, o problema não é a régua de recuperação: é
 * o convite. Régua não conserta oferta, e é bom que o painel diga isso antes de
 * alguém escrever mais três e-mails.
 */
export interface FunilIndicacao {
  convidados: number;
  cadastraram: number;
  clientes: number;
  recusaram: number;
  /** convidados há mais de 21 dias que nunca cadastraram — o estoque recuperável */
  parados: number;
  taxa_cadastro: number | null;
  taxa_cliente: number | null;
}

export function funilDeIndicacoes(lista: Indicacao[], hoje: Date): FunilIndicacao {
  const total = lista.length;
  const cadastraram = lista.filter((i) => i.cadastrou_em || i.status === "cadastrou" || i.status === "cliente").length;
  const clientes = lista.filter((i) => i.virou_cliente_em || i.status === "cliente").length;
  const recusaram = lista.filter((i) => i.status === "recusou").length;
  const parados = lista.filter(
    (i) => i.status === "convidado" && !i.cadastrou_em && dias(i.convite_em, hoje) > 21
  ).length;
  return {
    convidados: total,
    cadastraram,
    clientes,
    recusaram,
    parados,
    /* sem base, null e NÃO zero: 0% afirma algo que não se sabe */
    taxa_cadastro: total > 0 ? cadastraram / total : null,
    taxa_cliente: cadastraram > 0 ? clientes / cadastraram : null,
  };
}

/** a leitura em uma frase — e ela pode dizer "não faça régua" */
export function leituraDoFunil(f: FunilIndicacao): string {
  if (f.convidados === 0) return "Nenhuma indicação registrada ainda.";
  if (f.convidados < 10) {
    return (
      `${f.convidados} indicação(ões) até agora — pouco para tirar conclusão de taxa. ` +
      "A cadência de recuperação já pode rodar, mas o número que importa por enquanto é quantas " +
      "indicações entram, não quantas convertem."
    );
  }
  if (f.taxa_cadastro != null && f.taxa_cadastro < 0.15) {
    return (
      `Só ${Math.round(f.taxa_cadastro * 100)}% dos indicados se cadastram. Isso é problema do CONVITE, ` +
      "não da recuperação — três e-mails a mais não consertam uma oferta que não convence no primeiro."
    );
  }
  return (
    `${f.cadastraram} de ${f.convidados} indicados se cadastraram e ${f.clientes} viraram cliente. ` +
    `${f.parados} estão parados há mais de 21 dias — é esse o estoque que a cadência recupera.`
  );
}
