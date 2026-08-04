/**
 * A IDENTIDADE DO ESCRITÓRIO NOS DOCUMENTOS.
 *
 * Existia espalhada: seis arquivos repetiam `tenants(nome, crc, logo_url)` e
 * cada folha decidia sozinha como desenhar o cabeçalho. Acrescentar um campo
 * significava caçar seis lugares — e esquecer um deles produz um laudo com
 * cabeçalho diferente do termo da mesma empresa.
 *
 * DUAS REGRAS MORAM AQUI, e as duas vieram de problema real:
 *
 *  1. LOGO COM NOME. A maioria dos logos de escritório JÁ traz o nome escrito.
 *     O cabeçalho imprimia o logo e, do lado, o nome de novo — quando os dois
 *     textos não batem exatamente ("Oliveira Contabilidade" no logo, "Oliveira
 *     Contabilidade e Assessoria" no cadastro), o documento parece montado por
 *     engano. Quem decide é o dono do logo, não o programa.
 *
 *  2. QUEM ASSINA É UMA PESSOA. Laudo é peça técnica: quem responde por ela é
 *     um contador com CRC, não uma razão social. O rodapé assinava só o
 *     escritório porque nome de pessoa não existia em lugar nenhum do cadastro.
 */

export interface Escritorio {
  nome?: string | null;
  crc?: string | null;
  logo_url?: string | null;
  /** o logo já traz o nome escrito — então não repetir ao lado dele */
  logo_com_nome?: boolean | null;
  /** nome do profissional responsável (profiles.nome) */
  responsavel?: string | null;
}

/** as colunas do escritório, num lugar só — evita select divergente entre telas */
export const COLUNAS_ESCRITORIO = "nome, crc, logo_url, logo_com_nome";

/**
 * O nome deve ser IMPRESSO ao lado do logo?
 *
 * Sem logo, sempre: documento sem identificação nenhuma não serve. Com logo,
 * só se o logo for apenas figura. A opção é do escritório e o padrão é
 * imprimir — o silêncio não pode apagar o nome de quem assina.
 */
export function mostrarNomeEscrito(e: Escritorio | null | undefined): boolean {
  if (!e) return true;
  if (!e.logo_url) return true;
  return !e.logo_com_nome;
}

/**
 * A LINHA DE ASSINATURA do laudo e do relatório.
 *
 * Pessoa antes do escritório: é ela que tem CRC e é ela que responde. Sem nome
 * de pessoa cadastrado, cai no escritório — nunca em e-mail, que é endereço e
 * não identificação.
 */
export function assinaturaTecnica(e: Escritorio | null | undefined): string {
  const pessoa = e?.responsavel?.trim();
  const casa = e?.nome?.trim();
  const crc = e?.crc?.trim();
  const quem = pessoa && casa ? `${pessoa} · ${casa}` : pessoa || casa || "Contador responsável";
  return crc ? `${quem} — ${crc}` : quem;
}

/**
 * COMO CHAMAR ESTA PESSOA em e-mail, convite e indicação.
 *
 * Ordem: nome, depois escritório, e NUNCA o e-mail. Endereço de e-mail dentro
 * do texto de uma mensagem enviada A TERCEIROS expõe quem indicou sem que ele
 * tenha combinado isso — e ainda faz a mensagem parecer disparo automático.
 *
 * Devolve as duas partes separadas porque quem monta a frase é o template: a
 * versão anterior mandava o nome do escritório nos dois campos e o convite
 * saía "Contabilidade X, do Contabilidade X, indicou você".
 */
export function comoChamar(
  e: Escritorio | null | undefined,
  padrao = "Um colega contador"
): { quem: string; casa: string | null } {
  const pessoa = e?.responsavel?.trim();
  const casa = e?.nome?.trim() || null;
  if (pessoa) return { quem: pessoa, casa };
  return { quem: casa || padrao, casa: null };
}
