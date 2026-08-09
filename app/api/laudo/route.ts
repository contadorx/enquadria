import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import {
  situacaoPlano,
  mensagemBloqueio,
  montarMuro,
  avisoLimite,
  type Assinatura,
} from "@/lib/plano";
import { garantirAnaliseCoerente } from "@/lib/recalculo-server";
import { HONORARIO_PADRAO } from "@/lib/potencial";
import { honorarioSugerido } from "@/lib/proposta";
import { COLUNAS_ESCRITORIO, type Escritorio } from "@/lib/escritorio";
import { responsavelDoTenant } from "@/lib/escritorio-server";
import { ORIGEM_LOTE } from "@/lib/premissas-padrao";
import { erroDeBanco } from "@/lib/erro-banco";

/**
 * TEMPO DE FUNÇÃO — declarado em 08/08/2026.
 *
 * Nenhuma rota de lote declarava `maxDuration`: rodavam no default da
 * plataforma, enquanto os crons — que ninguém espera na frente da tela — já
 * pediam 60 s. Esta rota trabalha por item (RPC, gravação, e às vezes um
 * e-mail que pode levar segundos), e estourar no meio não é uma tela lenta: é
 * documento criado e e-mail já enviado, com "falha de rede" escrito para o
 * contador. Sessenta segundos não resolvem uma carteira de 400 de uma vez —
 * resolvem a maioria dos lotes reais, e o que passa disso agora é interrompido
 * com aviso honesto em vez de silêncio.
 */
export const maxDuration = 60;


/**
 * Emite o laudo de uma análise (RPC atômica que numera por tenant).
 *
 * GATE DO FREEMIUM: a trava vive AQUI, no servidor. Esconder o botão na tela não
 * é gate — é sugestão. O limite incide sobre a emissão, nunca sobre analisar:
 * o contador vê a carteira inteira de graça e só esbarra no muro quando vai
 * transformar a análise em documento com a marca dele.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });

  let corpo: { analise_id: string };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }
  if (!corpo.analise_id) {
    return NextResponse.json({ erro: "analise_id obrigatório" }, { status: 400 });
  }

  /**
   * A ROTA INDIVIDUAL TAMBÉM NÃO EMITE SOBRE PREMISSA ESTIMADA — 08/08/2026.
   *
   * O comentário do lote afirma que "esta rota era a única porta que furava a
   * regra". Não era: sobrou esta. `PainelEmpresa` mostra o botão "Emitir laudo"
   * ativo assim que existe análise, inclusive a estimada pelo CNAE na
   * importação, com apenas um aviso amarelo embaixo — e aviso não é trava. Saía
   * documento numerado, com o CRC do contador na capa, sobre premissa que
   * ninguém conferiu.
   *
   * A recusa é 409 (conflito de estado), não 400: não é o pedido que está
   * malformado, é a análise que ainda não está pronta. E a mensagem diz o que
   * fazer, porque o contador resolve isso sozinho em dois cliques.
   */
  const { data: analiseAlvo } = await supabase
    .from("analises")
    .select("parametros")
    .eq("id", corpo.analise_id)
    .maybeSingle();
  const origem = (analiseAlvo?.parametros as { origem_premissas?: string } | null)
    ?.origem_premissas;
  if (origem === ORIGEM_LOTE) {
    return NextResponse.json(
      {
        erro:
          "As premissas desta empresa ainda são a estimativa do CNAE. Abra a análise, confira os números e salve — aí o laudo sai com a sua assinatura em cima de dado conferido.",
        premissas_estimadas: true,
      },
      { status: 409 }
    );
  }

  // reemitir um laudo que já existe nunca consome cota
  const { data: jaExiste } = await supabase
    .from("laudos")
    .select("id")
    .eq("analise_id", corpo.analise_id)
    .maybeSingle();

  if (!jaExiste) {
    const { data: assinRaw } = await supabase.rpc("assinatura_ativa");
    const assinatura = (Array.isArray(assinRaw) ? assinRaw[0] : assinRaw) as Assinatura | null;

    const { count } = await supabase
      .from("laudos")
      .select("id", { count: "exact", head: true });

    const situacao = situacaoPlano(assinatura, count ?? 0);
    if (situacao.bloqueado) {
      // O PREÇO VEM DO BANCO, não de constante no código. O muro cita um valor
      // ao lado do honorário do contador; se essa cifra divergir da página de
      // planos, o argumento inteiro perde a força — e é o tipo de divergência
      // que ninguém percebe até um cliente apontar. Pego o plano público mais
      // caro, que é o anual.
      const { data: plano } = await supabase
        .from("planos")
        .select("preco_centavos")
        .eq("ativo", true)
        .eq("publico", true)
        .gt("preco_centavos", 0)
        .order("preco_centavos", { ascending: false })
        .limit(1)
        .maybeSingle();

      /**
       * O HONORÁRIO DO MURO É O DESTA EMPRESA — conserto de 08/08/2026.
       *
       * O muro dizia "Referência da sua tela: R$ 600,00 por empresa" usando
       * HONORARIO_PADRAO, que é a média da CARTEIRA usada no mapa. Só que a
       * proposta que o contador acabou de emitir para aquele cliente podia
       * dizer R$ 250 — e o argumento comercial virava contra o produto: a tela
       * seguinte inflava o número da tela anterior para justificar a assinatura.
       *
       * Agora o valor sai de `honorarioSugerido()`, a mesma função que a
       * proposta usa: mesma faixa, mesma RBT12, mesma saída. Se não der para
       * saber (empresa desconhecida), cai na média — e a média é honesta ali,
       * porque não há um número específico para contradizer.
       */
      const { data: alvo } = await supabase
        .from("analises")
        .select("saida, empresas(faixa, rbt12)")
        .eq("id", corpo.analise_id)
        .maybeSingle();
      const emp = (alvo?.empresas ?? null) as { faixa?: string | null; rbt12?: number | null } | null;
      const honorario = emp
        ? honorarioSugerido(emp.faixa, emp.rbt12 != null ? Number(emp.rbt12) : null, alvo?.saida as never)
            .projeto
        : HONORARIO_PADRAO;

      return NextResponse.json(
        {
          erro: mensagemBloqueio(situacao),
          bloqueado_por_plano: true,
          usados: situacao.usados,
          limite: situacao.limite,
          muro: montarMuro(situacao, honorario, plano?.preco_centavos ?? null),
        },
        { status: 402 }
      );
    }
  }

  /**
   * ANTES DE CONGELAR, CONFERE SE A ANÁLISE AINDA SE SUSTENTA.
   *
   * `emitir_laudo` monta o snapshot a partir da linha de `analises`. Se ela foi
   * calculada por um motor anterior e a decisão de hoje é outra, o documento
   * nasce congelando a saída velha — e o texto do laudo, que é gerado pelo
   * código de hoje, discute a saída nova. Refazer AQUI, antes da RPC, é o único
   * ponto em que os dois passam a falar do mesmo caso.
   */
  const recalculada = await garantirAnaliseCoerente(supabase, corpo.analise_id);

  const { data, error } = await supabase
    .rpc("emitir_laudo", { p_analise: corpo.analise_id })
    .single();

  if (error) return NextResponse.json({ erro: erroDeBanco(error, "laudo") }, { status: 500 });
  const laudo = data as { id: string; numero: number };

  /**
   * COMPLETA A IDENTIDADE NO SNAPSHOT.
   *
   * O snapshot do laudo é montado dentro da RPC `emitir_laudo`, em SQL, e ela
   * congela o escritório com os três campos que existiam quando foi escrita:
   * nome, CRC e logotipo. Dois campos novos ficam de fora — a preferência de
   * imprimir (ou não) o nome ao lado do logo, e o nome de quem assina — e a
   * VIA PÚBLICA do laudo lê SÓ o snapshot, de propósito: recompor ao vivo
   * deixaria de ser prova.
   *
   * Sem este trecho, o contador veria o laudo de um jeito na tela dele e o
   * cliente receberia outro cabeçalho. Preencher aqui, na emissão, custa uma
   * leitura e uma escrita e mantém a RPC intocada — alterá-la exigiria
   * reescrever uma função que não está neste repositório.
   *
   * Falha aqui não derruba a emissão: melhor um cabeçalho conservador do que
   * um laudo perdido.
   */
  try {
    const { data: perfil } = await supabase
      .from("profiles")
      .select(`tenant_id, tenants(${COLUNAS_ESCRITORIO})`)
      .eq("id", user.id)
      .maybeSingle();
    const tenant = perfil?.tenants as Escritorio | null;
    const responsavel = await responsavelDoTenant(supabase, (perfil?.tenant_id as string) ?? null);

    if (tenant) {
      const { data: atual } = await supabase
        .from("laudos")
        .select("snapshot")
        .eq("id", laudo.id)
        .maybeSingle();
      const snap = (atual?.snapshot ?? null) as Record<string, unknown> | null;
      if (snap) {
        const antigo = (snap.escritorio ?? {}) as Escritorio;
        snap.escritorio = {
          ...antigo,
          logo_com_nome: tenant.logo_com_nome ?? false,
          responsavel: antigo.responsavel ?? responsavel,
        };
        await supabase.from("laudos").update({ snapshot: snap }).eq("id", laudo.id);
      }
    }
  } catch (e) {
    console.error("[laudo] identidade não entrou no snapshot:", e instanceof Error ? e.message : e);
  }

  /**
   * O AVISO ANTES DO MURO — 08/08/2026.
   *
   * `avisoLimite()` estava escrita em lib/plano.ts desde sempre e não era
   * importada em lugar nenhum: código morto. O contador emitia o 1º e o 2º
   * laudo sem um único sinal de que a conta estava andando e batia no muro de
   * surpresa. Surpresa no momento da compra não vende, assusta — e a conta do
   * muro ("uma análise paga o ano") funciona muito melhor quando ele já sabia
   * que ela vinha.
   *
   * Sai só quando falta pouco, e só para quem tem teto: assinante nunca vê.
   */
  let aviso: string | null = null;
  try {
    const { data: assinRaw } = await supabase.rpc("assinatura_ativa");
    const { count } = await supabase.from("laudos").select("id", { count: "exact", head: true });
    aviso = avisoLimite(
      situacaoPlano((Array.isArray(assinRaw) ? assinRaw[0] : assinRaw) as Assinatura | null, count ?? 0)
    );
  } catch {
    /* o aviso é cortesia; falhar aqui não pode derrubar a emissão */
  }

  return NextResponse.json({
    ok: true,
    laudo_id: laudo.id,
    numero: laudo.numero,
    recalculada,
    aviso_plano: aviso,
  });
}
