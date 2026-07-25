import { createClient } from "@supabase/supabase-js";

/**
 * Cliente de SERVICE ROLE — ignora RLS. Use SOMENTE em rotas sem sessão de
 * usuário: os webhooks do Asaas e do ZapSign, que chegam do provedor externo
 * e não têm cookie de autenticação. NUNCA importe isto num componente de
 * cliente. A chave vive só no servidor (SUPABASE_SERVICE_ROLE_KEY).
 *
 * Sem a chave configurada, devolve null — a rota deve tratar isso e responder
 * 200 para o provedor não ficar reenviando, registrando que ficou pendente.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
