import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import { createAdminClient } from "@/lib/supabase-admin";
import {
  responderRoteiro,
  revisar,
  extrairEmail,
  perguntaValida,
  noLimite,
  contextoIA,
  SUGESTOES,
  TETO_SESSAO,
  RESPOSTA_CAPTURA,
  RESPOSTA_LIMITE,
  DESTINOS,
  type Fonte,
} from "@/lib/venda";
import { normalizar } from "@/lib/ajuda";

/**
 * O BALÃO DA PÁGINA PÚBLICA — a rota que fala com quem ainda não tem conta.
 *
 * Ela é diferente de todas as outras rotas do app em uma coisa: NÃO EXISTE
 * SESSÃO. Quem chama é um navegador anônimo numa página estática hospedada em
 * outro domínio. Isso muda três coisas de projeto:
 *
 *  1. CORS FECHADO. Só as origens do site. Endpoint de IA aberto na internet
 *     é conta de terceiro no meu cartão em dois dias.
 *
 *  2. TETO EM CAMADAS. Por sessão (conversa que não acaba), por IP e por hora
 *     (script apontado para cá) e por dia no total (o freio final). Estourar
 *     qualquer um não devolve erro: devolve a resposta que pede o e-mail. Quem
 *     está do outro lado pode ser um contador legítimo com muita dúvida.
 *
 *  3. IP NUNCA É GRAVADO EM CLARO. Só o HMAC dele. Preciso contar repetição,
 *     não saber quem é.
 *
 * E a regra de produto que atravessa tudo: SE O BANCO CAIR, O BALÃO CONTINUA
 * RESPONDENDO. O roteiro é função pura e não depende de nada. Perder o registro
 * de uma conversa é ruim; deixar a página muda para quem perguntou é pior.
 */

export const dynamic = "force-dynamic";

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

/** IP só existe aqui dentro; o que sai para o banco é o resumo dele. */
function hashIp(req: Request): string {
  const bruto =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "desconhecido";
  const segredo = process.env.SUPABASE_SERVICE_ROLE_KEY || "sem-segredo";
  return createHmac("sha256", segredo).update(bruto).digest("base64url").slice(0, 24);
}

const TETO_IP_HORA = 40;

interface Corpo {
  pergunta?: string;
  sessao?: string;
}

interface ConfigVenda {
  ativo: boolean;
  modelo: string;
  persona: string;
  teto_dia: number;
}

interface Saida {
  resposta: string;
  fonte: Fonte;
  chave?: string;
  cta?: { rotulo: string; url: string };
  pedirEmail?: boolean;
  sugestoes?: string[];
  restam?: number;
}

export async function POST(req: Request) {
  const cab = cors(req.headers.get("origin"));
  const admin = createAdminClient();

  let corpo: Corpo;
  try {
    corpo = (await req.json()) as Corpo;
  } catch {
    corpo = {};
  }

  const pergunta = (corpo.pergunta ?? "").trim();
  const sessao = (corpo.sessao ?? "").trim().slice(0, 64) || null;

  const valida = perguntaValida(pergunta);
  if (!valida.ok) {
    return NextResponse.json(
      {
        resposta:
          valida.motivo === "longa demais"
            ? "Essa ficou comprida para o chat. Resume em uma linha o que você precisa saber — ou me deixa seu e-mail que eu respondo com calma."
            : "Escreve a sua dúvida que eu respondo. Se preferir, clica em uma das perguntas prontas.",
        fonte: "roteiro" as Fonte,
        sugestoes: SUGESTOES,
      } satisfies Saida,
      { headers: cab }
    );
  }

  /* ---------------------------------------------------------------- 1. e-mail
   * Se a pessoa mandou o endereço, isso vem ANTES de qualquer resposta: é o
   * único momento em que ela está entregando o que eu quero. Gravar primeiro e
   * agradecer depois. */
  const email = extrairEmail(pergunta);
  if (email && admin) {
    await admin
      .from("curso_leads")
      .upsert(
        { email, origem: "agente-site", material: "conversa", atualizado_em: new Date().toISOString() },
        { onConflict: "email" }
      );
    if (sessao) {
      await admin
        .from("venda_conversas")
        .upsert({ sessao, email, ip_hash: hashIp(req), atualizado_em: new Date().toISOString() }, { onConflict: "sessao" });
    }
  }

  /* -------------------------------------------------------------- 2. os tetos
   * Contados no servidor. O cliente manda a sessão, não o placar — placar
   * enviado pelo navegador é placar que o navegador edita. */
  let feitas = 0;
  let ipHora = 0;
  const ipHash = hashIp(req);
  if (admin && sessao) {
    const umaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const [{ count: c1 }, { count: c2 }] = await Promise.all([
      admin.from("venda_mensagens").select("id", { count: "exact", head: true }).eq("sessao", sessao),
      admin
        .from("venda_mensagens")
        .select("id", { count: "exact", head: true })
        .eq("ip_hash", ipHash)
        .gte("criado_em", umaHora),
    ]);
    feitas = c1 ?? 0;
    ipHora = c2 ?? 0;
  }

  const registrar = async (s: Saida) => {
    if (!admin || !sessao) return;
    await admin.from("venda_mensagens").insert({
      sessao,
      ip_hash: ipHash,
      pergunta,
      resposta: s.resposta,
      fonte: s.fonte,
      chave: s.chave ?? null,
      email,
    });
  };

  const responder = async (s: Saida) => {
    await registrar(s);
    return NextResponse.json({ ...s, restam: Math.max(0, TETO_SESSAO - feitas - 1) }, { headers: cab });
  };

  if (email) {
    return responder({
      resposta:
        "Anotado — respondo no seu e-mail, normalmente no mesmo dia. Se quiser adiantar, cria a conta e cola o CNPJ de um cliente do Simples: a triagem é grátis e eu te acompanho a partir daí.",
      fonte: "captura",
      chave: "email-recebido",
      cta: DESTINOS.app,
    });
  }

  if (noLimite(feitas) || ipHora >= TETO_IP_HORA) {
    return responder({ resposta: RESPOSTA_LIMITE, fonte: "limite", pedirEmail: true });
  }

  /* ------------------------------------------------------------- 3. o roteiro
   * Primeiro, sempre. Grátis, instantâneo e conferido. */
  const doRoteiro = responderRoteiro(pergunta);
  if (doRoteiro) {
    // a revisão vale para o texto escrito à mão também: ele é editado por gente
    const rev = revisar(doRoteiro.resposta);
    if (rev.ok) {
      return responder({
        resposta: doRoteiro.resposta,
        fonte: doRoteiro.fonte,
        chave: doRoteiro.chave,
        cta: doRoteiro.cta,
        pedirEmail: doRoteiro.pedirEmail,
      });
    }
  }

  /* ------------------------------------------------------------------ 4. a IA
   * Só para o que sobrou, só com o corpus, e com interruptor no banco. */
  const chave = process.env.ANTHROPIC_API_KEY;
  let cfg: ConfigVenda | null = null;
  if (admin) {
    const { data } = await admin
      .from("venda_config")
      .select("ativo, modelo, persona, teto_dia")
      .eq("id", 1)
      .maybeSingle();
    cfg = (data as ConfigVenda | null) ?? null;
  }

  const capturar = (motivo: string) =>
    responder({ resposta: RESPOSTA_CAPTURA, fonte: "captura", chave: motivo, pedirEmail: true });

  if (!chave || !cfg?.ativo) return capturar(!chave ? "sem-chave" : "desligado");

  if (admin) {
    const inicioDoDia = `${new Date().toISOString().slice(0, 10)}T00:00:00Z`;
    const { count } = await admin
      .from("ia_uso")
      .select("id", { count: "exact", head: true })
      .eq("contexto", "venda")
      .gte("criado_em", inicioDoDia);
    if ((count ?? 0) >= (cfg.teto_dia ?? 100)) return capturar("teto-dia");
  }

  let texto = "";
  let erro: string | null = null;
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
        max_tokens: 500,
        system: `${cfg.persona}\n\nResponda SOMENTE com base no material abaixo, em no máximo 5 linhas, em português do Brasil. NUNCA calcule, estime ou opine sobre a situação tributária de uma empresa específica — nesse caso, convide para a triagem gratuita. NUNCA cite marcas de outros sistemas. Se a resposta não estiver no material, responda exatamente: NAO_SEI\n\n${contextoIA()}`,
        messages: [{ role: "user", content: pergunta }],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) erro = `HTTP ${r.status}`;
    else {
      const j = (await r.json()) as { content?: { type: string; text?: string }[] };
      texto = (j.content ?? [])
        .filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("")
        .trim();
    }
  } catch (e) {
    erro = e instanceof Error ? e.message : "falha na chamada";
  }

  // o uso é registrado inclusive quando falha: contar só sucesso esconde o que
  // precisa de conserto, e uma falha em laço gastaria o dia sem aparecer
  if (admin) {
    await admin.from("ia_uso").insert({ contexto: "venda", ok: !erro, erro });
  }

  if (erro) return capturar(`falha-ia`);
  if (!texto || normalizar(texto).includes("nao_sei")) return capturar("nao-sei");

  // O PORTÃO FINAL. A saída do modelo não é auditada por ninguém antes da tela.
  const rev = revisar(texto);
  if (!rev.ok) {
    if (admin) await admin.from("ia_uso").insert({ contexto: "venda", ok: false, erro: `revisão barrou: ${rev.motivo}` });
    return capturar("revisao-barrou");
  }

  return responder({ resposta: texto, fonte: "ia", chave: "ia", cta: DESTINOS.app });
}
