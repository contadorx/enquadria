/**
 * CSV da carteira — parse e mapeamento de colunas.
 *
 * O contador exporta a carteira de sistemas diferentes, então os cabeçalhos
 * variam. Em vez de exigir um formato rígido (que ele não vai seguir), a gente
 * reconhece as colunas por sinônimos e aceita o mínimo: CNPJ e razão social.
 * Todo o resto — CNAE, porte, situação — a gente enriquece contra a Receita.
 */

import Papa from "papaparse";
import { normalizarCnpj, cnpjValido } from "./cnpj";

export interface LinhaCarteira {
  cnpj: string;
  razao_social: string;
  cnae_principal?: string;
  porte?: string;
  situacao?: string;
  regime?: string;
  anexo?: number;
  faturamento_faixa?: string;
  /** RBT12 em R$ (receita bruta dos 12 meses) — base da alíquota efetiva */
  rbt12?: number;
}

/**
 * Interpreta um valor monetário BR ("1.200.000,00", "R$ 450000", "1200000")
 * como número. Devolve undefined para rótulos de faixa ("3,6mi", "acima",
 * "20–40%") ou qualquer coisa abaixo de R$ 1.000 — que não é RBT12 real.
 */
export function parseValorBRL(bruto?: string | null): number | undefined {
  if (!bruto) return undefined;
  let s = String(bruto).trim();
  // rótulos de faixa e percentuais não são RBT12
  if (/%|mi\b|milh|acima|até|ate|entre|\ba\b/i.test(s)) return undefined;
  s = s.replace(/r\$|\s/gi, "");
  if (s.includes(",")) {
    // vírgula é decimal no padrão BR → pontos são milhar
    s = s.replace(/\./g, "").replace(",", ".");
  } else if ((s.match(/\./g) || []).length > 1) {
    // vários pontos → todos milhar
    s = s.replace(/\./g, "");
  } else if (/\.\d{3}$/.test(s)) {
    // um ponto seguido de 3 dígitos → milhar (450.000)
    s = s.replace(/\./g, "");
  }
  const n = Number(s.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n >= 1000 ? n : undefined;
}

export interface ResultadoParse {
  linhas: LinhaCarteira[];
  descartadas: number;
  duplicadas: number;
  total_lidas: number;
  colunas_reconhecidas: Partial<Record<keyof LinhaCarteira, string>>;
  colunas_ignoradas: string[];
}

const SINONIMOS: Record<keyof LinhaCarteira, string[]> = {
  cnpj: ["cnpj", "cnpj/cpf", "documento", "cnpjcpf", "inscricao"],
  razao_social: ["razao social", "razao", "nome", "empresa", "razaosocial", "nome empresarial", "cliente"],
  cnae_principal: ["cnae", "cnae principal", "cnae fiscal", "atividade", "cnaeprincipal", "cnae_principal"],
  porte: ["porte", "porte empresa", "porte da empresa"],
  situacao: ["situacao", "situacao cadastral", "status"],
  regime: ["regime", "regime tributario", "tributacao", "enquadramento"],
  anexo: ["anexo", "anexo simples"],
  faturamento_faixa: ["faturamento", "faixa faturamento", "receita", "rbt12", "faturamento 12m"],
  rbt12: ["rbt 12", "receita bruta 12 meses", "receita bruta acumulada", "faturamento anual", "faturamento 12 meses", "rbt12 valor"],
};

const semAcento = (s: string) =>
  (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

function casarColuna(cabecalho: string): keyof LinhaCarteira | null {
  const h = semAcento(cabecalho);
  for (const [campo, nomes] of Object.entries(SINONIMOS)) {
    if (nomes.some((n) => h === n || h.includes(n))) return campo as keyof LinhaCarteira;
  }
  return null;
}

export function parsearCarteira(texto: string): ResultadoParse {
  const parsed = Papa.parse<Record<string, string>>(texto, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const cabecalhos = parsed.meta.fields ?? [];
  const mapa: Partial<Record<keyof LinhaCarteira, string>> = {};
  const ignoradas: string[] = [];

  for (const h of cabecalhos) {
    const campo = casarColuna(h);
    if (campo && !mapa[campo]) mapa[campo] = h;
    else ignoradas.push(h);
  }

  const vistos = new Set<string>();
  const linhas: LinhaCarteira[] = [];
  let descartadas = 0;
  let duplicadas = 0;

  const pega = (row: Record<string, string>, campo: keyof LinhaCarteira) => {
    const col = mapa[campo];
    return col ? (row[col] ?? "").trim() : "";
  };

  for (const row of parsed.data) {
    const cnpjBruto = pega(row, "cnpj");
    if (!cnpjValido(cnpjBruto)) {
      descartadas++;
      continue;
    }
    const cnpj = normalizarCnpj(cnpjBruto);
    if (vistos.has(cnpj)) {
      duplicadas++;
      continue;
    }
    vistos.add(cnpj);

    const anexoBruto = pega(row, "anexo");
    const anexo = anexoBruto ? parseInt(anexoBruto.replace(/\D/g, ""), 10) : undefined;

    const fatRaw = pega(row, "faturamento_faixa");
    const rbtRaw = pega(row, "rbt12");
    const rbt12 = parseValorBRL(rbtRaw) ?? parseValorBRL(fatRaw);

    linhas.push({
      cnpj,
      razao_social: pega(row, "razao_social") || "(sem razão social)",
      cnae_principal: pega(row, "cnae_principal") || undefined,
      porte: pega(row, "porte") || undefined,
      situacao: pega(row, "situacao") || undefined,
      regime: pega(row, "regime") || undefined,
      anexo: Number.isFinite(anexo) ? anexo : undefined,
      faturamento_faixa: fatRaw || rbtRaw || undefined,
      rbt12,
    });
  }

  return {
    linhas,
    descartadas,
    duplicadas,
    total_lidas: parsed.data.length,
    colunas_reconhecidas: mapa,
    colunas_ignoradas: ignoradas,
  };
}

export const CSV_EXEMPLO = `cnpj,razao_social,cnae_principal,porte,regime,rbt12
11.222.333/0001-81,Distribuidora Aurora Autopeças Ltda,4649-4/08,EPP,Simples Nacional,480000
07.526.557/0001-00,Casa Nova Restaurante ME,5611-2/01,ME,Simples Nacional,220000
22.333.444/0001-55,Transportes Vale Verde Ltda,4930-2/02,EPP,Simples Nacional,1200000`;
