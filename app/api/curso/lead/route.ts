import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * O CURSO MORA NO SITE, não aqui.
 *
 * A página estática do curso (enquadria.com.br/curso) posta neste endpoint, e
 * navegador nenhum faz POST entre domínios sem CORS. A lista de origens é
 * fechada de propósito: e-mail de lead é dado pessoal, e endpoint aberto vira
 * formulário de spam de terceiro em dois dias.
 */
const ORIGENS = [
  "https://enquadria.com.br",
  "https://www.enquadria.com.br",
  "https://app.enquadria.com.br",
];

function cors(origem: string | null) {
  const ok = origem && ORIGENS.includes(origem);
  return {
    "Access-Control-Allow-Origin": ok ? origem : ORIGENS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: cors(req.headers.get("origin")) });
}

/**
 * O ÚNICO PONTO DE CAPTURA DO CURSO.
 *
 * Rota pública: a página do curso não tem sessão. Por isso usa service role e
 * grava numa tabela com RLS ligada e sem policy — ninguém lê isso pelo cliente.
 *
 * REGRA DE PRODUTO: o download NÃO fica refém desta rota. Se o banco estiver
 * fora, se a chave não estiver configurada, se der qualquer erro, a resposta é
 * 200 e o material libera. Prometi o material em troca do e-mail; o e-mail veio.
 * Perder um lead é ruim; quebrar a promessa da página é pior.
 */
export async function POST(req: Request) {
  const cab = cors(req.headers.get("origin"));
  let corpo: { email?: string; origem?: string; material?: string };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ ok: true, gravado: false, motivo: "corpo inválido" }, { headers: cab });
  }

  const email = (corpo.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return NextResponse.json({ erro: "Confira o e-mail — parece incompleto." }, { status: 400, headers: cab });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    // sem SUPABASE_SERVICE_ROLE_KEY o app segue funcionando; só não captura
    return NextResponse.json({ ok: true, gravado: false, motivo: "captura não configurada" }, { headers: cab });
  }

  const { error } = await supabase
    .from("curso_leads")
    .upsert(
      {
        email,
        origem: corpo.origem ?? "curso",
        material: corpo.material ?? null,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "email" }
    );

  if (error) {
    // a migration 0022 pode ainda não ter rodado — não é motivo para negar o material
    return NextResponse.json({ ok: true, gravado: false, motivo: error.message }, { headers: cab });
  }

  return NextResponse.json({ ok: true, gravado: true }, { headers: cab });
}
