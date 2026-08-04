import { cnpjValido, formatarCnpj, limparCnpj } from "./cnpj";

/**
 * CPF OU CNPJ DE QUEM PAGA — o campo que faltava e derrubava a contratação.
 *
 * BUG REAL, e vale escrever inteiro porque ele era invisível:
 *
 * O Asaas EXIGE `cpfCnpj` para criar um cliente. A gente mandava só nome e
 * e-mail. O Asaas recusava, o nosso código engolia a resposta num `catch` que
 * devolvia `null`, a cobrança voltava sem link — e a tela, que só sabia tratar
 * "tem link" e "Asaas desligado", não fazia NADA. O contador clicava em
 * "Assinar" e não acontecia coisa alguma. Nenhum erro, nenhum aviso, nenhum
 * log visível para ele.
 *
 * Três defeitos empilhados: falta o campo, o erro é engolido, e a tela não
 * cobre o terceiro caso. Este arquivo resolve o primeiro; os outros dois estão
 * corrigidos em `lib/asaas.ts` e na tela de planos.
 *
 * A VALIDAÇÃO ACONTECE ANTES DE SAIR DAQUI. Mandar um documento inválido para
 * o Asaas devolve o mesmo silêncio de antes — e a pessoa que digitou errado
 * merece saber disso na hora, não depois de esperar.
 */

export type TipoDocumento = "cpf" | "cnpj" | "invalido";

/** só os dígitos — CPF e CNPJ de pagador não têm letra */
export function limparDocumento(v: string): string {
  return (v ?? "").replace(/\D/g, "");
}

/** CPF pelo dígito verificador — o mesmo algoritmo da Receita */
export function cpfValido(v: string): boolean {
  const d = limparDocumento(v);
  if (d.length !== 11) return false;
  // 111.111.111-11 e afins passam na conta dos dígitos e não existem
  if (/^(\d)\1{10}$/.test(d)) return false;

  const digito = (ate: number): number => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * (ate + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
}

/**
 * O que foi digitado?
 *
 * Pelo TAMANHO, não por escolha do usuário: pedir "é CPF ou CNPJ?" é uma
 * pergunta que o próprio número responde, e toda pergunta a mais num
 * formulário de pagamento custa conversão.
 */
export function tipoDocumento(v: string): TipoDocumento {
  const d = limparDocumento(v);
  if (d.length === 11) return cpfValido(d) ? "cpf" : "invalido";
  if (d.length === 14) return cnpjValido(d) ? "cnpj" : "invalido";
  return "invalido";
}

export function documentoValido(v: string): boolean {
  return tipoDocumento(v) !== "invalido";
}

/** 000.000.000-00 ou 00.000.000/0000-00 — como a pessoa espera ver */
export function formatarDocumento(v: string): string {
  const d = limparDocumento(v);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return formatarCnpj(limparCnpj(d));
  return v ?? "";
}

/**
 * A explicação do que está errado, para a tela.
 *
 * "documento inválido" não ajuda ninguém: quem digitou 10 dígitos precisa
 * saber que faltou um, e quem errou o dígito verificador precisa saber que o
 * número não existe — são conserto diferentes.
 */
export function criticaDocumento(v: string): string | null {
  const d = limparDocumento(v);
  if (!d) return "Informe o CPF ou o CNPJ de quem vai pagar.";
  if (d.length !== 11 && d.length !== 14) {
    return `Faltam ou sobram dígitos: um CPF tem 11 e um CNPJ tem 14 — você digitou ${d.length}.`;
  }
  if (!documentoValido(d)) {
    return d.length === 11
      ? "Este CPF não passa na verificação dos dígitos. Confira o número."
      : "Este CNPJ não passa na verificação dos dígitos. Confira o número.";
  }
  return null;
}
