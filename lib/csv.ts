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

    linhas.push({
      cnpj,
      razao_social: pega(row, "razao_social") || "(sem razão social)",
      cnae_principal: pega(row, "cnae_principal") || undefined,
      porte: pega(row, "porte") || undefined,
      situacao: pega(row, "situacao") || undefined,
      regime: pega(row, "regime") || undefined,
      anexo: Number.isFinite(anexo) ? anexo : undefined,
      faturamento_faixa: pega(row, "faturamento_faixa") || undefined,
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

export const CSV_EXEMPLO = `cnpj,razao_social,cnae_principal,porte,regime
11.222.333/0001-81,Distribuidora Aurora Autopeças Ltda,4649-4/08,EPP,Simples Nacional
07.526.557/0001-00,Casa Nova Restaurante ME,5611-2/01,ME,Simples Nacional
22.333.444/0001-55,Transportes Vale Verde Ltda,4930-2/02,EPP,Simples Nacional`;
