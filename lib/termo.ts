/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O TERMO — recomendação de um lado, decisão do outro.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O DEFEITO QUE ISTO CORRIGE, e ele é do tipo que só aparece quando dói.
 *
 * O termo antigo dizia "Decisão: Permanecer no regime tradicional" e mais nada.
 * Ou seja: o caso em que o contador recomendou permanecer e todo mundo
 * concordou produzia EXATAMENTE o mesmo documento que o caso em que ele
 * recomendou optar e o empresário decidiu o contrário.
 *
 * A divergência ciente é a única coisa que um termo de ciência precisa
 * capturar — e era justamente a que não aparecia. Seis meses depois, no "você
 * não me avisou", esse papel não ajudava ninguém: nem o contador, que não
 * consegue provar que recomendou, nem o empresário, que não consegue mostrar
 * que decidiu informado.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * TRÊS ESTADOS, NÃO DOIS.
 *
 *   seguir   · a decisão é a recomendada. O caso comum.
 *   divergir · a decisão é a outra. EXIGE o motivo, escrito pelo empresário.
 *   adiar    · não decidir nesta janela. É o mais comum e o que menos deixava
 *              rastro: quem não opta por omissão fica no tradicional, e antes
 *              disso nada registrava que houve escolha em vez de esquecimento.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * O MOTIVO DA DIVERGÊNCIA É DO EMPRESÁRIO, e o documento diz isso.
 *
 * Se o contador escreve "o cliente preferiu não optar por razões comerciais",
 * é o contador CARACTERIZANDO a razão do cliente — e é exatamente essa frase
 * que se contesta depois. O campo existe para receber a palavra de quem
 * decidiu, e as razões costumam ser coisas que o sistema não conhece nem deve
 * fingir que conhece: venda da empresa, relação com um cliente grande,
 * covenant de banco.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * A RECOMENDAÇÃO NÃO É O TÍTULO. O documento é o termo da DECISÃO do
 * empresário; a recomendação é o contexto que a informou. Se a recomendação
 * virar o destaque, o papel passa a parecer que quem decidiu foi o contador —
 * o oposto do objetivo. Ver a ordem em `components/FolhaTermo.tsx`.
 */
import { ehOptar, pct, moeda, SAIDAS, type Saida } from "./motor";
import {
  condicoesDeValidade, pressaoDoLaudo, absorcaoDoLaudo, type AnaliseGravada,
} from "./laudo";

export type TipoDecisao = "seguir" | "divergir" | "adiar";

export interface Recomendacao {
  /** o que o laudo recomenda */
  decisao: "optar" | "permanecer";
  saida: Saida;
  titulo: string;
  /** os fatos que sustentam a recomendação — o "baseado em" */
  baseado_em: string[];
}

/**
 * A RECOMENDAÇÃO, com o "baseado em" saindo dos números congelados.
 *
 * `ehOptar()` do motor é a fonte: S4 e S5. Havia uma segunda função aqui, a
 * `decisaoSugerida()`, que devolvia "optar" só para S4 — e S5 é o caso MAIS
 * forte de optar do produto inteiro (custo líquido negativo, não depende de
 * negociar com ninguém). Ela estava sem uso, e era exatamente a que alguém
 * pegaria ao montar esta tela. Agora existe uma só.
 */
export function recomendacaoDoTermo(a: AnaliseGravada): Recomendacao {
  const saida = (a.saida ?? "S1") as Saida;
  const decisao: "optar" | "permanecer" = ehOptar(saida) ? "optar" : "permanecer";
  const baseado: string[] = [];

  if (a.rq != null) {
    baseado.push(
      `Receita qualificada de ${pct(Number(a.rq))} — é a parcela do faturamento que gera crédito ` +
        "para quem compra, e é ela que dá (ou tira) sentido à opção."
    );
  }
  /**
   * O FUNDAMENTO FALA A LÍNGUA DA SAÍDA CONGELADA, e este `saida === "S5"` é a
   * correção de 05/08/2026.
   *
   * Antes o teste era `cl <= 0` cru — a regra VIVA aplicada sobre os números.
   * Numa análise gravada como S4 antes de o S5 existir, o cartão saía com o
   * título "Optar, CONDICIONADO A REPASSE" e, três linhas abaixo, "a vantagem
   * não depende de renegociar preço com ninguém". As duas frases no mesmo
   * documento, uma vinda da saída congelada e a outra da regra de hoje.
   *
   * Recalcular metade da recomendação é o mesmo erro das duas listas de
   * ciência: o documento passa a ter duas verdades e escolhe uma por linha.
   * Quem conserta análise velha é `lib/recalculo.ts`, na emissão — aqui a
   * saída congelada manda, sempre.
   */
  if (saida === "S5" && a.cl != null && Number(a.cl) <= 0) {
    baseado.push(
      `Custo líquido de ${pct(Number(a.cl))}: no regime regular a empresa paga MENOS, pelos créditos ` +
        "das próprias compras. A vantagem não depende de renegociar preço com ninguém."
    );
  } else if (a.re != null && a.fc != null && isFinite(Number(a.re)) && Number(a.re) > 0) {
    baseado.push(
      `Repasse de preço necessário de ${pct(Number(a.re))}, contra ${pct(Number(a.fc))} de crédito ` +
        "que o cliente empresa passa a ganhar."
    );
  }

  /* o motivo congelado na análise é a frase do motor, e é a mais específica */
  const motivo = a.parametros?.motivo;
  if (motivo) baseado.push(motivo);

  const pressao = pressaoDoLaudo(a);
  if (pressao) {
    baseado.push(
      `Faixa de negociação de ${pressao.faixa}: a empresa precisa de ${pressao.posicao} dela só ` +
        `para não sair perdendo (posição ${pressao.nivel}).`
    );
  }
  const absorcao = absorcaoDoLaudo(a);
  if (absorcao) {
    baseado.push(
      `Sem poder de renegociar preço, o cenário é absorver ${absorcao.custo} da receita` +
        (absorcao.custo_reais ? ` (${absorcao.custo_reais}/ano)` : "") +
        `, entregando ${absorcao.entrega} de crédito ao cliente sem aumento.`
    );
  }
  if (a.parametros?.banda_sublimite) {
    baseado.push(
      "A empresa está na faixa em torno do sublimite: ultrapassá-lo no curso do ano muda o que já " +
        "sai do DAS e desloca a conta no meio do exercício."
    );
  }
  const proj = a.parametros?.projecao;
  if (proj?.divergem) {
    baseado.push(
      `Com a RBT12 de hoje a conta indica ${proj.saida_hoje}; com a projetada para junho de 2027, ` +
        `${proj.saida_projetada}. A resposta depende do faturamento de 2027.`
    );
  }

  return { decisao, saida, titulo: SAIDAS[saida]?.titulo ?? "—", baseado_em: baseado };
}

/**
 * OS PONTOS QUE A EMPRESA PRECISA OBSERVAR.
 *
 * DERIVADOS, nunca genéricos. Uma lista fixa de "faturamento, poder comercial,
 * concorrência" que aparece igual em todo termo é lida por ninguém na terceira
 * vez — e a assinatura embaixo dela passa a não significar nada.
 *
 * A base é `condicoesDeValidade()`, a mesma do laudo: se ela mudar, o termo
 * muda junto. Escrever uma lista nova aqui criaria a segunda verdade de sempre,
 * que diverge na primeira correção de motor.
 *
 * Em cima dela, três pontos que só o termo precisa dizer — porque são sobre a
 * DECISÃO, não sobre o cálculo.
 */
export function pontosAObservar(a: AnaliseGravada): string[] {
  const pontos = [...condicoesDeValidade(a)];
  const r = a.respostas ?? {};

  /* PODER COMERCIAL — só quando ele é o fator que decide */
  if (r.preco != null && Number(r.preco) <= 1) {
    pontos.push(
      "O poder de renegociar preço foi declarado como baixo ou inexistente. É a premissa mais " +
        "frágil desta análise: se o preço não subir, quem absorve o custo é a empresa."
    );
  }
  const pressao = pressaoDoLaudo(a);
  if (pressao?.nivel === "apertada") {
    pontos.push(
      `A posição de negociação é APERTADA: de cada real em disputa, ${pressao.posicao} precisa vir ` +
        "para a empresa só para ela empatar. Qualquer resistência do cliente coloca a operação no vermelho."
    );
  }
  if (r.conc === 1) {
    pontos.push(
      "Os concorrentes desta empresa estão majoritariamente fora do Simples e já entregam crédito " +
        "integral. Aqui a opção não cria vantagem — reduz uma desvantagem, e o argumento de preço " +
        "perde força mais rápido."
    );
  }

  /* FATURAMENTO — quando ele é o que pode virar a resposta */
  const p = a.parametros ?? {};
  if (p.projecao && !p.projecao.divergem && p.projecao.muda_faixa) {
    pontos.push(
      `O faturamento projetado leva a empresa da faixa ${p.projecao.faixa} para a ` +
        `${p.projecao.faixa_projetada} dentro do período de efeito. A recomendação não muda, mas o ` +
        "número que a sustenta, sim."
    );
  }
  if (p.projecao?.cruza_teto) {
    pontos.push(
      `O faturamento projetado ultrapassa o teto do Simples (${moeda(4_800_000)}) dentro do período ` +
        "de efeito. Se isso se confirmar, a empresa apura pelo regime regular de qualquer forma e " +
        "esta decisão perde objeto."
    );
  }

  return pontos;
}

/**
 * A CIÊNCIA DOS EFEITOS.
 *
 * O terceiro item é novo e é o que faltava: "vale por semestre e não pode ser
 * alterada no período" era verdade pela metade. O art. 41 § 5º da LC 214/2025
 * veda a saída do regime regular a quem recebeu ressarcimento de créditos no
 * ano-calendário corrente ou no anterior — e esse é justamente o perfil que a
 * conta mais manda optar. Já estava no laudo; faltava no termo, que é o
 * documento que a pessoa assina.
 */
export const CIENCIA_DOS_EFEITOS: string[] = [
  "A opção vale por semestre e não pode ser alterada dentro do período.",
  "Quem não optar dentro do prazo permanece no regime tradicional.",
  "ATENÇÃO — a reversibilidade tem uma exceção: quem exercer a opção, acumular saldo credor e " +
    "PEDIR RESSARCIMENTO fica impedido de retornar ao recolhimento pelo DAS, no ano-calendário " +
    "corrente e no seguinte (art. 41, § 5º, da LC 214/2025). Nesse caso a decisão deixa de ser " +
    "semestral e passa a ser de mão única.",
  "Ao exercer a opção, o crédito integral passa ao cliente AUTOMATICAMENTE, independentemente de " +
    "acordo de preço. Negocie o reajuste ANTES de optar e registre por escrito: quem opta primeiro " +
    "e negocia depois negocia sem nada para trocar.",
  "A decisão afeta preço, crédito ao cliente e competitividade.",
  "A análise é estimativa de cenário; a alíquota de referência de IBS/CBS só é fixada por Resolução " +
    "do Senado até 31/10/2026, depois do fim desta janela.",
  "Os cálculos são de responsabilidade técnica do profissional que assina o laudo. O resultado " +
    "comercial da negociação de preço é decisão e risco da empresa.",
];

export interface DecisaoDoTermo {
  tipo: TipoDecisao;
  /** o que efetivamente vale: optar ou permanecer */
  decisao: "optar" | "permanecer";
  motivo?: string | null;
}

/**
 * O QUE A DECISÃO SIGNIFICA, dado o tipo e a recomendação.
 *
 * `adiar` resolve para "permanecer" porque é o que a lei faz com quem não opta
 * — mas o TIPO fica gravado, e é ele que distingue "decidi ficar" de "decidi
 * não decidir agora". No papel os dois produzem o mesmo regime; na conversa de
 * março, não produzem a mesma conversa.
 */
export function resolverDecisao(tipo: TipoDecisao, rec: Recomendacao): "optar" | "permanecer" {
  if (tipo === "seguir") return rec.decisao;
  if (tipo === "adiar") return "permanecer";
  /* divergir = o contrário do recomendado */
  return rec.decisao === "optar" ? "permanecer" : "optar";
}

export interface Validacao {
  ok: boolean;
  erro?: string;
}

/** aceita só os três estados — corpo de requisição não é fonte confiável de tipo */
export function ehTipoDecisao(x: unknown): x is TipoDecisao {
  return x === "seguir" || x === "divergir" || x === "adiar";
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O TERMO EMITIDO AINDA NÃO TEM DECISÃO — e essa é a mudança de 05/08/2026.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O contador escolhia os três estados na hora de emitir, e o termo chegava ao
 * cliente já dizendo "A empresa acompanha a recomendação técnica e decide
 * optar". A empresa assinava embaixo de uma decisão que ela não tinha
 * declarado em lugar nenhum — o papel voltava a não distinguir quem decidiu o
 * quê, que era exatamente o defeito que a reestruturação existia para corrigir.
 *
 * Agora a emissão congela a RECOMENDAÇÃO; a decisão nasce na assinatura. Até
 * lá o termo tem `tipo_decisao` nulo e `decisao = 'sem_decisao'`, e as telas
 * dizem isso em vez de mostrar uma decisão que ninguém tomou.
 */
export const AGUARDANDO_DECISAO =
  "A empresa ainda não declarou a decisão. Ela é escolhida por quem assina, na página de " +
  "assinatura, entre seguir a recomendação, decidir diferente ou não decidir nesta janela.";

/**
 * O MOTIVO É OBRIGATÓRIO NA DIVERGÊNCIA — e essa é a regra que dá sentido ao
 * documento inteiro.
 *
 * Um termo que registra "decidiu diferente do recomendado" sem dizer por quê é
 * pior do que o termo antigo: ele documenta o conflito e não documenta a
 * razão, que é a única coisa capaz de explicá-lo depois.
 *
 * Em `adiar` o motivo é opcional mas pedido: "vamos ver em março" é uma razão
 * legítima e vale registrar.
 */
export function validarDecisao(d: DecisaoDoTermo): Validacao {
  const motivo = (d.motivo ?? "").trim();
  if (d.tipo === "divergir") {
    if (!motivo) {
      return {
        ok: false,
        erro:
          "A empresa decidiu diferente do recomendado. Escreva o motivo — com as palavras de quem " +
          "decidiu, não com as suas. É a única linha que explica a divergência depois.",
      };
    }
    if (motivo.length < 15) {
      return {
        ok: false,
        erro: "O motivo está curto demais para explicar alguma coisa. Uma frase inteira basta.",
      };
    }
  }
  return { ok: true };
}

/** o rótulo de cada tipo, para a tela e para o papel */
export const ROTULO_TIPO: Record<TipoDecisao, string> = {
  seguir: "Seguir a recomendação",
  divergir: "Decidir diferente da recomendação",
  adiar: "Não decidir nesta janela",
};

/**
 * A FRASE QUE VAI NO TERMO, dita de forma que os dois lados reconheçam.
 *
 * Repare que em `divergir` a frase NÃO julga a decisão. Ela registra que houve
 * recomendação, que houve decisão diferente, e que a razão é da empresa. Um
 * termo que soa como reprovação não é assinado — e um que não registra a
 * divergência não serve para nada.
 */
export function fraseDaDecisao(d: DecisaoDoTermo, rec: Recomendacao): string {
  const valeu = resolverDecisao(d.tipo, rec);
  const nome = (x: string) => (x === "optar" ? "optar pelo regime híbrido" : "permanecer no regime tradicional");

  if (d.tipo === "seguir") {
    return `A empresa acompanha a recomendação técnica e decide ${nome(valeu)}.`;
  }
  if (d.tipo === "adiar") {
    return (
      "A empresa decide NÃO exercer a opção nesta janela e reavaliar na seguinte. Sem manifestação " +
      "dentro do prazo, permanece no regime tradicional — o que é uma escolha registrada, e não " +
      "uma omissão."
    );
  }
  return (
    `A recomendação técnica foi ${nome(rec.decisao)}. A empresa, ciente disso, decide ` +
    `${nome(valeu)}. O motivo é da empresa e está registrado abaixo; a análise técnica ` +
    "permanece como emitida."
  );
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O BLOCO CONGELADO — uma função só monta o termo inteiro.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * DUAS ROTAS EMITEM O MESMO PAPEL: `/api/termo` (uma empresa, o contador digita
 * o signatário) e `/api/termo/lote` (a esteira). Já aconteceu de as duas
 * divergirem — uma mandava o convite por e-mail e a outra não, e o MESMO
 * artefato chegava ou não ao cliente dependendo de qual botão o contador tinha
 * clicado. Duas rotas para o mesmo ato produzem duas regras.
 *
 * Aqui o bloco nasce UMA vez: a recomendação, os pontos, o tipo da decisão e o
 * que ela resolve. Quem emite só escolhe o tipo; nada mais é decidido na rota.
 *
 * E ele é CONGELADO no snapshot. Se o motor mudar em outubro, o termo assinado
 * em agosto continua dizendo o que foi recomendado em agosto — que é a única
 * coisa que ele pode afirmar com honestidade.
 */
export interface BlocoTermo {
  recomendacao: Recomendacao;
  pontos: string[];
  tipo_decisao: TipoDecisao;
  motivo_divergencia: string | null;
  /** o que efetivamente vale — derivado do tipo, nunca recebido pronto */
  decisao: "optar" | "permanecer";
}

export function blocoDoTermo(
  a: AnaliseGravada,
  tipo: TipoDecisao = "seguir",
  motivo?: string | null
): BlocoTermo {
  const recomendacao = recomendacaoDoTermo(a);
  return {
    recomendacao,
    pontos: pontosAObservar(a),
    tipo_decisao: tipo,
    motivo_divergencia: (motivo ?? "").trim() || null,
    decisao: resolverDecisao(tipo, recomendacao),
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LENDO O SNAPSHOT — uma função, três páginas.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O mesmo papel sai por TRÊS portas: o dossiê do contador (`/doc/termo/[id]`),
 * a via do cliente (`/termo/[token]`) e a tela de assinatura (`/assinar/[token]`).
 * Se cada uma ler o snapshot do seu jeito, elas divergem — e a divergência
 * aparece do pior jeito possível: o cliente lendo uma coisa e assinando outra.
 * Foi exatamente isso que a lista de ciência duplicada causou em 05/08.
 *
 * Termos anteriores a esta data não têm o bloco no snapshot. Eles voltam com
 * tudo nulo, e a folha sai como saía. Termo antigo é PROVA do que foi assinado,
 * não rascunho para completar com o que a gente sabe hoje.
 */
export interface ParteDecisaoDoTermo {
  recomendacao: Recomendacao | null;
  tipo_decisao: TipoDecisao | null;
  motivo_divergencia: string | null;
  pontos: string[];
  laudo_url: string | null;
  laudo_numero: number | null;
  /**
   * A LISTA DE CIÊNCIA CONGELADA — e ignorá-la era um defeito de prova.
   *
   * ENCONTRADO EM 05/08/2026, olhando a tela de assinatura. As três superfícies
   * imprimiam a constante VIVA (`CIENCIA_DOS_EFEITOS`) em vez da lista gravada
   * no snapshot. No dia em que a lista cresceu de 4 para 7 itens, os 21 termos
   * já emitidos passaram a ser EXIBIDOS com 7 cláusulas — e o hash deles cobre 4.
   *
   * Dois já estavam ASSINADOS. O papel passou a mostrar que o signatário deu
   * ciência do cadeado do art. 41 § 5º, e ele não deu: aquele texto não existia
   * quando ele assinou. O erro anda na pior direção possível — o documento diz
   * MAIS do que foi aceito, e é o tipo de divergência que só aparece quando
   * alguém compara o texto com o hash, que é exatamente o dia em que ela custa.
   *
   * `null` só para termos anteriores ao snapshot; aí não há o que congelar e a
   * constante viva é o melhor disponível.
   */
  clausulas: string[] | null;
}

export function decisaoDoSnapshot(snapshot: unknown): ParteDecisaoDoTermo {
  const s = (snapshot ?? {}) as {
    recomendacao?: Recomendacao | null;
    pontos?: unknown;
    tipo_decisao?: unknown;
    motivo_divergencia?: unknown;
    laudo?: { token?: string | null; numero?: number | null } | null;
    clausulas?: unknown;
  };
  const rec = s.recomendacao;
  const clausulas = Array.isArray(s.clausulas)
    ? s.clausulas.filter((x): x is string => typeof x === "string")
    : null;
  return {
    clausulas: clausulas && clausulas.length ? clausulas : null,
    /* só aceita a recomendação inteira: meia recomendação no papel é pior que
       nenhuma, porque parece completa */
    recomendacao:
      rec && typeof rec === "object" && rec.decisao && Array.isArray(rec.baseado_em) ? rec : null,
    tipo_decisao: ehTipoDecisao(s.tipo_decisao) ? s.tipo_decisao : null,
    motivo_divergencia: typeof s.motivo_divergencia === "string" ? s.motivo_divergencia : null,
    pontos: Array.isArray(s.pontos) ? s.pontos.filter((x): x is string => typeof x === "string") : [],
    laudo_url: s.laudo?.token ? `/laudo/${s.laudo.token}` : null,
    laudo_numero: typeof s.laudo?.numero === "number" ? s.laudo.numero : null,
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O NOME DA EMPRESA CHEGOU CORROMPIDO?
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Encontrado em produção em 05/08/2026: 6 de 95 empresas com o caractere de
 * substituição no lugar do acento — "Cabos e Condutores Ribeir�o Ltda". Todas
 * de importações de 03/08, anteriores à detecção de codificação que hoje existe
 * em `lib/csv.ts`.
 *
 * POR QUE ISSO NÃO É COSMÉTICO AQUI. O nome da empresa entra no `conteudoCanonico()`
 * — a string que é hasheada e assinada. Um termo assinado com a razão social
 * errada é um documento que o cliente devolve, e a assinatura não conserta: ela
 * garante que ninguém alterou o texto DEPOIS, não que o texto estava certo.
 *
 * O ESTRAGO NÃO TEM VOLTA AUTOMÁTICA. O byte original foi substituído por
 * U+FFFD na decodificação; "�" pode ter sido ã, á, â ou ç. Adivinhar pelo
 * contexto seria escrever no documento do cliente um palpite nosso. O que dá
 * para fazer é DETECTAR e IMPEDIR que saia assinado assim.
 */
export function nomeCorrompido(nome?: string | null): boolean {
  if (!nome) return false;
  /* U+FFFD é o resultado de decodificação falha. As sequências Ã/Â seguidas de
     caractere alto são UTF-8 lido como latin-1 — nenhuma delas aparece em
     português escrito corretamente. */
  return /\uFFFD|\u00C3[\u00A0-\u00BF]|\u00C2[\u00A0-\u00BF]/.test(nome);
}

/**
 * ESTE TERMO FOI EMITIDO COM UMA LISTA DE CIÊNCIA MAIS ANTIGA?
 *
 * Quem precisa saber é o CONTADOR, não o cliente. O cliente vê o documento que
 * corresponde ao hash — correto e completo em si. Quem tem uma decisão a tomar
 * ("emito de novo para colher ciência do cadeado do art. 41 § 5º?") é quem
 * emitiu, e a resposta muda conforme o termo já esteja assinado ou não.
 */
export function cienciaDefasada(clausulas: string[] | null): boolean {
  return !!clausulas && clausulas.length < CIENCIA_DOS_EFEITOS.length;
}

export function avisoCienciaDefasada(clausulas: string[] | null, assinado: boolean): string | null {
  if (!cienciaDefasada(clausulas)) return null;
  const n = clausulas!.length;
  const base =
    `Este termo foi emitido com a lista de ciência de ${n} itens; a atual tem ` +
    `${CIENCIA_DOS_EFEITOS.length} — inclusive o cadeado do art. 41, § 5º, da LC 214/2025, que ` +
    "torna a opção irreversível para quem pedir ressarcimento de créditos. ";
  return assinado
    ? base +
        "O documento assinado é este, e continua válido pelo que diz. Para ter a ciência do cadeado " +
        "por escrito, emita um termo novo — o antigo não deve ser substituído nem reescrito."
    : base + "Ainda não foi assinado: emita um novo antes de colher a assinatura.";
}

export const AVISO_NOME_CORROMPIDO =
  "A razão social desta empresa contém caractere corrompido — provavelmente um acento perdido na " +
  "importação. Corrija o cadastro ANTES de colher a assinatura: o nome entra no conteúdo que é " +
  "assinado, e a assinatura garante que o texto não mudou depois, não que ele estava certo.";
