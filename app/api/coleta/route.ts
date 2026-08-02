import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { novoToken } from "@/lib/coleta";

/**
 * ABRIR (E FECHAR) UMA COLETA — rota do contador, autenticada.
 *
 * A TRAVA DE ACESSO ESTÁ AQUI, e é deliberada. A tabela `coletas` tem RLS
 * ligada e nenhuma policy, então quem manda no acesso é este arquivo. Antes de
 * criar qualquer coisa, a empresa é buscada com o cliente do USUÁRIO — sujeito
 * à RLS que já existe em `empresas`. Se o contador não enxerga aquela empresa,
 * a busca volta vazia e a coleta não nasce. A regra de quem-vê-o-quê continua
 * morando num lugar só, em vez de ser reescrita (e divergir) aqui.
 */

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });

  let corpo: { empresa_id?: string };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }
  const empresaId = (corpo.empresa_id ?? "").trim();
  if (!empresaId) return NextResponse.json({ erro: "empresa obrigatória" }, { status: 400 });

  // ↓ a RLS de `empresas` decide se este contador pode abrir coleta desta empresa
  const { data: empresa } = await supabase
    .from("empresas")
    .select("id, razao_social")
    .eq("id", empresaId)
    .maybeSingle();
  if (!empresa) return NextResponse.json({ erro: "empresa não encontrada" }, { status: 404 });

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { erro: "Coleta indisponível: o servidor está sem a chave de serviço." },
      { status: 503 }
    );
  }

  // já existe uma coleta aberta? devolve a mesma. Dois links vivos para a mesma
  // empresa é o caminho mais curto para o cliente responder um e o contador
  // ficar olhando o outro.
  const { data: aberta } = await admin
    .from("coletas")
    .select("id, token, criado_em")
    .eq("empresa_id", empresaId)
    .eq("status", "aberta")
    .order("criado_em", { ascending: false })
    .maybeSingle();

  if (aberta?.token) {
    return NextResponse.json({ ok: true, token: aberta.token, ja_existia: true });
  }

  const token = novoToken(randomBytes(20));
  const { error } = await admin.from("coletas").insert({ empresa_id: empresaId, token });
  if (error) {
    return NextResponse.json({ erro: "Não consegui abrir a coleta agora." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, token, ja_existia: false });
}

/** fecha a coleta aberta — o link para de responder na hora */
export async function DELETE(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });

  const empresaId = new URL(req.url).searchParams.get("empresa") ?? "";
  const { data: empresa } = await supabase
    .from("empresas")
    .select("id")
    .eq("id", empresaId)
    .maybeSingle();
  if (!empresa) return NextResponse.json({ erro: "empresa não encontrada" }, { status: 404 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ erro: "indisponível" }, { status: 503 });

  await admin
    .from("coletas")
    .update({ status: "cancelada" })
    .eq("empresa_id", empresaId)
    .eq("status", "aberta");

  return NextResponse.json({ ok: true });
}
