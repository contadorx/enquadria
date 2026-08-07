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
  /* precisada em 07/08/2026: um usuário real errou a senha, leu esta frase e
     ficou SEM caminho — a tela não tinha recuperação. Agora tem, e o erro
     aponta. Erro que só diagnostica é meio erro. */
  ["invalid login credentials", "E-mail ou senha incorretos. Se não lembra a senha, use “Esqueci minha senha” ou “Entrar com código por e-mail”, logo abaixo."],
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
  // fluxo de código por e-mail (signInWithOtp / verifyOtp)
  ["signups not allowed for otp", "Não existe conta com este e-mail. Confira o endereço — ou crie a conta."],
  ["otp_expired", "Código vencido. Peça um novo com “mandar outro código”."],
  ["token has expired or is invalid", "Código errado ou vencido. Confira os dígitos ou peça um novo."],
  ["otp_disabled", "Entrada por código está desligada no servidor de autenticação. Use a senha ou a recuperação."],
  // fluxo de nova senha (updateUser)
  ["new password should be different", "A nova senha precisa ser diferente da atual."],
  ["auth session missing", "A sessão do link venceu. Peça um novo link em “Esqueci minha senha”."],
  ["error sending confirmation", "Não foi possível enviar o e-mail de confirmação. A conta NÃO foi criada."],
  ["error sending", "Não foi possível enviar o e-mail. A conta NÃO foi criada."],
  ["failed to fetch", "Não consegui falar com o servidor. Verifique sua conexão."],
  // vindos do link de confirmação, via /auth/callback
  ["expired", "Este link de confirmação expirou. Peça um novo entrando com seu e-mail e senha."],
  ["invalid request", "Este link de confirmação já foi usado ou não vale mais. Tente entrar direto."],
  ["code verifier", "O link foi aberto em um navegador diferente do que fez o cadastro. Abra no mesmo navegador, ou entre direto com e-mail e senha."],
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

/* ────────────────────────────────────────────────────────────────────────
 * O QUE ACONTECEU NO CADASTRO — quando não há erro nenhum.
 *
 * Caso real: o cadastro funcionava, o usuário era gravado, o e-mail saía —
 * e a tela não mexia um pixel. A causa é que "criar conta" e "entrar" são
 * coisas diferentes quando a confirmação de e-mail está ligada:
 *
 *   signUp devolve `session: null`, porque a pessoa ainda não provou que é
 *   dona do endereço. O código empurrava para /painel assumindo que criar
 *   conta é entrar; /painel não via sessão e devolvia para o login. Sem
 *   erro, sem aviso, sem navegação aparente — a tela parecia travada.
 *
 * Há ainda um terceiro caso, silencioso de propósito: se o e-mail JÁ tem
 * conta, o Supabase não devolve erro (isso permitiria descobrir quem é
 * cadastrado). Ele devolve um usuário com `identities` vazio. Sem tratar
 * isso, a tela também fica parada.
 * ──────────────────────────────────────────────────────────────────────── */

export type ResultadoCadastro =
  | { tipo: "entrou" }
  | { tipo: "confirmar"; email: string }
  | { tipo: "jaExiste" };

export function interpretarCadastro(dados: unknown, email: string): ResultadoCadastro {
  const d = (dados ?? {}) as {
    session?: unknown;
    user?: { identities?: unknown[] | null } | null;
  };

  // identities vazio = e-mail já cadastrado. O Supabase omite o erro de
  // propósito; nós não podemos omitir a informação da pessoa.
  const ids = d.user?.identities;
  if (Array.isArray(ids) && ids.length === 0) return { tipo: "jaExiste" };

  // com sessão, cadastrar já entrou: pode seguir para o painel
  if (d.session) return { tipo: "entrou" };

  // sem sessão e sem erro: conta criada, falta confirmar o e-mail
  return { tipo: "confirmar", email };
}
