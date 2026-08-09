/**
 * O ANUÁRIO — o que a Reforma exigiu do seu cliente no ano, e o que fizemos.
 *
 * POR QUE ESTE ARQUIVO EXISTE.
 *
 * O produto tem um problema de calendário que nenhuma tela resolve: a janela de
 * opção fecha em 30/09/2026 e a renovação da assinatura acontece meses depois,
 * quando não há prazo nenhum piscando na tela. Em março de 2027 a pergunta do
 * contador não é "o Enquadria é bom?" — é "o que eu ponho na mesa do meu
 * cliente para cobrar de novo?".
 *
 * A resposta já existia espalhada no banco e não tinha forma: as normas que
 * atingiram aquela empresa, o que foi decidido sobre cada uma, os documentos
 * emitidos, e quanto disso virou serviço. Aqui isso vira uma peça só.
 *
 * O QUE ESTE ARQUIVO NÃO FAZ, e é deliberado:
 *
 * · não estima, não projeta e não extrapola. Só soma o que o contador
 *   declarou. Um relatório que inventa "valor economizado" é ficção com ar de
 *   contabilidade, e quem assina embaixo é ele, não nós;
 * · não promete resultado nem receita futura. Ele olha para trás;
 * · não decide o que é relevante: lista tudo o que aconteceu, na ordem do
 *   tempo, e deixa a leitura para quem está na reunião.
 *
 * Puro: nada de I/O. A rota busca, isto organiza, a folha imprime.
 */

import type { StatusApontamento } from "./apontamentos";

/** um ponto da Reforma que tocou a empresa, já com a matéria junto */
export interface PontoDoAno {
  id: string;
  status: StatusApontamento;
  nota: string | null;
  criado_em: string;
  tratado_em: string | null;
  virou_servico_em: string | null;
  honorario_centavos: number | null;
  materia: {
    titulo: string;
    resumo: string | null;
    o_que_fazer: string | null;
    fonte: string | null;
    severidade: string | null;
    publicado_em: string | null;
    vigencia_em: string | null;
  } | null;
}

/** documento emitido para a empresa no período */
export interface DocumentoDoAno {
  tipo: "laudo" | "termo";
  numero: number | null;
  em: string | null;
  /** só para termos: se a assinatura voltou */
  assinado?: boolean;
}

export interface Periodo {
  /** ISO, inclusivo */
  de: string;
  /** ISO, inclusivo */
  ate: string;
  rotulo: string;
}

/** o ano civil como período — o recorte que o cliente entende sem explicação */
export function anoCivil(ano: number): Periodo {
  return { de: `${ano}-01-01`, ate: `${ano}-12-31`, rotulo: String(ano) };
}

const dentro = (iso: string | null | undefined, p: Periodo): boolean => {
  if (!iso) return false;
  const d = iso.slice(0, 10);
  return d >= p.de && d <= p.ate;
};

export interface LinhaDoAnuario {
  /** a data que ordena a linha na história do ano */
  quando: string;
  titulo: string;
  /** o que aconteceu, em português, sem jargão de estado interno */
  desfecho: string;
  detalhe: string | null;
  fonte: string | null;
  honorario_centavos: number | null;
  cobravel: boolean;
}

/**
 * O DESFECHO EM PORTUGUÊS.
 *
 * Os estados internos (`nao_se_aplica`, `virou_servico`) são vocabulário de
 * fila de trabalho. No papel que vai para a mesa do empresário eles precisam
 * dizer o que foi FEITO — inclusive, e principalmente, quando a resposta foi
 * "analisamos e não te atingia": esse é trabalho invisível, é o que o cliente
 * mais duvida que exista, e é justamente o que o registro prova.
 */
export function desfechoDoPonto(status: StatusApontamento): {
  texto: string;
  cobravel: boolean;
} {
  switch (status) {
    case "virou_servico":
      return { texto: "Tratado como serviço contratado.", cobravel: true };
    case "tratado":
      return { texto: "Analisado e providenciado pelo escritório.", cobravel: false };
    case "nao_se_aplica":
      return {
        texto: "Analisado: não alcança esta empresa. Nenhuma providência necessária.",
        cobravel: false,
      };
    case "superado":
      return {
        texto: "Deixou de alcançar esta empresa antes de exigir providência.",
        cobravel: false,
      };
    default:
      return { texto: "Em acompanhamento.", cobravel: false };
  }
}

export interface Anuario {
  periodo: Periodo;
  linhas: LinhaDoAnuario[];
  /** normas que tocaram a empresa no período */
  pontos: number;
  /** quantas foram analisadas e descartadas — o trabalho que não aparece */
  descartados: number;
  /** quantas ainda estão em aberto no fim do período */
  abertos: number;
  /** quantas viraram serviço contratado */
  servicos: number;
  /** o que o escritório declarou ter cobrado no período, em centavos */
  honorario_centavos: number;
  /** quantos serviços foram registrados sem valor informado */
  servicos_sem_valor: number;
  documentos: DocumentoDoAno[];
}

/**
 * Monta o anuário de UMA empresa.
 *
 * O corte é pela data do FATO, não pela data do registro: um ponto criado em
 * dezembro de 2026 e tratado em janeiro de 2027 aparece nos dois anuários, e
 * em cada um com o que aconteceu naquele ano. Cortar por `criado_em` faria o
 * trabalho de janeiro desaparecer do relatório de 2027.
 */
export function montarAnuario(
  pontos: PontoDoAno[],
  documentos: DocumentoDoAno[],
  periodo: Periodo
): Anuario {
  const linhas: LinhaDoAnuario[] = [];
  let descartados = 0;
  let abertos = 0;
  let servicos = 0;
  let honorario = 0;
  let semValor = 0;

  for (const p of pontos) {
    /* a data da linha é a do desfecho quando existe; senão a do aparecimento.
       É o que o cliente reconhece: ele lembra de quando o contador ligou, não
       de quando o monitor gravou a linha. */
    const quando = p.virou_servico_em ?? p.tratado_em ?? p.criado_em;
    if (!dentro(quando, periodo)) continue;

    const d = desfechoDoPonto(p.status);
    if (p.status === "nao_se_aplica" || p.status === "superado") descartados++;
    if (p.status === "novo") abertos++;
    if (p.status === "virou_servico") {
      servicos++;
      if (p.honorario_centavos != null) honorario += p.honorario_centavos;
      else semValor++;
    }

    linhas.push({
      quando,
      titulo: p.materia?.titulo ?? "Norma da transição",
      desfecho: d.texto,
      /* a nota do contador vence o texto genérico da norma: ela é o que ELE
         escreveu sobre ESTE cliente, e é o que dá valor à peça */
      detalhe: p.nota?.trim() || p.materia?.o_que_fazer?.trim() || null,
      fonte: p.materia?.fonte ?? null,
      honorario_centavos: p.status === "virou_servico" ? p.honorario_centavos : null,
      cobravel: d.cobravel,
    });
  }

  linhas.sort((a, b) => a.quando.localeCompare(b.quando));

  return {
    periodo,
    linhas,
    pontos: linhas.length,
    descartados,
    abertos,
    servicos,
    honorario_centavos: honorario,
    servicos_sem_valor: semValor,
    documentos: documentos.filter((d) => dentro(d.em, periodo)),
  };
}

/**
 * A FRASE DE ABERTURA DO RELATÓRIO.
 *
 * Ela é o produto inteiro numa linha, e por isso não pode ser genérica. O que
 * ela diz muda com o que aconteceu — inclusive no caso em que NADA precisou ser
 * feito, que é o resultado mais difícil de cobrar e o mais fácil de o cliente
 * confundir com "o contador não fez nada".
 */
export function aberturaDoAnuario(a: Anuario, empresa: string): string {
  if (a.pontos === 0) {
    return (
      `Em ${a.periodo.rotulo}, nenhuma das normas da transição publicadas no período alcançou ` +
      `${empresa}. O acompanhamento foi feito e está registrado — ausência de exigência também é ` +
      `resultado, e só se sabe que não havia exigência depois de conferir.`
    );
  }

  const partes: string[] = [
    `Em ${a.periodo.rotulo}, ${a.pontos} ${a.pontos === 1 ? "norma da transição alcançou" : "normas da transição alcançaram"} ${empresa}.`,
  ];
  if (a.descartados > 0) {
    partes.push(
      `${a.descartados} ${a.descartados === 1 ? "foi analisada e não exigia" : "foram analisadas e não exigiam"} providência.`
    );
  }
  if (a.servicos > 0) {
    partes.push(
      `${a.servicos} ${a.servicos === 1 ? "virou serviço contratado" : "viraram serviços contratados"}.`
    );
  }
  if (a.abertos > 0) {
    partes.push(
      `${a.abertos} ${a.abertos === 1 ? "segue em acompanhamento" : "seguem em acompanhamento"}.`
    );
  }
  return partes.join(" ");
}

/* ─────────────────────────────────────────────────────────── a carteira ── */

export interface ResumoDaCarteira {
  periodo: Periodo;
  /** empresas que tiveram ao menos um ponto no período */
  empresas_tocadas: number;
  pontos: number;
  descartados: number;
  servicos: number;
  honorario_centavos: number;
  servicos_sem_valor: number;
  /** as empresas com mais trabalho no período, para o contador saber por onde ligar */
  destaques: { empresa_id: string; nome: string; pontos: number; honorario_centavos: number }[];
}

/**
 * O mesmo cálculo, agora para o escritório inteiro.
 *
 * Este é o número que responde "quanto a carteira rendeu de revisão no ano" —
 * a pergunta que o comentário de ApontamentosEmpresa.tsx dizia que ninguém
 * conseguia responder. Ele é a conta do contador, não a nossa: soma só o que
 * ele declarou ter cobrado.
 */
export function resumirCarteira(
  porEmpresa: { empresa_id: string; nome: string; anuario: Anuario }[],
  periodo: Periodo
): ResumoDaCarteira {
  let pontos = 0;
  let descartados = 0;
  let servicos = 0;
  let honorario = 0;
  let semValor = 0;
  const tocadas: ResumoDaCarteira["destaques"] = [];

  for (const e of porEmpresa) {
    if (e.anuario.pontos === 0) continue;
    pontos += e.anuario.pontos;
    descartados += e.anuario.descartados;
    servicos += e.anuario.servicos;
    honorario += e.anuario.honorario_centavos;
    semValor += e.anuario.servicos_sem_valor;
    tocadas.push({
      empresa_id: e.empresa_id,
      nome: e.nome,
      pontos: e.anuario.pontos,
      honorario_centavos: e.anuario.honorario_centavos,
    });
  }

  /* ordena por dinheiro e, no empate, por volume: quem rendeu mais é a
     primeira conversa de renovação, e quem deu mais trabalho sem render é a
     segunda — as duas listas importam, e esta ordem mostra as duas */
  tocadas.sort(
    (a, b) => b.honorario_centavos - a.honorario_centavos || b.pontos - a.pontos
  );

  return {
    periodo,
    empresas_tocadas: tocadas.length,
    pontos,
    descartados,
    servicos,
    honorario_centavos: honorario,
    servicos_sem_valor: semValor,
    destaques: tocadas.slice(0, 10),
  };
}

/** centavos → "R$ 1.234" (sem centavos: honorário se fala em reais redondos) */
export function emReaisRedondos(centavos: number): string {
  return `R$ ${Math.round(centavos / 100).toLocaleString("pt-BR")}`;
}

/**
 * A RESSALVA QUE ACOMPANHA QUALQUER NÚMERO DESTE RELATÓRIO.
 *
 * O documento vai para a mesa do empresário com valores. Sem esta linha, um
 * total de honorários pode ser lido como cobrança, como economia gerada ou
 * como promessa — e nenhuma das três é o que ele é.
 */
export const RESSALVA_ANUARIO =
  "Os valores acima são os honorários informados pelo próprio escritório para os " +
  "serviços prestados no período. Este documento registra o acompanhamento feito e as " +
  "providências adotadas; não constitui apuração fiscal, cobrança, nem estimativa de " +
  "resultado futuro.";
