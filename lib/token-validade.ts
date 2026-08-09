/**
 * A VALIDADE DO LINK PÚBLICO, num lugar só — 08/08/2026.
 *
 * Cinco rotas servem documento por token (laudo, termo, assinar, comparativo,
 * abertura) e nenhuma delas checava validade, porque validade não existia. A
 * migration 0068 criou `token_expira_em` e `revogado_em` nas cinco tabelas;
 * esta função é a leitura dessas duas colunas.
 *
 * Está aqui, e não repetida em cada página, por um motivo prático: cinco cópias
 * de uma regra de acesso são cinco lugares onde alguém esquece de conferir uma
 * das duas colunas. Foi assim que o `noindex` acabou faltando em cinco rotas.
 *
 * PURA: recebe o que a linha trouxe, devolve o veredito. Sem I/O, testável.
 */

export type SituacaoDoLink = "valido" | "expirado" | "revogado";

export function situacaoDoLink(linha: {
  token_expira_em?: string | null;
  revogado_em?: string | null;
}, agora = Date.now()): SituacaoDoLink {
  /**
   * REVOGADO VENCE EXPIRADO. Um link cortado pelo escritório e depois vencido
   * pelo tempo continua sendo, para quem chega, um corte — e é essa a
   * informação que ele precisa para saber com quem falar.
   */
  if (linha.revogado_em) return "revogado";
  /**
   * SEM DATA, ABRE. As linhas anteriores à 0068 recebem validade na própria
   * migration, mas uma tabela que ainda não foi migrada não pode fechar os
   * links de todo mundo: falha de infraestrutura nossa não vira porta fechada
   * na cara do cliente do contador.
   */
  if (!linha.token_expira_em) return "valido";
  return new Date(linha.token_expira_em).getTime() < agora ? "expirado" : "valido";
}

/** as colunas que toda consulta de documento por token precisa pedir */
export const COLUNAS_VALIDADE = "token_expira_em, revogado_em";
