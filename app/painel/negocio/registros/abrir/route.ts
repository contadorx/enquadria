import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

/**
 * ABRIR O DOCUMENTO DE UM CLIENTE, DO PAINEL — a porta que faltava.
 *
 * O DEFEITO: a tela de registros por conta LISTA os laudos de qualquer
 * escritório (lê por `plataforma_conta()`, que é security definer) e linkava
 * para `/doc/laudo/[id]`, que lê com o cliente da SESSÃO. A RLS de `laudos` é
 * `tenant_id = tenant_atual()`: nenhuma linha volta, a página chama
 * `notFound()`, e a tela mostra que o documento existe e se recusa a abri-lo.
 *
 * Ler por uma porta e navegar por outra é o defeito, e o consertos óbvio —
 * abrir exceção de superadmin na RLS — resolveria essa navegação e valeria
 * para toda consulta a `laudos` feita com a sessão dele, em qualquer tela, hoje
 * e em todo código futuro. Política de tabela é ampla demais para isso.
 *
 * AQUI: a RPC confere `e_plataforma()`, REGISTRA o acesso em
 * `acessos_plataforma` e devolve o token público que o documento já tem — o
 * mesmo pelo qual o cliente do contador o abre, sem login. Nada de novo é
 * exposto; o que muda é que o caminho existe e deixa rastro.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tipo = url.searchParams.get("tipo") ?? "laudo";
  const id = url.searchParams.get("id");

  if (!id || (tipo !== "laudo" && tipo !== "termo")) {
    return recado("Link incompleto", "Falta o documento a abrir. Volte ao registro da conta e clique no número do laudo.");
  }

  const supabase = createClient();
  const { data: token, error } = await supabase.rpc("plataforma_documento_token", {
    p_tipo: tipo,
    p_id: id,
  });

  /* a RPC levanta exceção quando quem pede não é o dono da plataforma — e o
     recado é o mesmo de "não existe", de propósito: quem não pode ver também
     não precisa descobrir se existe */
  if (error) {
    return recado(
      "Não foi possível abrir",
      "Este documento não está disponível para a sua conta."
    );
  }
  if (!token) {
    return recado(
      "Documento sem link público",
      "Este " + tipo + " foi emitido antes do endereço público existir e não tem token. " +
        "Ele continua guardado; só não há por onde abri-lo daqui. Peça a via ao escritório."
    );
  }

  return NextResponse.redirect(new URL(`/${tipo}/${token}`, url.origin));
}

/** um recado legível em vez de 404 — a tela que manda para cá mostrou o item */
function recado(titulo: string, texto: string) {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><title>${titulo}</title>` +
      `<div style="font:15px/1.6 system-ui,sans-serif;max-width:46ch;margin:14vh auto;padding:0 20px;color:#334155">` +
      `<h1 style="font-size:17px;margin:0 0 8px">${titulo}</h1><p>${texto}</p>` +
      `<p><a href="/painel/negocio/registros" style="color:#1e4b8f">← voltar aos registros</a></p></div>`,
    { status: 404, headers: { "content-type": "text/html; charset=utf-8" } }
  );
}
