import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { COLUNAS_ESCRITORIO, type Escritorio } from "@/lib/escritorio";
import { responsavelDoTenant } from "@/lib/escritorio-server";
import { montarProposta, criticarProposta, honorarioSugerido } from "@/lib/proposta";
import type { Saida } from "@/lib/motor";

/**
 * GERA A PROPOSTA DE HONORÁRIOS de uma empresa da carteira.
 *
 * TRÊS COISAS QUE ESTA ROTA FAZ DIFERENTE DO LAUDO, de propósito:
 *
 *  1. NÃO PASSA PELO GATE DE PLANO. A proposta é o documento que faz o
 *     contador querer emitir o laudo — cobrar por ela é pôr pedágio na porta
 *     de entrada do próprio funil. O muro continua onde sempre esteve: na
 *     emissão do laudo.
 *
 *  2. NÃO EXIGE ANÁLISE. Propor antes de analisar é o caminho mais comum de
 *     verdade: o contador fecha o serviço e só então levanta as premissas com
 *     o cliente. Sem análise, o documento sai pelo perfil da triagem e não
 *     inventa resultado nenhum.
 *
 *  3. O TEXTO É MONTADO AQUI E CONGELADO. O que foi proposto num dia não pode
 *     mudar porque o valor sugerido, o texto padrão ou o motor mudaram depois.
 *     Proposta é oferta com data e validade.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });

  let corpo: {
    empresa_id?: string;
    analise_id?: string | null;
    projeto?: number | null;
    revisao?: number | null;
    validade_dias?: number | null;
    nome?: string | null;
    email?: string | null;
  };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }
  if (!corpo.empresa_id) return NextResponse.json({ erro: "empresa_id obrigatório" }, { status: 400 });

  const { data: empresa } = await supabase
    .from("empresas")
    .select("id, razao_social, cnpj, anexo, faixa, rbt12, contato_nome, contato_email")
    .eq("id", corpo.empresa_id)
    .maybeSingle();
  if (!empresa) return NextResponse.json({ erro: "empresa não encontrada" }, { status: 404 });

  const emp = empresa as unknown as {
    id: string;
    razao_social: string;
    cnpj: string;
    anexo: number | null;
    faixa: string | null;
    rbt12: number | null;
    contato_nome: string | null;
    contato_email: string | null;
  };

  /* A análise mais recente, quando existe. Não é obrigatória — ver nota 2. */
  let saida: Saida | null = null;
  let analiseId: string | null = corpo.analise_id ?? null;
  {
    let q = supabase.from("analises").select("id, saida").eq("empresa_id", emp.id);
    q = analiseId ? q.eq("id", analiseId) : q.order("calculado_em", { ascending: false }).limit(1);
    const { data: a } = await q.maybeSingle();
    if (a) {
      saida = ((a as { saida?: string }).saida ?? null) as Saida | null;
      analiseId = (a as { id: string }).id;
    }
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const entrada = {
    empresa: {
      razao_social: emp.razao_social,
      cnpj: emp.cnpj,
      anexo: emp.anexo,
      faixa: emp.faixa,
    },
    saida,
    rbt12: emp.rbt12,
    premissas: {
      projeto: corpo.projeto ?? null,
      revisao: corpo.revisao ?? null,
      validadeDias: corpo.validade_dias ?? 15,
    },
    hoje,
  };

  /* A crítica roda no SERVIDOR mesmo estando na tela: esconder o botão não é
     trava. Empresa sem decisão a tomar não recebe proposta por nenhum caminho. */
  const critica = criticarProposta(entrada);
  if (critica.erros.length > 0) {
    return NextResponse.json({ erro: critica.erros[0], erros: critica.erros }, { status: 400 });
  }

  const conteudo = montarProposta(entrada);
  const sugerido = honorarioSugerido(emp.faixa, emp.rbt12, saida);

  /* A identidade vai congelada junto: recompor ao vivo faria o documento mudar
     de cabeçalho depois de entregue. */
  const { data: perfil } = await supabase
    .from("profiles")
    .select(`tenant_id, tenants(${COLUNAS_ESCRITORIO})`)
    .eq("id", user.id)
    .maybeSingle();
  const tenant = (perfil?.tenants ?? null) as Escritorio | null;
  const escritorio: Escritorio | null = tenant
    ? {
        ...tenant,
        logo_com_nome: tenant.logo_com_nome ?? false,
        responsavel: await responsavelDoTenant(supabase, (perfil?.tenant_id as string) ?? null),
      }
    : null;

  const { data, error } = await supabase
    .rpc("emitir_proposta", {
      p_empresa_id: emp.id,
      p_analise_id: analiseId,
      p_premissas: {
        projeto: conteudo.investimento.projeto,
        revisao: conteudo.investimento.revisao,
        validade_dias: corpo.validade_dias ?? 15,
        sugerido: { projeto: sugerido.projeto, revisao: sugerido.revisao },
      },
      p_conteudo: conteudo,
      p_escritorio: escritorio,
      p_nome: corpo.nome ?? emp.contato_nome,
      p_email: corpo.email ?? emp.contato_email,
    })
    .single();

  if (error) {
    const falta = /emitir_proposta|propostas/i.test(error.message);
    return NextResponse.json(
      {
        erro: falta
          ? "A migration 0059 ainda não foi rodada neste banco — a proposta não pode ser numerada."
          : error.message,
      },
      { status: 500 }
    );
  }

  const p = data as { id: string; numero: number };
  return NextResponse.json({
    ok: true,
    proposta_id: p.id,
    numero: p.numero,
    alertas: critica.alertas,
    sugerido,
  });
}
