/**
 * CNPJ — normalização e validação, alfanumérico inclusive.
 *
 * A REGRA NOVA (IN RFB 2.229/2024, em vigor desde 31/07/2026)
 * -----------------------------------------------------------
 * As 14 posições continuam, mas as 12 primeiras passam a aceitar LETRAS
 * MAIÚSCULAS; só os 2 dígitos verificadores seguem obrigatoriamente
 * numéricos. CNPJ já existente NÃO muda — a regra vale para inscrições
 * novas, e a Receita segue emitindo numéricos durante a transição.
 *
 * O cálculo do DV continua módulo 11 com os mesmos pesos. O que muda é a
 * conversão: cada caractere vale seu código ASCII menos 48. Para dígito isso
 * devolve o próprio dígito ('0' = 48−48 = 0), então a regra nova é um
 * SUPERCONJUNTO da antiga — nenhum CNPJ numérico válido deixa de valer.
 * Para letra: A=17, B=18 … Z=42.
 *
 * POR QUE CORRIGIR AGORA, com a carteira toda numérica
 * -----------------------------------------------------
 * A versão anterior usava `replace(/\D/g, "")`, que APAGA as letras.
 * `PC3D315K000193` virava `3315000193` e, com o `padStart(14, "0")`, virava
 * `00003315000193`: catorze caracteres, formato impecável, empresa errada.
 * O modo de falha não era recusar — era ACEITAR calado um CNPJ que não
 * existe, e carimbá-lo num laudo. Por isso não dá para esperar o
 * alfanumérico ficar comum.
 *
 * A Receita recomenda não EMITIR com as letras I, O, Q e F (confusão
 * visual). É recomendação de emissão, não de validação: aqui aceitamos A-Z
 * inteiro, senão recusaríamos um CNPJ que o próprio Fisco considera válido.
 */

/** valor do caractere no cálculo do DV: ASCII − 48 */
const valorDv = (c: string): number => c.charCodeAt(0) - 48;

/**
 * Tira pontuação e espaço, sobe para maiúscula e descarta o que não for
 * letra nem dígito. NÃO valida tamanho nem DV — quem faz isso é cnpjValido().
 */
export function limparCnpj(v: string): string {
  return (v || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
}

/**
 * Completa com zero à esquerda APENAS quando o valor é todo numérico.
 *
 * O padding existe por causa de planilha: o Excel trata a coluna de CNPJ
 * como número e come o zero da frente, devolvendo 13 caracteres. Isso só
 * acontece com CNPJ numérico — havendo letra, a célula é texto e chega
 * inteira. Completar um alfanumérico curto seria inventar uma empresa.
 */
export function normalizarCnpj(v: string): string {
  const c = limparCnpj(v);
  if (c.length > 14) return c.slice(-14);
  // 12 ou 13: é CNPJ com zero comido. Menos que isso não é CNPJ truncado, é
  // lixo — e encher de zero transformaria "1" em 00000000000001, que parece
  // um CNPJ e não é. A versão anterior fazia exatamente isso.
  if (c.length >= 12 && /^\d+$/.test(c)) return c.padStart(14, "0");
  return c;
}

export function formatarCnpj(v: string): string {
  const d = normalizarCnpj(v);
  if (d.length !== 14) return d;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** máscara que preserva a raiz e esconde o miolo, como no mockup */
export function mascararCnpj(v: string): string {
  const d = normalizarCnpj(v);
  if (d.length !== 14) return d;
  return `${d.slice(0, 2)}.***.***/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** true quando há letra em alguma das 12 primeiras posições */
export function ehAlfanumerico(v: string): boolean {
  return /[A-Z]/.test(limparCnpj(v).slice(0, 12));
}

export function cnpjValido(v: string): boolean {
  // normalizarCnpj e não limparCnpj: o parser da carteira valida ANTES de
  // normalizar, então o CNPJ que o Excel entregou sem o zero da frente era
  // recusado e a empresa sumia da importação — o padding existia e nunca era
  // alcançado. Quem decide se o zero recomposto é legítimo é o DV, logo abaixo.
  const c = normalizarCnpj(v);
  // 12 posições alfanuméricas + 2 dígitos verificadores numéricos
  if (!/^[0-9A-Z]{12}\d{2}$/.test(c)) return false;
  // catorze caracteres iguais é preenchimento de teste, não empresa
  if (/^(.)\1{13}$/.test(c)) return false;

  const calc = (base: string) => {
    let soma = 0;
    let peso = base.length - 7;
    for (let i = 0; i < base.length; i++) {
      soma += valorDv(base[i]) * peso;
      peso = peso === 2 ? 9 : peso - 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const dv1 = calc(c.slice(0, 12));
  const dv2 = calc(c.slice(0, 12) + dv1);
  return c.slice(12) === `${dv1}${dv2}`;
}
