import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieItem = { name: string; value: string; options?: CookieOptions };

/**
 * DOIS DOMÍNIOS, UM CÓDIGO, PAPÉIS DIFERENTES.
 *
 *   enquadria.com.br      → o site. É o que o Google indexa.
 *   app.enquadria.com.br  → o painel. Não aparece em busca nenhuma.
 *
 * O painel NÃO se muda para o domínio raiz, e a razão é concreta: as URLs de
 * redirect do Supabase, os cookies de sessão e o `/auth/callback` estão
 * configurados para o host `app.` Trocar host de autenticação no mesmo dia em
 * que se troca o DNS é juntar dois problemas que se disfarçam um do outro.
 *
 * O que NUNCA pode ser redirecionado de `app.` para a raiz: `/assinar`,
 * `/laudo`, `/termo`, `/coleta`, `/comparativo`, `/abertura`, `/verificar`.
 * Esses links já saíram por e-mail para clientes e precisam responder no
 * endereço em que foram enviados, para sempre. Por isso a lista abaixo é de
 * INCLUSÃO — o que não está nela fica onde está.
 */
const SO_NO_PAINEL = ["/painel", "/doc", "/login", "/redefinir", "/auth"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  /* ---- cada endereço no seu domínio --------------------------------- */
  const host = (request.headers.get("host") ?? "").toLowerCase();
  const caminho = request.nextUrl.pathname;
  if (host.endsWith("enquadria.com.br")) {
    const noPainel = host.startsWith("app.");

    // pediram trabalho no endereço do site → vai para onde a sessão vive
    if (!noPainel && SO_NO_PAINEL.some((p) => caminho.startsWith(p))) {
      const destino = request.nextUrl.clone();
      destino.host = `app.${host.replace(/^www\./, "")}`;
      destino.port = "";
      destino.protocol = "https";
      return NextResponse.redirect(destino, 308);
    }

    /* a raiz de `app.` continua levando ao painel: é o endereço que os
       contadores têm no favorito desde antes de o site morar aqui */
    if (noPainel && caminho === "/") {
      const painel = request.nextUrl.clone();
      painel.pathname = "/painel";
      return NextResponse.redirect(painel);
    }

    /**
     * `app.` NÃO ENTRA NO ÍNDICE — nenhuma página dele.
     *
     * O mesmo código serve os dois domínios, então as páginas do site também
     * respondem em `app.enquadria.com.br/precos`. Se o buscador achar as duas
     * versões, ele divide a autoridade entre elas — o oposto do motivo pelo
     * qual o site veio para cá. O `canonical` já declara qual é a verdadeira;
     * este cabeçalho fecha a porta em vez de só apontar a certa.
     *
     * Vai por cabeçalho e não pelo `robots.txt` porque o robots é um arquivo
     * só para os dois domínios: ele não sabe por qual host foi pedido.
     */
    if (noPainel) {
      response.headers.set("X-Robots-Tag", "noindex, nofollow");
    }
  }

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
