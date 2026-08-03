/**
 * A RÉGUA DE ONBOARDING — o que mandar, para quem, e quando parar.
 *
 * DIFERENÇA DE FUNDO PARA A RÉGUA DE COBRANÇA: aquela ancora numa DATA (o
 * vencimento) e o eixo é o calendário. Esta ancora num EVENTO — cadastrou,
 * importou, emitiu — e o eixo é o que a pessoa fez ou deixou de fazer.
 *
 * A REGRA QUE MAIS IMPORTA É A DE PARAR. Um passo do tipo "sem_carteira" só
 * existe enquanto a carteira não subiu; no instante em que ela sobe, o passo
 * perde o sentido. Mandar "vi que a carteira ainda não subiu" para quem acabou
 * de subir 143 empresas é o e-mail que faz a pessoa parar de ler todos os
 * outros — e ele é o mais fácil de escrever por engano, porque a régua já
 * estava agendada.
 *
 * Puro e sem relógio próprio: `hoje` entra como argumento, como na cobrança.
 */

export interface PassoOnboarding {
  chave: string;
  evento: "cadastro" | "sem_carteira" | "sem_analise" | "sem_laudo" | "primeiro_laudo";
  /** dias após o evento âncora */
  dias: number;
  assunto: string;
  corpo: string;
  ativo: boolean;
}

/** O retrato da conta no momento da avaliação. */
export interface EstadoConta {
  id: string;
  /** AAAA-MM-DD */
  criado_em: string;
  is_teste: boolean;
  emails_optout: boolean;
  status: string;
  empresas: number;
  analises: number;
  laudos: number;
  /** AAAA-MM-DD do primeiro laudo, se houver */
  primeiro_laudo_em: string | null;
}

export interface EnvioOnboarding {
  tenant_id: string;
  passo_chave: string;
}

function dias(de: string, ate: string): number {
  const a = Date.UTC(+de.slice(0, 4), +de.slice(5, 7) - 1, +de.slice(8, 10));
  const b = Date.UTC(+ate.slice(0, 4), +ate.slice(5, 7) - 1, +ate.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

/**
 * O passo ainda faz sentido para esta conta?
 *
 * É aqui que mora a regra de parar. Separada da regra de tempo de propósito:
 * são perguntas diferentes ("já passou o prazo?" e "ainda é verdade?") e
 * juntá-las produz o erro clássico de mandar cobrança de tarefa já feita.
 */
export function aindaFazSentido(passo: PassoOnboarding, c: EstadoConta): boolean {
  switch (passo.evento) {
    case "cadastro":
      return true;
    case "sem_carteira":
      return c.empresas === 0;
    case "sem_analise":
      // só cobra análise de quem já tem carteira: sem empresa, o passo
      // anterior é que se aplica
      return c.empresas > 0 && c.analises === 0;
    case "sem_laudo":
      return c.analises > 0 && c.laudos === 0;
    case "primeiro_laudo":
      return c.laudos > 0;
    default:
      return false;
  }
}

/** A data-âncora de cada evento. Null quando o evento ainda não aconteceu. */
export function ancora(passo: PassoOnboarding, c: EstadoConta): string | null {
  if (passo.evento === "primeiro_laudo") return c.primeiro_laudo_em;
  // os demais contam do nascimento da conta: é a única data que existe para
  // todos, e a régua de entrada é sobre o tempo desde que a pessoa chegou
  return c.criado_em;
}

export function elegivelOnboarding(c: EstadoConta): boolean {
  if (c.is_teste) return false;
  if (c.emails_optout) return false;
  if (c.status === "cancelada" || c.status === "suspensa") return false;
  return true;
}

/**
 * O que sai hoje para uma conta.
 *
 * `jaEnviados` traz as marcas `tenant|passo` já registradas. Onboarding não tem
 * competência: cada passo acontece UMA vez por conta, para sempre. A pessoa só
 * entra no produto uma vez.
 */
export function onboardingDevido(
  c: EstadoConta,
  passos: PassoOnboarding[],
  hoje: string,
  jaEnviados: Set<string>
): EnvioOnboarding[] {
  if (!elegivelOnboarding(c)) return [];

  const saida: EnvioOnboarding[] = [];
  for (const p of passos) {
    if (!p.ativo) continue;
    if (jaEnviados.has(`${c.id}|${p.chave}`)) continue;
    if (!aindaFazSentido(p, c)) continue;

    const base = ancora(p, c);
    if (!base) continue;

    // `>=` e não `===`: se o cron falhar num dia, o passo ainda sai no
    // seguinte. Com igualdade exata, uma indisponibilidade de algumas horas
    // apagaria o passo para sempre — e ninguém descobriria.
    if (dias(base, hoje) >= p.dias) {
      saida.push({ tenant_id: c.id, passo_chave: p.chave });
    }
  }
  return saida;
}
