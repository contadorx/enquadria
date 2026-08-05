/**
 * MOTOR DE DECISÃO — IBS/CBS · regime híbrido do Simples Nacional
 *
 * Portado sem alteração da calculadora de validação (22/07/2026).
 * Toda regra fica aqui e é pura: sem I/O, sem Supabase, sem React.
 * Assim a mesma função roda no servidor, no cliente e no teste.
 *
 * PREMISSA CENTRAL, EM 2027-2028 — confirmada:
 *   CBS = alíquota de referência reduzida em 0,1 p.p. (LC 214/2025, art. 347)
 *   IBS = 0,05% estadual + 0,05% municipal (art. 344)
 *   → total efetivo ~8,8%, NÃO os 26,5% do regime pleno.
 *
 * QUANTO SAI DO DAS — ERA "A CONFIRMAR"; foi confirmado em 05/08/2026, e por um
 * caminho diferente do que este comentário supunha.
 *
 *   LC 214/2025, art. 519: os Anexos I a V da LC 123/2006 são SUBSTITUÍDOS pelos
 *   Anexos XVIII a XXII, com efeitos em 1º/01/2027. Nas tabelas novas as colunas
 *   "Cofins" e "PIS/Pasep" deixam de existir e entram "CBS" e "IBS" — com soma
 *   idêntica nas faixas 1 a 5 (Anexo I: 12,74 + 2,76 = 15,50 = 15,33 + 0,17;
 *   Anexo II: 11,51 + 2,49 = 14,00 = 13,85 + 0,15).
 *
 *   O dispositivo operativo é a LC 123/2006, art. 13, § 9º (redação da
 *   LC 227/2026): "as parcelas a eles relativas não serão cobradas pelo regime
 *   único". ICMS e ISS PERMANECEM no DAS em 2027-2028 — a saída em degraus
 *   começa em 2029 e a revogação plena é de 2033 (art. 543). Por isso eles não
 *   entram em `cl`: são pagos igual, optando ou não.
 *
 *   Consequência: `sharePC` está certo, e continua certo em 2027. O que mudou
 *   foi a fundamentação impressa no laudo — corrigida em lib/laudo.
 *
 * O QUE CONTINUA ABERTO — não implementar antes da resposta normativa:
 *   · faixas 6 dos Anexos XVIII-XXII: indício de renormalização (Anexo I com
 *     CBS 34,02% contra os 34,40% de hoje), fonte única e conta que não fecha;
 *   · teto de 5% do ISS (LC 123, art. 18, § 16): o excedente é redistribuído aos
 *     tributos federais, o que ELEVA a fatia que sai do DAS em serviço acima de
 *     ~1,9 mi de RBT12. Erro medido de até 16% no `das` (Anexo IV, faixa 5,
 *     RBT12 3,33 mi: 3,6258% → 4,2097%), com 2,7% das saídas trocando. Falta
 *     saber se a regra sobrevive aos Anexos novos e se alcança a coluna CBS.
 */

export type Saida = "S1" | "S2" | "S3" | "S4" | "S5";

/** S4 e S5 são recomendações de OPTAR; diferem no motivo, não no destino. */
export function ehOptar(s?: Saida | string | null): boolean {
  return s === "S4" || s === "S5";
}

export interface Respostas {
  /** Q1 · fração da receita vendida a PJ */
  b2b: number;
  /** Q2 · fração desses PJ que aproveitam crédito integral */
  qual: number;
  /** Q3 · fração da receita em compras que geram crédito */
  cred: number;
  /** Q4 · fração da receita em folha (conferência de consistência) */
  folha: number;
  /** Q5 · poder de renegociação: 3 forte · 2 com esforço · 1 travado · 0 nenhum */
  preco: number;
  /** Q6 · concorrentes majoritariamente fora do Simples: 1 sim · 0 não */
  conc: number;
  /** Q7 · faixa de faturamento (não entra na conta, dimensiona o honorário) */
  faturamento?: string;
  /** Q8 · cliente já exigiu crédito integral: 1 sim · 0 não */
  exig: number;
}

export interface Parametros {
  /** alíquota IBS+CBS do exercício, em fração (0.088) */
  aliquota: number;
  /** parcela de PIS/Cofins embutida no DAS, em fração (0.012) */
  das: number;
  /**
   * OBSOLETO. Ficou inerte quando a árvore foi reordenada (26/07/2026): o corte
   * superior agora é o próprio `fronteiraMax`. Mantido só para não quebrar
   * registros antigos que gravaram o parâmetro.
   */
  corteS1?: number;
  /** receita qualificada mínima para a decisão depender de repasse */
  rqMin?: number;
  /** largura da zona de fronteira, em torno de FC */
  fronteiraMin?: number;
  fronteiraMax?: number;
  /** RBT12 da empresa, quando conhecida — só serve à banda do sublimite */
  rbt12?: number | null;
  /** sublimite de ICMS/ISS do Simples (R$ 3,6 mi) */
  sublimite?: number;
  /** largura da banda em torno do sublimite, em fração (0,05 = ±5%) */
  bandaSublimite?: number;
}

export interface Resultado {
  /** receita qualificada = b2b × qual */
  rq: number;
  /** custo do híbrido sobre a base */
  ch: number;
  /** custo líquido da empresa */
  cl: number;
  /** REPASSE DE EQUILÍBRIO — o número */
  re: number;
  /** folga do comprador */
  fc: number;
  /** folga da negociação, em pontos */
  folga: number;
  saida: Saida;
  prioridade: boolean;
  /** por que esta saída, em uma frase — vai para a seção 7 do laudo */
  motivo: string;
  /** true quando a banda do sublimite empurrou a decisão para o empresário */
  banda_sublimite?: boolean;
}

export const PARAMETROS_2027: Parametros = {
  aliquota: 0.088,
  das: 0.01473,
  fronteiraMin: 0.8,
  fronteiraMax: 1.2,
  rqMin: 0.3,
  sublimite: 3600000,
  bandaSublimite: 0.05,
};

/**
 * CENÁRIO ALTERNATIVO DE ALÍQUOTA — 9,4%.
 *
 * A decisão de setembro é tomada ANTES de a alíquota existir: a referência de
 * IBS/CBS só é fixada por Resolução do Senado, e o prazo é 31/10/2026 — um mês
 * DEPOIS de a janela fechar. Um laudo que traz um número só esconde do
 * empresário o único risco que ele não pode controlar. Por isso todo laudo sai
 * com as duas contas.
 *
 * 9,4% não tem norma: é sensibilidade declarada, e o documento diz isso.
 */
export const ALIQUOTA_ALTERNATIVA = 0.094;

/** de onde vem a alíquota usada — vai impressa no corpo do laudo */
export interface CarimboAliquota {
  aliquota: number;
  alternativa: number;
  /** true só quando a Resolução do Senado tiver sido publicada */
  fixada: boolean;
  fixacao_ate: string;
  fonte: string;
  nota_alternativa: string;
  consultado_em: string;
}

export function carimboAliquota(aliquota: number, consultadoEm: string): CarimboAliquota {
  return {
    aliquota,
    alternativa: ALIQUOTA_ALTERNATIVA,
    fixada: false,
    fixacao_ate: "31/10/2026",
    fonte:
      "Estimativa de trabalho para 2027: CBS na alíquota de referência reduzida em 0,1 ponto " +
      "percentual, somada ao IBS de 0,1% (0,05% estadual e 0,05% municipal), na forma da " +
      "EC 132/2023 e da LC 214/2025. A alíquota de referência é fixada por Resolução do Senado " +
      "Federal, com prazo até 31/10/2026 — depois do fechamento da janela de opção.",
    nota_alternativa:
      "O cenário de 9,4% não decorre de norma publicada: é sensibilidade declarada, para medir o " +
      "efeito de a alíquota de referência ser fixada acima da estimativa de trabalho.",
    consultado_em: consultadoEm,
  };
}

/**
 * TABELA LEGAL DO SIMPLES NACIONAL — LC 123, Anexos I a V.
 * Conferida contra as tabelas oficiais da Receita Federal (jul/2026).
 *
 * Cada faixa carrega o que a alíquota EFETIVA precisa:
 *   teto      · teto de RBT12 da faixa, em R$
 *   nominal   · alíquota nominal da faixa (fração)
 *   deduzir   · parcela a deduzir da faixa, em R$
 *   sharePC   · (Cofins% + PIS/Pasep%) da partilha OFICIAL daquela faixa —
 *               a fatia da carga que vira CBS e SAI do DAS no regime híbrido.
 *
 * A alíquota efetiva do Simples é (RBT12 × nominal − deduzir) / RBT12: sempre
 * ≤ nominal, e bem abaixo nas faixas baixas. Usar a nominal superestima o
 * custo — por isso o laudo de produção calcula a efetiva a partir da RBT12.
 */
export interface FaixaSimples {
  teto: number;
  nominal: number;
  deduzir: number;
  sharePC: number;
}

export const ANEXOS_SIMPLES: Record<number, FaixaSimples[]> = {
  // Anexo I — Comércio
  1: [
    { teto: 180000, nominal: 0.04, deduzir: 0, sharePC: 0.155 },
    { teto: 360000, nominal: 0.073, deduzir: 5940, sharePC: 0.155 },
    { teto: 720000, nominal: 0.095, deduzir: 13860, sharePC: 0.155 },
    { teto: 1800000, nominal: 0.107, deduzir: 22500, sharePC: 0.155 },
    { teto: 3600000, nominal: 0.143, deduzir: 87300, sharePC: 0.155 },
    { teto: 4800000, nominal: 0.19, deduzir: 378000, sharePC: 0.344 },
  ],
  // Anexo II — Indústria
  2: [
    { teto: 180000, nominal: 0.045, deduzir: 0, sharePC: 0.14 },
    { teto: 360000, nominal: 0.078, deduzir: 5940, sharePC: 0.14 },
    { teto: 720000, nominal: 0.1, deduzir: 13860, sharePC: 0.14 },
    { teto: 1800000, nominal: 0.112, deduzir: 22500, sharePC: 0.14 },
    { teto: 3600000, nominal: 0.147, deduzir: 85500, sharePC: 0.14 },
    { teto: 4800000, nominal: 0.3, deduzir: 720000, sharePC: 0.255 },
  ],
  // Anexo III — Serviços (fator R ≥ 28% e serviços do §5º-B)
  3: [
    { teto: 180000, nominal: 0.06, deduzir: 0, sharePC: 0.156 },
    { teto: 360000, nominal: 0.112, deduzir: 9360, sharePC: 0.171 },
    { teto: 720000, nominal: 0.135, deduzir: 17640, sharePC: 0.166 },
    { teto: 1800000, nominal: 0.16, deduzir: 35640, sharePC: 0.166 },
    { teto: 3600000, nominal: 0.21, deduzir: 125640, sharePC: 0.156 },
    { teto: 4800000, nominal: 0.33, deduzir: 648000, sharePC: 0.195 },
  ],
  // Anexo IV — Serviços (construção, limpeza, advocacia; sem CPP no DAS)
  4: [
    { teto: 180000, nominal: 0.045, deduzir: 0, sharePC: 0.215 },
    { teto: 360000, nominal: 0.09, deduzir: 8100, sharePC: 0.25 },
    { teto: 720000, nominal: 0.102, deduzir: 12420, sharePC: 0.24 },
    { teto: 1800000, nominal: 0.14, deduzir: 39780, sharePC: 0.23 },
    { teto: 3600000, nominal: 0.22, deduzir: 183780, sharePC: 0.22 },
    { teto: 4800000, nominal: 0.33, deduzir: 828000, sharePC: 0.25 },
  ],
  // Anexo V — Serviços intensivos em conhecimento (fator R < 28%)
  5: [
    { teto: 180000, nominal: 0.155, deduzir: 0, sharePC: 0.1715 },
    { teto: 360000, nominal: 0.18, deduzir: 4500, sharePC: 0.1715 },
    { teto: 720000, nominal: 0.195, deduzir: 9900, sharePC: 0.1815 },
    { teto: 1800000, nominal: 0.205, deduzir: 17100, sharePC: 0.1915 },
    { teto: 3600000, nominal: 0.23, deduzir: 62100, sharePC: 0.1715 },
    { teto: 4800000, nominal: 0.305, deduzir: 540000, sharePC: 0.2 },
  ],
};

/** normaliza o índice do anexo; cai no Anexo I quando ausente ou inválido */
function anexoValido(anexo?: number | null): number {
  return anexo && ANEXOS_SIMPLES[anexo] ? anexo : 1;
}

/** faixa (1–6) de uma empresa a partir da RBT12; null quando a RBT12 é inválida */
export function faixaDe(anexo: number | null | undefined, rbt12: number): number | null {
  if (!(rbt12 > 0)) return null;
  const tabela = ANEXOS_SIMPLES[anexoValido(anexo)];
  for (let i = 0; i < tabela.length; i++) {
    if (rbt12 <= tabela[i].teto) return i + 1;
  }
  return tabela.length; // acima do teto do Simples: última faixa (sublimite tratado à parte)
}

/**
 * Alíquota EFETIVA do Simples a partir da RBT12 real: (RBT12 × nominal − PD) / RBT12.
 * Retorna null se a RBT12 for inválida (sem valor não há efetiva — usa-se o fallback).
 */
export function aliquotaEfetivaSimples(anexo: number | null | undefined, rbt12: number): number | null {
  const f = faixaDe(anexo, rbt12);
  if (f == null) return null;
  const faixa = ANEXOS_SIMPLES[anexoValido(anexo)][f - 1];
  return Math.max((rbt12 * faixa.nominal - faixa.deduzir) / rbt12, 0);
}

export interface DDAS {
  /** parcela PIS/Cofins que sai do DAS, como fração da receita — é o `das` do motor */
  das: number;
  /** faixa usada (1–6) */
  faixa: number;
  /** anexo usado (1–5) */
  anexo: number;
  /** alíquota do Simples aplicada (efetiva quando há RBT12; nominal no fallback) */
  aliquota: number;
  /** fração PIS/Cofins da partilha da faixa */
  sharePC: number;
  /** RBT12 usada, quando informada */
  rbt12: number | null;
  /** "efetiva" = calculada da RBT12 real · "conservador" = topo da faixa (nominal) */
  fonte: "efetiva" | "conservador";
  /**
   * RBT12 acima do teto do Simples (R$ 4,8 mi). Antes isso virava faixa 6 em
   * silêncio; a empresa está EXCLUÍDA do Simples e não tem decisão de setembro.
   * Quem consome precisa avisar em vez de calcular.
   */
  acimaDoTeto?: boolean;
}

/**
 * dDAS EFETIVO por empresa — o número que entra no motor como `das`.
 *
 * Com RBT12 real → alíquota efetiva daquela RBT12 × sharePC da faixa.
 * Sem RBT12     → FALLBACK CONSERVADOR: alíquota nominal (topo da faixa) ×
 *                 sharePC, na faixa informada (ou faixa 3 se nada vier). Nunca
 *                 subestima o custo, e o laudo marca a premissa como estimada.
 */
export function dDASefetivo(
  anexo?: number | null,
  rbt12?: number | null,
  faixaFallback?: number | null
): DDAS {
  const a = anexoValido(anexo);
  const tabela = ANEXOS_SIMPLES[a];

  if (rbt12 && rbt12 > 0) {
    const f = faixaDe(a, rbt12) as number;
    const faixa = tabela[f - 1];
    const efetiva = Math.max((rbt12 * faixa.nominal - faixa.deduzir) / rbt12, 0);
    const acimaDoTeto = rbt12 > tabela[tabela.length - 1].teto;
    return { das: efetiva * faixa.sharePC, faixa: f, anexo: a, aliquota: efetiva, sharePC: faixa.sharePC, rbt12, fonte: "efetiva", acimaDoTeto };
  }

  // FALLBACK — mudou em 26/07/2026, depois da validação externa.
  // Antes caía na faixa 3, e isso NÃO era conservador: um comércio realmente na
  // faixa 1 recebia `das` de 1,4725% em vez de 0,6200% — 2,4× o valor real. E
  // `das` maior significa `cl` menor, ou seja, o erro empurrava para OPTAR, que
  // é a direção perigosa. A faixa 1 é o menor `das` possível do anexo, portanto
  // o maior `cl`, portanto o viés contra optar. Melhor ainda é exigir a RBT12.
  const f = faixaFallback && tabela[faixaFallback - 1] ? faixaFallback : 1;
  const faixa = tabela[f - 1];
  return { das: faixa.nominal * faixa.sharePC, faixa: f, anexo: a, aliquota: faixa.nominal, sharePC: faixa.sharePC, rbt12: null, fonte: "conservador" };
}

/* ==========================================================================
 * RECEITA SEGREGADA POR ANEXO
 *
 * O erro que isto corrige: até aqui a empresa tinha UM anexo. Mas o Simples
 * segrega receita por atividade dentro do MESMO CNPJ — a fábrica que também
 * revende (II e I), a prestadora que vende produto (III e I), e principalmente
 * o serviço que fica no III ou no V conforme o fator R. Cada anexo tem a sua
 * tabela e, o que importa aqui, a sua PARTILHA DE PIS/COFINS: 15,5% no I,
 * 14,0% no II, 15,6%–17,1% no III, 17,15%–19,15% no V.
 *
 * Como `das` é exatamente a fatia de PIS/Cofins que sai do DAS ao optar, tratar
 * uma empresa mista por um anexo só erra o número que decide. Um exemplo real:
 * metade comércio (I) e metade serviço no V, RBT12 de R$ 1,2 mi — pelo Anexo I
 * sozinho o `das` sai bem abaixo do verdadeiro, e `das` menor significa `cl`
 * maior, ou seja, empurra para NÃO optar. O viés existe nas duas direções
 * conforme a composição, que é justamente o motivo de não dar para escolher
 * "o anexo principal" e seguir em frente.
 *
 * A CONTA. A RBT12 é da EMPRESA, não da atividade — é ela que define a faixa e
 * a alíquota efetiva em CADA tabela, como no PGDAS. Depois, cada anexo entra
 * com o peso da receita dele:
 *
 *     das = Σ ( participação_a × alíquota_efetiva_a × sharePC_a )
 *
 * Com um anexo só e participação de 100%, isto devolve exatamente o que
 * `dDASefetivo` devolvia — as análises antigas continuam valendo.
 * ========================================================================== */

export interface Segmento {
  /** anexo do Simples (1 a 5) */
  anexo: number;
  /** participação desta atividade na receita, em fração (0,4 = 40%) */
  share: number;
}

export interface SegmentoCalculado extends DDAS {
  share: number;
  /** quanto este anexo contribui para o `das` final, em fração da receita */
  contribuicao: number;
}

export interface DDASSegregado extends DDAS {
  segregado: true;
  segmentos: SegmentoCalculado[];
  /** soma das participações informadas, ANTES de qualquer normalização */
  somaInformada: number;
  /**
   * true quando a soma não fechava 100% e foi normalizada. Nunca deveria
   * acontecer — a tela não deixa salvar fora de 100% — mas se acontecer, o
   * laudo precisa poder dizer isso em vez de imprimir um número silenciosamente
   * escalado.
   */
  normalizado: boolean;
}

const TOLERANCIA_SOMA = 0.005;

/**
 * `segmentos` com um item só (ou vazio) cai no comportamento de sempre.
 * Participação zero ou negativa é descartada: linha em branco na tela não pode
 * virar peso na conta.
 */
export function dDASsegregado(
  segmentos: Segmento[] | null | undefined,
  rbt12?: number | null,
  faixaFallback?: number | null
): DDAS | DDASSegregado {
  const validos = (segmentos ?? []).filter((s) => s && s.share > 0 && anexoValido(s.anexo) === s.anexo);

  if (validos.length === 0) return dDASefetivo(null, rbt12, faixaFallback);
  if (validos.length === 1) return dDASefetivo(validos[0].anexo, rbt12, faixaFallback);

  const somaInformada = validos.reduce((t, s) => t + s.share, 0);
  const normalizado = Math.abs(somaInformada - 1) > TOLERANCIA_SOMA;
  const divisor = somaInformada > 0 ? somaInformada : 1;

  const calculados: SegmentoCalculado[] = validos.map((s) => {
    const base = dDASefetivo(s.anexo, rbt12, faixaFallback);
    const share = normalizado ? s.share / divisor : s.share;
    return { ...base, share, contribuicao: base.das * share };
  });

  const das = calculados.reduce((t, s) => t + s.contribuicao, 0);
  const aliquota = calculados.reduce((t, s) => t + s.aliquota * s.share, 0);
  const sharePC = das > 0 && aliquota > 0 ? das / aliquota : 0;
  // o anexo "da empresa" é o de maior receita — serve para rótulo e para o
  // alerta de fator R, nunca para a conta, que é sempre a soma acima
  const dominante = calculados.reduce((a, b) => (b.share > a.share ? b : a));

  return {
    das,
    faixa: dominante.faixa,
    anexo: dominante.anexo,
    aliquota,
    sharePC,
    rbt12: dominante.rbt12,
    fonte: calculados.every((s) => s.fonte === "efetiva") ? "efetiva" : "conservador",
    acimaDoTeto: calculados.some((s) => s.acimaDoTeto),
    segregado: true,
    segmentos: calculados,
    somaInformada,
    normalizado,
  };
}

/** discriminante para quem consome o resultado sem saber qual dos dois veio */
export function ehSegregado(d: DDAS | DDASSegregado): d is DDASSegregado {
  return (d as DDASSegregado).segregado === true;
}

/**
 * ONDE O SERVIÇO FICA — III ou V, pelo fator R.
 *
 * `alertaFatorR` já cuida do caso de um anexo só. Com receita segregada a
 * pergunta muda de forma: não é "o anexo está certo?", é "a receita de serviço
 * está no anexo certo?". Devolve null quando não há serviço de fator R na
 * composição — construção e afins (Anexo IV) não entram nesta regra.
 */
export function fatorRSegregado(
  segmentos: Segmento[] | null | undefined,
  folhaSobreReceita: number | null | undefined
): { fator: number; deveriaSer: 3 | 5; declarado: number[]; texto: string } | null {
  const f = folhaSobreReceita;
  if (f == null || !isFinite(f)) return null;
  const servicos = (segmentos ?? []).filter((s) => (s.anexo === 3 || s.anexo === 5) && s.share > 0);
  if (servicos.length === 0) return null;

  const deveriaSer: 3 | 5 = f >= 0.28 ? 3 : 5;
  // sem spread de Set: o tsconfig do projeto compila para um alvo que não
  // itera Set sem downlevelIteration, e isto roda também nos testes compilados
  const declarados = servicos
    .map((s) => s.anexo)
    .filter((a, i, todos) => todos.indexOf(a) === i);
  const erradas = servicos.filter((s) => s.anexo !== deveriaSer);
  if (erradas.length === 0) return null;

  const total = erradas.reduce((t, s) => t + s.share, 0);
  return {
    fator: f,
    deveriaSer,
    declarado: declarados,
    texto:
      `Folha em ${pct(f)} da receita. Com fator R ${f >= 0.28 ? "igual ou acima" : "abaixo"} de 28%, ` +
      `a receita de serviço vai ao Anexo ${deveriaSer} — e ${pct(total)} da receita está declarada ` +
      `no Anexo ${erradas.map((s) => s.anexo).join(" e ")}. A alíquota do Simples muda, e com ela a ` +
      "parcela que sai do DAS. Confirme a segregação antes de emitir o laudo.",
  };
}

/** a participação tem de fechar 100% — usado pela tela para travar o salvamento */
export function somaSegmentos(segmentos: Segmento[] | null | undefined): number {
  return (segmentos ?? []).reduce((t, s) => t + (s.share > 0 ? s.share : 0), 0);
}
export function segmentosFechados(segmentos: Segmento[] | null | undefined): boolean {
  const s = somaSegmentos(segmentos);
  return Math.abs(s - 1) <= TOLERANCIA_SOMA;
}

/**
 * dDAS por anexo E faixa — espelho conservador (nominal × sharePC), derivado da
 * tabela oficial acima, para o modo demonstração e o `parametros_exercicio`.
 * A fonte única é ANEXOS_SIMPLES; aqui é só a projeção topo-da-faixa.
 */
export const DAS_POR_ANEXO_FAIXA: Record<number, Record<number, number>> = Object.fromEntries(
  Object.entries(ANEXOS_SIMPLES).map(([a, faixas]) => [
    Number(a),
    Object.fromEntries(faixas.map((f, i) => [i + 1, Math.round(f.nominal * f.sharePC * 1e5) / 1e5])),
  ])
);

/** resolve o dDAS conservador de uma empresa; cai no anexo I faixa 1 se faltar dado */
export function dasDe(anexo?: number | null, faixa?: number | null): number {
  return dDASefetivo(anexo, null, faixa).das;
}

/**
 * ÁRVORE DE DECISÃO — reordenada em 26/07/2026 após validação externa.
 *
 * A ordem anterior tinha três defeitos medidos num grid de 16.800 combinações:
 *
 *  1. `cl <= 0` decidia ANTES da qualificação. 12,9% dos casos caíam nessa regra
 *     e 4,5% recebiam "optar, condicionado a repasse" com `rq < 0,3` — empresa
 *     sem a quem transferir crédito, com repasse infinito no laudo, e que a
 *     triagem da carteira teria descartado. Agora a qualificação vem primeiro, e
 *     quem paga menos imposto sem depender de negociação tem saída PRÓPRIA (S5).
 *
 *  2. `preco` só era consultado quando `re < 0,8·fc`, ou seja, exatamente onde
 *     menos importava. Uma empresa SEM poder de renegociar e com a conta
 *     apertada (re/fc 0,85) recebia S3 "leve os dois cenários ao empresário",
 *     enquanto a mesma empresa com a conta mais FOLGADA (0,76) recebia S2 "a
 *     negociação não fecha". Economia melhor, recomendação pior. Agora o teste
 *     de `preco` vem antes da banda de fronteira: quem não consegue renegociar
 *     não está em fronteira nenhuma.
 *
 *  3. `corteS1` era inerte: com a banda capturando [0,8·fc ; 1,2·fc], tudo acima
 *     de 1,2 virava S1 com ou sem ele. O corte superior agora é o próprio
 *     `fronteiraMax`, que é o mesmo número com significado.
 *
 * A ordem abaixo é significativa. Ler de cima para baixo.
 */
export function decidir(r: Respostas, p: Parametros = PARAMETROS_2027): Resultado {
  const fMin = p.fronteiraMin ?? 0.8;
  const fMax = p.fronteiraMax ?? 1.2;
  const rqMin = p.rqMin ?? 0.3;

  const rq = r.b2b * r.qual;
  const ch = p.aliquota * (1 - r.cred);
  const cl = ch - p.das;
  const re = rq > 0 ? cl / rq : Number.POSITIVE_INFINITY;
  const fc = p.aliquota - p.das;

  let saida: Saida;
  let motivo: string;

  if (rq < rqMin) {
    // Sem receita qualificada não há a quem transferir crédito. Vale inclusive
    // quando o híbrido sairia mais barato: o ganho não compensa a apuração por
    // fora numa empresa que vende para consumidor final ou para o Simples.
    saida = "S1";
    motivo = `Receita qualificada de ${pct(rq)} — abaixo do piso de ${pct(rqMin)}. Não há a quem transferir crédito em volume que justifique apurar por fora.`;
  } else if (cl <= 0) {
    // O híbrido custa MENOS em termos absolutos. Optar não depende de
    // renegociar preço nenhum — e por isso não é o mesmo conselho que o S4.
    saida = "S5";
    motivo = `Custo líquido negativo (${pct(cl)}): no regime regular a empresa paga menos pelos créditos das próprias compras, sem depender de renegociar preço.`;
  } else if (fc <= 0) {
    // Guarda para exercícios futuros: se o que sai do DAS alcançar a alíquota,
    // o comprador não ganha crédito extra e as bandas de fronteira se invertem.
    saida = "S1";
    motivo = "O que sai do DAS alcança a alíquota do regime regular: o comprador não teria crédito adicional a ganhar.";
  } else if (re > fc * fMax) {
    // O repasse necessário estoura o ganho do comprador. Não fecha para ninguém.
    saida = "S1";
    motivo = `Repasse necessário de ${pct(re)} contra ganho de ${pct(fc)} do comprador: a conta não fecha para nenhum dos dois lados.`;
  } else if (r.preco <= 1) {
    // A conta fecha, a negociação não. Preparar a janela seguinte.
    saida = "S2";
    motivo = "A conta fecha, a negociação não: sem poder de renegociar preço, o repasse não acontece a tempo desta janela.";
  } else if (re >= fc * fMin) {
    // Cabe, mas por pouco: o motor não decide, o empresário decide.
    saida = "S3";
    motivo = `Repasse de ${pct(re)} contra ganho de ${pct(fc)}: dentro da banda de fronteira (${fMin}× a ${fMax}× o ganho do comprador). A conta cabe, mas por pouco.`;
  } else {
    saida = "S4";
    motivo = `Repasse de ${pct(re)} bem abaixo do ganho de ${pct(fc)} do comprador: sobra folga de ${((fc - re) * 100).toFixed(1).replace(".", ",")} pontos para a negociação.`;
  }

  /**
   * BANDA DO SUBLIMITE — R$ 3,6 milhões.
   *
   * Perto do sublimite, ICMS e ISS saem do DAS por força do próprio Simples, e
   * a comparação entre ficar dentro e apurar por fora muda de natureza no meio
   * do exercício. O motor não tem como saber de que lado a empresa vai fechar o
   * ano — então devolve a decisão a quem tem: o empresário.
   *
   * Não vale para quem já caiu em S1 por falta de receita qualificada: ali não
   * há decisão a tomar, o sublimite não cria uma.
   */
  const sublimite = p.sublimite ?? 0;
  const banda = p.bandaSublimite ?? 0;
  const rbt12 = p.rbt12 ?? null;
  let bandaSublimite = false;
  if (
    sublimite > 0 &&
    banda > 0 &&
    rbt12 != null &&
    rbt12 > 0 &&
    Math.abs(rbt12 - sublimite) <= sublimite * banda &&
    rq >= rqMin
  ) {
    bandaSublimite = true;
    saida = "S3";
    motivo =
      `RBT12 de ${moeda(rbt12)}, dentro da faixa de ${moeda(sublimite * (1 - banda))} a ` +
      `${moeda(sublimite * (1 + banda))} em torno do sublimite de ${moeda(sublimite)}. ` +
      "Ultrapassar o sublimite no curso do ano muda o que já sai do DAS e desloca a conta — " +
      "a decisão é do empresário, com os dois cenários à vista.";
  }

  // Prioridade é um SELO, não uma saída: uma empresa pode ser prioridade
  // e ainda assim receber "não optar". Descoberta da validação de 22/07.
  const prioridade = r.exig === 1 || (r.conc === 1 && rq > 0.7);

  return { rq, ch, cl, re, fc, folga: fc - re, saida, prioridade, motivo, banda_sublimite: bandaSublimite };
}

export const SAIDAS: Record<Saida, { titulo: string; descricao: string; cor: string }> = {
  S1: {
    titulo: "Não optar",
    descricao:
      "Perfil sem contrapartida comercial que justifique o custo. O híbrido aumentaria a carga sem retorno.",
    cor: "vermelho",
  },
  S2: {
    titulo: "Não optar nesta janela — preparar março",
    descricao:
      "A conta fecha, a negociação não. Plano de renegociação nos próximos meses e decisão na janela seguinte.",
    cor: "amarelo",
  },
  S3: {
    titulo: "Zona de fronteira — decisão do empresário",
    descricao:
      "O motor não decide. Apresente os dois cenários em reunião e registre a escolha com termo assinado.",
    cor: "neutro",
  },
  S4: {
    titulo: "Optar, condicionado a repasse",
    descricao:
      "Optar é vantajoso para os dois lados desde que o preço seja renegociado antes do fim da janela.",
    cor: "verde",
  },
  S5: {
    titulo: "Optar por vantagem direta",
    descricao:
      "No regime regular a empresa paga menos, pelos créditos das próprias compras — sem depender de renegociar preço com ninguém. Confirme se o custo de apurar por fora cabe no ganho.",
    cor: "verde",
  },
};

export const pct = (x: number, casas = 1) =>
  !isFinite(x) ? "—" : `${(x * 100).toFixed(casas).replace(".", ",")}%`;

export const moeda = (x?: number | null) =>
  x == null || !isFinite(x)
    ? "—"
    : x.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/* ==========================================================================
 * FATIA 5 — o que faz o contador poder cobrar pelo laudo
 * ========================================================================== */

export interface Cenario {
  rotulo: string;
  aliquota: number;
  resultado: Resultado;
  /** true no cenário que sustenta a recomendação */
  principal: boolean;
}

/**
 * OS DOIS CENÁRIOS. A decisão é tomada antes de a alíquota existir; um laudo
 * com um número só esconde do empresário o risco que ele não controla.
 */
export function cenarios(r: Respostas, p: Parametros = PARAMETROS_2027): Cenario[] {
  return [
    {
      rotulo: `Estimativa de trabalho — ${pct(p.aliquota)}`,
      aliquota: p.aliquota,
      resultado: decidir(r, p),
      principal: true,
    },
    {
      rotulo: `Sensibilidade — ${pct(ALIQUOTA_ALTERNATIVA)}`,
      aliquota: ALIQUOTA_ALTERNATIVA,
      resultado: decidir(r, { ...p, aliquota: ALIQUOTA_ALTERNATIVA }),
      principal: false,
    },
  ];
}

export interface Dinheiro {
  /** receita usada na conversão — a RBT12 informada */
  receita: number | null;
  /** folga da negociação × receita qualificada × receita, em R$/ano */
  ganho_anual: number | null;
  /** custo declarado de apurar IBS/CBS fora do DAS, em R$/ano */
  custo_anual: number | null;
  /** meses até o ganho cobrir o custo; null quando não há como calcular */
  payback_meses: number | null;
  /** quanto a empresa absorve por ano se o repasse NÃO for aceito */
  absorvido_anual: number | null;
}

/**
 * O NÚMERO EM REAIS.
 *
 * O laudo dava percentual, e percentual não se compara com honorário nem com
 * custo de apuração. Aqui vira R$/ano ao lado do custo de apurar por fora.
 *
 * HONESTIDADE EMBUTIDA: sem RBT12 não há receita, e sem receita não há R$ —
 * devolve null em vez de estimar. Sem custo declarado, não há payback: o laudo
 * omite a seção em vez de inventar a premissa.
 */
export function emReais(
  res: Resultado,
  receita?: number | null,
  custoAnual?: number | null
): Dinheiro {
  const r = receita != null && isFinite(receita) && receita > 0 ? receita : null;
  const c = custoAnual != null && isFinite(custoAnual) && custoAnual > 0 ? custoAnual : null;
  const ganho = r != null && isFinite(res.folga) ? res.folga * res.rq * r : null;
  const absorvido = r != null ? res.cl * r : null;
  const payback = ganho != null && c != null && ganho > 0 ? (c / ganho) * 12 : null;
  return {
    receita: r,
    ganho_anual: ganho,
    custo_anual: c,
    payback_meses: payback,
    absorvido_anual: absorvido,
  };
}

export interface LinhaSensibilidade {
  titulo: string;
  pergunta: string;
  saida: Saida | null;
  re: number | null;
  fc: number | null;
  folga: number | null;
  efeito: string;
}

/**
 * TRÊS LINHAS, não um estudo. O que muda se a premissa mais frágil ceder.
 */
export function sensibilidade(
  r: Respostas,
  p: Parametros = PARAMETROS_2027,
  dinheiro?: Dinheiro
): LinhaSensibilidade[] {
  const base = decidir(r, p);
  const linhas: LinhaSensibilidade[] = [];

  // 1) receita qualificada 10 pontos menor
  const rqBase = r.b2b * r.qual;
  const rqMenor = Math.max(rqBase - 0.1, 0);
  const qualMenor = r.b2b > 0 ? rqMenor / r.b2b : 0;
  const cenarioRq = decidir({ ...r, qual: qualMenor }, p);
  linhas.push({
    titulo: "Receita qualificada 10 pontos menor",
    pergunta: `E se, em vez de ${pct(rqBase)}, apenas ${pct(rqMenor)} da receita for vendida a quem aproveita crédito?`,
    saida: cenarioRq.saida,
    re: isFinite(cenarioRq.re) ? cenarioRq.re : null,
    fc: cenarioRq.fc,
    folga: isFinite(cenarioRq.folga) ? cenarioRq.folga : null,
    efeito:
      cenarioRq.saida === base.saida
        ? "A recomendação não muda."
        : `A recomendação muda de ${base.saida} para ${cenarioRq.saida}.`,
  });

  // 2) o repasse não é aceito
  linhas.push({
    titulo: "O repasse de preço não é aceito",
    pergunta: "E se o cliente não aceitar o reajuste que equilibra a conta?",
    saida: null,
    re: null,
    fc: null,
    folga: null,
    efeito:
      `A empresa absorve o custo líquido de ${pct(base.cl)} da receita` +
      (dinheiro?.absorvido_anual != null
        ? `, o que representa ${moeda(dinheiro.absorvido_anual)} por ano na receita informada.`
        : ". Informe a RBT12 para converter em reais.") +
      " Sem repasse, a opção deixa de ser vantajosa.",
  });

  // 3) alíquota fixada acima da estimativa de trabalho
  const alt = decidir(r, { ...p, aliquota: ALIQUOTA_ALTERNATIVA });
  linhas.push({
    titulo: `Alíquota fixada em ${pct(ALIQUOTA_ALTERNATIVA)}`,
    pergunta: "E se a Resolução do Senado fixar a referência acima da estimativa de trabalho?",
    saida: alt.saida,
    re: isFinite(alt.re) ? alt.re : null,
    fc: alt.fc,
    folga: isFinite(alt.folga) ? alt.folga : null,
    efeito:
      alt.saida === base.saida
        ? "A recomendação não muda."
        : `A recomendação muda de ${base.saida} para ${alt.saida}.`,
  });

  return linhas;
}

/* ==========================================================================
 * FATIA 7 — precisão
 * ========================================================================== */

/**
 * PARTILHA PIS/COFINS POR EXERCÍCIO.
 *
 * `sharePC` estava fixo na tabela do anexo, e isso é verdade em 2027 e 2028 —
 * só a fatia federal migra para a CBS. De 2029 em diante ICMS e ISS começam a
 * sair do DAS em degraus anuais, e a fatia que deixa o DAS deixa de ser a
 * mesma. Não há partilha publicada para esses exercícios, então a função
 * RECUSA calcular em vez de projetar: número inventado em documento assinado
 * por contador não tem conserto.
 */
export const EXERCICIOS_PARAMETRIZADOS = [2027, 2028];

export function sharePCDe(
  anexo: number | null | undefined,
  faixa: number,
  exercicio = 2027
): { valor: number | null; motivo: string } {
  const tabela = ANEXOS_SIMPLES[anexoValido(anexo)];
  const f = tabela[faixa - 1];
  if (!f) return { valor: null, motivo: `Faixa ${faixa} inexistente no Anexo ${anexoValido(anexo)}.` };
  if (!EXERCICIOS_PARAMETRIZADOS.includes(exercicio)) {
    return {
      valor: null,
      motivo:
        `A partilha do DAS do exercício ${exercicio} não está parametrizada. ` +
        "De 2029 em diante ICMS e ISS saem do DAS em degraus anuais e a fatia que migra para a " +
        "CBS deixa de ser a de 2027 — o valor precisa vir de norma, não de projeção.",
    };
  }
  return { valor: f.sharePC, motivo: `Partilha PIS/Cofins da faixa ${faixa} do Anexo ${anexoValido(anexo)}, vigente em ${exercicio}.` };
}

/** fator R = folha de 12 meses ÷ receita bruta de 12 meses */
export function fatorR(folha: number, receita: number): number | null {
  if (!(receita > 0)) return null;
  return folha / receita;
}

export interface AlertaFatorR {
  fator: number;
  anexoDeclarado: number;
  anexoSugerido: number;
  texto: string;
}

/**
 * ALERTA DE FATOR R — avisa, nunca bloqueia.
 *
 * A pergunta da folha é uma FAIXA ("15 a 30%"), não um número apurado: bloquear
 * a emissão com base nela travaria laudo legítimo. O aviso pede confirmação
 * explícita do anexo e segue; a confirmação fica registrada nos parâmetros.
 */
export function alertaFatorR(
  anexoDeclarado: number | null | undefined,
  folhaSobreReceita: number | null | undefined
): AlertaFatorR | null {
  const a = anexoDeclarado ?? 0;
  const f = folhaSobreReceita;
  if (f == null || !isFinite(f)) return null;
  if (a !== 3 && a !== 5) return null;

  if (a === 5 && f >= 0.28) {
    return {
      fator: f,
      anexoDeclarado: 5,
      anexoSugerido: 3,
      texto:
        `Folha declarada em ${pct(f)} da receita. Com fator R igual ou acima de 28% a atividade ` +
        "vai ao Anexo III, e a alíquota do Simples — logo, a parcela que sai do DAS — muda. " +
        "Confirme o anexo antes de emitir o laudo.",
    };
  }
  if (a === 3 && f < 0.28) {
    return {
      fator: f,
      anexoDeclarado: 3,
      anexoSugerido: 5,
      texto:
        `Folha declarada em ${pct(f)} da receita. Com fator R abaixo de 28% a atividade cai no ` +
        "Anexo V, com alíquota mais alta e outra parcela saindo do DAS. Confirme o anexo antes " +
        "de emitir o laudo.",
    };
  }
  return null;
}

/* --------------------------------------------------------------------------
 * PERGUNTAS DESDOBRADAS — Q2 e Q3 eram as mais ambíguas do questionário.
 *
 * O motor continua consumindo `qual` e `cred`: as perguntas menores DERIVAM
 * esses dois valores. Assim as análises antigas seguem válidas e o laudo pode
 * mostrar a composição de cada premissa em vez de um percentual sem origem.
 * -------------------------------------------------------------------------- */

export interface DetalheQual {
  /** fração dos clientes PJ que estão fora do Simples (Real ou Presumido) */
  fora_simples: number;
  /** fração DESSES que, ainda assim, não aproveita crédito (imunes, órgão público, revenda a consumidor final) */
  sem_aproveitamento: number;
}

export function derivarQual(d: DetalheQual): number {
  return Math.min(Math.max(d.fora_simples * (1 - d.sem_aproveitamento), 0), 1);
}

export interface DetalheCred {
  /** mercadorias e insumos comprados de fornecedor fora do Simples, em % da receita */
  insumos: number;
  /** serviços tomados de PJ fora do Simples, em % da receita */
  servicos: number;
  /** energia, aluguel de PJ, fretes e demais insumos com crédito, em % da receita */
  outros: number;
}

export function derivarCred(d: DetalheCred): number {
  return Math.min(Math.max(d.insumos + d.servicos + d.outros, 0), 1);
}
