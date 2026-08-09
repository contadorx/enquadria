/**
 * O ERRO DO BANCO EM PORTUGUÊS DE CONTADOR — 08/08/2026.
 *
 * O DEFEITO. Doze rotas devolviam `error.message` cru do Postgres para a tela,
 * e o Cockpit imprime esse texto direto no recado. O contador lia, em inglês,
 * coisas como `duplicate key value violates unique constraint
 * "analises_empresa_janela_idx"` — uma frase que não diz o que aconteceu, não
 * diz o que fazer, e que ele não tem como resolver de jeito nenhum. O caminho
 * dele a partir dali é abrir um chamado, e o nosso é traduzir o mesmo erro pela
 * décima vez.
 *
 * A REGRA. Quem lê a tela recebe uma frase que descreve o estado e aponta um
 * próximo passo; quem opera o sistema recebe o texto original no log do
 * servidor, que é onde ele serve para alguma coisa. Nunca os dois trocados.
 *
 * O QUE NÃO FAZER: engolir o erro. Uma mensagem genérica sem log é pior que o
 * texto em inglês, porque some a informação de quem precisa dela.
 */

interface ErroDoBanco {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

/**
 * Os códigos do Postgres que aparecem de verdade neste produto. `code` é mais
 * confiável que texto: mensagem muda de versão para versão, código não.
 */
const POR_CODIGO: Record<string, string> = {
  // unique_violation
  "23505":
    "este registro já existe. Recarregue a tela para ver o que está gravado antes de tentar de novo.",
  // foreign_key_violation
  "23503":
    "este registro depende de outro que não está mais lá. Recarregue a tela — algo pode ter sido apagado ou arquivado enquanto você trabalhava.",
  // not_null_violation
  "23502": "faltou preencher um campo obrigatório para gravar.",
  // check_violation
  "23514": "algum valor informado está fora do que o sistema aceita para este campo.",
  // insufficient_privilege / RLS
  "42501":
    "você não tem permissão para alterar este registro. Se ele é do seu escritório, peça ao responsável para conferir o seu acesso.",
  // undefined_table
  "42P01":
    "uma parte do sistema ainda não foi habilitada neste ambiente. O problema é do nosso lado — nada do que você fez foi perdido.",
  // undefined_column
  "42703":
    "uma parte do sistema ainda não foi habilitada neste ambiente. O problema é do nosso lado — nada do que você fez foi perdido.",
  // query_canceled / statement timeout
  "57014":
    "a consulta demorou demais e foi interrompida. Tente de novo com um recorte menor da carteira.",
};

/**
 * Traduz e REGISTRA. O `onde` entra no log para que a linha do servidor diga de
 * qual rota veio sem precisar de stack trace.
 */
export function erroDeBanco(e: ErroDoBanco | null | undefined, onde: string): string {
  const bruto = e?.message ?? "";
  console.error(`[${onde}] erro do banco:`, e?.code ?? "sem código", bruto, e?.details ?? "");

  const porCodigo = e?.code ? POR_CODIGO[e.code] : undefined;
  if (porCodigo) return porCodigo;

  /* rede de segurança para quem não trouxe código: a mensagem do PostgREST
     costuma trazer a palavra, mesmo sem `code` */
  if (/duplicate key|already exists/i.test(bruto)) return POR_CODIGO["23505"];
  if (/violates row-level security|permission denied/i.test(bruto)) return POR_CODIGO["42501"];
  if (/does not exist/i.test(bruto)) return POR_CODIGO["42P01"];
  if (/timeout|canceling statement/i.test(bruto)) return POR_CODIGO["57014"];

  return "não foi possível gravar agora. Recarregue a tela e confira o que ficou salvo antes de repetir.";
}
