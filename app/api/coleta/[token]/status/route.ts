import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * O STATUS DE UMA COLETA — só isso, e de propósito.
 *
 * Serve à sondagem que roda na tela do contador enquanto ele espera o cliente
 * responder. Devolve UMA palavra: aberta, pedida ou respondida. Nada de
 * respostas, nada de dados da empresa — uma rota consultada a cada quinze
 * segundos não pode carregar mais do que precisa, e o token que a identifica
 * é o mesmo que o cliente recebe por WhatsApp.
 */

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ erro: "indisponível" }, { status: 503 });

  const { data } = await admin
    .from("coletas")
    .select("status")
    .eq("token", params.token)
    .maybeSingle();

  if (!data) return NextResponse.json({ erro: "não encontrada" }, { status: 404 });
  return NextResponse.json({ status: data.status });
}
