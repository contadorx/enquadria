/**
 * O ENDEREÇO DA MATÉRIA — como um título vira um pedaço de URL.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISSO É UMA FUNÇÃO PURA, E POR QUE O RESULTADO VAI PARA O BANCO.
 *
 * O endereço de uma matéria da Reforma é a coisa mais permanente que este
 * produto publica: é o que o Google guarda, o que alguém cola num grupo de
 * WhatsApp, o que um contador salva nos favoritos. Ele não pode mudar porque
 * alguém corrigiu uma vírgula no título.
 *
 * Por isso a derivação acontece UMA VEZ, na hora de publicar, e o resultado é
 * gravado numa coluna. Derivar a cada leitura seria mais simples e teria um
 * defeito caro: editar "Janela de opção pelo regime regular de IBS/CBS" para
 * "Janela de opção pelo regime regular do IBS/CBS" trocaria a URL e mataria
 * tudo o que já apontava para ela — sem erro nenhum aparecer em lugar nenhum.
 *
 * ---------------------------------------------------------------------------
 * AS REGRAS, e o motivo de cada uma:
 *
 *   · ACENTO VIRA A LETRA SEM ACENTO. "opção" → "opcao". URL com acento é
 *     percent-encoded pelo navegador e vira ilegível quando colada.
 *   · CAIXA BAIXA sempre. Servidor de arquivo diferencia maiúscula; a mesma
 *     matéria em dois endereços divide a autoridade do domínio.
 *   · "/" E "%" VIRAM HÍFEN antes de qualquer coisa: "IBS/CBS" tem de virar
 *     "ibs-cbs", não "ibscbs" — a barra é separador de rota.
 *   · Nº, § E & viram palavra. "nº 186/2026" → "n-186-2026"; "§ 5º" → "par-5".
 *   · O TAMANHO É CORTADO EM PALAVRA INTEIRA, não no meio. Título longo vira
 *     endereço longo, e endereço cortado no meio de uma palavra parece defeito.
 */

/** os acentos que aparecem em português, sem depender de tabela do banco */
const ACENTOS: Record<string, string> = {
  á: "a", à: "a", ã: "a", â: "a", ä: "a",
  é: "e", è: "e", ê: "e", ë: "e",
  í: "i", ì: "i", î: "i", ï: "i",
  ó: "o", ò: "o", õ: "o", ô: "o", ö: "o",
  ú: "u", ù: "u", û: "u", ü: "u",
  ç: "c", ñ: "n", ý: "y",
};

/** quanto do título cabe no endereço — o suficiente para ser lido de relance */
export const MAX_SLUG = 80;

export function paraSlug(texto: string, max = MAX_SLUG): string {
  let s = (texto || "").toLowerCase();

  /* símbolos que carregam significado viram palavra ANTES de sumir */
  s = s
    .replace(/[\/\\|]/g, "-")
    .replace(/[ºª°]/g, "")
    .replace(/§/g, " par ")
    .replace(/%/g, " pct ")
    .replace(/&/g, " e ")
    .replace(/\+/g, " mais ");

  s = s.replace(/[áàãâäéèêëíìîïóòõôöúùûüçñý]/g, (c) => ACENTOS[c] ?? c);

  /* o que sobrou que não é letra, número ou hífen vira separador */
  s = s
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (s.length > max) {
    const cortado = s.slice(0, max);
    /* volta até o hífen anterior para não partir palavra ao meio; se a
       primeira palavra já for maior que o limite, corta seco mesmo */
    const ultimo = cortado.lastIndexOf("-");
    s = (ultimo > 0 ? cortado.slice(0, ultimo) : cortado).replace(/-+$/, "");
  }

  return s;
}

/**
 * O ENDEREÇO TEM DE SER ÚNICO — e o desempate é `-2`, `-3`, e por aí.
 *
 * Duas matérias podem legitimamente ter títulos parecidos ("CBS entra em vigor"
 * numa fase e noutra). O banco tem índice único; sem desempate no código, a
 * segunda publicação falharia com erro de constraint na cara de quem publica,
 * que não fez nada de errado.
 */
export function slugUnico(base: string, jaUsados: Iterable<string>): string {
  const usados = new Set(jaUsados);
  const raiz = paraSlug(base) || "materia";
  if (!usados.has(raiz)) return raiz;
  for (let n = 2; n < 500; n++) {
    const tentativa = `${raiz}-${n}`;
    if (!usados.has(tentativa)) return tentativa;
  }
  /* 500 títulos idênticos é defeito de quem publica, não caso a tratar —
     mas devolver algo repetido seria pior que devolver algo feio */
  return `${raiz}-${Date.now()}`;
}
