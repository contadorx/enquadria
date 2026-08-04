import { moeda, type Dinheiro } from "./motor";

/**
 * O ROTEIRO DA EMPRESA — onde eu estou e o que falta.
 *
 * A tela da empresa mostra tudo o que É POSSÍVEL fazer: pedir dados, preencher
 * premissas, salvar, emitir laudo, gerar termo, enviar. O que ela nunca disse é
 * o que vem AGORA. Quem abre a primeira empresa vê um formulário longo, três
 * botões desabilitados e nenhuma indicação de ordem — e a leitura natural de
 * botão apagado é "quebrado", não "ainda não é a hora".
 *
 * O roteiro é essa ordem escrita, com o passo atual marcado. Cinco passos,
 * porque a esteira do produto tem cinco: dados → análise → laudo → termo →
 * assinatura. Nenhum deles é opcional para chegar no documento que sustenta o
 * honorário.
 *
 * Função pura de propósito: o estado vem de fora (o que existe no banco) e a
 * decisão de qual passo está "agora" é testável nota a nota, sem tela.
 */

export type EstadoPasso = "feito" | "agora" | "depois";

export interface PassoRoteiro {
  chave: "dados" | "analise" | "laudo" | "termo" | "assinatura";
  titulo: string;
  /** por que este passo existe — some quando o passo já está feito */
  detalhe: string;
  estado: EstadoPasso;
}

export interface EstadoDaEmpresa {
  /** o cliente respondeu o formulário de coleta */
  temColeta: boolean;
  /** existe análise salva */
  temAnalise: boolean;
  temLaudo: boolean;
  temTermo: boolean;
  assinado: boolean;
}

const PASSOS: Array<{ chave: PassoRoteiro["chave"]; titulo: string; detalhe: string }> = [
  {
    chave: "dados",
    titulo: "Reunir as premissas",
    detalhe:
      "Peça ao cliente pelo formulário ou preencha você mesmo, se a escrituração já responde.",
  },
  {
    chave: "analise",
    titulo: "Salvar a análise",
    detalhe: "Nada é gravado até você salvar — e o laudo só existe a partir do que foi salvo.",
  },
  {
    chave: "laudo",
    titulo: "Emitir o laudo",
    detalhe: "É o documento com a sua assinatura e a memória de cálculo. É por ele que se cobra.",
  },
  {
    chave: "termo",
    titulo: "Gerar o termo de ciência",
    detalhe: "Registra que a empresa foi informada e decidiu. Protege você em 2027.",
  },
  {
    chave: "assinatura",
    titulo: "Colher a assinatura",
    detalhe: "Mande o link ao responsável. Termo sem assinatura não prova ciência.",
  },
];

/**
 * O passo "agora" é o PRIMEIRO não concluído — nunca dois ao mesmo tempo.
 * Tudo pronto devolve os cinco como feitos, e a tela mostra o encerramento em
 * vez de inventar um sexto passo.
 */
export function roteiroDaEmpresa(e: EstadoDaEmpresa): PassoRoteiro[] {
  const feitos: Record<PassoRoteiro["chave"], boolean> = {
    // dados: a análise salva também resolve — quem preencheu na mão não precisa
    // do formulário do cliente, e marcar como pendente o que já foi feito é a
    // forma mais rápida de a lista perder a credibilidade
    dados: e.temColeta || e.temAnalise,
    analise: e.temAnalise,
    laudo: e.temLaudo,
    termo: e.temTermo,
    assinatura: e.assinado,
  };

  let achouAtual = false;
  return PASSOS.map((p) => {
    if (feitos[p.chave]) return { ...p, estado: "feito" as EstadoPasso };
    if (!achouAtual) {
      achouAtual = true;
      return { ...p, estado: "agora" as EstadoPasso };
    }
    return { ...p, estado: "depois" as EstadoPasso };
  });
}

/** quantos passos já fecharam — para o "3 de 5" do cabeçalho */
export function progressoRoteiro(passos: PassoRoteiro[]): { feitos: number; total: number } {
  return { feitos: passos.filter((p) => p.estado === "feito").length, total: passos.length };
}

/**
 * A LEITURA DA TABELA EM REAIS.
 *
 * A tabela "o que isso vale no ano" entrega quatro números corretos e nenhuma
 * conclusão. Quem já domina a conta lê rápido; quem está aprendendo o serviço
 * olha "R$ 18.400 / R$ 6.000 / 3,9 meses" e não sabe dizer se isso é bom.
 *
 * Esta frase é a conclusão em uma linha — a mesma que o contador diria ao
 * cliente. Não decide nada que a tabela já não diga: só põe em português.
 *
 * DE QUEM É O DINHEIRO: da EMPRESA analisada, não do escritório. Sem isso, já
 * houve quem lesse o ganho anual como honorário.
 */
export function leituraDoDinheiro(d: Dinheiro | null | undefined): string | null {
  if (!d || d.receita == null) return null;

  const ganho = d.ganho_anual;
  if (ganho == null || ganho <= 0) {
    const absorve =
      d.absorvido_anual != null && d.absorvido_anual > 0
        ? ` Sem repasse aceito, ela ainda absorveria ${moeda(d.absorvido_anual)} por ano.`
        : "";
    return `No cenário analisado, optar não gera ganho para a empresa — só acrescenta a obrigação de apurar por fora.${absorve}`;
  }

  const partes = [`Optando, a empresa ganha cerca de ${moeda(ganho)} por ano`];

  if (d.custo_anual != null && d.custo_anual > 0) {
    if (d.payback_meses != null && d.payback_meses > 0) {
      const meses = d.payback_meses.toFixed(1).replace(".", ",");
      partes.push(
        d.payback_meses <= 12
          ? `contra ${moeda(d.custo_anual)} de custo para apurar — que se paga em ${meses} meses`
          : `contra ${moeda(d.custo_anual)} de custo para apurar, que só se paga em ${meses} meses`
      );
    } else {
      partes.push(`contra ${moeda(d.custo_anual)} de custo para apurar`);
    }
  } else {
    partes.push("e o custo de apurar por fora ainda não foi informado");
  }

  const frase = partes.join(", ") + ".";
  const risco =
    d.absorvido_anual != null && d.absorvido_anual > 0
      ? ` Se o cliente dela não aceitar o repasse, a empresa absorve ${moeda(d.absorvido_anual)} por ano — e a conta se inverte.`
      : "";
  return frase + risco;
}
