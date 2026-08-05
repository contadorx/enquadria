/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A DERIVA — o que mudar o motor fez com o que já estava salvo.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O QUE MUDA E O QUE NÃO MUDA, sem meio-termo.
 *
 * NÃO MUDA: os números gravados em `analises` (rq, ch, cl, re, fc, saída) e os
 * parâmetros congelados. Ninguém reprocessa nada. Um laudo emitido guarda
 * snapshot completo e continua exatamente o documento que foi entregue.
 *
 * MUDA: tudo o que é DERIVADO na hora de renderizar. A folga impressa no laudo
 * era `fc − re`; hoje é `fc − re_liquido`. A seção de pressão comercial não
 * existia. A memória de cálculo tinha oito passos e tem dez. Ou seja: reabrir
 * hoje um laudo emitido em julho mostra números e seções que o PDF entregue ao
 * cliente não tinha.
 *
 * Isso não é bug — é o preço de corrigir o motor, e corrigir foi certo. O que
 * não pode é ser invisível.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * POR QUE ESTE ARQUIVO CHAMA `decidir()` EM VEZ DE COMPARAR EM SQL.
 *
 * Uma segunda implementação da árvore — em SQL, aqui, em qualquer lugar —
 * diverge da primeira na semana seguinte, e a divergência aparece exatamente
 * no relatório que existe para detectar divergência. Foi assim que Contas e
 * Cobranças passaram meses discordando. Aqui roda o motor de produção, o
 * mesmo, sobre os parâmetros congelados de cada análise.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * O QUE ESTE ARQUIVO NÃO FAZ, e é deliberado: não reprocessa. A decisão de
 * refazer uma análise é caso a caso, do dono da plataforma e do contador que
 * assinou — não de um botão que atualiza tudo e reescreve em silêncio
 * recomendações já entregues, algumas com termo assinado.
 */
import { decidir, PARAMETROS_2027, type Saida, type Respostas } from "./motor";

export interface AnaliseCrua {
  id: string;
  tenant_id: string | null;
  tenant_nome: string | null;
  empresa_id: string | null;
  empresa_nome: string | null;
  calculado_em: string | null;
  saida: string | null;
  rq: number | null;
  ch: number | null;
  cl: number | null;
  re: number | null;
  fc: number | null;
  respostas: Record<string, number> | null;
  parametros: Record<string, unknown> | null;
  tem_laudo: boolean;
  laudo_numero: number | null;
  laudo_emitido_em: string | null;
  termo_assinado: boolean;
}

export interface LinhaDeriva {
  id: string;
  tenant_nome: string | null;
  empresa_nome: string | null;
  calculado_em: string | null;
  gravada: Saida | null;
  recalculada: Saida | null;
  muda: boolean;
  /** a saída mudou E o documento já saiu — é a linha que exige decisão humana */
  critica: boolean;
  tem_laudo: boolean;
  laudo_numero: number | null;
  termo_assinado: boolean;
  motivo_novo: string;
  /** a folga impressa antes (fc − re) e a de hoje (fc − re_liquido), em pontos */
  folga_antes: number | null;
  folga_agora: number | null;
  absorcao_cabe: boolean;
  /** por que não deu para recalcular esta linha */
  sem_base: string | null;
}

/** as premissas que o motor exige; ausência de qualquer uma impede recalcular */
function respostasDe(r: Record<string, number> | null): Respostas | null {
  if (!r) return null;
  const num = (k: string) => (typeof r[k] === "number" && isFinite(r[k]) ? r[k] : null);
  const b2b = num("b2b"), qual = num("qual"), cred = num("cred"), preco = num("preco");
  if (b2b == null || qual == null || cred == null || preco == null) return null;
  return {
    b2b, qual, cred, preco,
    folha: num("folha") ?? 0,
    conc: num("conc") ?? 0,
    exig: num("exig") ?? 0,
  };
}

export function derivaDe(a: AnaliseCrua): LinhaDeriva {
  const base: LinhaDeriva = {
    id: a.id,
    tenant_nome: a.tenant_nome,
    empresa_nome: a.empresa_nome,
    calculado_em: a.calculado_em,
    gravada: (a.saida ?? null) as Saida | null,
    recalculada: null,
    muda: false,
    critica: false,
    tem_laudo: a.tem_laudo,
    laudo_numero: a.laudo_numero,
    termo_assinado: a.termo_assinado,
    motivo_novo: "",
    folga_antes: null,
    folga_agora: null,
    absorcao_cabe: false,
    sem_base: null,
  };

  const p = (a.parametros ?? {}) as Record<string, unknown>;
  const aliquota = typeof p.aliquota === "number" ? p.aliquota : null;
  const das = typeof p.das === "number" ? p.das : null;
  const r = respostasDe(a.respostas);

  /**
   * SEM PARÂMETRO CONGELADO NÃO SE RECALCULA — e a linha diz isso em vez de
   * cair no padrão de 2027. Recalcular uma análise antiga com a alíquota de
   * hoje mediria duas mudanças ao mesmo tempo (o motor e o parâmetro) e
   * atribuiria as duas ao motor. O relatório existe para separar isso.
   */
  if (aliquota == null || das == null) return { ...base, sem_base: "sem alíquota/dDAS congelados" };
  if (!r) return { ...base, sem_base: "premissas incompletas" };

  const rbt12 = typeof p.rbt12 === "number" ? p.rbt12 : null;
  const novo = decidir(r, {
    ...PARAMETROS_2027,
    aliquota,
    das,
    rbt12,
    ...(typeof p.fronteiraMin === "number" ? { fronteiraMin: p.fronteiraMin } : {}),
    ...(typeof p.fronteiraMax === "number" ? { fronteiraMax: p.fronteiraMax } : {}),
    ...(typeof p.rqMin === "number" ? { rqMin: p.rqMin } : {}),
  });

  const muda = base.gravada != null && novo.saida !== base.gravada;
  /* a folga impressa: antes saía do repasse cheio, hoje sai do líquido */
  const folgaAntes = a.fc != null && a.re != null ? Number(a.fc) - Number(a.re) : null;
  const folgaAgora =
    a.fc != null && a.re != null ? Number(a.fc) - Number(a.re) * (1 - aliquota) : null;

  return {
    ...base,
    recalculada: novo.saida,
    muda,
    critica: muda && (a.tem_laudo || a.termo_assinado),
    motivo_novo: novo.motivo,
    folga_antes: folgaAntes,
    folga_agora: folgaAgora,
    absorcao_cabe: !!novo.absorcao_cabe,
  };
}

export interface ResumoDeriva {
  total: number;
  recalculadas: number;
  sem_base: number;
  mudam: number;
  criticas: number;
  /** "S1→S3" → quantas */
  transicoes: { de: string; para: string; n: number; comDocumento: number }[];
  /** maior diferença de folga impressa, em pontos percentuais */
  maior_diferenca_folga: number;
}

export function resumirDeriva(linhas: LinhaDeriva[]): ResumoDeriva {
  const mapa = new Map<string, { de: string; para: string; n: number; comDocumento: number }>();
  let maior = 0;
  for (const l of linhas) {
    if (l.folga_antes != null && l.folga_agora != null) {
      maior = Math.max(maior, Math.abs(l.folga_agora - l.folga_antes));
    }
    if (!l.muda || !l.gravada || !l.recalculada) continue;
    const chave = `${l.gravada}→${l.recalculada}`;
    const atual = mapa.get(chave) ?? { de: l.gravada, para: l.recalculada, n: 0, comDocumento: 0 };
    atual.n += 1;
    if (l.tem_laudo || l.termo_assinado) atual.comDocumento += 1;
    mapa.set(chave, atual);
  }
  return {
    total: linhas.length,
    recalculadas: linhas.filter((l) => l.sem_base == null).length,
    sem_base: linhas.filter((l) => l.sem_base != null).length,
    mudam: linhas.filter((l) => l.muda).length,
    criticas: linhas.filter((l) => l.critica).length,
    transicoes: Array.from(mapa.values()).sort((a, b) => b.n - a.n),
    maior_diferenca_folga: maior,
  };
}

/**
 * A LEITURA EM UMA FRASE — o que o dono da plataforma precisa saber antes de
 * olhar a tabela. Sem isto o relatório é uma lista, e lista não vira decisão.
 */
export function leituraDaDeriva(r: ResumoDeriva): string {
  if (r.total === 0) return "Não há análises gravadas.";
  if (r.mudam === 0) {
    return (
      `Nenhuma das ${r.total} análises mudaria de saída se fosse recalculada com o motor de hoje. ` +
      "As correções recentes não alcançaram nenhum caso da base."
    );
  }
  const pct = ((r.mudam / r.total) * 100).toFixed(0);
  return (
    `${r.mudam} de ${r.total} análises (${pct}%) mudariam de saída se fossem recalculadas hoje` +
    (r.criticas > 0
      ? `, e ${r.criticas} delas já têm laudo emitido ou termo assinado. Essas ${r.criticas} exigem ` +
        "decisão caso a caso: o documento que o cliente tem na mão continua o que era, e refazer a " +
        "análise não o reescreve — mas o contador precisa saber que a conta mudou."
      : ". Nenhuma delas virou documento ainda, então dá para refazer sem conversa difícil.")
  );
}
