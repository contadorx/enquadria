import { afeta, type CriterioRadar, type EmpresaRadar, type ItemRadar } from "./radar";

/**
 * O APONTAMENTO — o radar com memória.
 *
 * O radar responde "quem esta norma atinge?" toda vez que perguntam. O
 * apontamento responde "o que já apontamos, e o que foi feito a respeito?" — e
 * essa segunda pergunta é a que sustenta uma assinatura, porque é a única que
 * ainda faz sentido em janeiro, quando não há janela nenhuma aberta.
 *
 * Este arquivo é PURO: decide o que deveria existir, o que falta criar e o que
 * ficou para trás. Quem grava é a rota; quem testa é a suíte, sem banco.
 */

export type StatusApontamento =
  | "novo"
  | "tratado"
  | "nao_se_aplica"
  | "virou_servico"
  | "superado";

export interface Apontamento {
  id: string;
  item_id: string;
  empresa_id: string;
  status: StatusApontamento;
  nota: string | null;
  criado_em: string;
  tratado_em: string | null;
}

export const ROTULO_STATUS: Record<StatusApontamento, string> = {
  novo: "Novo",
  tratado: "Tratado",
  nao_se_aplica: "Não se aplica",
  virou_servico: "Virou serviço",
  superado: "Superado",
};

/**
 * O que ainda pede trabalho do contador.
 *
 * `superado` fica de fora porque não é dívida: é registro de algo que deixou de
 * casar. E `nao_se_aplica` também sai — a decisão de que não se aplica JÁ é o
 * trabalho, e continuar contando seria transformar a lista em algo que nunca
 * zera. Lista que nunca zera é lista que se para de ler.
 */
export const ABERTOS: StatusApontamento[] = ["novo"];

export function estaAberto(a: { status: StatusApontamento }): boolean {
  return ABERTOS.includes(a.status);
}

export interface PlanoDeGeracao {
  /** pares (item, empresa) que casam e ainda não têm registro */
  criar: { item_id: string; empresa_id: string; criterio: CriterioRadar | null }[];
  /** apontamentos cuja empresa deixou de casar com o critério */
  superar: string[];
  /** apontamentos marcados como superados que voltaram a casar */
  reabrir: string[];
}

/**
 * O DIFF DE UM DIA DE MONITOR.
 *
 * Roda sobre as matérias ativas e a carteira inteira, e devolve as três coisas
 * que podem ter mudado desde ontem. É um diff, e não uma reconstrução, por uma
 * razão que vale a pena escrever: reconstruir apagaria o estado que o contador
 * registrou à mão. Ele marcou "não se aplica" na terça; a varredura de quarta
 * não pode desfazer isso porque recalculou tudo do zero.
 *
 * ---------------------------------------------------------------------------
 * SUPERAR NÃO É APAGAR. A empresa que mudou de anexo e deixou de ser atingida
 * ganha `superado` — o registro continua lá, dizendo que um dia ela foi
 * apontada e por quê. Apagar seria reescrever o passado pela porta dos fundos.
 *
 * E `superado` volta atrás: se ela casar de novo (o CNAE foi corrigido, a
 * análise mudou a saída), o apontamento REABRE em vez de nascer um segundo.
 * Dois registros do mesmo fato contariam a mesma dívida duas vezes.
 */
export function planejarGeracao(
  itens: ItemRadar[],
  empresas: EmpresaRadar[],
  existentes: Pick<Apontamento, "item_id" | "empresa_id" | "status">[]
): PlanoDeGeracao {
  const chave = (i: string, e: string) => `${i}|${e}`;
  const jaTem = new Map(existentes.map((a) => [chave(a.item_id, a.empresa_id), a]));

  const criar: PlanoDeGeracao["criar"] = [];
  const reabrir: string[] = [];
  const casam = new Set<string>();

  for (const item of itens) {
    for (const e of empresas) {
      if (!afeta(item.criterio, e)) continue;
      const k = chave(item.id, e.id);
      casam.add(k);
      const atual = jaTem.get(k);
      if (!atual) {
        criar.push({ item_id: item.id, empresa_id: e.id, criterio: item.criterio ?? null });
      } else if (atual.status === "superado") {
        reabrir.push(k);
      }
    }
  }

  /* o que existe, não casa mais e ainda não estava marcado como superado.
     `nao_se_aplica` e `virou_servico` são decisões do contador e não são
     tocadas: superar uma decisão dele seria o sistema opinando por cima. */
  const superar: string[] = [];
  for (const [k, a] of Array.from(jaTem.entries())) {
    if (casam.has(k)) continue;
    if (a.status === "superado" || a.status === "nao_se_aplica" || a.status === "virou_servico") {
      continue;
    }
    superar.push(k);
  }

  return { criar, superar, reabrir };
}

/** o resumo que a varredura devolve — e que vira a linha do painel */
export interface ResultadoVarredura {
  itens: number;
  empresas: number;
  criados: number;
  superados: number;
  reabertos: number;
}

/**
 * QUANTOS APONTAMENTOS ABERTOS POR EMPRESA — para o selo da linha da fila.
 */
export function abertosPorEmpresa(
  apontamentos: Pick<Apontamento, "empresa_id" | "status">[]
): Record<string, number> {
  const mapa: Record<string, number> = {};
  for (const a of apontamentos) {
    if (!estaAberto(a)) continue;
    mapa[a.empresa_id] = (mapa[a.empresa_id] ?? 0) + 1;
  }
  return mapa;
}

/**
 * O QUE APARECEU DESDE A ÚLTIMA VISITA.
 *
 * A pergunta que traz o contador de volta fora da janela. Sem data de
 * referência devolve os novos de sempre — nunca a lista inteira, que seria
 * anunciar como novidade o que já estava lá.
 */
export function novosDesde<T extends { criado_em: string; status: StatusApontamento }>(
  apontamentos: T[],
  desdeISO: string | null
): T[] {
  const corte = desdeISO ? new Date(desdeISO).getTime() : null;
  return apontamentos.filter((a) => {
    if (!estaAberto(a)) return false;
    if (corte == null) return true;
    return new Date(a.criado_em).getTime() > corte;
  });
}
