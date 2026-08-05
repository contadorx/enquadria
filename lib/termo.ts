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
  if (a.cl != null && Number(a.cl) <= 0) {
    baseado.push(
      `Custo líquido de ${pct(Number(a.cl))}: no regime regular a empresa paga MENOS, pelos créditos ` +
        "das próprias compras. A vantagem não depende de renegociar preço com ninguém."
    );
  } else if (a.re != null && a.fc != null && isFinite(Number(a.re))) {
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
