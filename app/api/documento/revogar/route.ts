import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const maxDuration = 60;

/**
 * CORTAR O ACESSO POR UM LINK — 08/08/2026.
 *
 * Os documentos por token não tinham validade nem revogação. A migration 0068
 * deu prazo a todos; faltava o ato deliberado: o cliente reencaminhou o link
 * para o grupo errado, o contato saiu da empresa, o contrato acabou. Sem esta
 * rota, a única saída do contador era não ter saída.
 *
 * TRÊS COISAS QUE ELA NÃO FAZ, e cada uma é uma decisão:
 *
 * 1. NÃO APAGA NADA. O documento continua no banco, continua no dossiê e
 *    continua conferível em /verificar pelo número e pelo CNPJ. Revogar é
 *    fechar uma porta, não reescrever o passado — apagar seria o defeito que a
 *    migration dos apontamentos já recusou uma vez, com outro nome.
 *
 * 2. NÃO INVALIDA ASSINATURA. Um termo assinado permanece assinado, com hash e
 *    carimbo do tempo intactos. O que se corta é o acesso pelo endereço; a
 *    prova é o documento, não o link.
 *
 * 3. NÃO ROTACIONA O TOKEN. Gerar um token novo aqui deixaria o antigo morto e
 *    o novo sem ninguém para receber. Quem precisa de link novo reemite o
 *    documento, que é o caminho que já existe e que registra a reemissão.
 *
 * A autorização é da RLS: o cliente é o do USUÁRIO, não o de serviço. Cada
 * tabela já tem política por tenant, e é ela que impede revogar documento de
 * outro escritório — trava em rota é trava que a segunda rota não herda.
 */

/** só as tabelas que servem documento por token público */
const TABELAS = ["laudos", "termos", "comparativos", "aberturas", "coletas"] as const;
type Tabela = (typeof TABELAS)[number];

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });

  let corpo: { tabela?: string; id?: string; desfazer?: boolean };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  const tabela = corpo.tabela as Tabela;
  if (!TABELAS.includes(tabela)) {
    return NextResponse.json({ erro: "tipo de documento inválido" }, { status: 400 });
  }
  if (!corpo.id) return NextResponse.json({ erro: "id obrigatório" }, { status: 400 });

  /* desfazer existe porque revogar por engano é barato de corrigir e caro de
     descobrir: sem a volta, o contador evita usar a trava que o protege */
  const patch = corpo.desfazer
    ? { revogado_em: null, revogado_por: null }
    : { revogado_em: new Date().toISOString(), revogado_por: user.id };

  const { error } = await supabase.from(tabela).update(patch).eq("id", corpo.id);
  if (error) {
    /* a coluna vem da 0068; sem ela a mensagem tem de dizer isso ao operador em
       vez de devolver um erro de Postgres em inglês para o contador */
    const faltaColuna = /revogado_em|column .* does not exist/i.test(error.message);
    return NextResponse.json(
      {
        erro: faltaColuna
          ? "a revogação de links ainda não foi habilitada neste ambiente (migration 0068)"
          : "não foi possível alterar o acesso a este documento",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    revogado: !corpo.desfazer,
    aviso: corpo.desfazer
      ? "O link voltou a abrir, respeitando o prazo de validade original."
      : "O link deixou de abrir. O documento continua no dossiê e conferível em /verificar pelo número e pelo CNPJ.",
  });
}
