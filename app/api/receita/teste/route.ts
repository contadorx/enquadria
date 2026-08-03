import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { enriquecer } from "@/lib/receita";

/**
 * DIAGNÓSTICO DO ENRIQUECIMENTO — o instrumento, não o palpite.
 *
 * Quando a Receita não responde, quem está na tela vê "não respondeu" e quem
 * pode olhar o servidor está em outro lugar. Sem um instrumento, a depuração
 * vira troca de mensagens adivinhando entre token, rota, DNS e timeout — que
 * são quatro consertos diferentes.
 *
 * Esta rota faz UMA chamada com um CNPJ conhecido e devolve o que aconteceu:
 * a URL efetivamente usada, se havia token, quanto tempo levou, e o erro exato.
 *
 * SEGURANÇA: exige sessão (é rota de painel, não pública) e NUNCA devolve o
 * token — só se ele está presente. Um diagnóstico que vaza credencial é um
 * problema maior do que o que ele resolve.
 */

export const dynamic = "force-dynamic";

/** Petrobras — existe em qualquer carga da base e não é dado de cliente */
const CNPJ_SONDA = "33000167000101";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });

  const t0 = Date.now();
  const r = await enriquecer([CNPJ_SONDA]);
  const ms = Date.now() - t0;

  const achou = r.dados[CNPJ_SONDA];

  let veredito: string;
  let sugestao: string | null = null;

  if (!r.configurado) {
    veredito = "RECEITA_API_URL não está configurada na Vercel";
    sugestao = "Defina RECEITA_API_URL (e RECEITA_API_TOKEN) e faça um novo deploy.";
  } else if (r.ativo && achou) {
    veredito = "funcionando";
  } else if (r.ativo && !achou) {
    veredito = "a base respondeu, mas não tem este CNPJ";
    sugestao =
      "A integração está de pé. Se a sua carteira também volta vazia, a carga da base " +
      "pode estar incompleta — confira o total de estabelecimentos no VPS.";
  } else {
    veredito = `a base não respondeu — ${r.detalhe ?? "motivo desconhecido"}`;
    if (/401/.test(r.detalhe ?? "")) {
      sugestao =
        "O token da Vercel não bate com o do servidor. Compare RECEITA_API_TOKEN na Vercel " +
        "com a variável de token no .env do receita-api.";
    } else if (/404/.test(r.detalhe ?? "")) {
      sugestao =
        "A rota /lote não existe no servidor. Rode o instalar-lote.sh no VPS, ou confira se " +
        "RECEITA_API_URL aponta para o caminho certo.";
    } else if (/sem resposta/.test(r.detalhe ?? "")) {
      sugestao =
        "O servidor não respondeu a tempo. Verifique se o serviço receita-api está ativo e se " +
        "o Postgres da Receita está de pé.";
    } else {
      sugestao =
        "Parece problema de rede ou DNS. Teste do próprio VPS: " +
        "curl -sS -X POST <url>/lote -H 'Authorization: Bearer <token>' " +
        "-H 'Content-Type: application/json' -d '{\"cnpjs\":[\"33000167000101\"]}'";
    }
  }

  return NextResponse.json({
    veredito,
    sugestao,
    url: r.url ?? null,
    tem_token: !!process.env.RECEITA_API_TOKEN,
    tempo_ms: ms,
    configurado: r.configurado,
    respondeu: r.ativo,
    falhas: r.falhas,
    detalhe: r.detalhe ?? null,
    amostra: achou ?? null,
  });
}
