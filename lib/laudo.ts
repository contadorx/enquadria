/**
 * Monta o conteúdo de apresentação do laudo e do termo a partir de uma
 * análise já persistida. Fica separado das páginas de impressão para que a
 * mesma lógica alimente laudo, termo e, no futuro, o PDF server-side.
 *
 * Nada aqui recalcula o motor — usa os valores congelados na análise, que são
 * a fonte da verdade daquele laudo naquela data.
 */

import { pct, SAIDAS, type Saida } from "./motor";

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

export function decisaoSugerida(a: AnaliseGravada): "optar" | "permanecer" {
  return a.saida === "S4" ? "optar" : "permanecer";
}
