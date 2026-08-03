import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieItem = { name: string; value: string; options?: CookieOptions };

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(list: CookieItem[]) {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  /**
   * O QUE É PROTEGIDO, E O QUE NÃO PODE SER.
   *
   * `/painel` e `/doc` exigem sessão: são as telas do contador e as versões
   * dos documentos que leem com o cliente do usuário.
   *
   * Ficam DELIBERADAMENTE de fora os endereços que existem para quem não tem
   * conta e nunca vai ter — o cliente do contador:
   *     /assinar/[token]      · o termo de ciência
   *     /coleta/[token]       · o formulário de dados
   *     /laudo/[token]        · o laudo entregue
   *     /comparativo/[token]  · o comparativo entregue
   *
   * A autorização deles é o token, e a leitura é feita pelo cliente de serviço
   * na própria página. Acrescentar qualquer um desses prefixos aqui não daria
   * erro visível no build: daria um cliente batendo em tela de login para ler
   * o documento que ele pagou. Há uma regra em testes/rodar-tudo.mjs que
   * verifica isto.
   */
  const path = request.nextUrl.pathname;
  if ((path.startsWith("/painel") || path.startsWith("/doc")) && !user) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    return NextResponse.redirect(login);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
