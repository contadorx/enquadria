import { moeda, ehOptar, type Saida } from "./motor";
import { SAIDAS } from "./motor";
import { HONORARIO_PADRAO, HONORARIO_CURTO_PADRAO } from "./potencial";
import { JANELA } from "./janela";

/**
 * A PROPOSTA — o documento que faltava entre a decisão e o dinheiro.
 *
 * O produto entregava a decisão (laudo) e a prova (termo), e parava exatamente
 * antes do único ato que faz o contador ganhar com isso: cobrar. A proposta de
 * honorários ficava para depois, escrita à mão, em Word, quando sobrava tempo —
 * e serviço que depende de sobrar tempo não acontece.
 *
 * O QUE ESTE ARQUIVO DECIDE, e o que ele deliberadamente NÃO decide:
 *
 *  DECIDE o valor SUGERIDO, a partir do que o sistema já sabe (faixa da
 *  triagem, RBT12, saída da análise). Sugerir é diferente de arbitrar: os dois
 *  valores são premissa editável na tela, como o honorário do mapa de risco.
 *
 *  NÃO DECIDE o preço do contador. Ele conhece o cliente, a região e a própria
 *  estrutura. O que o sistema faz é tirar a folha em branco da frente dele —
 *  que é onde a proposta morria.
 *
 * DUAS REGRAS DE HONESTIDADE ficam travadas aqui, porque este papel vai para o
 * cliente final do contador:
 *
 *  1. NENHUMA PROMESSA DE ECONOMIA. A proposta vende o trabalho de decidir com
 *     método e prova, não um resultado tributário. A decisão pode perfeitamente
 *     ser "não optar" — e o trabalho foi o mesmo.
 *
 *  2. EMPRESA SEM DECISÃO NÃO RECEBE PROPOSTA. MEI, inativa ou já fora do
 *     Simples não tem o que decidir nesta janela: propor um serviço que não
 *     existe é o caminho mais curto para queimar a relação que o laudo curto
 *     acabou de construir.
 */

export type FaixaProposta = "A" | "B" | "C" | "D" | "MEI" | "FORA";

export interface EmpresaProposta {
  razao_social?: string | null;
  cnpj?: string | null;
  anexo?: number | null;
  faixa?: string | null;
}

export interface PremissasProposta {
  /** honorário do projeto (a decisão desta janela). Editável na tela. */
  projeto?: number | null;
  /** honorário da revisão a cada janela seguinte. Editável na tela. */
  revisao?: number | null;
  /** dias de validade da proposta */
  validadeDias?: number;
}

export interface EntradaProposta {
  empresa: EmpresaProposta;
  /** saída da análise; ausente quando só houve triagem */
  saida?: Saida | null;
  rbt12?: number | null;
  premissas?: PremissasProposta;
  /** data de referência, "AAAA-MM-DD" — vem do servidor, nunca do navegador */
  hoje: string;
}

/* ══════════════════════════ O VALOR SUGERIDO ═══════════════════════════════
 *
 * Três camadas, e cada uma responde a uma pergunta diferente:
 *
 *   BASE      — que tipo de trabalho é este? Decisão completa (faixas A e B) ou
 *               permanência documentada (C e D)? São serviços diferentes e o
 *               preço não pode ser o mesmo.
 *   PORTE     — de que tamanho é a empresa? A mesma análise vale mais para quem
 *               fatura 3 milhões do que para quem fatura 200 mil, porque o que
 *               está em jogo é proporcional ao faturamento dela.
 *   TRABALHO  — a saída exige negociação? "Optar condicionado a repasse" (S4)
 *               significa renegociar preço com os clientes do cliente: reunião,
 *               simulação e acompanhamento que as outras saídas não têm.
 */

/** Faixas de porte pelo RBT12 — os mesmos degraus que o contador já usa. */
const PORTES: { ate: number; fator: number; rotulo: string }[] = [
  { ate: 360_000, fator: 0.8, rotulo: "microempresa" },
  { ate: 1_800_000, fator: 1.0, rotulo: "empresa de pequeno porte" },
  { ate: 3_600_000, fator: 1.4, rotulo: "empresa de pequeno porte no teto" },
  { ate: Infinity, fator: 1.8, rotulo: "acima do sublimite" },
];

/** Acréscimo pelo trabalho de negociação que a saída S4 impõe. */
const FATOR_REPASSE = 1.25;

/** Piso por tipo de trabalho: abaixo disso não paga a hora de ninguém. */
const PISO_COMPLETO = 300;
const PISO_CURTO = 150;

/** Arredonda para o múltiplo de 50 mais próximo — preço com dízima não fecha. */
function arredondar(v: number): number {
  return Math.round(v / 50) * 50;
}

export interface Sugestao {
  projeto: number;
  revisao: number;
  base: number;
  fator: number;
  porte: string | null;
  /** por que este número, em linguagem de gente — vai na tela, não no papel */
  porque: string[];
}

export function honorarioSugerido(
  faixa: string | null | undefined,
  rbt12?: number | null,
  saida?: Saida | null
): Sugestao {
  const completo = faixa === "A" || faixa === "B";
  const base = completo ? HONORARIO_PADRAO : HONORARIO_CURTO_PADRAO;
  const porque: string[] = [
    completo
      ? "Decisão completa: cálculo, laudo com memória e termo de ciência."
      : "Permanência documentada: laudo curto e termo, sem simulação de decisão.",
  ];

  let fator = 1;
  let porte: string | null = null;
  if (rbt12 != null && rbt12 > 0) {
    const p = PORTES.find((x) => rbt12 <= x.ate)!;
    fator = p.fator;
    porte = p.rotulo;
    porque.push(`Porte pela RBT12 de ${moeda(rbt12)} (${p.rotulo}): fator ${p.fator.toFixed(1)}×.`);
  } else {
    porque.push("Sem RBT12 informada — valor calculado pelo porte médio. Informe a receita para afinar.");
  }

  // só S4 pede negociação de preço com os clientes do cliente; as demais saídas
  // de "optar" (S5) valem por si e não exigem essa conversa
  if (saida === "S4") {
    fator *= FATOR_REPASSE;
    porque.push("A saída exige renegociação de preço com os clientes: +25% pelo acompanhamento.");
  }

  const piso = completo ? PISO_COMPLETO : PISO_CURTO;
  const projeto = Math.max(arredondar(base * fator), piso);
  // a janela seguinte reaproveita o cadastro, as premissas e o histórico: metade
  // do trabalho, metade do preço — e é o número que transforma isto em recorrência
  const revisao = Math.max(arredondar(projeto * 0.5), PISO_CURTO);

  return { projeto, revisao, base, fator, porte, porque };
}

/* ═══════════════════════════ A CRÍTICA ═════════════════════════════════════ */

export interface CriticaProposta {
  erros: string[];
  alertas: string[];
}

/**
 * Erro trava; alerta avisa e deixa seguir.
 *
 * A separação importa: faltar razão social é impedimento (o papel sai sem
 * destinatário), faltar RBT12 não é — sai com valor de porte médio e o contador
 * ajusta na tela, que é exatamente o que ele faria de qualquer jeito.
 */
export function criticarProposta(e: EntradaProposta): CriticaProposta {
  const erros: string[] = [];
  const alertas: string[] = [];

  if (!e.empresa?.razao_social?.trim()) erros.push("A empresa está sem razão social.");
  if (!e.empresa?.cnpj?.trim()) erros.push("A empresa está sem CNPJ.");

  const faixa = e.empresa?.faixa;
  if (faixa === "MEI" || faixa === "FORA") {
    erros.push(
      "Esta empresa não tem decisão a tomar nesta janela (MEI, inativa ou fora do Simples) — não há serviço a propor."
    );
  }

  if (!e.saida) {
    alertas.push("A análise ainda não foi feita: a proposta sai pelo perfil da triagem, sem o resultado do cálculo.");
  }
  if (e.rbt12 == null || e.rbt12 <= 0) {
    alertas.push("Sem RBT12 informada, o valor sugerido usa porte médio. Informar a receita afina a sugestão.");
  }

  return { erros, alertas };
}

/* ═══════════════════════════ A PROPOSTA ════════════════════════════════════ */

export interface BlocoEscopo {
  titulo: string;
  itens: string[];
}

export interface Proposta {
  destinatario: { nome: string; cnpj: string };
  /** o parágrafo de abertura: por que esta conversa existe */
  contexto: string[];
  /** o que a análise já sabe sobre esta empresa — sem prometer resultado */
  situacao: string[];
  escopo: BlocoEscopo[];
  investimento: {
    projeto: number;
    revisao: number;
    linhas: { rotulo: string; valor: number; explica: string }[];
  };
  prazos: string[];
  condicoes: string[];
  validade: string;
  /** dentro da janela a validade é limitada pelo prazo legal, não pelo costume */
  validadeLimitadaPelaJanela: boolean;
}

function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * VALIDADE — a regra que ninguém lembra de escrever à mão.
 *
 * Uma proposta de 15 dias emitida em 25 de setembro venceria em 10 de outubro,
 * dez dias depois de o serviço deixar de ser possível. Enquanto a janela existe,
 * a validade nunca a ultrapassa: o prazo do papel é o prazo da lei.
 */
export function validadeDaProposta(hoje: string, dias = 15): { data: string; limitada: boolean } {
  const natural = somarDias(hoje, dias);
  if (hoje <= JANELA.fecha && natural > JANELA.fecha) {
    return { data: JANELA.fecha, limitada: true };
  }
  return { data: natural, limitada: false };
}

const ESCOPO_COMPLETO: BlocoEscopo[] = [
  {
    titulo: "Diagnóstico",
    itens: [
      "Levantamento do enquadramento atual: anexo, faixa e receita bruta dos últimos 12 meses.",
      "Mapeamento do perfil de clientes: quanto da receita vem de pessoa jurídica e quanto desse valor é de empresa que aproveita crédito.",
      "Apuração da parcela de tributos que sai do DAS na hipótese de apuração pelo regime regular.",
    ],
  },
  {
    titulo: "Cálculo e recomendação",
    itens: [
      "Comparação entre permanecer no recolhimento unificado e apurar IBS/CBS pelo regime regular, com memória de cálculo passo a passo.",
      "Cenários de repasse de preço e o efeito de cada um sobre o comprador.",
      "Recomendação técnica fundamentada na legislação vigente na data da emissão.",
    ],
  },
  {
    titulo: "Documentação",
    itens: [
      "Laudo técnico numerado, com código público de verificação.",
      "Termo de ciência para registro formal da decisão tomada pela empresa.",
      "Arquivamento das peças no dossiê da empresa, disponível para consulta futura.",
    ],
  },
  {
    titulo: "Acompanhamento da transição",
    itens: [
      "Revisão da decisão a cada nova janela de opção, enquanto durar a transição.",
      "Aviso sempre que uma norma publicada alterar a base da recomendação.",
    ],
  },
];

const ESCOPO_CURTO: BlocoEscopo[] = [
  {
    titulo: "Verificação e registro",
    itens: [
      "Verificação do enquadramento e do perfil de operação da empresa nesta janela.",
      "Laudo de permanência documentada, numerado e com código público de verificação.",
      "Termo de ciência registrando que a situação foi avaliada e a decisão é permanecer.",
    ],
  },
  {
    titulo: "Acompanhamento da transição",
    itens: [
      "Reavaliação a cada nova janela: o perfil da empresa muda, e a resposta pode mudar com ele.",
      "Aviso sempre que uma norma publicada alterar a base da avaliação.",
    ],
  },
];

/**
 * O CONTEXTO É EDUCATIVO, NUNCA ALARMISTA.
 *
 * Quem lê é o empresário, não o contador. A frase que vende é a que descreve o
 * fato com data — "existe um prazo e ele é este" — e não a que assusta. Papel
 * com marca de escritório dizendo que o cliente vai ter prejuízo se não assinar
 * é o tipo de peça que volta contra quem assinou.
 */
function contextoDaJanela(hoje: string): string[] {
  const dentro = hoje <= JANELA.fecha;
  if (dentro) {
    return [
      "A Resolução CGSN nº 186/2026 abriu, de 1º a 30 de setembro de 2026, a possibilidade de as empresas optantes pelo Simples Nacional apurarem o IBS e a CBS pelo regime regular, por fora do recolhimento unificado, com efeito a partir de 1º de janeiro de 2027.",
      "A escolha é por empresa e tem prazo: quem não avaliar dentro da janela permanece na situação atual durante todo o período seguinte. Avaliar não obriga a mudar — obriga a saber.",
    ];
  }
  return [
    "A transição do IBS e da CBS ocorre por etapas até 2033 e recoloca, a cada período, a mesma pergunta: qual forma de apuração é a mais adequada para esta empresa no período seguinte.",
    "A avaliação é por empresa e depende do perfil de clientes e do porte — e muda quando a norma muda. Por isso ela não é um trabalho de uma vez só.",
  ];
}

export function montarProposta(e: EntradaProposta): Proposta {
  const faixa = e.empresa?.faixa ?? null;
  const completo = faixa === "A" || faixa === "B";
  const p = e.premissas ?? {};
  const sug = honorarioSugerido(faixa, e.rbt12, e.saida);

  const projeto = p.projeto != null && p.projeto > 0 ? p.projeto : sug.projeto;
  const revisao = p.revisao != null && p.revisao >= 0 ? p.revisao : sug.revisao;
  const validade = validadeDaProposta(e.hoje, p.validadeDias ?? 15);

  const situacao: string[] = [];
  if (e.empresa?.anexo) situacao.push(`Enquadramento atual: Simples Nacional, Anexo ${e.empresa.anexo}.`);
  if (e.rbt12 != null && e.rbt12 > 0) {
    situacao.push(`Receita bruta dos últimos 12 meses considerada: ${moeda(e.rbt12)}.`);
  }
  if (e.saida) {
    const s = SAIDAS[e.saida];
    /* O RESULTADO PRELIMINAR ENTRA, MAS SEM O NÚMERO.
       Dar a conta pronta na proposta entrega de graça o serviço que a proposta
       vende — e, pior, entrega uma recomendação sem a memória de cálculo que a
       sustenta. O que entra é a existência de uma indicação preliminar; o que
       ela é, sai no laudo. */
    situacao.push(
      ehOptar(e.saida)
        ? `A avaliação preliminar indica que a apuração pelo regime regular pode ser vantajosa para esta empresa (${s.titulo.toLowerCase()}). A confirmação depende do cálculo completo, com as premissas levantadas junto à empresa.`
        : `A avaliação preliminar aponta para a manutenção da forma atual de recolhimento (${s.titulo.toLowerCase()}). O trabalho a seguir confirma e documenta essa conclusão.`
    );
  }

  const linhas = [
    {
      rotulo: completo ? "Análise e decisão desta janela" : "Verificação e documentação desta janela",
      valor: projeto,
      explica: "Pagamento único, na contratação.",
    },
  ];
  if (revisao > 0) {
    linhas.push({
      rotulo: "Revisão a cada nova janela de opção",
      valor: revisao,
      explica:
        "Opcional e cobrado apenas quando a revisão for realizada. Reaproveita o cadastro e o histórico já levantados.",
    });
  }

  return {
    destinatario: {
      nome: e.empresa?.razao_social?.trim() || "—",
      cnpj: e.empresa?.cnpj?.trim() || "—",
    },
    contexto: contextoDaJanela(e.hoje),
    situacao,
    escopo: completo ? ESCOPO_COMPLETO : ESCOPO_CURTO,
    investimento: { projeto, revisao, linhas },
    prazos: [
      e.hoje <= JANELA.fecha
        ? "Entrega do laudo e do termo em até 5 dias úteis da contratação, respeitado o prazo legal de 30 de setembro de 2026."
        : "Entrega do laudo e do termo em até 5 dias úteis da contratação.",
      "A empresa fornece os dados de faturamento e o perfil de clientes; o levantamento cadastral é feito por este escritório.",
    ],
    condicoes: [
      "A recomendação decorre das premissas informadas pela empresa e da legislação vigente na data da emissão do laudo. Alteração de premissa ou de norma pode alterar a conclusão.",
      "A decisão é da empresa e fica registrada em termo de ciência. Este escritório responde pela técnica da análise; a escolha é do empresário.",
      "Os valores acima não incluem tributos eventualmente devidos sobre o serviço, nem taxas de terceiros.",
    ],
    validade: validade.data,
    validadeLimitadaPelaJanela: validade.limitada,
  };
}

/** dd/mm/aaaa — como a proposta é lida por quem recebe */
export function dataBR(iso: string): string {
  if (!iso || iso.length < 10) return "—";
  return iso.slice(0, 10).split("-").reverse().join("/");
}
