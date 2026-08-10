import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { erroDeBanco } from "@/lib/erro-banco";

/**
 * ZERAR A CARTEIRA DA CONTA — para quem grava demonstração e recomeça o dia
 * inteiro. 10/08/2026.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POR QUE ISTO EXISTE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Gravar um caso do começo ao fim exige carteira vazia: os números da esteira
 * do roteiro só batem se a conta estiver limpa. Apagar à mão significava abrir
 * o Supabase e rodar `delete` em oito tabelas na ordem certa — e o dia em que
 * a ordem sai errada, sobra órfão e a reimportação falha por chave única, no
 * meio da gravação.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AS TRÊS TRAVAS, E POR QUE CADA UMA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. CLIENTE DE SESSÃO, NUNCA O SERVICE ROLE. A RLS já limita cada `delete` ao
 *    tenant de quem está logado. Isso não é economia de código: é a garantia
 *    ESTRUTURAL de que esta rota não consegue tocar na carteira de outro
 *    escritório, nem por bug nem por parâmetro forjado. Com `createAdminClient`
 *    aqui, um erro de filtro apagaria a base inteira.
 *
 * 2. FRASE DIGITADA. `confirmacao` tem de vir exatamente como
 *    `APAGAR A CARTEIRA`. Botão de apagar tudo protegido só por um "tem
 *    certeza?" é botão que se clica sem ler.
 *
 * 3. A CONTA TEM DE SE DECLARAR DE TESTE. Sem `NEXT_PUBLIC_CONTA_DEMO` batendo
 *    com o e-mail de quem chama, a rota recusa. Um escritório de verdade não
 *    pode chegar aqui por link colado, mesmo digitando a frase certa.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE ELA NÃO APAGA, DE PROPÓSITO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O escritório (nome, CRC, logo), a assinatura, o plano e as configurações
 * ficam. O que se refaz numa gravação é a CARTEIRA — recadastrar a marca a
 * cada tomada seria trocar um trabalho manual por outro.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * A ORDEM IMPORTA: filho antes de pai. Fora dela, uma FK sem `on delete
 * cascade` recusa o `delete` do pai e a carteira fica pela metade — que é o
 * pior estado possível, porque a tela parece limpa e a reimportação quebra.
 *
 * Tabela que não existe neste banco não é erro: a lista cobre migrations que
 * podem não ter rodado (comparativos, aberturas, apontamentos). Cada uma é
 * tentada e o resultado sai no relatório.
 */
const NA_ORDEM = [
  "envios_cliente",
  "termos",
  "laudos",
  "coletas",
  "comparativos",
  "apontamentos",
  "analises",
  "empresas",
  "importacoes",
] as const;

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });

  const demo = (process.env.NEXT_PUBLIC_CONTA_DEMO ?? "").trim().toLowerCase();
  if (!demo) {
    return NextResponse.json(
      { erro: "esta instalação não declarou conta de demonstração (NEXT_PUBLIC_CONTA_DEMO)" },
      { status: 403 }
    );
  }
  if ((user.email ?? "").trim().toLowerCase() !== demo) {
    return NextResponse.json(
      { erro: "esta conta não é a de demonstração — zerar carteira só é permitido nela" },
      { status: 403 }
    );
  }

  let corpo: { confirmacao?: string };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }
  if ((corpo.confirmacao ?? "").trim().toUpperCase() !== "APAGAR A CARTEIRA") {
    return NextResponse.json(
      { erro: 'digite exatamente "APAGAR A CARTEIRA" para confirmar' },
      { status: 400 }
    );
  }

  const apagados: Record<string, number | string> = {};

  for (const tabela of NA_ORDEM) {
    /* CONTAR ANTES, APAGAR DEPOIS. `delete` não devolve quantas linhas caíram
       sem `returning`, e um relatório que diz "ok" sem número não deixa você
       perceber que a tabela nem existia. */
    // schema-ok: tabelas da carteira; a RLS limita cada uma ao tenant da sessão
    const { count, error: erroConta } = await supabase
      .from(tabela)
      .select("id", { count: "exact", head: true });

    if (erroConta) {
      apagados[tabela] = erroConta.code === "42P01" ? "tabela não existe" : erroDeBanco(erroConta, tabela);
      continue;
    }

    if ((count ?? 0) === 0) {
      apagados[tabela] = 0;
      continue;
    }

    /* `neq("id", ...)` com um uuid impossível é o "apague tudo o que eu posso
       ver": o PostgREST recusa `delete` sem filtro, de propósito, e a RLS já
       fez o recorte que importa. */
    const { error } = await supabase
      .from(tabela)
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");

    apagados[tabela] = error ? erroDeBanco(error, tabela) : (count ?? 0);
  }

  return NextResponse.json({ ok: true, apagados });
}
