/**
 * AS NORMAS CITADAS NO TEXTO VIRAM LINK — 10/08/2026.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE ESTAVA ERRADO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Numa matéria do radar, a norma aparece DUAS vezes: dentro do texto ("a
 * Resolução CGSN nº 186/2026 abriu…"), onde o leitor está, e num cartão "A
 * norma" no rodapé, com um botão "Ler a norma na fonte oficial". Só o segundo
 * era clicável.
 *
 * O custo disso não é de conveniência. Esta página se vende por uma frase —
 * "fonte sempre citada" — e a citação chegava como texto morto no meio do
 * parágrafo, com a fonte de verdade a três rolagens dali. Quem lê para decidir
 * confere no momento em que a norma é mencionada, não depois.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DUAS PROCEDÊNCIAS, DOIS TRATAMENTOS — e isso é deliberado
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. NORMAS DE ENDEREÇO CONHECIDO E ESTÁVEL (a lista abaixo). São as leis de
 *    base da transição, no Planalto, com URL que não muda. Foram CONFERIDAS
 *    uma a uma em 10/08/2026 — abrindo o endereço e lendo a ementa, não
 *    deduzindo o padrão da URL. Estas saem sem `nofollow`: apontar para a
 *    fonte primária é exatamente o que dá lastro ao texto.
 *
 * 2. QUALQUER OUTRA CITAÇÃO (resoluções do CGSN, atos declaratórios, notas).
 *    Aqui NÃO existe endereço que se possa deduzir: o sistema de normas da
 *    Receita endereça por `idAto`, um número interno que não sai do texto da
 *    resolução. Inventar essa URL seria produzir uma fonte falsa numa página
 *    cujo argumento inteiro é a fonte — o oposto do que se quer. Então a
 *    citação só vira link quando a própria matéria trouxer a `fonte` como
 *    endereço; e aí, por ser campo livre digitado no painel, vai com
 *    `nofollow` e `noreferrer`, como já ia o botão do rodapé.
 *
 * Citação sem endereço conhecido e sem `fonte` continua texto. É o certo:
 * link que não leva à norma é pior do que nenhum.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POR QUE ISTO É FUNÇÃO PURA, E NÃO UM COMPONENTE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `partirPorNormas` devolve pedaços — texto e link —, sem saber o que é React.
 * Assim ela é testável pelo executor sem navegador, e a mesma quebra serve
 * para a página, para um e-mail ou para o que vier.
 */

/** uma norma de base, com endereço conferido na fonte */
type NormaConhecida = {
  /** como ela é citada, para a busca no texto */
  padrao: RegExp;
  /** o endereço oficial, conferido em 10/08/2026 */
  url: string;
  /** o que o leitor vê ao passar o mouse */
  titulo: string;
};

/**
 * A LISTA. Cada `padrao` aceita as formas que um contador escreve de verdade
 * — "LC 214/2025", "Lei Complementar nº 214, de 2025", "LC 214" —, porque o
 * texto é digitado à mão no painel e ninguém padroniza citação enquanto
 * escreve.
 *
 * O ano é opcional na captura de propósito: "LC 214" sozinha é inequívoca no
 * contexto desta transição, e exigir o ano deixaria de fora metade das
 * citações reais.
 */
const CONHECIDAS: NormaConhecida[] = [
  {
    padrao: /\b(?:EC|Emenda\s+Constitucional)\s*n?[º°o]?\s*132(?:\s*[/,]?\s*(?:de\s+)?2023)?\b/gi,
    url: "https://www.planalto.gov.br/ccivil_03/constituicao/emendas/emc/emc132.htm",
    titulo: "Emenda Constitucional nº 132/2023 — altera o Sistema Tributário Nacional",
  },
  {
    padrao: /\b(?:LC|Lei\s+Complementar)\s*n?[º°o]?\s*214(?:\s*[/,]?\s*(?:de\s+)?2025)?\b/gi,
    url: "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm",
    titulo: "Lei Complementar nº 214/2025 — institui o IBS, a CBS e o Imposto Seletivo",
  },
  {
    padrao: /\b(?:LC|Lei\s+Complementar)\s*n?[º°o]?\s*123(?:\s*[/,]?\s*(?:de\s+)?2006)?\b/gi,
    url: "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm",
    titulo: "Lei Complementar nº 123/2006 — Estatuto da Microempresa e o Simples Nacional",
  },
];

/**
 * As citações SEM endereço dedutível. Elas só viram link se a matéria trouxer
 * `fonte` como URL — ver a nota de procedência lá em cima.
 */
const SEM_ENDERECO_PROPRIO =
  /\b(?:Resolu[çc][ãa]o\s+CGSN|Ato\s+Declarat[óo]rio(?:\s+Executivo)?|Instru[çc][ãa]o\s+Normativa|Ato\s+Conjunto|Portaria|Decreto)\s*(?:n?[º°o]?\s*)?[\d.]+(?:\s*[/,]?\s*(?:de\s+)?\d{4})?\b/gi;

export type Pedaco =
  | { tipo: "texto"; texto: string }
  | { tipo: "link"; texto: string; url: string; titulo: string; oficial: boolean };

/** só http(s) vira link — `fonte` é campo livre e às vezes traz a citação */
export function ehEndereco(v: string | null | undefined): boolean {
  return !!v && /^https?:\/\//i.test(v.trim());
}

/**
 * Quebra o texto em pedaços, marcando as citações de norma.
 *
 * `fonte` é a fonte declarada da matéria: quando for endereço, as citações sem
 * endereço próprio apontam para ela. Quando não for, elas seguem texto.
 *
 * As correspondências NÃO se sobrepõem: a varredura ordena por posição e
 * descarta o que começar dentro de uma anterior. Sem isso, "Lei Complementar
 * nº 214" casaria também dentro de uma citação maior e o texto sairia partido
 * no meio de uma palavra.
 */
export function partirPorNormas(
  texto: string | null | undefined,
  fonte?: string | null
): Pedaco[] {
  const t = (texto ?? "").toString();
  if (!t) return [];

  const achados: { ini: number; fim: number; url: string; titulo: string; oficial: boolean }[] = [];

  for (const n of CONHECIDAS) {
    /* `lastIndex` é estado do próprio RegExp: sem reiniciar, a segunda
       chamada da mesma função começaria do meio do texto anterior. */
    n.padrao.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = n.padrao.exec(t)) !== null) {
      achados.push({ ini: m.index, fim: m.index + m[0].length, url: n.url, titulo: n.titulo, oficial: true });
      if (m[0].length === 0) n.padrao.lastIndex++;
    }
  }

  if (ehEndereco(fonte)) {
    SEM_ENDERECO_PROPRIO.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = SEM_ENDERECO_PROPRIO.exec(t)) !== null) {
      achados.push({
        ini: m.index,
        fim: m.index + m[0].length,
        url: (fonte as string).trim(),
        titulo: "Ler a norma na fonte declarada nesta matéria",
        oficial: false,
      });
      if (m[0].length === 0) SEM_ENDERECO_PROPRIO.lastIndex++;
    }
  }

  achados.sort((a, b) => a.ini - b.ini || b.fim - a.fim);

  const pedacos: Pedaco[] = [];
  let cursor = 0;
  for (const a of achados) {
    if (a.ini < cursor) continue; // já está dentro de um link anterior
    if (a.ini > cursor) pedacos.push({ tipo: "texto", texto: t.slice(cursor, a.ini) });
    pedacos.push({
      tipo: "link",
      texto: t.slice(a.ini, a.fim),
      url: a.url,
      titulo: a.titulo,
      oficial: a.oficial,
    });
    cursor = a.fim;
  }
  if (cursor < t.length) pedacos.push({ tipo: "texto", texto: t.slice(cursor) });

  return pedacos;
}

/** quantas citações viraram link — usado no teste e em nada mais */
export function quantasNormas(texto: string | null | undefined, fonte?: string | null): number {
  return partirPorNormas(texto, fonte).filter((p) => p.tipo === "link").length;
}
