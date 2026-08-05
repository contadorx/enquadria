import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { avisarContatia, chaveDe } from "@/lib/contatia";

/**
 * A TROCA DO CÓDIGO POR SESSÃO — a rota que faltava.
 *
 * O `@supabase/ssr` usa PKCE por padrão. Nesse fluxo, o link de confirmação de
 * e-mail (e o de recuperar senha) devolve a pessoa para o site com `?code=` na
 * URL, e ALGUÉM precisa trocar esse código por sessão no servidor. Sem esta
 * rota, o código chegava e morria: a pessoa confirmava o e-mail, era jogada na
 * home sem sessão nenhuma, e o produto parecia ter ignorado a confirmação.
 *
 * `next` permite mandar a pessoa para onde ela ia — hoje sempre /painel, mas
 * recuperação de senha vai precisar de outro destino.
 */

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const destino = url.searchParams.get("next") || "/painel";

  // erro devolvido pelo próprio Supabase (link expirado é o caso comum)
  const erroSupabase = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (erroSupabase) {
    const login = new URL("/login", url.origin);
    login.searchParams.set("erro", erroSupabase);
    return NextResponse.redirect(login);
  }

  if (!code) {
    // sem código não há o que trocar. Pode ser alguém abrindo a URL na mão.
    return NextResponse.redirect(new URL("/login", url.origin));
  }

  const supabase = createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const login = new URL("/login", url.origin);
    // a mensagem crua do Supabase é em inglês; a tela traduz
    login.searchParams.set("erro", error.message);
    return NextResponse.redirect(login);
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * O CADASTRO VIROU ATIVO — e o Contatia precisa saber AGORA.
   *
   * Este é o momento exato: o e-mail foi confirmado, a sessão existe, a conta
   * passa a ser usável. Antes disso (no `signUp`) o cadastro ainda pode nunca
   * se concretizar; depois disso não há gatilho natural.
   *
   * Sem este aviso, a tag "Usuário Enquadria" só era aplicada à mão, uma vez
   * por semana — e no intervalo a pessoa continuava na cadência de PROSPECÇÃO,
   * recebendo "você conhece o Enquadria?" um dia depois de criar a conta.
   *
   * NÃO SEGURA O REDIRECIONAMENTO POR FALHA. Quem confirmou o e-mail está
   * esperando o painel abrir; um CRM fora do ar não pode virar erro na cara
   * dele. `avisarContatia` tem timeout de 4s e não lança — o pior caso é uma
   * linha de log e a tag aplicada na conferência semanal, como era antes.
   * ═══════════════════════════════════════════════════════════════════════
   */
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) {
      const { data: perfil } = await supabase
        .from("profiles")
        .select("tenant_id, tenants(nome)")
        .eq("id", user.id)
        .maybeSingle();
      const t = (perfil as { tenants?: { nome?: string } | { nome?: string }[] } | null)?.tenants;
      const empresa = (Array.isArray(t) ? t[0]?.nome : t?.nome) ?? null;
      const tenantId = (perfil as { tenant_id?: string } | null)?.tenant_id;

      const r = await avisarContatia({
        evento: "cadastro_ativo",
        /* a chave é o TENANT, não o instante: reconfirmar o e-mail ou clicar
           duas vezes no link converge para um evento só do outro lado */
        chave: chaveDe("cadastro_ativo", tenantId ?? user.id),
        email: user.email,
        empresa,
        extra: { origem: "confirmacao_email" },
      });
      if (!r.enviado) console.error(`[contatia] cadastro_ativo não avisado: ${r.motivo}`);
    }
  } catch (e) {
    /* nada aqui pode impedir a pessoa de entrar */
    console.error("[contatia] aviso de cadastro falhou:", e instanceof Error ? e.message : e);
  }

  return NextResponse.redirect(new URL(destino, url.origin));
}
