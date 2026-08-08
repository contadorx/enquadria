import { leRegime, ehMEIPorPorte, situacaoDerruba } from "./triagem";

/**
 * O CADASTRO ENVELHECE EM SILÊNCIO.
 *
 * A carteira é consultada UMA VEZ, na importação. Depois disso a empresa pode
 * ser baixada, trocar de CNAE, mudar de porte ou sair do Simples — e o produto
 * segue recomendando sobre uma foto de meses atrás, com a mesma confiança.
 *
 * O contador não tem como saber sozinho: ninguém acompanha a situação cadastral
 * de duzentos clientes. O custo de não saber é constrangimento na frente do
 * cliente — e é exatamente o tipo de aviso pelo qual se paga sem pensar.
 *
 * Este arquivo decide O QUE É MUDANÇA QUE IMPORTA. Ele é puro: recebe o que
 * está gravado e o que a base devolveu, e diz o que mudou. Quem consulta é o
 * cron; quem grava é a rota; quem decide se aplica é o contador.
 */

export type CampoCadastro = "situacao" | "cnae_principal" | "porte" | "regime";

export interface MudancaCadastro {
  campo: CampoCadastro;
  de: string | null;
  para: string;
  /** muda a faixa da triagem, e portanto pode mudar a decisão */
  muda_triagem: boolean;
  /** a frase que o contador lê — escrita aqui para não divergir entre telas */
  texto: string;
}

export const ROTULO_CAMPO: Record<CampoCadastro, string> = {
  situacao: "Situação cadastral",
  cnae_principal: "CNAE principal",
  porte: "Porte",
  regime: "Regime tributário",
};

const limpo = (v: unknown): string | null => {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
};

/** CNAE com e sem máscara é o mesmo CNAE — comparar cru geraria mudança falsa */
const soDigitos = (v: string | null): string | null => (v ? v.replace(/\D/g, "") || null : null);

export interface CadastroGravado {
  situacao?: string | null;
  cnae_principal?: string | null;
  porte?: string | null;
  regime?: string | null;
}

export interface CadastroDaBase {
  situacao?: string | null;
  cnae_principal?: string | null;
  porte?: string | null;
  regime?: string | null;
}

/**
 * O DIFF DO CADASTRO.
 *
 * Só devolve o que MUDOU e o que IMPORTA. Duas exclusões deliberadas:
 *
 *   · CAMPO QUE SUMIU não é mudança. A base responder vazio hoje, para um campo
 *     que respondeu ontem, é falha de leitura muito mais provável que baixa de
 *     informação — e tratar ausência como fato geraria um alarme por semana em
 *     cada carteira, que é como se ensina alguém a ignorar alarmes.
 *
 *   · DIFERENÇA DE GRAFIA não é mudança. "ATIVA" e "Ativa", CNAE com e sem
 *     ponto, MEI escrito de quatro jeitos: comparar cru encheria a tela de
 *     mudança que não mudou nada.
 */
export function compararCadastro(
  gravado: CadastroGravado,
  base: CadastroDaBase
): MudancaCadastro[] {
  const saida: MudancaCadastro[] = [];

  /* SITUAÇÃO — a mais grave da lista, e a única em que o silêncio custa caro:
     empresa baixada continua na fila esperando uma decisão que não existe. */
  const sitG = limpo(gravado.situacao);
  const sitB = limpo(base.situacao);
  if (sitB && sitB.toUpperCase() !== (sitG ?? "").toUpperCase()) {
    const derruba = situacaoDerruba(sitB);
    saida.push({
      campo: "situacao",
      de: sitG,
      para: sitB,
      muda_triagem: derruba || situacaoDerruba(sitG),
      texto: derruba
        ? `A empresa está ${sitB.toLowerCase()} na base da Receita — e continua na sua fila.`
        : `A situação cadastral passou de ${sitG ?? "não informada"} para ${sitB}.`,
    });
  }

  /* CNAE — muda a faixa da triagem, e a faixa é o que ordena a fila inteira */
  const cnaeG = soDigitos(limpo(gravado.cnae_principal));
  const cnaeB = soDigitos(limpo(base.cnae_principal));
  if (cnaeB && cnaeB !== cnaeG) {
    saida.push({
      campo: "cnae_principal",
      de: limpo(gravado.cnae_principal),
      para: limpo(base.cnae_principal) as string,
      muda_triagem: true,
      texto: `O CNAE principal mudou de ${limpo(gravado.cnae_principal) ?? "não informado"} para ${limpo(base.cnae_principal)}. A faixa da triagem pode mudar com ele.`,
    });
  }

  /* PORTE — importa por um motivo só, e é decisivo: virar MEI tira a empresa
     da regra (o regime híbrido alcança ME e EPP) */
  const porteG = limpo(gravado.porte);
  const porteB = limpo(base.porte);
  if (porteB && porteB.toUpperCase() !== (porteG ?? "").toUpperCase()) {
    const virouMEI = ehMEIPorPorte(porteB);
    saida.push({
      campo: "porte",
      de: porteG,
      para: porteB,
      muda_triagem: virouMEI || ehMEIPorPorte(porteG),
      texto: virouMEI
        ? "A empresa passou a MEI — o regime híbrido alcança apenas ME e EPP."
        : `O porte mudou de ${porteG ?? "não informado"} para ${porteB}.`,
    });
  }

  /* REGIME — sair do Simples encerra a decisão desta janela */
  const regG = leRegime(gravado.regime);
  const regB = leRegime(base.regime);
  if (regB && regB !== regG) {
    saida.push({
      campo: "regime",
      de: limpo(gravado.regime),
      para: limpo(base.regime) as string,
      muda_triagem: true,
      texto:
        regB === "fora"
          ? "A empresa não consta mais como optante do Simples — não há decisão a tomar nesta janela."
          : `O regime mudou para ${limpo(base.regime)}.`,
    });
  }

  return saida;
}

/**
 * A ORDEM DA FILA DA VARREDURA.
 *
 * Quem foi conferido há mais tempo vai primeiro; quem nunca foi, antes de todos.
 * Sem isto, uma carteira maior que a fatia diária teria empresas eternamente na
 * mesma posição — as primeiras conferidas todo dia e as últimas nunca.
 */
export function proximasAConferir<T extends { id: string; cadastro_conferido_em?: string | null }>(
  empresas: T[],
  quantas: number
): T[] {
  const peso = (e: T) =>
    e.cadastro_conferido_em ? new Date(e.cadastro_conferido_em).getTime() : 0;
  return [...empresas].sort((a, b) => peso(a) - peso(b)).slice(0, quantas);
}
