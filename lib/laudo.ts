/**
 * Monta o conteúdo de apresentação do laudo e do termo a partir de uma
 * análise já persistida. Fica separado das páginas de impressão para que a
 * mesma lógica alimente laudo, termo e, no futuro, o PDF server-side.
 *
 * Nada aqui recalcula o motor — usa os valores congelados na análise, que são
 * a fonte da verdade daquele laudo naquela data.
 */

import {
  pct,
  moeda,
  SAIDAS,
  ANEXOS_SIMPLES,
  type Saida,
  type DDAS,
  type SegmentoCalculado as SegmentoImpresso,
  type CarimboAliquota,
  type Cenario,
  type Dinheiro,
  type LinhaSensibilidade,
  type AlertaFatorR,
  type DetalheQual,
  type DetalheCred,
} from "./motor";

export interface AnaliseGravada {
  id: string;
  rq: number | null;
  ch: number | null;
  cl: number | null;
  re: number | null;
  fc: number | null;
  saida: Saida | null;
  prioridade: boolean;
  respostas: Record<string, number> | null;
  calculado_em: string | null;
  /** parâmetros congelados na análise, incluindo o dDAS efetivo (rastreabilidade) */
  parametros?: {
    /** com receita segregada, `ddas.segmentos` traz a composição usada */
    ddas?: DDAS & { segmentos?: SegmentoImpresso[]; normalizado?: boolean; somaInformada?: number };
    segmentos?: { anexo: number; share: number }[] | null;
    segregado?: boolean;
    aliquota?: number;
    das?: number;
    /** "lote_cnae" quando as premissas foram estimadas pelo CNAE, não informadas */
    origem_premissas?: string;
    confianca_premissas?: string;
    /** tudo o que a fatia 5 congelou para o laudo poder imprimir sem recalcular */
    exercicio?: number;
    anexo?: number;
    rbt12?: number | null;
    sublimite?: number;
    bandaSublimite?: number;
    fronteiraMin?: number;
    fronteiraMax?: number;
    partilha?: { valor: number | null; motivo: string };
    carimbo?: CarimboAliquota;
    cenarios?: Cenario[];
    dinheiro?: Dinheiro;
    sensibilidade?: LinhaSensibilidade[];
    custo_apuracao_anual?: number | null;
    detalhes?: { qual?: DetalheQual; cred?: DetalheCred } | null;
    origens?: Record<string, string> | null;
    fator_r?: AlertaFatorR | null;
    anexo_confirmado?: boolean;
    motivo?: string;
    banda_sublimite?: boolean;
  } | null;
}

/**
 * true quando as premissas vieram da análise em lote e ainda não foram
 * confirmadas pelo contador. O laudo leva a assinatura dele — ele precisa saber.
 */
export function premissasEstimadas(a: AnaliseGravada): boolean {
  return a.parametros?.origem_premissas === "lote_cnae";
}

export interface EmpresaLaudo {
  razao_social: string;
  cnpj: string;
  anexo: number | null;
  regime: string | null;
}

export interface EscritorioLaudo {
  nome: string;
  crc: string | null;
  logo_url: string | null;
}

const FAIXA_LABEL: Record<string, string> = {
  "0.12": "até 20%",
  "0.3": "20 a 40%",
  "0.5": "40 a 60%",
  "0.7": "60 a 80%",
  "0.9": "mais de 80%",
  "0.1": "quase nenhum ou até 15%",
  "0.33": "menos da metade",
  "0.65": "mais da metade",
  "0.92": "quase todos",
  "0.22": "15 a 30%",
  "0.37": "30 a 45%",
  "0.52": "45 a 60%",
  "0.55": "mais de 45%",
};

export function premissasEmTexto(r: Record<string, number> | null): string[] {
  if (!r) return [];
  const linhas: string[] = [];
  if (r.b2b != null) linhas.push(`Vendas para pessoa jurídica: ${FAIXA_LABEL[String(r.b2b)] ?? pct(r.b2b)} da receita`);
  if (r.qual != null) linhas.push(`Clientes PJ que aproveitam crédito: ${FAIXA_LABEL[String(r.qual)] ?? pct(r.qual)}`);
  if (r.cred != null) linhas.push(`Compras que geram crédito: ${FAIXA_LABEL[String(r.cred)] ?? pct(r.cred)} da receita`);
  if (r.preco != null) {
    const p = ["não, o mercado define", "contratos travados", "com esforço", "tem poder de preço"][r.preco] ?? "—";
    linhas.push(`Poder de renegociação de preço: ${p}`);
  }
  if (r.exig === 1) linhas.push("Cliente PJ já sinalizou que exigirá crédito integral em 2027");
  return linhas;
}

export function resultadoEmTexto(a: AnaliseGravada): string[] {
  const linhas: string[] = [];
  if (a.fc != null) linhas.push(`Crédito transferido ao comprador: ${pct(Number(a.fc))} da operação`);
  if (a.re != null) linhas.push(`Repasse de preço necessário: ${pct(Number(a.re))}`);
  if (a.re != null && a.fc != null) {
    const folga = (Number(a.fc) - Number(a.re)) * 100;
    linhas.push(`Folga na negociação: ${folga.toFixed(1).replace(".", ",")} pontos percentuais`);
  }
  return linhas;
}

export function recomendacao(a: AnaliseGravada): { titulo: string; descricao: string; cor: string } {
  const s = (a.saida ?? "S1") as Saida;
  return SAIDAS[s];
}

/**
 * Rastreabilidade da base de cálculo do dDAS — como a parcela PIS/Cofris que
 * sai do DAS foi apurada. Torna o laudo auditável: qual RBT12, qual faixa, qual
 * alíquota (efetiva ou estimada). Vazio nas análises anteriores à Fatia 5.
 */
export function baseDeCalculo(a: AnaliseGravada): string[] {
  const d = a.parametros?.ddas;
  if (!d) return [];
  const linhas: string[] = [];
  if (d.fonte === "efetiva") {
    linhas.push(
      `Alíquota efetiva do Simples: ${pct(d.aliquota)} — apurada sobre a RBT12 de ${moeda(
        d.rbt12
      )} (Anexo ${d.anexo}, faixa ${d.faixa}).`
    );
  } else {
    linhas.push(
      `Alíquota do Simples: ${pct(d.aliquota)} — topo da faixa ${d.faixa} do Anexo ${d.anexo}, ` +
        `estimativa conservadora usada por falta de RBT12 informada (tende a superestimar o custo).`
    );
  }
  linhas.push(
    `Parcela PIS/Cofins que migra para a CBS e sai do DAS: ${pct(d.sharePC)} da carga do Simples = ${pct(
      d.das
    )} da receita.`
  );
  return linhas;
}

/** true quando a base do dDAS foi estimada (sem RBT12) — dispara o aviso no laudo */
export function dDASestimado(a: AnaliseGravada): boolean {
  return a.parametros?.ddas?.fonte === "conservador";
}

export function decisaoSugerida(a: AnaliseGravada): "optar" | "permanecer" {
  return a.saida === "S4" ? "optar" : "permanecer";
}

/* ==========================================================================
 * FATIA 6 — as dez seções.
 *
 * Tudo aqui LÊ o que foi congelado na análise. Nada recalcula: o laudo é prova,
 * e prova que se recalcula sozinha quando o motor muda não é prova.
 * ========================================================================== */

/** Faixas C e D recebem laudo curto: documentar a permanência, não simular a decisão. */
export function ehLaudoCurto(faixa?: string | null): boolean {
  return faixa === "C" || faixa === "D" || faixa === "MEI" || faixa === "FORA";
}

export interface PremissaImpressa {
  pergunta: string;
  resposta: string;
  origem: "coleta" | "informada" | "estimada" | "padrao";
  composicao?: string;
}

const ORIGEM_ROTULO: Record<string, string> = {
  // respondida pelo próprio cliente, no formulário — o grau mais forte de
  // proveniência que uma premissa pode ter neste produto
  coleta: "respondida pelo cliente no formulário",
  informada: "informada pelo cliente",
  estimada: "estimada pelo contador",
  padrao: "padrão do sistema",
};

export function rotuloOrigem(o: string): string {
  return ORIGEM_ROTULO[o] ?? ORIGEM_ROTULO.padrao;
}

/** Seção 3 — cada premissa com a origem marcada. Estimada aparece destacada. */
export function premissasComOrigem(a: AnaliseGravada): PremissaImpressa[] {
  const r = a.respostas ?? {};
  const p = a.parametros ?? {};
  const o = (k: string): PremissaImpressa["origem"] => {
    const v = p.origens?.[k];
    if (v === "coleta" || v === "informada" || v === "estimada" || v === "padrao") return v;
    return p.origem_premissas === "lote_cnae" ? "estimada" : "padrao";
  };
  const dq = p.detalhes?.qual;
  const dc = p.detalhes?.cred;

  const linhas: PremissaImpressa[] = [];
  if (r.b2b != null) {
    linhas.push({
      pergunta: "Parcela do faturamento vendida a outras empresas",
      resposta: pct(r.b2b),
      origem: o("b2b"),
    });
  }
  if (r.qual != null) {
    linhas.push({
      pergunta: "Dos clientes empresa, os que aproveitam crédito integral",
      resposta: pct(r.qual),
      origem: o("qual"),
      composicao: dq
        ? `${pct(dq.fora_simples)} fora do Simples, dos quais ${pct(dq.sem_aproveitamento)} ainda assim não aproveitariam o crédito.`
        : undefined,
    });
  }
  if (r.cred != null) {
    linhas.push({
      pergunta: "Compras que geram crédito, sobre a receita",
      resposta: pct(r.cred),
      origem: o("cred"),
      composicao: dc
        ? `${pct(dc.insumos)} em mercadorias e insumos, ${pct(dc.servicos)} em serviços de PJ, ${pct(dc.outros)} em energia, aluguel de PJ e fretes.`
        : undefined,
    });
  }
  if (r.folha != null) {
    linhas.push({ pergunta: "Folha sobre o faturamento", resposta: pct(r.folha), origem: o("folha") });
  }
  if (r.preco != null) {
    const t = ["não, o mercado define", "contratos travados", "com esforço", "tem poder de preço"][r.preco] ?? "—";
    linhas.push({ pergunta: "Poder de renegociar preço com o cliente empresa", resposta: t, origem: o("preco") });
  }
  if (r.conc != null) {
    linhas.push({
      pergunta: "Concorrentes diretos majoritariamente fora do Simples",
      resposta: r.conc === 1 ? "sim" : "não",
      origem: o("conc"),
    });
  }
  if (r.exig != null) {
    linhas.push({
      pergunta: "Cliente já sinalizou que exigirá crédito integral em 2027",
      resposta: r.exig === 1 ? "sim" : "não",
      origem: o("exig"),
    });
  }
  return linhas;
}

export interface PassoCalculo {
  passo: string;
  formula: string;
  substituicao: string;
  resultado: string;
}

/**
 * Seção 4 — MEMÓRIA DE CÁLCULO.
 *
 * O critério é um só: um fiscal precisa conseguir refazer no papel. Por isso
 * cada linha traz fórmula, substituição numérica e resultado — e não apenas o
 * resultado, que é o que um relatório de sistema entrega.
 */
export function memoriaDeCalculo(a: AnaliseGravada): PassoCalculo[] {
  const p = a.parametros ?? {};
  const d = p.ddas;
  const r = a.respostas ?? {};
  const passos: PassoCalculo[] = [];
  const n = (x: number | null | undefined, casas = 4) =>
    x == null || !isFinite(x) ? "—" : x.toFixed(casas).replace(".", ",");

  /**
   * RECEITA SEGREGADA. Quando a empresa tem atividade em mais de um anexo, o
   * passo 1 deixa de ser UMA alíquota e vira uma composição: cada anexo tem a
   * sua tabela e a sua partilha de PIS/Cofins, e o dDAS é a soma ponderada
   * pela receita de cada um. Sem imprimir a composição, o laudo traria um dDAS
   * que ninguém consegue refazer com a tabela de um anexo só — que é
   * exatamente o defeito que esta seção existe para não ter.
   */
  const segs = d?.segmentos;
  if (d && segs && segs.length > 1) {
    segs.forEach((s, i) => {
      const t = ANEXOS_SIMPLES[s.anexo]?.[s.faixa - 1];
      passos.push({
        passo: `1.${i + 1} Anexo ${s.anexo} — ${pct(s.share, 1)} da receita`,
        formula:
          s.fonte === "efetiva"
            ? "[(RBT12 × nominal − deduzir) ÷ RBT12] × partilha de PIS/Cofins do anexo"
            : "alíquota nominal do topo da faixa × partilha de PIS/Cofins do anexo",
        substituicao:
          s.fonte === "efetiva" && s.rbt12 && t
            ? `[(${moeda(s.rbt12)} × ${pct(t.nominal, 2)} − ${moeda(t.deduzir)}) ÷ ${moeda(s.rbt12)}] × ${pct(s.sharePC, 2)}`
            : `Anexo ${s.anexo}, faixa ${s.faixa} — RBT12 não informada`,
        resultado: `${pct(s.aliquota, 2)} de Simples · ${pct(s.das, 3)} de PIS/Cofins no anexo`,
      });
    });
    passos.push({
      passo: "2. Parcela de PIS/Cofins embutida no DAS (receita segregada)",
      formula: "dDAS = Σ (participação do anexo × PIS/Cofins do anexo)",
      substituicao: segs.map((s) => `${pct(s.share, 1)} × ${pct(s.das, 3)}`).join("  +  "),
      resultado: `dDAS = ${pct(d.das, 3)} da receita total`,
    });
  } else if (d) {
    const tabela = ANEXOS_SIMPLES[d.anexo]?.[d.faixa - 1];
    if (d.fonte === "efetiva" && d.rbt12 && tabela) {
      passos.push({
        passo: "1. Alíquota efetiva do Simples Nacional",
        formula: "(RBT12 × alíquota nominal − parcela a deduzir) ÷ RBT12",
        substituicao: `(${moeda(d.rbt12)} × ${pct(tabela.nominal, 2)} − ${moeda(tabela.deduzir)}) ÷ ${moeda(d.rbt12)}`,
        resultado: `${pct(d.aliquota, 2)}  (Anexo ${d.anexo}, faixa ${d.faixa})`,
      });
    } else {
      passos.push({
        passo: "1. Alíquota do Simples Nacional (estimada)",
        formula: "alíquota nominal do topo da faixa",
        substituicao: `Anexo ${d.anexo}, faixa ${d.faixa} — RBT12 não informada`,
        resultado: `${pct(d.aliquota, 2)}  (estimativa conservadora)`,
      });
    }
    passos.push({
      passo: "2. Parcela de PIS/Cofins embutida no DAS",
      formula: "alíquota do Simples × partilha de PIS/Cofins da faixa",
      substituicao: `${pct(d.aliquota, 2)} × ${pct(d.sharePC, 2)}`,
      resultado: `dDAS = ${pct(d.das, 3)} da receita`,
    });
  }

  if (r.b2b != null && r.qual != null) {
    passos.push({
      passo: "3. Receita qualificada",
      formula: "rq = vendas a PJ × PJ que aproveitam crédito",
      substituicao: `${n(r.b2b, 3)} × ${n(r.qual, 3)}`,
      resultado: `rq = ${pct(a.rq ?? 0)}`,
    });
  }
  if (p.aliquota != null && r.cred != null) {
    passos.push({
      passo: "4. Carga híbrida sobre a base",
      formula: "ch = alíquota IBS+CBS × (1 − compras com crédito)",
      substituicao: `${n(p.aliquota, 4)} × (1 − ${n(r.cred, 3)})`,
      resultado: `ch = ${pct(a.ch ?? 0)}`,
    });
  }
  if (a.ch != null && p.das != null) {
    passos.push({
      passo: "5. Custo líquido da empresa",
      formula: "cl = ch − dDAS",
      substituicao: `${n(Number(a.ch), 4)} − ${n(p.das, 5)}`,
      resultado: `cl = ${pct(Number(a.cl ?? 0))}`,
    });
  }
  if (a.cl != null && a.rq != null) {
    passos.push({
      passo: "6. Repasse de equilíbrio",
      formula: "re = cl ÷ rq",
      substituicao: `${n(Number(a.cl), 4)} ÷ ${n(Number(a.rq), 3)}`,
      resultado: `re = ${pct(Number(a.re ?? 0))}`,
    });
  }
  if (p.aliquota != null && p.das != null) {
    passos.push({
      passo: "7. Folga do adquirente",
      formula: "fc = alíquota IBS+CBS − dDAS",
      substituicao: `${n(p.aliquota, 4)} − ${n(p.das, 5)}`,
      resultado: `fc = ${pct(Number(a.fc ?? 0))}`,
    });
  }
  if (a.re != null && a.fc != null) {
    passos.push({
      passo: "8. Folga da negociação",
      formula: "folga = fc − re",
      substituicao: `${n(Number(a.fc), 4)} − ${n(Number(a.re), 4)}`,
      resultado: `${((Number(a.fc) - Number(a.re)) * 100).toFixed(2).replace(".", ",")} pontos percentuais`,
    });
  }
  return passos;
}

export interface LinhaQuadro {
  rotulo: string;
  dentro: string;
  fora: string;
  diferenca: string;
}

/**
 * Seção 5 — QUADRO COMPARATIVO: dentro do DAS × regime regular, em % e em R$.
 * Tudo derivado das grandezas que o motor já congelou; nada de premissa nova.
 */
export function quadroComparativo(a: AnaliseGravada): LinhaQuadro[] {
  const p = a.parametros ?? {};
  const d = p.ddas;
  const receita = p.dinheiro?.receita ?? p.rbt12 ?? null;
  if (!d || p.aliquota == null || a.ch == null) return [];

  const dentroPct = d.aliquota;
  const foraPct = d.aliquota - d.das + Number(a.ch);
  const difPct = Number(a.cl ?? 0);
  const emR$ = (x: number) => (receita ? moeda(x * receita) : "—");

  return [
    {
      rotulo: "Tributo da empresa, sobre a receita",
      dentro: pct(dentroPct, 2),
      fora: pct(foraPct, 2),
      diferenca: `${difPct >= 0 ? "+" : ""}${pct(difPct, 2)}`,
    },
    {
      rotulo: "Tributo da empresa, por ano",
      dentro: emR$(dentroPct),
      fora: emR$(foraPct),
      diferenca: receita ? `${difPct >= 0 ? "+" : ""}${moeda(difPct * receita)}` : "—",
    },
    {
      rotulo: "Crédito transferido ao cliente PJ, por operação",
      dentro: pct(d.das, 3),
      fora: pct(p.aliquota, 2),
      diferenca: `+${pct(Number(a.fc ?? 0), 2)}`,
    },
    {
      rotulo: "Repasse de preço necessário para equilibrar",
      dentro: "—",
      fora: a.re != null ? pct(Number(a.re)) : "—",
      diferenca: a.re != null && a.fc != null
        ? `folga de ${((Number(a.fc) - Number(a.re)) * 100).toFixed(1).replace(".", ",")} p.p.`
        : "—",
    },
  ];
}

/** Seção 7 — o que precisa continuar verdadeiro para a recomendação se manter. */
export function condicoesDeValidade(a: AnaliseGravada): string[] {
  const r = a.respostas ?? {};
  const p = a.parametros ?? {};
  const cond: string[] = [];
  if (a.rq != null) {
    cond.push(
      `A receita vendida a quem aproveita crédito permanecer em torno de ${pct(Number(a.rq))} do faturamento.`
    );
  }
  if (r.cred != null) {
    cond.push(`As compras que geram crédito permanecerem em torno de ${pct(r.cred)} da receita.`);
  }
  if (a.re != null && isFinite(Number(a.re)) && ehOptarSaida(a.saida)) {
    cond.push(
      `O reajuste de preço de ${pct(Number(a.re))} ser efetivamente aceito pelos clientes empresa antes do fim da janela.`
    );
  }
  if (p.carimbo) {
    cond.push(
      `A alíquota de referência de IBS/CBS ser fixada em patamar próximo de ${pct(p.carimbo.aliquota)} — o cenário alternativo de ${pct(p.carimbo.alternativa)} está na seção de sensibilidade.`
    );
  }
  if (p.rbt12 != null && p.sublimite) {
    cond.push(
      `A receita do ano permanecer do mesmo lado do sublimite de ${moeda(p.sublimite)}, que altera o que já sai do DAS.`
    );
  }
  /**
   * Com receita segregada, o mix É uma premissa. Cada anexo tem partilha de
   * PIS/Cofins própria, então mudar a proporção entre as atividades muda o
   * dDAS e pode mudar a decisão — sem que nada no cadastro da empresa mude.
   */
  const segs = p.ddas?.segmentos;
  if (segs && segs.length > 1) {
    cond.push(
      "A composição da receita permanecer próxima da declarada — " +
        segs.map((s) => `Anexo ${s.anexo} em ${pct(s.share, 1)}`).join(", ") +
        ". Cada anexo tem partilha de PIS/Cofins própria, e mudar o mix muda o que sai do DAS."
    );
    if (segs.some((s) => s.anexo === 3 || s.anexo === 5)) {
      cond.push(
        "O fator R do período manter a receita de serviço no anexo declarado — a folha em relação " +
          "à receita é o que decide entre o Anexo III e o Anexo V, e ela muda mês a mês."
      );
    }
  }
  cond.push("A empresa permanecer optante pelo Simples Nacional e em situação cadastral regular.");
  return cond;
}

function ehOptarSaida(s?: string | null): boolean {
  return s === "S4" || s === "S5";
}

/** Seção 8 — riscos e limites, incluindo os que esta análise específica carrega. */
export function riscosELimites(a: AnaliseGravada): string[] {
  const p = a.parametros ?? {};
  const riscos: string[] = [
    "A alíquota de referência de IBS e CBS ainda não foi fixada. A Resolução do Senado Federal tem prazo até 31 de outubro de 2026 — depois do encerramento da janela de opção. As duas contas deste laudo existem por causa disso.",
    "Os valores partem de premissas declaradas, não de apuração com dados fiscais efetivos. A conferência dos percentuais informados é responsabilidade do contador que assina.",
    "O cálculo trata a base como “por dentro”. A discussão sobre base por fora, ligada ao art. 516 da LC 214/2025, depende de posição jurídica e não foi aplicada aqui; se aplicada, deslocaria o resultado na direção de optar.",
    "A opção produz efeito por semestre e é cancelável até o último dia de novembro de 2026. A decisão de agora não encerra o assunto: a janela seguinte reabre a pergunta.",
  ];
  if (p.ddas?.fonte === "conservador") {
    riscos.push(
      "A RBT12 não foi informada: a parcela que sai do DAS foi estimada pelo topo da faixa, o que tende a superestimar o custo do regime regular. Informar a receita dos últimos 12 meses torna o número exato."
    );
  }
  if (p.origem_premissas === "lote_cnae") {
    riscos.push(
      "As premissas deste laudo foram estimadas a partir do CNAE na análise em lote e não foram confirmadas caso a caso."
    );
  }
  if (p.fator_r) {
    riscos.push(
      `Fator R e anexo declarado divergem: ${p.fator_r.texto} ${
        p.anexo_confirmado ? "O anexo foi confirmado pelo contador responsável." : "O anexo ainda não foi confirmado."
      }`
    );
  }
  if (p.partilha && p.partilha.valor == null) {
    riscos.push(p.partilha.motivo);
  }
  return riscos;
}

/** Seção 10 — a tabela do anexo usada, com a faixa da empresa destacada. */
export function tabelaDoAnexo(a: AnaliseGravada): {
  anexo: number;
  faixaAtual: number;
  linhas: { faixa: number; ate: string; nominal: string; deduzir: string; sharePC: string }[];
} | null {
  const d = a.parametros?.ddas;
  if (!d) return null;
  const tabela = ANEXOS_SIMPLES[d.anexo];
  if (!tabela) return null;
  return {
    anexo: d.anexo,
    faixaAtual: d.faixa,
    linhas: tabela.map((f, i) => ({
      faixa: i + 1,
      ate: moeda(f.teto),
      nominal: pct(f.nominal, 2),
      deduzir: moeda(f.deduzir),
      sharePC: pct(f.sharePC, 2),
    })),
  };
}

/** A cadeia normativa citada na seção 2 — a primeira pergunta de quem questionar depois. */
export const BASE_LEGAL: { norma: string; papel: string }[] = [
  {
    norma: "Emenda Constitucional nº 132/2023",
    papel: "instituiu o IBS e a CBS e desenhou a transição, inclusive para os optantes pelo Simples Nacional.",
  },
  {
    norma: "Lei Complementar nº 214/2025",
    papel:
      "regulamentou o IBS e a CBS e disciplinou a apuração pelo optante do Simples, dentro ou fora do documento único de arrecadação.",
  },
  {
    norma: "Lei Complementar nº 227/2026",
    papel:
      "revogou o art. 87-B e postergou o art. 517 da LC 214/2025, deslocando o fundamento da regulamentação da opção.",
  },
  {
    norma: "Resolução CGSN nº 186/2026",
    papel:
      "abriu a janela de 1º a 30 de setembro de 2026 para a opção por apurar IBS e CBS fora do DAS, com efeito de janeiro a junho de 2027 e cancelamento até o último dia de novembro de 2026. Com a revogação do art. 87-B, a Resolução apoia-se no art. 41, §§ 3º e 4º, da Lei Complementar nº 123/2006.",
  },
];
