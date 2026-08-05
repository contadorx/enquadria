/**
 * ASSINATURA ELETRÔNICA PRÓPRIA — o motor de prova do termo de ciência.
 *
 * Substitui a dependência externa: o valor do termo nunca foi a plataforma de
 * assinatura, foi a PROVA. Aqui a gente reproduz os quatro ingredientes que
 * qualquer e-sign entrega, dentro do próprio app, com custo por documento ~zero:
 *
 *   1. o documento exato que a pessoa viu      → hash SHA-256 do conteúdo canônico
 *   2. a manifestação de vontade               → o aceite registrado
 *   3. a identificação do signatário           → nome + CPF + e-mail (+ OTP na avançada)
 *   4. a data/hora e a trilha                  → timestamp, IP, user-agent, carimbo
 *
 * Base legal (Lei 14.063/2020 + MP 2.200-2/2001): assinatura eletrônica simples
 * e avançada têm validade entre as partes para um termo de ciência. ICP-Brasil
 * só é exigida em atos específicos, que não é o caso.
 */

import { createHash, randomInt, randomUUID, timingSafeEqual } from "crypto";

export type MetodoAssinatura = "simples" | "avancada";

/** SHA-256 hex de um texto (UTF-8). Determinístico e verificável por qualquer um. */
export function sha256(texto: string): string {
  return createHash("sha256").update(texto, "utf8").digest("hex");
}

/** token público opaco para a URL de assinatura (não expõe o id interno) */
export function novoToken(): string {
  return randomUUID();
}

/**
 * CONTEÚDO CANÔNICO do termo — a string exata que é "assinada". Precisa ser
 * idêntica no momento da emissão e no que o signatário lê na tela, senão o hash
 * não fecha. Ordem e rótulos fixos; nada de data de render aqui.
 */
export function conteudoCanonico(d: {
  empresa: string;
  cnpj: string;
  decisao: "optar" | "permanecer";
  clausulas: string[];
}): string {
  const decisao =
    d.decisao === "optar"
      ? "OPTAR pelo regime híbrido — recolhimento de IBS/CBS fora do DAS a partir de 2027"
      : "PERMANECER no regime tradicional do Simples Nacional";
  return [
    "TERMO DE CIÊNCIA E DECISÃO — IBS/CBS",
    `EMPRESA: ${d.empresa}`,
    `CNPJ: ${d.cnpj}`,
    `DECISÃO: ${decisao}`,
    "CIÊNCIA:",
    ...d.clausulas.map((c, i) => `${i + 1}. ${c}`),
  ].join("\n");
}

/**
 * AS CLÁUSULAS DE CIÊNCIA — uma lista só, e esta é a correção de 05/08/2026.
 *
 * Havia DUAS cópias: esta e a de `components/FolhaTermo.tsx`. Depois viraram
 * três, quando `lib/termo.ts` nasceu com a versão nova (com o cadeado do
 * art. 41 § 5º). Resultado imediato: o termo que o cliente abre pelo link de
 * assinatura mostrava a lista ANTIGA — e é essa a lista que entra no conteúdo
 * canônico, que é a que vira hash.
 *
 * Ou seja: a lista que a pessoa lê e assina não era a lista que a gente tinha
 * corrigido. Uma cópia por superfície é exatamente como isso acontece.
 *
 * A lista mora em `lib/termo.ts` porque é conteúdo jurídico, não mecânica de
 * assinatura. Aqui fica o apelido, para não quebrar quem já importa daqui.
 *
 * ATENÇÃO AO HASH, e isto foi conferido antes de mexer: `conteudoCanonico()` é
 * calculado UMA VEZ na emissão e o resultado é GRAVADO em `hash_documento`.
 * Nada recomputa a partir desta constante na verificação. Mudar a lista afeta
 * apenas termos NOVOS; as assinaturas existentes continuam válidas com o texto
 * que foi assinado. Se a verificação recalculasse, mudar uma vírgula aqui
 * invalidaria todas as assinaturas já colhidas.
 */
export { CIENCIA_DOS_EFEITOS as CLAUSULAS_CIENCIA } from "./termo";

/* ------------------------------------------------------------------ OTP ---- */

/** código numérico de 6 dígitos, gerado com CSPRNG (não Math.random) */
export function gerarOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** guarda só o hash do OTP (nunca o código em claro), amarrado ao token */
export function hashOtp(codigo: string, token: string): string {
  return sha256(`${token}:${codigo}`);
}

/** verificação em tempo constante do OTP */
export function otpConfere(codigo: string, token: string, hashGravado?: string | null): boolean {
  if (!hashGravado) return false;
  const a = Buffer.from(hashOtp(codigo, token));
  const b = Buffer.from(hashGravado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const OTP_VALIDADE_MIN = 10;
export const OTP_MAX_TENTATIVAS = 5;

/* --------------------------------------------------------------- evidência - */

export interface Evidencia {
  aceito_em: string;
  ip: string | null;
  user_agent: string | null;
  metodo: MetodoAssinatura;
  otp_verificado: boolean;
  hash_documento: string;
}

/** monta a evidência do aceite a partir dos cabeçalhos da requisição */
export function montarEvidencia(params: {
  headers: Headers;
  metodo: MetodoAssinatura;
  otp_verificado: boolean;
  hash_documento: string;
  agora: string;
}): Evidencia {
  const h = params.headers;
  const ip =
    (h.get("x-forwarded-for") || "").split(",")[0].trim() ||
    h.get("x-real-ip") ||
    h.get("cf-connecting-ip") ||
    null;
  return {
    aceito_em: params.agora,
    ip,
    user_agent: h.get("user-agent"),
    metodo: params.metodo,
    otp_verificado: params.otp_verificado,
    hash_documento: params.hash_documento,
  };
}

/* ----------------------------------------------------------------- trilha -- */

/** e-mail mascarado para exibição (jo***@dominio.com) */
export function mascararEmail(email?: string | null): string {
  if (!email || !email.includes("@")) return "—";
  const [u, dom] = email.split("@");
  const ini = u.slice(0, 2);
  return `${ini}${"*".repeat(Math.max(1, u.length - 2))}@${dom}`;
}

/** linhas da trilha de auditoria exibidas no termo do contador */
export function trilhaEmTexto(t: {
  assinante_nome?: string | null;
  assinante_cpf?: string | null;
  assinante_email?: string | null;
  assinado_em?: string | null;
  metodo?: string | null;
  hash_documento?: string | null;
  evidencia?: Evidencia | null;
  carimbo?: { fonte?: string; carimbo_em?: string; token?: string } | null;
}): string[] {
  const linhas: string[] = [];
  const metodo = t.metodo === "avancada" ? "avançada (com código por e-mail)" : "simples";
  linhas.push(`Método: assinatura eletrônica ${metodo} (Lei 14.063/2020).`);
  if (t.assinante_nome) linhas.push(`Signatário: ${t.assinante_nome}${t.assinante_cpf ? ` — CPF ${t.assinante_cpf}` : ""}.`);
  if (t.assinante_email) linhas.push(`E-mail: ${mascararEmail(t.assinante_email)}.`);
  if (t.assinado_em) linhas.push(`Data e hora do aceite: ${new Date(t.assinado_em).toLocaleString("pt-BR")}.`);
  if (t.evidencia?.ip) linhas.push(`IP de origem: ${t.evidencia.ip}.`);
  if (t.carimbo?.carimbo_em) {
    const fonte = t.carimbo.fonte === "tsa" ? "autoridade de carimbo do tempo (RFC 3161)" : "servidor";
    linhas.push(`Carimbo do tempo (${fonte}): ${new Date(t.carimbo.carimbo_em).toLocaleString("pt-BR")}.`);
  }
  if (t.hash_documento) linhas.push(`Hash SHA-256 do documento: ${t.hash_documento}.`);
  return linhas;
}
