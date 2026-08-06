/**
 * O FUNIL — onde as pessoas param.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * POR QUE ISTO EXISTE. O suporte hoje é reativo: eu descubro que alguém travou
 * quando essa pessoa escreve. E quem trava raramente escreve — na conversa de
 * 05-06/08/2026, a contadora só perguntou porque já tinha um canal aberto
 * comigo. Quem chega pelo site e trava não vira chamado: vira silêncio.
 *
 * O dado para descobrir isso sozinho já existe (empresas, análises, laudos,
 * termos por escritório). O que faltava era olhar para ele como ESTEIRA, e não
 * como total.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * A REGRA QUE FAZ O NÚMERO SER LIDO CERTO: cada escritório entra em UM degrau
 * só — o mais avançado que ele alcançou.
 *
 * Contar "quantos importaram" e "quantos analisaram" em colunas independentes
 * produz o número mais enganoso possível: 40 importaram, 12 analisaram, e a
 * leitura natural (errada) é "28 estão importando agora". Não estão. Eles
 * pararam. O funil só serve se o degrau disser PAROU AQUI.
 */

export interface EscritorioFunil {
  tenant_id: string;
  nome: string;
  criado_em: string;
  empresas: number;
  analises: number;
  laudos: number;
  termos: number;
  assinados: number;
}

export type Degrau = "criou" | "importou" | "analisou" | "emitiu" | "enviou" | "fechou";

export const DEGRAUS: { chave: Degrau; titulo: string; parou: string }[] = [
  { chave: "criou",     titulo: "Criou a conta",        parou: "criou a conta e não importou nenhuma empresa" },
  { chave: "importou",  titulo: "Importou a carteira",  parou: "tem carteira e nunca analisou ninguém" },
  { chave: "analisou",  titulo: "Fez a 1ª análise",     parou: "analisou e não emitiu laudo" },
  { chave: "emitiu",    titulo: "Emitiu o 1º laudo",    parou: "emitiu o laudo e não mandou o termo" },
  { chave: "enviou",    titulo: "Mandou o 1º termo",    parou: "mandou o termo e ninguém assinou" },
  { chave: "fechou",    titulo: "Colheu a 1ª assinatura", parou: "" },
];

/** o degrau mais avançado que este escritório alcançou */
export function degrauDe(e: EscritorioFunil): Degrau {
  if (e.assinados > 0) return "fechou";
  if (e.termos > 0) return "enviou";
  if (e.laudos > 0) return "emitiu";
  if (e.analises > 0) return "analisou";
  if (e.empresas > 0) return "importou";
  return "criou";
}

export interface LinhaFunil {
  chave: Degrau;
  titulo: string;
  /** quantos CHEGARAM até aqui (este degrau e os seguintes) */
  chegaram: number;
  /** quantos PARARAM aqui — é o número que gera trabalho */
  pararam: number;
  /** % dos que chegaram ao degrau anterior e passaram deste */
  passagem: number | null;
  /** a frase do que fazer com quem parou */
  parou: string;
}

export function montarFunil(escritorios: EscritorioFunil[]): LinhaFunil[] {
  const ordem = DEGRAUS.map((d) => d.chave);
  const pararamEm: Record<string, number> = {};
  for (const d of ordem) pararamEm[d] = 0;
  for (const e of escritorios) pararamEm[degrauDe(e)]++;

  const linhas: LinhaFunil[] = [];
  for (let i = 0; i < DEGRAUS.length; i++) {
    /* chegaram = parou aqui + parou em qualquer degrau depois deste */
    const chegaram = ordem.slice(i).reduce((a, d) => a + pararamEm[d], 0);
    const anterior = i === 0 ? null : linhas[i - 1].chegaram;
    linhas.push({
      chave: DEGRAUS[i].chave,
      titulo: DEGRAUS[i].titulo,
      chegaram,
      pararam: pararamEm[DEGRAUS[i].chave],
      /* passagem sem base é NULL, não 0%: "0% passaram" com zero pessoas no
         degrau anterior é uma mentira que parece diagnóstico */
      passagem: anterior ? Math.round((chegaram / anterior) * 1000) / 10 : null,
      parou: DEGRAUS[i].parou,
    });
  }
  return linhas;
}

/**
 * O DEGRAU QUE MAIS SEGURA GENTE — e ele não é o que tem mais parados.
 *
 * O primeiro degrau quase sempre acumula mais gente em número absoluto,
 * simplesmente porque todo mundo passa por ele. O que interessa é onde a
 * PASSAGEM despenca: é ali que a tela, o texto ou o produto estão pedindo algo
 * que a pessoa não consegue dar.
 *
 * Só considera degraus com base mínima — com três escritórios, qualquer
 * percentual é ruído, e agir sobre ruído é pior do que não agir.
 */
export function gargalo(linhas: LinhaFunil[], baseMinima = 5): LinhaFunil | null {
  const candidatos = linhas.filter(
    (l, i) => l.passagem != null && i > 0 && linhas[i - 1].chegaram >= baseMinima
  );
  if (!candidatos.length) return null;
  return candidatos.reduce((pior, l) => (l.passagem! < pior.passagem! ? l : pior));
}

/**
 * QUEM PAROU E HÁ QUANTO TEMPO — a lista que vira contato.
 *
 * `diasParado` conta desde a criação da conta, não desde a última ação: o dado
 * de "última ação" não existe hoje em lugar nenhum, e inventar uma aproximação
 * aqui produziria uma lista de prioridade errada. Quando `ultima_atividade`
 * existir, é só trocar a fonte — a ordenação continua a mesma.
 */
export function paradosEm(
  escritorios: EscritorioFunil[],
  degrau: Degrau,
  hojeISO: string
): (EscritorioFunil & { diasParado: number })[] {
  const hoje = Date.parse(hojeISO);
  return escritorios
    .filter((e) => degrauDe(e) === degrau)
    .map((e) => ({
      ...e,
      diasParado: Math.max(0, Math.floor((hoje - Date.parse(e.criado_em)) / 86_400_000)),
    }))
    .sort((a, b) => b.diasParado - a.diasParado);
}
