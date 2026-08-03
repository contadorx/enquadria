/**
 * NPS QUE VIRA INDICAÇÃO.
 *
 * A pergunta do NPS **é** "você indicaria". Quem responde 9 ou 10 acabou de
 * declarar intenção de indicar, por escrito, naquele segundo — e é o único
 * instante em que pedir a indicação não é interrupção.
 *
 * Nenhum dos três apps analisados fecha esse ciclo: os três coletam a nota e
 * param ali. O desperdício não é pequeno, porque contador conversa com contador
 * e a indicação é o canal mais barato que este produto tem.
 *
 * A NOTA DECIDE O QUE VEM DEPOIS, e o desenho importa:
 *
 *   9-10 promotor  → convite para indicar, na mesma tela, sem fricção
 *    7-8 neutro    → pedido de melhoria; ele não está pronto para indicar
 *    0-6 detrator  → conversa, e NUNCA pedido de indicação
 *
 * Pedir indicação a detrator é o erro que transforma pesquisa em ofensa. Vale
 * a pena escrever isso em código, não em documento, porque é onde alguém vai
 * "simplificar" um dia.
 */

export type Perfil = "promotor" | "neutro" | "detrator";

export function perfilDaNota(nota: number): Perfil {
  if (nota >= 9) return "promotor";
  if (nota >= 7) return "neutro";
  return "detrator";
}

export interface Desfecho {
  perfil: Perfil;
  /** o que a tela faz em seguida */
  acao: "indicar" | "melhorar" | "conversar";
  titulo: string;
  texto: string;
  /** pedir indicação aqui? A resposta é a regra, não uma opção de configuração. */
  pedeIndicacao: boolean;
}

export function desfecho(nota: number): Desfecho {
  const perfil = perfilDaNota(nota);

  if (perfil === "promotor") {
    return {
      perfil,
      acao: "indicar",
      pedeIndicacao: true,
      titulo: "Então indica um colega?",
      texto:
        "Você acabou de dizer que indicaria. Contador confia em contador — e a janela de 30 de setembro vale para a carteira dele também. Quem você indicar ganha 30 dias para testar com a carteira inteira.",
    };
  }

  if (perfil === "neutro") {
    return {
      perfil,
      acao: "melhorar",
      pedeIndicacao: false,
      titulo: "O que falta para virar 10?",
      texto:
        "Uma frase basta. É o tipo de resposta que muda a próxima versão — e o que você apontar aqui eu leio pessoalmente.",
    };
  }

  return {
    perfil,
    acao: "conversar",
    pedeIndicacao: false,
    titulo: "O que deu errado?",
    texto:
      "Quero entender. Escreva o que aconteceu e eu respondo — não é formulário automático, é conversa.",
  };
}

/** Aceita e-mail? Validação frouxa de propósito: recusar endereço válido é pior. */
export function emailPlausivel(e: string): boolean {
  const t = (e ?? "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t);
}

export interface Indicado {
  nome: string;
  email: string;
}

/**
 * Limpa a lista de indicados antes de gravar.
 *
 * Tira vazios, tira e-mail inválido e tira REPETIDO — inclusive o próprio
 * e-mail de quem indica, que é o engano mais comum quando alguém está testando
 * o formulário e depois vira convite de verdade.
 */
export function limparIndicados(itens: Indicado[], emailDeQuemIndica?: string): Indicado[] {
  const vistos = new Set<string>();
  const proprio = (emailDeQuemIndica ?? "").trim().toLowerCase();

  return itens
    .map((i) => ({ nome: (i.nome ?? "").trim(), email: (i.email ?? "").trim().toLowerCase() }))
    .filter((i) => i.email && emailPlausivel(i.email))
    .filter((i) => i.email !== proprio)
    .filter((i) => {
      if (vistos.has(i.email)) return false;
      vistos.add(i.email);
      return true;
    })
    .map((i) => ({ nome: i.nome || i.email.split("@")[0], email: i.email }));
}

/** NPS clássico: % promotores − % detratores, arredondado. Null sem respostas. */
export function calcularNps(notas: number[]): number | null {
  if (notas.length === 0) return null;
  const prom = notas.filter((n) => n >= 9).length;
  const det = notas.filter((n) => n <= 6).length;
  return Math.round(((prom - det) / notas.length) * 100);
}
