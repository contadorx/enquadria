import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

/**
 * O LINK PÚBLICO DE UM DOCUMENTO, para o contador mandar do jeito dele.
 *
 * POR QUE ESTA ROTA EXISTE. Enviar pelo sistema não pode ser o único caminho.
 * Boa parte da relação do contador com o cliente acontece no WhatsApp, e há
 * empresa onde quem lê é o sócio, num endereço pessoal que não é o
 * `contato_email` da carteira. Quem conhece o cliente e escolhe o canal é o
 * contador — o produto oferece o caminho automático e não impõe.
 *
 * POR QUE O TOKEN NÃO VAI JUNTO COM A LISTA. O dossiê poderia simplesmente
 * trazer o token de cada documento e a tela montaria a URL. Mas aí o token
 * estaria no JSON de toda abertura de dossiê, no cache do navegador e em
 * qualquer log de rede — para um link que só interessa quando alguém decide
 * mandá-lo. Aqui ele sai uma vez, no clique, e para quem a RLS já autorizou.
 *
 * A AUTORIZAÇÃO É A RLS DA CARTEIRA. A consulta usa o cliente do USUÁRIO: se o
 * documento não é deste contador, não volta linha e a resposta é 404. Não há
 * verificação de dono escrita à mão aqui, de propósito — regra de acesso
 * duplicada é regra que diverge.
 */
export async function GET(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });

  const url = new URL(req.url);
  const tipo = url.searchParams.get("tipo");
  const id = url.searchParams.get("id");

  if (!id || (tipo !== "laudo" && tipo !== "comparativo")) {
    return NextResponse.json({ erro: "tipo (laudo|comparativo) e id obrigatórios" }, { status: 400 });
  }

  const tabela = tipo === "laudo" ? "laudos" : "comparativos";
  const { data: doc } = await supabase
    .from(tabela)
    // schema-ok: token criado pela migration 0028 (alter dinâmico, invisível ao parser)
    .select("id, numero, token")
    .eq("id", id)
    .maybeSingle();

  if (!doc) return NextResponse.json({ erro: "documento não encontrado" }, { status: 404 });
  if (!doc.token) {
    return NextResponse.json(
      { erro: "documento sem endereço público — rode a migration 0028" },
      { status: 409 }
    );
  }

  return NextResponse.json({
    ok: true,
    numero: doc.numero,
    link: `${url.origin}/${tipo}/${doc.token}`,
  });
}
