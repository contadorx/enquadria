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

/* ───────────────────────────────────────────────────────────────────────────
 * LER O VALOR COMO OS SISTEMAS ESCREVEM, não como a gente gostaria.
 *
 * Descoberto em 07/08/2026 com a PRIMEIRA carteira real: a coluna de regime
 * veio em sigla — e `regime.includes("SIMPLES")` jogou a carteira INTEIRA em
 * "Fora do Simples". Nenhum A, nenhum B; o produto pareceu não ter lido o
 * arquivo. Os exports reais escrevem "SN", "Sim", "1 - Simples Nacional",
 * "Optante", "Não optante" — e cada leitura ingênua aqui classifica uma
 * carteira inteira errado, no primeiro contato com o produto.
 *
 * O erro tem dois sentidos, e o silencioso é o pior: "Não" numa coluna
 * "Optante pelo Simples" que o parser não reconhecia deixava a empresa de
 * Lucro Presumido ENTRAR na fila como se fosse optante.
 * ─────────────────────────────────────────────────────────────────────────── */

const semAcentoV = (s?: string | null) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();

/** interpreta o campo de regime como os exports reais o escrevem */
export function leRegime(bruto?: string | null): "simples" | "mei" | "fora" | null {
  const v = semAcentoV(bruto);
  if (!v) return null;
  /**
   * A SEGUNDA REDE DO ANEXO (08/08/2026): um valor que é SÓ um dígito de 1 a 5
   * não é regime — é anexo numa coluna que veio parar aqui. O mapeamento já foi
   * corrigido em `casarColuna`, mas o custo do erro é a carteira inteira sumindo
   * calada, então ele merece duas travas. "não sei" segue pela triagem por CNAE;
   * "fora" some da tela. Note que "1 - Simples Nacional" continua casando em
   * `^1\b` mais abaixo: aqui só cai o dígito sozinho.
   */
  if (/^[1-5]$/.test(v)) return null;
  if (/\bMEI\b|MICROEMPREENDEDOR/.test(v)) return "mei";
  // a negação vem ANTES do resto: "NAO OPTANTE" contém "OPTANTE"
  if (/\bNAO\b|^N$|^0$/.test(v)) return "fora";
  if (/PRESUMIDO|\bREAL\b|ARBITRADO|\bNORMAL\b/.test(v)) return "fora";
  if (/SIMPLES|\bSN\b|\bSIM\b|^S$|^1\b|OPTANTE/.test(v)) return "simples";
  // preenchido e irreconhecível: fora, como sempre foi — mas agora só depois
  // de todas as grafias reais terem tido a chance de casar
  return "fora";
}

/** MEI pelo porte — por palavra, não por substring ("priMEIra" contém MEI) */
export function ehMEIPorPorte(porte?: string | null): boolean {
  return /\bMEI\b|MICROEMPREENDEDOR/.test(semAcentoV(porte));
}

/**
 * A situação só DERRUBA quando reconhece um estado ruim. A versão anterior
 * derrubava tudo que não contivesse "ATIV" — e uma coluna mal mapeada (ex.:
 * "Situação Simples Nacional" = "Optante") mandava a empresa para FORA com o
 * motivo surreal "Situação cadastral: Optante". Falso-FORA é a carteira
 * sumindo da tela; valor desconhecido agora segue adiante.
 */
export function situacaoDerruba(situacao?: string | null): boolean {
  return /BAIXAD|INAPT|SUSPENS|\bNULA\b|CANCELAD|ENCERRAD|EXTINT/.test(semAcentoV(situacao));
}

export function triar(e: EmpresaBruta): Triagem {
  const d = div(e.cnae_principal);
  const regime = leRegime(e.regime);

  if (situacaoDerruba(e.situacao)) {
    return { faixa: "FORA", motivo: `Situação cadastral: ${e.situacao}.`, prioridade_maxima: false };
  }
  if (ehMEIPorPorte(e.porte) || regime === "mei") {
    return {
      faixa: "MEI",
      motivo: "O regime híbrido alcança apenas ME e EPP. MEI segue com alíquota fixa.",
      prioridade_maxima: false,
    };
  }
  if (regime === "fora") {
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
  /**
   * SEM CNAE NÃO É "SEM PERFIL DOMINANTE" — 10/08/2026.
   *
   * As duas coisas caíam no mesmo lugar, com o mesmo motivo, e o motivo
   * afirmava algo sobre um CNAE que não existia. Foi assim que uma empresa
   * importada só pelo CNPJ, com a Receita sem devolver a atividade, apareceu na
   * fila como "baixo risco" — um veredito sobre uma empresa da qual o produto
   * não sabia nada.
   *
   * A faixa continua C porque C é "olhe rápido", e é isso que se deve fazer. O
   * que muda é o que a tela diz do porquê: a diferença entre "eu olhei o CNAE e
   * ele não define" e "eu não tenho CNAE" é a diferença entre um resultado e a
   * ausência dele.
   */
  if (!d) {
    return {
      faixa: "C",
      motivo:
        "Sem CNAE para triar: não veio no arquivo e a base da Receita não devolveu. Confirme a atividade antes de decidir.",
      prioridade_maxima: false,
    };
  }

  return {
    faixa: "C",
    motivo: "CNAE sem perfil dominante identificado. Análise rápida para confirmar a permanência.",
    prioridade_maxima: false,
  };
}

export const ROTULO_FAIXA: Record<Faixa, string> = {
  MEI: "MEI — fora da regra",
  FORA: "Já fora do Simples",
  A: "Urgente",
  B: "Avaliar",
  /* "BAIXO RISCO" ERA VEREDITO — 10/08/2026. A faixa C é onde caem tanto a
     empresa cujo CNAE não define perfil quanto a empresa da qual não se sabe
     nada. Chamar as duas de "baixo risco" é o produto afirmando segurança sobre
     o que ele não avaliou; uma Petrobras importada por CNPJ solto aparecia
     assim na fila. "Análise rápida" descreve a AÇÃO, que é o que a faixa
     sempre significou — e é o que o próprio `oQueFazer` dela já dizia. */
  C: "Análise rápida",
  D: "Permanência documentada",
};

export function resumir(triagens: Triagem[]) {
  const base: Record<Faixa, number> = { MEI: 0, FORA: 0, A: 0, B: 0, C: 0, D: 0 };
  for (const t of triagens) base[t.faixa]++;
  const analises = base.A + base.B;
  const curtos = base.C + base.D;
  return { ...base, total: triagens.length, analises, curtos };
}
