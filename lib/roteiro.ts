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

/**
 * OS CAMINHOS DE "REUNIR AS PREMISSAS" — 10/08/2026.
 *
 * O passo dizia "peça ao cliente pelo formulário ou preencha você mesmo" e não
 * oferecia nem um nem outro: era instrução sem porta. Quem lia ficava com a
 * dúvida certa ("como eu peço?") e a resposta estava três blocos abaixo, no
 * meio da tela.
 *
 * São três caminhos porque a realidade tem três, e a diferença entre eles não é
 * de gosto — é de QUEM RESPONDE, e isso muda o que o laudo pode afirmar:
 *
 *  · `coleta`  — quem responde é a empresa. As respostas entram marcadas como
 *                informadas pelo cliente, e é a origem mais forte que existe
 *                para uma premissa num documento que ele vai assinar.
 *  · `estimado`— quem responde é o perfil do CNAE. Serve para ordenar a fila e
 *                para não travar quem tem 143 clientes; NÃO serve para assinar
 *                sem conferir, e o rótulo diz isso.
 *  · `direto`  — quem responde é o contador, da escrituração. É o caminho de
 *                quem já tem o dado na mão.
 *
 * O terceiro precisa começar EM BRANCO. Preencher com a estimativa e chamar de
 * "preencher diretamente" é a mesma armadilha do roteiro que nascia riscado: a
 * tela parece pronta, o contador confirma sem ler, e o chute do CNAE vai para
 * dentro de um laudo assinado.
 */
export type CaminhoDasPremissas = "coleta" | "estimado" | "direto";

export interface AcaoDoPasso {
  caminho: CaminhoDasPremissas;
  rotulo: string;
  /** o que acontece ao escolher — o contador decide com isto, não com o nome */
  efeito: string;
}

export const ACOES_DAS_PREMISSAS: AcaoDoPasso[] = [
  {
    caminho: "coleta",
    rotulo: "Solicitar à empresa",
    efeito:
      "Gera um link com seis perguntas em português, sem jargão. O que voltar entra marcado como resposta do cliente.",
  },
  {
    caminho: "estimado",
    rotulo: "Adotar as estimadas e revisar",
    efeito:
      "Usa o perfil do CNAE como ponto de partida e você confere resposta por resposta. Mais rápido, e a origem fica registrada como estimada até você tocar.",
  },
  {
    caminho: "direto",
    rotulo: "Preencher diretamente",
    efeito:
      "Abre o formulário em branco, para você responder pela escrituração. Nada vem preenchido — o que for marcado é seu.",
  },
];

export interface PassoRoteiro {
  chave: "dados" | "analise" | "laudo" | "termo" | "assinatura";
  titulo: string;
  /** por que este passo existe — some quando o passo já está feito */
  detalhe: string;
  estado: EstadoPasso;
  /** os caminhos oferecidos quando este passo é o "agora" */
  acoes?: AcaoDoPasso[];
}

export interface EstadoDaEmpresa {
  /** o cliente respondeu o formulário de coleta */
  temColeta: boolean;
  /** existe análise salva */
  temAnalise: boolean;
  /**
   * As premissas vieram do lote por CNAE e ninguém confirmou.
   *
   * Muda o TEXTO do passo da análise, não o passo. O contador que abre uma
   * empresa da faixa A encontra o formulário INTEIRO já preenchido e conclui,
   * razoavelmente, que não há nada a fazer ali — a tela parece pronta. O
   * roteiro é o lugar onde essa armadilha é desarmada, porque é a única peça da
   * tela que fala de ORDEM.
   */
  premissasEstimadas?: boolean;
  temLaudo: boolean;
  temTermo: boolean;
  assinado: boolean;
}

const PASSOS: Array<{ chave: PassoRoteiro["chave"]; titulo: string; detalhe: string }> = [
  {
    chave: "dados",
    titulo: "Reunir as premissas",
    detalhe: "São seis respostas sobre para quem a empresa vende e o que ela compra. Escolha por onde vêm:",
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
  /**
   * ESTIMATIVA NÃO FECHA PASSO — conserto de 10/08/2026.
   *
   * O roteiro existe, segundo o comentário de `premissasEstimadas` aqui em
   * cima, para desarmar exatamente esta armadilha: o contador abre uma empresa
   * da faixa A, encontra o formulário inteiro preenchido pelo lote do CNAE e
   * conclui que não há nada a fazer.
   *
   * Só que ele estava CONFIRMANDO a armadilha. O lote grava análise, então
   * `temAnalise` virava true e os dois primeiros passos — "Reunir as premissas"
   * e "Salvar a análise" — nasciam riscados. A tela dizia "2 de 5" sobre um
   * trabalho que ninguém fez: o CNAE chutou, e chute não é premissa reunida nem
   * análise salva. O passo "agora" pulava direto para "Emitir o laudo" — que é
   * a única coisa que o contador NÃO deve fazer antes de conferir.
   *
   * Agora estimativa não fecha nada, e a empresa recém-importada volta a abrir
   * no primeiro passo, que é onde ele de fato está.
   */
  const analiseDoContador = e.temAnalise && !e.premissasEstimadas;

  const feitos: Record<PassoRoteiro["chave"], boolean> = {
    // dados: a análise salva também resolve — quem preencheu na mão não precisa
    // do formulário do cliente, e marcar como pendente o que já foi feito é a
    // forma mais rápida de a lista perder a credibilidade
    dados: e.temColeta || analiseDoContador,
    analise: analiseDoContador,
    laudo: e.temLaudo,
    termo: e.temTermo,
    assinatura: e.assinado,
  };

  let achouAtual = false;
  return PASSOS.map((base) => {
    /* o passo é o mesmo; o que muda é o que ele PEDE. Com premissas estimadas,
       "salvar a análise" esconde a tarefa real, que é conferir o que o CNAE
       chutou antes de assinar em cima. */
    const p =
      base.chave === "analise" && e.premissasEstimadas
        ? {
            ...base,
            titulo: "Conferir as premissas e salvar",
            detalhe:
              "O formulário já vem preenchido pelo perfil do CNAE — é estimativa, não a sua análise. Percorra as respostas, ajuste o que não corresponder ao cliente e salve.",
          }
        : base;
    if (feitos[p.chave]) return { ...p, estado: "feito" as EstadoPasso };
    if (!achouAtual) {
      achouAtual = true;
      /* as ações só existem no passo ATUAL: oferecer caminho para um passo que
         ainda não chegou é convidar a pular a ordem que o roteiro existe para
         estabelecer */
      return {
        ...p,
        estado: "agora" as EstadoPasso,
        ...(p.chave === "dados" ? { acoes: ACOES_DAS_PREMISSAS } : {}),
      };
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

  /**
   * "A EMPRESA GANHA CERCA DE X" — a frase que saiu em 10/08/2026.
   *
   * `ganho_anual` é a faixa de negociação inteira convertida em reais: o que a
   * empresa levaria se capturasse TUDO o que está na mesa. Dizer que ela "ganha
   * cerca de" isso afirma o topo de uma faixa como se fosse o resultado
   * esperado — e o mesmo documento explica, na seção da pressão comercial, que
   * o resultado depende de uma negociação que ninguém garante.
   *
   * A frase passa a nomear a condição e o teto. O piso continua sendo zero, e é
   * a tabela logo acima que o mostra.
   */
  const partes = [`Se o repasse for aceito, a empresa chega a até ${moeda(ganho)} por ano`];

  if (d.custo_anual != null && d.custo_anual > 0) {
    if (d.payback_meses != null && d.payback_meses > 0) {
      const meses = d.payback_meses.toFixed(1).replace(".", ",");
      /* "1,0 meses" saía no laudo do cliente. Custa uma linha e é a única
         palavra da frase que denuncia que ninguém leu a saída em voz alta. */
      const unidade = meses === "1,0" ? "mês" : "meses";
      partes.push(
        d.payback_meses <= 12
          ? `contra ${moeda(d.custo_anual)} de custo para apurar — que se paga em ${meses} ${unidade}`
          : `contra ${moeda(d.custo_anual)} de custo para apurar, que só se paga em ${meses} ${unidade}`
      );
    } else {
      partes.push(`contra ${moeda(d.custo_anual)} de custo para apurar`);
    }
  } else {
    partes.push("e o custo de apurar por fora ainda não foi informado");
  }

  const frase = partes.join(", ") + ".";
  /* o teto vem como frase própria: enfiado na primeira oração ele virava
     subordinada antes de uma vírgula de lista, e o parágrafo saía emendado */
  const teto = " É o teto da faixa de negociação, não o resultado esperado: no piso do repasse a empresa apenas não perde.";
  const risco =
    d.absorvido_anual != null && d.absorvido_anual > 0
      ? ` Sem repasse nenhum, ela absorve ${moeda(d.absorvido_anual)} por ano — e a conta se inverte.`
      : "";
  return frase + teto + risco;
}
