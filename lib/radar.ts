/**
 * RADAR DA TRANSIÇÃO — casamento de impacto.
 *
 * O valor do radar não é a notícia: é responder "QUAIS clientes MEUS isso
 * atinge?". Esta função é pura (sem I/O) para rodar no servidor e no teste.
 *
 * Regra: critério vazio = atinge todo mundo. Cada chave presente RESTRINGE.
 * Todas as chaves presentes precisam bater (E lógico); dentro de uma chave,
 * basta um valor bater (OU lógico).
 */

export interface CriterioRadar {
  /** anexos do Simples (1..5) */
  anexos?: number[];
  /** faixas da triagem: A, B, C, D, MEI, FORA */
  faixas?: string[];
  /** saídas do motor: S1..S4 */
  saidas?: string[];
  /** divisões de CNAE (2 primeiros dígitos) */
  divisoes_cnae?: string[];
  /** só conta empresa que já tem análise salva */
  somente_com_analise?: boolean;
}

export interface ItemRadar {
  id: string;
  /** o endereço público em /reforma/<slug> — ver a migration 0064 e lib/slug.ts.
   *  Opcional porque as telas internas não o consultam e porque o índice único
   *  é parcial: uma linha sem endereço entra no banco, só não vira página. */
  slug?: string | null;
  titulo: string;
  resumo: string;
  o_que_fazer: string | null;
  fonte: string | null;
  publicado_em: string;
  vigencia_em: string | null;
  severidade: string;
  criterio: CriterioRadar | null;
}

export interface EmpresaRadar {
  id: string;
  razao_social: string;
  cnpj: string;
  anexo: number | null;
  faixa: string | null;
  cnae_principal: string | null;
  /** saída da análise salva, quando existe */
  saida?: string | null;
  tem_analise?: boolean;
}

const divisao = (cnae?: string | null) => (cnae || "").replace(/\D/g, "").slice(0, 2);

/** a empresa é atingida por este critério? */
export function afeta(criterio: CriterioRadar | null | undefined, e: EmpresaRadar): boolean {
  const c = criterio ?? {};

  if (c.somente_com_analise && !e.tem_analise) return false;

  if (c.anexos?.length) {
    if (e.anexo == null || !c.anexos.includes(Number(e.anexo))) return false;
  }
  if (c.faixas?.length) {
    if (!e.faixa || !c.faixas.includes(e.faixa)) return false;
  }
  if (c.saidas?.length) {
    if (!e.saida || !c.saidas.includes(e.saida)) return false;
  }
  if (c.divisoes_cnae?.length) {
    const d = divisao(e.cnae_principal);
    if (!d || !c.divisoes_cnae.includes(d)) return false;
  }
  return true;
}

/** empresas atingidas por um item */
export function atingidas(item: ItemRadar, empresas: EmpresaRadar[]): EmpresaRadar[] {
  return empresas.filter((e) => afeta(item.criterio, e));
}

export const COR_SEVERIDADE: Record<string, string> = {
  alta: "text-vermelho",
  media: "text-amarelo",
  baixa: "text-muted",
};

export const ROTULO_SEVERIDADE: Record<string, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Informativo",
};

/**
 * Ordena o radar pelo que importa ao contador: o que já está valendo ou está
 * prestes a valer vem primeiro; depois por severidade; depois por publicação.
 */
export function ordenar(itens: ItemRadar[], hojeISO: string): ItemRadar[] {
  const peso: Record<string, number> = { alta: 0, media: 1, baixa: 2 };
  const hoje = new Date(hojeISO).getTime();
  return [...itens].sort((a, b) => {
    const da = a.vigencia_em ? new Date(a.vigencia_em).getTime() : Number.POSITIVE_INFINITY;
    const db = b.vigencia_em ? new Date(b.vigencia_em).getTime() : Number.POSITIVE_INFINITY;
    const fa = da >= hoje ? 0 : 1; // futuro/vigente antes de passado
    const fb = db >= hoje ? 0 : 1;
    if (fa !== fb) return fa - fb;
    if (fa === 0 && da !== db) return da - db; // o mais próximo primeiro
    const pa = peso[a.severidade] ?? 1;
    const pb = peso[b.severidade] ?? 1;
    if (pa !== pb) return pa - pb;
    return new Date(b.publicado_em).getTime() - new Date(a.publicado_em).getTime();
  });
}

/** dias entre hoje e a vigência (negativo = já passou) */
export function diasPara(vigencia: string | null, hojeISO: string): number | null {
  if (!vigencia) return null;
  const ms = new Date(vigencia).getTime() - new Date(hojeISO).getTime();
  return Math.ceil(ms / 86_400_000);
}
