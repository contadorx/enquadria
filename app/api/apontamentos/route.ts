import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import type { StatusApontamento } from "@/lib/apontamentos";
import { erroDeBanco } from "@/lib/erro-banco";

/**
 * OS APONTAMENTOS DE UMA EMPRESA — ler e decidir.
 *
 * A geração é do cron (uma vez por dia, 05h). Aqui só se lê o que ele produziu
 * e se registra a decisão do contador sobre cada um.
 *
 * A separação é de propósito: gerar é trabalho de máquina sobre a carteira
 * inteira; decidir é trabalho de gente sobre um caso. Misturar os dois numa
 * rota só faria a tela do contador esperar por uma varredura.
 */

const VALIDOS: StatusApontamento[] = ["novo", "tratado", "nao_se_aplica", "virou_servico"];

export async function GET(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });

  const empresa = new URL(req.url).searchParams.get("empresa");
  if (!empresa) return NextResponse.json({ erro: "empresa obrigatória" }, { status: 400 });

  /* a matéria vem junto: o apontamento sozinho é um id, e o contador precisa
     ler o que a norma diz para decidir se trata ou se não se aplica */
  const { data, error } = await supabase
    .from("apontamentos")
    // schema-ok: apontamentos vem da 0063; as colunas entre parênteses são o join com radar_itens
    .select(
      "id, status, nota, criado_em, tratado_em, radar_itens(id, titulo, resumo, o_que_fazer, fonte, severidade, vigencia_em, publicado_em)"
    )
    .eq("empresa_id", empresa)
    .order("criado_em", { ascending: false });

  /**
   * A MIGRATION PODE NÃO TER RODADO — e isso não pode derrubar o dossiê.
   *
   * Mesma decisão da leitura de propostas: falha aqui devolve lista vazia e o
   * resto da tela continua funcionando. Um bloco a menos é incômodo; a ficha da
   * empresa inteira em branco por causa de um bloco é um beco.
   */
  if (error) return NextResponse.json({ apontamentos: [], indisponivel: true });

  return NextResponse.json({ apontamentos: data ?? [] });
}

export async function PATCH(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });

  let corpo: {
    id?: string;
    ids?: string[];
    /**
     * AS EMPRESAS INTEIRAS, VINDAS DO COCKPIT — 10/08/2026.
     *
     * O cockpit trabalha por EMPRESA, que é a unidade da fila: quem está lá vê
     * o selo "reforma 3" e quer dizer "tratei os três desta empresa". Sem esta
     * porta, a tela teria de descobrir os ids de cada empresa antes de decidir
     * — uma consulta por linha selecionada, e um lote pela metade se a quinta
     * falhasse.
     */
    empresas?: string[];
    status?: StatusApontamento;
    nota?: string | null;
    /** quanto o escritório declara ter cobrado; só existe em `virou_servico` */
    honorario_centavos?: number | null;
  };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  if (!corpo.status || !VALIDOS.includes(corpo.status)) {
    return NextResponse.json({ erro: "status inválido" }, { status: 400 });
  }

  /* UM OU MUITOS, PELA MESMA PORTA.
     A tela da carteira decide uma norma inteira de uma vez — "esta resolução
     não se aplica a nenhum dos meus dez clientes de transporte" é uma decisão
     só, tomada uma vez. Obrigar dez requisições faria a tela piscar dez vezes
     e deixaria estado pela metade se a quinta falhasse. */
  let ids = corpo.ids?.length ? corpo.ids : corpo.id ? [corpo.id] : [];

  /**
   * POR EMPRESA, E SÓ O QUE ESTÁ EM ABERTO.
   *
   * A resolução dos ids acontece AQUI e não na tela por dois motivos. O
   * primeiro é de rede. O segundo é o que importa: o filtro `status = 'novo'`
   * é a garantia de que um clique em lote não rebaixa um ponto já marcado como
   * "virou serviço" para "tratado" — isso apagaria o valor declarado e o mês em
   * que o dinheiro entrou (a rota limpa os dois quando o estado sai de
   * `virou_servico`), e com eles o relatório do fim do ano, que é a peça de
   * renovação. Em lote ninguém lê o que está apagando.
   */
  if (ids.length === 0 && corpo.empresas?.length) {
    if (corpo.empresas.length > 500) {
      return NextResponse.json({ erro: "no máximo 500 empresas por vez" }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("apontamentos")
      // schema-ok: apontamentos vem da 0063
      .select("id")
      .in("empresa_id", corpo.empresas)
      .eq("status", "novo")
      .limit(2000);
    if (error) {
      return NextResponse.json({ erro: erroDeBanco(error, "apontamentos") }, { status: 500 });
    }
    ids = (data ?? []).map((l) => l.id as string);
    /* nenhum em aberto não é erro: é o caso de dois contadores tratando a
       mesma empresa ao mesmo tempo, e o segundo não precisa ver falha */
    if (ids.length === 0) return NextResponse.json({ ok: true, atualizados: 0 });
  }

  if (ids.length === 0) return NextResponse.json({ erro: "id obrigatório" }, { status: 400 });
  if (ids.length > 2000) {
    return NextResponse.json({ erro: "no máximo 2000 por vez" }, { status: 400 });
  }

  /**
   * O VALOR SÓ VIAJA COM O ESTADO QUE O JUSTIFICA — 08/08/2026.
   *
   * "Virou serviço" era só um rótulo: mudava a cor do botão e a informação
   * morria ali. Sem valor e sem data, ninguém conseguia responder quanto a
   * carteira rendeu de revisão no ano — que é a pergunta de março de 2027, e a
   * única resposta que faz o contador renovar a assinatura.
   *
   * O número é DECLARAÇÃO DELE sobre o que cobrou, igual ao honorário de
   * referência do mapa de risco. O produto não fatura nada por aqui e não
   * promete receita: registra o que o escritório declarou, para virar papel no
   * fim do ano.
   *
   * Sair de "virou serviço" LIMPA o valor e a data. Sem isso, um ponto
   * remarcado como "não se aplica" levaria consigo um honorário para dentro do
   * relatório anual — trabalho somado que o próprio escritório disse não ter
   * feito. A mesma regra está no banco (migration 0066), porque regra que só
   * vive na rota some na segunda rota.
   */
  const virouServico = corpo.status === "virou_servico";
  const valor = corpo.honorario_centavos;
  if (valor != null && (!Number.isFinite(valor) || valor < 0 || valor > 100_000_000)) {
    return NextResponse.json({ erro: "valor do serviço inválido" }, { status: 400 });
  }
  if (valor != null && !virouServico) {
    return NextResponse.json(
      { erro: "só um ponto marcado como serviço carrega valor" },
      { status: 400 }
    );
  }

  /* `superado` não entra na lista de válidos: quem supera é a varredura, olhando
     o critério. Deixar a tela marcar superado seria confundir "o fato mudou"
     com "eu decidi" — e são as duas informações que este registro separa. */
  const patch: Record<string, unknown> = {
    status: corpo.status,
    nota: corpo.nota ?? null,
    tratado_em: corpo.status === "novo" ? null : new Date().toISOString(),
    tratado_por: corpo.status === "novo" ? null : user.id,
    /* data própria: um ponto pode ser tratado em março e só virar serviço em
       maio, e o relatório anual precisa saber em qual mês o dinheiro entrou */
    virou_servico_em: virouServico ? new Date().toISOString() : null,
    honorario_centavos: virouServico ? valor ?? null : null,
  };

  const { error } = await supabase.from("apontamentos").update(patch).in("id", ids);
  if (error) return NextResponse.json({ erro: erroDeBanco(error, "apontamentos") }, { status: 500 });

  return NextResponse.json({ ok: true, atualizados: ids.length });
}
