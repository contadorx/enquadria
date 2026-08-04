import type { Escritorio } from "@/lib/escritorio";

/**
 * QUEM É O RESPONSÁVEL TÉCNICO — uma pergunta, uma resposta, sempre a mesma.
 *
 * O laudo é assinado. Se a assinatura viesse do perfil de quem está OLHANDO o
 * documento, um escritório com três pessoas teria três assinaturas para o mesmo
 * laudo, dependendo de quem abrisse a tela. Documento com assinatura variável
 * não é documento.
 *
 * Então a assinatura é do DONO do escritório: é o perfil ligado ao CRC que já
 * está no cadastro do tenant, e é ele que responde tecnicamente pela peça.
 *
 * Aceita tanto o cliente com sessão (a RLS já limita ao próprio escritório)
 * quanto o cliente de serviço das páginas públicas — nesse caso o tenant vem
 * por parâmetro, porque não há sessão para deduzi-lo.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ClienteSupabase = any;

export async function responsavelDoTenant(
  supabase: ClienteSupabase,
  tenantId?: string | null
): Promise<string | null> {
  try {
    let q = supabase.from("profiles").select("nome, role");
    if (tenantId) q = q.eq("tenant_id", tenantId);
    const { data } = await q;
    const linhas = (data ?? []) as Array<{ nome?: string | null; role?: string | null }>;
    if (linhas.length === 0) return null;
    const dono = linhas.find((p) => p.role === "owner") ?? linhas[0];
    return dono?.nome?.trim() || null;
  } catch {
    // nome é enfeite bem-vindo, não requisito: o documento sai assinado pelo
    // escritório se esta consulta falhar
    return null;
  }
}

/** junta o que veio do tenant com o nome do responsável, sem repetir código */
export async function comResponsavel(
  supabase: ClienteSupabase,
  base: Escritorio | null,
  tenantId?: string | null
): Promise<Escritorio | null> {
  if (!base) return null;
  if (base.responsavel) return base;
  return { ...base, responsavel: await responsavelDoTenant(supabase, tenantId) };
}
