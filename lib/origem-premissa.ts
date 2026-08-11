/**
 * DE QUEM É ESTA PREMISSA — a regra, fora da tela.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POR QUE ISTO É UM MÓDULO E NÃO UMA FUNÇÃO DENTRO DO FORMULÁRIO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A proveniência é o produto. O laudo vale porque diz, premissa por premissa,
 * quem respondeu — e "respondida pelo cliente no formulário" é a diferença
 * entre um documento que o contador defende em 2027 e um que ele explica.
 *
 * Essa regra viveu dentro de `FormAnalise` como sete linhas sem teste, e
 * produziu dois defeitos que só apareceram num laudo impresso:
 *
 *  1. os RÓTULOS mentiam nos dois sentidos — o que o contador escolheu saía
 *     como "informada pelo cliente" e o palpite do CNAE saía como "estimada
 *     pelo contador". Ver a nota de `ORIGEM_ROTULO`, em lib/laudo.ts;
 *  2. reabrir e salvar de novo APAGAVA a origem gravada. `tocadas` nasce vazio
 *     a cada abertura da tela e `chavesDaColeta` só chega no instante em que as
 *     respostas do cliente são aplicadas; numa reabertura qualquer, tudo o que
 *     não fosse tocado caía no ramo "tem respostas iniciais, logo informada".
 *     As seis respostas que o cliente preencheu viravam declaração do
 *     escritório num segundo clique em salvar, sem nada mudar na tela.
 *
 * O segundo é o pior dos dois: destrói informação que não pode ser
 * reconstruída. E era invisível — a tela não muda de aparência quando a
 * proveniência é rebaixada.
 */

export type OrigemPremissa = "coleta" | "informada" | "estimada" | "padrao";

export const ORIGENS: OrigemPremissa[] = ["coleta", "informada", "estimada", "padrao"];

/** as sete que o motor consome — a mesma lista que viaja no salvamento */
export const CHAVES_DE_PREMISSA = [
  "b2b",
  "qual",
  "cred",
  "folha",
  "preco",
  "conc",
  "exig",
] as const;

export function origemValida(v: unknown): v is OrigemPremissa {
  return typeof v === "string" && (ORIGENS as string[]).includes(v);
}

export interface EstadoDaOrigem {
  /** o contador mexeu nesta premissa NESTA sessão */
  tocada: boolean;
  /** veio do formulário do cliente que acabou de ser aplicado */
  daColetaAgora: boolean;
  /** o que já estava gravado na análise, se havia análise */
  gravada?: string | null;
  /** as premissas desta análise vieram do lote por CNAE */
  doLoteCnae: boolean;
  /** a tela abriu com respostas preenchidas (análise anterior) */
  temRespostasIniciais: boolean;
}

/**
 * A ORDEM DE PRECEDÊNCIA, e por que ela é esta.
 *
 *  1. `tocada` — o contador mexeu agora. A premissa passou a ser dele, e isso
 *     vale mesmo por cima de uma resposta do cliente: se ele corrigiu o que o
 *     cliente respondeu, quem assina o número é ele.
 *  2. `daColetaAgora` — o cliente acabou de responder. Mais recente e mais
 *     forte do que qualquer coisa gravada antes.
 *  3. `gravada` — o que a análise já dizia. Vence os dois palpites abaixo,
 *     porque foi decidido com informação que esta sessão não tem mais.
 *  4. `doLoteCnae` — ninguém respondeu; a tabela chutou.
 *  5. `temRespostasIniciais` — há valores na tela, sem origem registrada. É o
 *     caso das análises anteriores ao registro de origem: alguém preencheu, e o
 *     único palpite honesto é que foi o escritório.
 *  6. `padrao` — nada disso. O valor é o que o sistema trouxe.
 */
export function resolverOrigem(e: EstadoDaOrigem): OrigemPremissa {
  if (e.tocada) return "informada";
  if (e.daColetaAgora) return "coleta";
  if (origemValida(e.gravada)) return e.gravada;
  if (e.doLoteCnae) return "estimada";
  if (e.temRespostasIniciais) return "informada";
  return "padrao";
}

/**
 * A premissa é fraca o bastante para o documento destacá-la?
 *
 * "Estimada" e "padrão" são as duas que ninguém escolheu — a primeira chutada
 * por CNAE, a segunda pelo próprio sistema. O laudo destacava só a primeira, e
 * "padrão do sistema" saía em cinza, com o mesmo peso visual de uma resposta do
 * cliente, dentro da seção que existe para separar as duas.
 */
export function premissaFraca(o: OrigemPremissa): boolean {
  return o === "estimada" || o === "padrao";
}
