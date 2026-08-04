import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { estudarAbertura, type EntradaAbertura } from "@/lib/abertura";
import { PREMISSAS_PADRAO, type Premissas } from "@/lib/comparativo";
import { situacaoPlano, type Assinatura } from "@/lib/plano";
import { COLUNAS_ESCRITORIO, type Escritorio } from "@/lib/escritorio";
import { responsavelDoTenant } from "@/lib/escritorio-server";

/**
 * Emite o ESTUDO DE ABERTURA como documento numerado e arquivado.
 *
 * Mesma regra do laudo e do comparativo: a TELA é livre — o contador simula à
 * vontade, inclusive na frente do prospecto — e o DOCUMENTO com a marca dele é
 * o que exige plano pago. É o documento que ganha o cliente, não a simulação.
 *
 * E O CÁLCULO É REFEITO AQUI. O navegador manda a ENTRADA, nunca o resultado:
 * um número que vai para um papel assinado pelo contador não pode ter passado
 * por um lugar onde qualquer pessoa consegue editá-lo.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });

  let corpo: {
    entrada?: EntradaAbertura;
    premissas?: Premissas;
    responsavel?: string;
    email?: string;
  };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  const entrada = corpo?.entrada;
  if (!entrada || !(entrada.receita_mensal > 0)) {
    return NextResponse.json({ erro: "informe o faturamento mensal esperado" }, { status: 400 });
  }
  if (!entrada.nome_negocio?.trim()) {
    return NextResponse.json(
      { erro: "dê um nome ao negócio — é ele que vai na capa do estudo" },
      { status: 400 }
    );
  }

  // gate do documento: igual ao comparativo
  const { data: assinRaw } = await supabase.rpc("assinatura_ativa");
  const assinatura = (Array.isArray(assinRaw) ? assinRaw[0] : assinRaw) as Assinatura | null;
  const { count } = await supabase.from("laudos").select("id", { count: "exact", head: true });
  const situacao = situacaoPlano(assinatura, count ?? 0);
  if (!situacao.ilimitado) {
    return NextResponse.json(
      {
        erro:
          "O estudo impresso faz parte do plano PRO. Na versão gratuita ele continua disponível na tela, para você usar na conversa.",
        bloqueado_por_plano: true,
      },
      { status: 402 }
    );
  }

  const resultado = estudarAbertura(entrada, { ...PREMISSAS_PADRAO, ...(corpo.premissas ?? {}) });

  // a identidade do escritório é congelada aqui: a via pública lê só o snapshot
  const { data: perfil } = await supabase
    .from("profiles")
    .select(`tenant_id, tenants(${COLUNAS_ESCRITORIO})`)
    .eq("id", user.id)
    .maybeSingle();
  const tenant = (perfil?.tenants as Escritorio | null) ?? null;
  const escritorio = tenant
    ? { ...tenant, responsavel: await responsavelDoTenant(supabase, (perfil?.tenant_id as string) ?? null) }
    : null;

  const { data, error } = await supabase
    .rpc("emitir_abertura", {
      p_nome: entrada.nome_negocio.trim(),
      p_responsavel: corpo.responsavel ?? null,
      p_email: corpo.email ?? null,
      p_entrada: entrada,
      p_premissas: resultado.premissas,
      p_resultado: resultado,
      p_escritorio: escritorio,
    })
    .single();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  const doc = data as { id: string; numero: number };
  return NextResponse.json({ ok: true, abertura_id: doc.id, numero: doc.numero });
}
