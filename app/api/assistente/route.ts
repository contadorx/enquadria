import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { buscar, normalizar } from "@/lib/ajuda";

/**
 * O ASSISTENTE — responde a partir dos artigos, e escala o que não sabe.
 *
 * TRÊS TRAVAS, e nenhuma é opcional num produto que produz laudo tributário:
 *
 *  1. SÓ RESPONDE COM O QUE ESTÁ ESCRITO. Os artigos publicados vão no
 *     contexto e a instrução proíbe inventar. Um número inventado aqui não
 *     fica no chat: vira premissa de laudo na mão de um cliente.
 *
 *  2. ESCALA EM VEZ DE CHUTAR. Se não achou resposta — ou se a chamada falhar,
 *     ou se estiver desligado — abre chamado. O contador nunca fica sem
 *     resposta, e o humano só vê o que a máquina não resolveu.
 *
 *  3. TETO DIÁRIO. Assistente sem teto é fatura sem teto. Atingido o limite,
 *     a pergunta vira chamado em vez de erro.
 *
 * O interruptor e a persona vivem em `assistente_config`, editáveis em runtime:
 * ajustar uma IA que está respondendo errado precisa levar minutos.
 */

export const dynamic = "force-dynamic";

interface Corpo {
  pergunta?: string;
}

/** Abre chamado e devolve a resposta que a pessoa vê. Nunca deixa sem saída. */
async function escalar(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  tenantId: string | null,
  pergunta: string,
  motivo: string
) {
  if (!admin) {
    return NextResponse.json({
      resposta:
        "Não consegui responder agora e também não consegui abrir um chamado. Escreva para suporte@enquadria.com.br que eu respondo.",
      escalado: false,
    });
  }

  const { data: chamado } = await admin
    .from("chamados")
    .insert({
      user_id: userId,
      tenant_id: tenantId,
      assunto: pergunta.slice(0, 120),
      escalado_ia: true,
      status: "aberto",
    })
    .select("id")
    .maybeSingle();

  if (chamado?.id) {
    await admin.from("chamado_mensagens").insert([
      { chamado_id: chamado.id, autor: "cliente", corpo: pergunta },
      {
        chamado_id: chamado.id,
        autor: "ia",
        corpo: `(escalado automaticamente: ${motivo})`,
      },
    ]);
  }

  return NextResponse.json({
    resposta:
      "Essa eu não sei responder com o que está escrito na central de ajuda — e prefiro não chutar, porque daqui sai laudo. Abri um chamado e você recebe a resposta por e-mail.",
    escalado: true,
    chamado_id: chamado?.id ?? null,
  });
}

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });

  let corpo: Corpo;
  try {
    corpo = await req.json();
  } catch {
    corpo = {};
  }
  const pergunta = (corpo.pergunta ?? "").trim();
  if (!pergunta) return NextResponse.json({ erro: "escreva a pergunta" }, { status: 400 });

  const { data: perfil } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();
  const tenantId = (perfil?.tenant_id as string) ?? null;
  const admin = createAdminClient();

  const { data: cfg } = await supabase
    .from("assistente_config")
    .select("ativo, modelo, persona, teto_dia")
    .eq("id", 1)
    .maybeSingle();

  const chave = process.env.ANTHROPIC_API_KEY;

  // desligado ou sem chave: não é erro, é caminho previsto — vira chamado
  if (!cfg?.ativo) return escalar(admin, user.id, tenantId, pergunta, "assistente desligado");
  if (!chave) return escalar(admin, user.id, tenantId, pergunta, "sem chave de API no servidor");

  // teto do dia. Conta TODAS as chamadas, inclusive as que falharam: uma falha
  // que repete em laço gastaria o dia inteiro sem aparecer na contagem.
  if (admin) {
    const inicioDoDia = `${new Date().toISOString().slice(0, 10)}T00:00:00Z`;
    const { count } = await admin
      .from("ia_uso")
      .select("id", { count: "exact", head: true })
      .gte("criado_em", inicioDoDia);
    if ((count ?? 0) >= (cfg.teto_dia ?? 200)) {
      return escalar(admin, user.id, tenantId, pergunta, "teto diário de uso atingido");
    }
  }

  // ---- o contexto: os artigos publicados que casam com a pergunta ----------
  const { data: artigos } = await supabase
    .from("ajuda_artigos")
    .select("titulo, resumo, corpo, no_assistente, publicado")
    .eq("publicado", true)
    .eq("no_assistente", true);

  const todos = (artigos ?? []) as unknown as {
    titulo: string;
    resumo: string | null;
    corpo: string;
  }[];

  // primeiro tenta a busca por palavras; se não casar nada, manda os mais
  // curtos como base — vazio garantiria escalonamento mesmo tendo resposta
  let contexto = buscar(todos, pergunta).slice(0, 4);
  if (contexto.length === 0) contexto = todos.slice(0, 3);
  if (contexto.length === 0) {
    return escalar(admin, user.id, tenantId, pergunta, "nenhum artigo publicado");
  }

  const material = contexto
    .map((a) => `## ${a.titulo}\n${a.resumo ?? ""}\n\n${a.corpo}`)
    .join("\n\n---\n\n");

  let resposta = "";
  let erroChamada: string | null = null;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": chave,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: cfg.modelo || "claude-haiku-4-5",
        max_tokens: 700,
        system: `${cfg.persona}\n\nResponda SOMENTE com base no material abaixo. Se a resposta não estiver nele, responda exatamente: NAO_SEI\n\n${material}`,
        messages: [{ role: "user", content: pergunta }],
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!r.ok) {
      erroChamada = `HTTP ${r.status}`;
    } else {
      const j = (await r.json()) as { content?: { type: string; text?: string }[] };
      resposta = (j.content ?? [])
        .filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("")
        .trim();
    }
  } catch (e) {
    erroChamada = e instanceof Error ? e.message : "falha na chamada";
  }

  // o registro inclui a falha — contar só sucesso esconde o que precisa de conserto
  if (admin) {
    await admin.from("ia_uso").insert({
      user_id: user.id,
      contexto: "ajuda",
      ok: !erroChamada,
      erro: erroChamada,
    });
  }

  if (erroChamada) {
    return escalar(admin, user.id, tenantId, pergunta, `falha na IA (${erroChamada})`);
  }
  if (!resposta || normalizar(resposta).includes("nao_sei")) {
    return escalar(admin, user.id, tenantId, pergunta, "sem resposta no material");
  }

  return NextResponse.json({ resposta, escalado: false });
}
