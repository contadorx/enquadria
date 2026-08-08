import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { situacaoPlano, mensagemBloqueio, montarMuro, type Assinatura } from "@/lib/plano";
import { garantirAnaliseCoerente } from "@/lib/recalculo-server";
import { HONORARIO_PADRAO } from "@/lib/potencial";
import { honorarioSugerido } from "@/lib/proposta";
import { COLUNAS_ESCRITORIO, type Escritorio } from "@/lib/escritorio";
import { responsavelDoTenant } from "@/lib/escritorio-server";

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

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
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

  return NextResponse.json({ ok: true, laudo_id: laudo.id, numero: laudo.numero, recalculada });
}
