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

/* ═══════════════════════════════════════════════════════════════════════
 * QUANDO PERGUNTAR — a parte que decide se o NPS ajuda ou irrita.
 * ═══════════════════════════════════════════════════════════════════════ */

export interface ContextoNps {
  /** laudos emitidos por este escritório */
  laudos: number;
  /** AAAA-MM-DD da última resposta de NPS, se houver */
  respondidoEm: string | null;
  /** AAAA-MM-DD em que a pessoa fechou o convite sem responder */
  dispensadoEm: string | null;
  hoje: string;
}

function diasEntre(de: string, ate: string): number {
  const a = Date.UTC(+de.slice(0, 4), +de.slice(5, 7) - 1, +de.slice(8, 10));
  const b = Date.UTC(+ate.slice(0, 4), +ate.slice(5, 7) - 1, +ate.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

/**
 * PERGUNTAR AGORA?
 *
 * Três regras, e cada uma existe por um jeito diferente de estragar a coisa:
 *
 *  1. SÓ DEPOIS DE ENTREGAR VALOR. Perguntar "você indicaria?" a quem ainda
 *     não emitiu um laudo é perguntar sobre um produto que a pessoa não usou.
 *     A nota mede a expectativa dela, não o produto — e contamina a média com
 *     ruído que ninguém sabe interpretar depois.
 *
 *  2. QUEM RESPONDEU FICA EM PAZ POR 90 DIAS. NPS que reaparece toda semana
 *     ensina a fechar sem ler, e aí não mede mais nada.
 *
 *  3. QUEM DISPENSOU FICA EM PAZ POR 30. Fechar o convite é uma resposta —
 *     "agora não". Reabrir no dia seguinte é ignorar o que a pessoa disse.
 *
 * O prazo do dispensado é menor que o do respondente de propósito: dispensar é
 * mais fraco que responder, e a pessoa pode simplesmente estar no meio de uma
 * tarefa.
 */
export function devePerguntarNps(c: ContextoNps): boolean {
  if (c.laudos < 1) return false;
  if (c.respondidoEm && diasEntre(c.respondidoEm, c.hoje) < 90) return false;
  if (c.dispensadoEm && diasEntre(c.dispensadoEm, c.hoje) < 30) return false;
  return true;
}
