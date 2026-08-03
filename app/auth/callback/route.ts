import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

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

  return NextResponse.redirect(new URL(destino, url.origin));
}
