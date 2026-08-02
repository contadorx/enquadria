import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { trilhaEmTexto } from "@/lib/esign";

/**
 * O DOSSIÊ DA EMPRESA, num único GET.
 *
 * A gaveta que abre sobre a fila e a página /painel/empresa/[id] mostram
 * exatamente o mesmo conteúdo — por isso o conteúdo é UM componente de cliente
 * alimentado por UMA rota. Duas montagens do mesmo dossiê divergiriam na
 * primeira alteração, que é o defeito que este redesenho existe para corrigir.
 *
 * A trilha de auditoria é montada AQUI porque `lib/esign` depende de `crypto`
 * do Node: importá-la num componente de cliente quebraria o build.
 */
export async function GET(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("empresa");
  if (!id) return NextResponse.json({ erro: "empresa obrigatória" }, { status: 400 });

  const { data: empresa } = await supabase
    .from("empresas")
    .select(
      "id, cnpj, razao_social, cnae_principal, porte, situacao, regime, anexo, rbt12, faixa, motivo_triagem, prioridade_maxima, fonte_dados, contato_nome, contato_email, contato_telefone"
    )
    .eq("id", id)
    .maybeSingle();
  if (!empresa) return NextResponse.json({ erro: "empresa não encontrada" }, { status: 404 });

  const { data: rodadas } = await supabase
    .from("analises")
    .select("id, rq, ch, cl, re, fc, saida, prioridade, respostas, calculado_em, parametros, status, janela_id")
    .eq("empresa_id", id)
    .order("calculado_em", { ascending: false });

  const analise = rodadas?.[0] ?? null;

  const { data: janelas } = await supabase.from("janelas").select("id, nome");

  const { data: laudo } = analise
    ? await supabase
        .from("laudos")
        .select("id, numero, emitido_em")
        .eq("analise_id", analise.id)
        .maybeSingle()
    : { data: null };

  const { data: termo } = analise
    ? await supabase
        .from("termos")
        .select(
          "id, token, decisao, assinatura_status, assinante_nome, assinante_cpf, assinante_email, assinado_em, metodo, hash_documento, evidencia, carimbo"
        )
        .eq("analise_id", analise.id)
        .maybeSingle()
    : { data: null };

  const { data: comparativos } = await supabase
    .from("comparativos")
    .select("id, numero, emitido_em")
    .eq("empresa_id", id)
    .order("emitido_em", { ascending: false });

  const assinado = termo?.assinatura_status === "assinado" || !!termo?.assinado_em;

  /**
   * A COLETA vem pelo cliente de SERVIÇO, e isso é seguro exatamente aqui:
   * `empresas` já foi lida acima com o cliente do USUÁRIO e voltou preenchida —
   * ou seja, a RLS da carteira já autorizou este contador a ver esta empresa.
   * A tabela `coletas` tem RLS ligada e nenhuma policy de propósito, para que a
   * decisão de acesso aconteça num lugar só, apoiada na RLS que já existe.
   */
  const admin = createAdminClient();
  const { data: coleta } = admin
    ? await admin
        .from("coletas")
        .select(
          "id, token, status, criado_em, respondido_em, respondente_nome, respondente_cargo, respostas, derivadas, observacao, aplicada_em"
        )
        .eq("empresa_id", id)
        .order("criado_em", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  return NextResponse.json({
    ok: true,
    empresa,
    rodadas: rodadas ?? [],
    laudo,
    termo,
    coleta: coleta ?? null,
    comparativos: comparativos ?? [],
    janelas: Object.fromEntries((janelas ?? []).map((j) => [j.id, j.nome])),
    trilha: assinado && termo ? trilhaEmTexto(termo as never) : [],
  });
}
