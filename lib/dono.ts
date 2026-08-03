/**
 * QUEM É O CONTADOR DESTE ESCRITÓRIO.
 *
 * POR QUE ISTO PRECISOU EXISTIR. Dois avisos rodam SEM sessão do contador: a
 * coleta respondida (quem chama é o cliente, na página pública) e o termo
 * assinado (idem). Nos dois casos é preciso descobrir para quem avisar, e não
 * há usuário logado de onde tirar.
 *
 * O DIGEST JÁ FAZIA ISSO, E FAZIA MAL: pegava o PRIMEIRO `profiles` que a
 * consulta devolvesse para aquele tenant. Num escritório com equipe, "o
 * primeiro" é a ordem que o Postgres quiser — o aviso podia ir para o
 * estagiário em vez do responsável, e ninguém notaria porque o e-mail chega
 * para alguém. A coluna `papel` existe desde a tela de equipe (owner, admin,
 * membro); usá-la custa uma linha.
 *
 * A ORDEM É DELIBERADA: owner → admin → qualquer um com e-mail. O último degrau
 * existe porque um escritório de uma pessoa pode não ter papel preenchido, e
 * não avisar ninguém é pior que avisar o único cadastrado.
 */

export interface Dono {
  email: string;
  escritorio: string;
  tenant_id: string;
}

/**
 * @param admin cliente de SERVICE ROLE — estas chamadas nascem em rota pública,
 *              onde não existe sessão e a RLS não tem em quem se apoiar.
 */
export async function donoDoTenant(
  admin: { from: (t: string) => any },
  tenantId: string | null | undefined
): Promise<Dono | null> {
  if (!tenantId) return null;

  const { data: perfis } = await admin
    .from("profiles")
    // schema-ok: profiles.papel alimenta a tela de equipe (app/painel/equipe) — owner|admin|membro
    .select("email, papel")
    .eq("tenant_id", tenantId)
    .not("email", "is", null);

  const lista = (perfis ?? []) as { email: string | null; papel: string | null }[];
  if (!lista.length) return null;

  const escolhido =
    lista.find((p) => p.papel === "owner") ??
    lista.find((p) => p.papel === "admin") ??
    lista[0];
  if (!escolhido?.email) return null;

  const { data: tenant } = await admin
    .from("tenants")
    .select("nome")
    .eq("id", tenantId)
    .maybeSingle();

  return {
    email: escolhido.email,
    escritorio: (tenant as { nome?: string } | null)?.nome || "Seu escritório",
    tenant_id: tenantId,
  };
}
