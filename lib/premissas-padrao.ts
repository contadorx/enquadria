/**
 * PREMISSAS PADRÃO POR CNAE — o que destrava a análise em lote.
 *
 * O gargalo entre importar a carteira e faturar era este: o motor pede 7
 * respostas por empresa. Para 46 empresas na fila, isso é meia tarde de
 * trabalho antes do primeiro laudo — e é onde a maioria desiste.
 *
 * Aqui a gente parte de um PERFIL TÍPICO por atividade e roda a carteira
 * inteira de uma vez. O contador então revisa só o que importa, em vez de
 * digitar tudo do zero.
 *
 * HONESTIDADE OBRIGATÓRIA: premissa estimada não é premissa informada. Toda
 * análise gerada em lote fica marcada como ESTIMADA, e a tela e o laudo dizem
 * isso. O contador assina embaixo — ele precisa saber o que revisou e o que não.
 *
 * Os valores usados são exatamente os das opções do questionário, para que a
 * empresa aberta na tela apareça com os botões certos já selecionados.
 */

import type { Respostas } from "./motor";

export type Confianca = "alta" | "media" | "baixa";

export interface PerfilPadrao {
  respostas: Respostas;
  confianca: Confianca;
  /** por que este perfil foi atribuído — aparece na tela de revisão */
  justificativa: string;
}

/** valores válidos do questionário (espelham as opções da tela do motor) */
const B2B = { nenhum: 0.12, baixo: 0.3, medio: 0.5, alto: 0.7, dominante: 0.9 };
const QUAL = { quase_nenhum: 0.1, minoria: 0.33, maioria: 0.65, quase_todos: 0.92 };
const CRED = { minimo: 0.1, baixo: 0.22, medio: 0.37, alto: 0.52, muito_alto: 0.7 };
const FOLHA = { baixa: 0.12, media: 0.22, alta: 0.37, muito_alta: 0.55 };

type Perfil = Omit<PerfilPadrao, "respostas"> & { respostas: Respostas };

function perfil(
  b2b: number,
  qual: number,
  cred: number,
  folha: number,
  preco: number,
  conc: number,
  confianca: Confianca,
  justificativa: string
): Perfil {
  return {
    respostas: { b2b, qual, cred, folha, preco, conc, exig: 0 },
    confianca,
    justificativa,
  };
}

/**
 * Perfis por divisão de CNAE (2 primeiros dígitos).
 * A regra de ouro: na dúvida, o perfil é CONSERVADOR — puxa para "não optar",
 * porque um falso "optar" custa caro ao cliente do contador.
 */
const POR_DIVISAO: Record<string, Perfil> = {
  // ---- Atacado: o caso mais claro de B2B com crédito relevante
  "46": perfil(B2B.dominante, QUAL.maioria, CRED.alto, FOLHA.baixa, 2, 1, "alta",
    "Atacado: venda predominante a outras empresas e compras de mercadoria que geram crédito."),

  // ---- Indústria (divisões 10 a 33)
  ...Object.fromEntries(
    Array.from({ length: 24 }, (_, i) => String(i + 10).padStart(2, "0")).map((d) => [
      d,
      perfil(B2B.dominante, QUAL.maioria, CRED.alto, FOLHA.media, 2, 1, "alta",
        "Indústria: vende para empresas e tem insumos que geram crédito."),
    ])
  ),

  // ---- Construção civil
  "41": perfil(B2B.alto, QUAL.maioria, CRED.medio, FOLHA.alta, 1, 0, "media",
    "Construção: mistura de clientes PJ e PF, folha alta e crédito de material intermediário."),
  "42": perfil(B2B.alto, QUAL.maioria, CRED.medio, FOLHA.alta, 1, 0, "media",
    "Obras de infraestrutura: cliente predominantemente PJ ou público."),
  "43": perfil(B2B.medio, QUAL.minoria, CRED.medio, FOLHA.alta, 1, 0, "media",
    "Serviços especializados de obra: parte relevante do faturamento vem de pessoa física."),

  // ---- Transporte de carga
  "49": perfil(B2B.dominante, QUAL.maioria, CRED.medio, FOLHA.alta, 2, 1, "alta",
    "Transporte de carga: contratante quase sempre é empresa; combustível e manutenção geram crédito."),
  "52": perfil(B2B.dominante, QUAL.maioria, CRED.baixo, FOLHA.alta, 2, 1, "media",
    "Armazenagem e apoio ao transporte: cliente empresarial, mas pouco insumo com crédito."),
  "53": perfil(B2B.alto, QUAL.maioria, CRED.baixo, FOLHA.alta, 1, 0, "media",
    "Correio e entregas: cliente misto e estrutura de custo concentrada em folha."),

  // ---- Serviços prestados a empresas (terceirização, limpeza, segurança, RH)
  "77": perfil(B2B.dominante, QUAL.maioria, CRED.baixo, FOLHA.alta, 2, 1, "alta",
    "Aluguel de bens e equipamentos a empresas."),
  "78": perfil(B2B.dominante, QUAL.maioria, CRED.minimo, FOLHA.muito_alta, 1, 1, "alta",
    "Seleção e locação de mão de obra: quase toda a receita é folha, com pouquíssimo crédito."),
  "80": perfil(B2B.dominante, QUAL.maioria, CRED.minimo, FOLHA.muito_alta, 1, 1, "alta",
    "Vigilância e segurança: cliente PJ, estrutura dominada por folha."),
  "81": perfil(B2B.dominante, QUAL.maioria, CRED.minimo, FOLHA.muito_alta, 1, 1, "alta",
    "Serviços de limpeza a empresas: folha alta e crédito mínimo."),
  "82": perfil(B2B.dominante, QUAL.maioria, CRED.baixo, FOLHA.alta, 2, 1, "alta",
    "Serviços administrativos a empresas."),

  // ---- Serviços intelectuais (o caso em que optar raramente compensa)
  "62": perfil(B2B.alto, QUAL.minoria, CRED.minimo, FOLHA.muito_alta, 2, 0, "media",
    "Tecnologia: cliente PJ frequente, mas quase nenhum insumo com crédito e folha alta."),
  "63": perfil(B2B.alto, QUAL.minoria, CRED.minimo, FOLHA.muito_alta, 2, 0, "media",
    "Serviços de informação: estrutura intelectual, crédito baixo."),
  "69": perfil(B2B.alto, QUAL.minoria, CRED.minimo, FOLHA.muito_alta, 1, 0, "media",
    "Jurídico e contábil: parte da carteira é pessoa física e o crédito de compras é mínimo."),
  "70": perfil(B2B.dominante, QUAL.maioria, CRED.minimo, FOLHA.muito_alta, 2, 0, "media",
    "Consultoria em gestão: cliente PJ, mas serviço intensivo em pessoas."),
  "71": perfil(B2B.alto, QUAL.maioria, CRED.baixo, FOLHA.alta, 2, 1, "media",
    "Engenharia e arquitetura: cliente misto, algum crédito de projeto e material."),
  "73": perfil(B2B.dominante, QUAL.maioria, CRED.baixo, FOLHA.alta, 2, 1, "media",
    "Publicidade e pesquisa: cliente PJ com repasse de mídia."),
  "74": perfil(B2B.alto, QUAL.minoria, CRED.minimo, FOLHA.alta, 1, 0, "baixa",
    "Atividades profissionais diversas: perfil heterogêneo, revise caso a caso."),

  // ---- B2C evidente: optar praticamente nunca compensa
  "47": perfil(B2B.nenhum, QUAL.quase_nenhum, CRED.alto, FOLHA.media, 0, 0, "alta",
    "Varejo: cliente final é pessoa física e não aproveita crédito."),
  "55": perfil(B2B.baixo, QUAL.quase_nenhum, CRED.medio, FOLHA.alta, 0, 0, "alta",
    "Hospedagem: receita predominante de pessoa física."),
  "56": perfil(B2B.nenhum, QUAL.quase_nenhum, CRED.medio, FOLHA.alta, 0, 0, "alta",
    "Alimentação: consumidor final não aproveita crédito."),
  "85": perfil(B2B.baixo, QUAL.quase_nenhum, CRED.minimo, FOLHA.muito_alta, 0, 0, "alta",
    "Educação: aluno pessoa física, folha alta."),
  "86": perfil(B2B.baixo, QUAL.minoria, CRED.baixo, FOLHA.muito_alta, 1, 0, "media",
    "Saúde: paciente pessoa física, com parte de convênio."),
  "93": perfil(B2B.nenhum, QUAL.quase_nenhum, CRED.baixo, FOLHA.alta, 0, 0, "alta",
    "Esporte e lazer: consumidor final."),
  "96": perfil(B2B.nenhum, QUAL.quase_nenhum, CRED.baixo, FOLHA.alta, 0, 0, "alta",
    "Serviços pessoais: consumidor final."),
};

/** perfil usado quando o CNAE não diz nada — conservador de propósito */
const PADRAO_NEUTRO: Perfil = perfil(
  B2B.medio,
  QUAL.minoria,
  CRED.baixo,
  FOLHA.alta,
  1,
  0,
  "baixa",
  "CNAE sem perfil dominante identificado: premissas neutras e conservadoras. Revise antes de emitir o laudo."
);

const divisao = (cnae?: string | null) => (cnae || "").replace(/\D/g, "").slice(0, 2);

/** premissas prováveis para uma empresa a partir do CNAE */
export function premissasPadrao(cnae?: string | null): PerfilPadrao {
  const d = divisao(cnae);
  const p = POR_DIVISAO[d];
  if (!p) return { ...PADRAO_NEUTRO, respostas: { ...PADRAO_NEUTRO.respostas } };
  return { ...p, respostas: { ...p.respostas } };
}

export const ROTULO_CONFIANCA: Record<Confianca, string> = {
  alta: "Perfil claro",
  media: "Confirme",
  baixa: "Revise",
};

export const COR_CONFIANCA: Record<Confianca, string> = {
  alta: "text-verde",
  media: "text-amarelo",
  baixa: "text-vermelho",
};

/** marca gravada em analises.parametros para saber o que foi estimado */
export const ORIGEM_LOTE = "lote_cnae";
