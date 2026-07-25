/**
 * TRIAGEM AUTOMÁTICA — classifica a carteira antes de qualquer pergunta.
 *
 * Roda no momento da importação, cruzando CNAE, porte e situação cadastral.
 * Objetivo: eliminar 60-80% da carteira sem gastar um minuto do contador.
 * É o "aha" do primeiro clique e o único componente que depende da base da
 * Receita Federal — o moat que nenhum concorrente tem de graça.
 */

export type Faixa = "MEI" | "FORA" | "A" | "B" | "C" | "D";

export interface EmpresaBruta {
  cnpj: string;
  razao_social: string;
  cnae_principal?: string | null;
  cnaes_secundarios?: string[] | null;
  porte?: string | null;
  situacao?: string | null;
  regime?: string | null;
  faturamento_faixa?: string | null;
}

export interface Triagem {
  faixa: Faixa;
  motivo: string;
  prioridade_maxima: boolean;
}

/** divisões CNAE de perfil B2B dominante */
const B2B_FORTE = ["46", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "31", "32", "33", "41", "42", "43", "52", "71", "73", "77", "78", "80", "81", "82"];

/** divisões de perfil misto — B2B com estrutura de custo desfavorável */
const MISTO = ["62", "63", "69", "68", "53", "95", "70", "74"];

/** divisões de perfil B2C evidente */
const B2C = ["47", "55", "56", "85", "86", "93", "96", "97"];

const div = (cnae?: string | null) => (cnae || "").replace(/\D/g, "").slice(0, 2);

/**
 * ANEXO PROVÁVEL a partir do CNAE — só um ponto de partida quando a empresa não
 * traz o anexo do CSV nem da Receita. Comércio → I, indústria/extrativa → II,
 * construção e serviços do §5º-C → IV, demais serviços → III (o mais comum).
 * A distinção III × V depende do fator R (folha), que o CNAE não revela — por
 * isso serviço cai em III, e o contador ajusta na análise se for o caso.
 */
export function anexoPorCnae(cnae?: string | null): number | undefined {
  const d = div(cnae);
  if (!d) return undefined;
  const n = Number(d);
  if (["45", "46", "47"].includes(d)) return 1; // comércio
  if (n >= 5 && n <= 33) return 2; // indústria e extrativa
  if (["41", "42", "43"].includes(d)) return 4; // construção civil
  if (n >= 49 && n <= 99) return 3; // serviços em geral
  return 3;
}

export function triar(e: EmpresaBruta): Triagem {
  const situacao = (e.situacao || "").toUpperCase();
  const porte = (e.porte || "").toUpperCase();
  const regime = (e.regime || "").toUpperCase();
  const d = div(e.cnae_principal);

  if (situacao && !situacao.includes("ATIV")) {
    return { faixa: "FORA", motivo: `Situação cadastral: ${e.situacao}.`, prioridade_maxima: false };
  }
  if (porte.includes("MEI") || regime.includes("MEI")) {
    return {
      faixa: "MEI",
      motivo: "O regime híbrido alcança apenas ME e EPP. MEI segue com alíquota fixa.",
      prioridade_maxima: false,
    };
  }
  if (regime && !regime.includes("SIMPLES")) {
    return {
      faixa: "FORA",
      motivo: "Empresa já fora do Simples — entra na trilha de transição, não nesta janela.",
      prioridade_maxima: false,
    };
  }

  // transporte rodoviário de carga: divisão 49 só entra pelo grupo 493
  const grupo = (e.cnae_principal || "").replace(/\D/g, "").slice(0, 3);
  const cargaRodoviaria = grupo === "493";

  const secundarioB2B = (e.cnaes_secundarios || []).some((c) => B2B_FORTE.includes(div(c)));
  const nearSublimite = /3[,.]6|4[,.]8|acima/i.test(e.faturamento_faixa || "");

  if (B2B_FORTE.includes(d) || cargaRodoviaria) {
    return {
      faixa: "A",
      motivo: "CNAE de perfil B2B dominante — atacado, indústria, transporte de carga, terceirização ou engenharia.",
      prioridade_maxima: nearSublimite,
    };
  }
  if (MISTO.includes(d)) {
    return {
      faixa: "B",
      motivo: "Perfil misto ou B2B com folha alta, onde o crédito de compras tende a ser baixo.",
      prioridade_maxima: false,
    };
  }
  if (B2C.includes(d)) {
    return secundarioB2B
      ? {
          faixa: "C",
          motivo: "Atividade principal B2C, mas há CNAE secundário de perfil empresarial. Análise rápida.",
          prioridade_maxima: false,
        }
      : {
          faixa: "D",
          motivo: "Varejo, alimentação, saúde ou serviço a pessoa física. Gera laudo curto e termo de ciência.",
          prioridade_maxima: false,
        };
  }
  return {
    faixa: "C",
    motivo: "CNAE sem perfil dominante identificado. Análise rápida para confirmar o descarte.",
    prioridade_maxima: false,
  };
}

export const ROTULO_FAIXA: Record<Faixa, string> = {
  MEI: "MEI — fora da regra",
  FORA: "Já fora do Simples",
  A: "Urgente",
  B: "Avaliar",
  C: "Baixo risco",
  D: "Descarte documentado",
};

export function resumir(triagens: Triagem[]) {
  const base: Record<Faixa, number> = { MEI: 0, FORA: 0, A: 0, B: 0, C: 0, D: 0 };
  for (const t of triagens) base[t.faixa]++;
  const analises = base.A + base.B;
  const curtos = base.C + base.D;
  return { ...base, total: triagens.length, analises, curtos };
}
