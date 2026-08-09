/**
 * MÁSCARA DE VALOR E DE DATA DURANTE A DIGITAÇÃO — 08/08/2026.
 *
 * O DEFEITO. Os campos de dinheiro do produto aceitavam texto livre e só
 * mostravam o valor entendido DEPOIS, num eco embaixo do campo. Quem digita
 * "480000" não sabe se gravou quatrocentos e oitenta mil ou quatro mil e
 * oitocentos até tirar o olho do teclado — e a RBT12 é o número que decide
 * faixa, alíquota efetiva e sublimite de um laudo que sai assinado. Um campo
 * que se formata enquanto se digita não é enfeite: é a conferência acontecendo
 * no momento em que o erro ainda é barato.
 *
 * A DECISÃO: máscara por CENTAVOS ACUMULADOS, não por reformatação de texto.
 * A abordagem ingênua (reformatar a string a cada tecla) briga com o cursor:
 * apagar no meio de "1.234,56" faz o número saltar. Aqui só existem dígitos —
 * cada tecla empurra uma casa, `Backspace` puxa de volta — e a formatação é
 * sempre derivada do inteiro. É o comportamento de terminal de cartão, que é o
 * que a mão de quem digita valor já conhece.
 *
 * PURO: sem DOM, sem React. Testável, e usado igual em todos os campos.
 */

/** "1234556" → 1234556 centavos → "12.345,56" */
export function mascaraMoeda(bruto: string): string {
  const digitos = (bruto ?? "").replace(/\D/g, "").slice(0, 15);
  if (!digitos) return "";
  const centavos = Number(digitos);
  return (centavos / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** o número que vai para o banco a partir do texto mascarado */
export function valorDaMascara(mascarado: string): number | null {
  const digitos = (mascarado ?? "").replace(/\D/g, "");
  if (!digitos) return null;
  return Number(digitos) / 100;
}

/** o texto inicial do campo a partir do que já está gravado */
export function moedaParaMascara(valor: number | null | undefined): string {
  if (valor == null || !Number.isFinite(valor)) return "";
  return mascaraMoeda(String(Math.round(valor * 100)));
}

/**
 * Data em dd/mm/aaaa, pela mesma regra: só dígitos, as barras entram sozinhas.
 * Não valida o calendário — validar enquanto se digita acusa erro em toda data
 * pela metade, e o campo passa a piscar vermelho o tempo inteiro.
 */
export function mascaraData(bruto: string): string {
  const d = (bruto ?? "").replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** "31/10/2026" → "2026-10-31"; devolve null enquanto estiver incompleta */
export function dataISO(mascarada: string): string | null {
  const d = (mascarada ?? "").replace(/\D/g, "");
  if (d.length !== 8) return null;
  const dia = d.slice(0, 2);
  const mes = d.slice(2, 4);
  const ano = d.slice(4);
  const iso = `${ano}-${mes}-${dia}`;
  /* a validação acontece SÓ com a data completa: um `new Date` que devolve o
     mês seguinte é como 31/02 vira 03/03 sem ninguém perceber */
  const t = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(t.getTime())) return null;
  return t.toISOString().slice(0, 10) === iso ? iso : null;
}
