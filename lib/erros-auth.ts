/**
 * TRADUÇÃO DOS ERROS DE AUTENTICAÇÃO.
 *
 * Existe por causa de um caso real: a tela de criar conta mostrou "{}" para o
 * usuário. Não é bug do nosso código — é a biblioteca do Supabase fazendo
 * `JSON.stringify` no corpo do erro quando o servidor responde SEM mensagem
 * (auth-js, lib/fetch.ts, _getErrorMessage). Corpo vazio vira o texto "{}".
 *
 * Duas regras nascem daí:
 *
 *  1. NUNCA jogar na tela o que veio do servidor sem passar por aqui. Um "{}"
 *     não diz nada a quem está tentando entrar, e some justamente com a
 *     informação que resolveria: o código HTTP.
 *
 *  2. Quando não houver mensagem, dizer o que o STATUS significa. 500 é
 *     problema do servidor e a pessoa não tem o que corrigir — mandar ela
 *     "conferir a senha" seria mentira. 400 é dado errado e ela pode agir.
 *
 * O objetivo não é esconder o erro: é dizer a verdade em português e deixar o
 * rastro técnico no console, onde ele serve.
 */

export interface ErroAuth {
  /** O que aparece na tela, em português, sempre preenchido. */
  texto: string;
  /** Se a pessoa consegue resolver sozinha (senha, e-mail) ou não (500). */
  culpaDoServidor: boolean;
}

/** Mensagens conhecidas do GoTrue → português. Casadas por trecho, minúsculas. */
const CONHECIDAS: Array<[string, string]> = [
  ["invalid login credentials", "E-mail ou senha incorretos."],
  ["email not confirmed", "Falta confirmar seu e-mail. Procure a mensagem de confirmação na caixa de entrada."],
  ["user already registered", "Já existe uma conta com este e-mail. Use “Entrar”."],
  ["already been registered", "Já existe uma conta com este e-mail. Use “Entrar”."],
  ["password should be at least", "A senha é curta demais — use pelo menos 6 caracteres."],
  ["weak password", "Senha fraca demais. Misture letras, números e símbolos."],
  ["unable to validate email", "Esse e-mail não parece válido."],
  ["signups not allowed", "O cadastro está fechado no momento."],
  ["email rate limit exceeded", "Limite de e-mails atingido. Tente de novo daqui a pouco."],
  ["over_email_send_rate_limit", "Limite de e-mails atingido. Tente de novo daqui a pouco."],
  ["for security purposes", "Aguarde alguns segundos antes de tentar de novo."],
  ["error sending confirmation", "Não foi possível enviar o e-mail de confirmação. A conta NÃO foi criada."],
  ["error sending", "Não foi possível enviar o e-mail. A conta NÃO foi criada."],
  ["failed to fetch", "Não consegui falar com o servidor. Verifique sua conexão."],
];

/**
 * Traduz o erro do Supabase. Aceita `unknown` porque o que chega da biblioteca
 * nem sempre é um AuthError — em falha de rede pode ser um TypeError puro.
 */
export function traduzirErroAuth(erro: unknown, modo: "entrar" | "criar"): ErroAuth {
  const e = (erro ?? {}) as { message?: unknown; status?: unknown; code?: unknown };
  const bruta = typeof e.message === "string" ? e.message.trim() : "";
  const status = typeof e.status === "number" ? e.status : undefined;
  const codigo = typeof e.code === "string" ? e.code : undefined;

  // o rastro técnico vai para o console — é lá que ele é útil
  if (typeof console !== "undefined") {
    console.error("[auth]", { modo, status, codigo, mensagem: bruta });
  }

  // "{}" e "[object Object]" são a biblioteca desistindo de ler o corpo:
  // tratamos como ausência de mensagem, não como mensagem.
  const vazia = !bruta || bruta === "{}" || bruta === "[object Object]" || bruta === "null";

  if (!vazia) {
    const achado = CONHECIDAS.find(([chave]) => bruta.toLowerCase().includes(chave));
    if (achado) {
      return { texto: achado[1], culpaDoServidor: /não foi possível enviar/i.test(achado[1]) };
    }
  }

  // Sem mensagem utilizável: o status é a única verdade que sobrou.
  if (status !== undefined && status >= 500) {
    return {
      texto:
        modo === "criar"
          ? "O servidor de autenticação falhou e a conta não foi criada. Costuma ser o envio do e-mail de confirmação: se o SMTP recusa a mensagem, o Supabase desfaz o cadastro inteiro. Verifique o SMTP e os logs de Auth."
          : "O servidor de autenticação falhou. Não é a sua senha — tente de novo em instantes.",
      culpaDoServidor: true,
    };
  }

  if (status === 429) {
    return { texto: "Muitas tentativas seguidas. Espere um minuto e tente de novo.", culpaDoServidor: false };
  }

  if (vazia) {
    return {
      texto: `Falha na autenticação sem mensagem do servidor${
        status ? ` (HTTP ${status})` : ""
      }. Os detalhes estão no console.`,
      culpaDoServidor: status === undefined || status >= 500,
    };
  }

  // Mensagem desconhecida mas legível: mostrar é melhor que engolir.
  return { texto: bruta, culpaDoServidor: false };
}
