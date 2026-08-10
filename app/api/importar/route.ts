import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { triar, resumir, anexoPorCnae, type EmpresaBruta } from "@/lib/triagem";
import { enriquecer, fundir, type Divergencia } from "@/lib/receita";
import type { LinhaCarteira } from "@/lib/csv";

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
 * Recebe as linhas já parseadas no navegador, enriquece contra a Receita,
 * roda a triagem e grava tudo em lote. O parse fica no cliente (papaparse no
 * browser aguenta arquivo grande sem estourar o payload); aqui roda o que
 * precisa de segredo: o token da Receita e o service-role implícito da sessão.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
  }

  const { data: perfil } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();
  const tenantId = perfil?.tenant_id;
  if (!tenantId) {
    return NextResponse.json({ erro: "workspace não encontrado" }, { status: 400 });
  }

  let corpo: { linhas: LinhaCarteira[]; arquivo?: string; stats?: Record<string, number> };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  const linhas = corpo.linhas ?? [];
  if (linhas.length === 0) {
    return NextResponse.json({ erro: "nenhuma linha válida" }, { status: 400 });
  }
  if (linhas.length > 5000) {
    return NextResponse.json({ erro: "limite de 5000 empresas por importação" }, { status: 400 });
  }

  const { dados, ativo, configurado, falhas, detalhe } = await enriquecer(linhas.map((l) => l.cnpj));

  /**
   * ONDE A RECEITA DISCORDA DO ARQUIVO — 10/08/2026.
   *
   * `fundir` deixou de sobrescrever e passou a completar lacuna; o que ela
   * encontra de divergente cai aqui e volta na resposta. A tela precisa poder
   * dizer "em N empresas a Receita discorda do seu arquivo, nestes campos" —
   * antes a troca acontecia calada e a faixa da empresa mudava sem explicação.
   */
  const divergencias: Divergencia[] = [];

  const registros = linhas.map((l) => {
    const enriquecido = fundir(l, dados[l.cnpj], divergencias);
    const bruta: EmpresaBruta = {
      cnpj: enriquecido.cnpj,
      razao_social: enriquecido.razao_social,
      cnae_principal: enriquecido.cnae_principal ?? null,
      cnaes_secundarios: enriquecido.cnaes_secundarios ?? null,
      porte: enriquecido.porte ?? null,
      situacao: enriquecido.situacao ?? null,
      regime: enriquecido.regime ?? null,
      faturamento_faixa: enriquecido.faturamento_faixa ?? null,
    };
    const t = triar(bruta);
    const veioDaReceita = ativo && !!dados[l.cnpj];
    return {
      tenant_id: tenantId,
      cnpj: enriquecido.cnpj,
      razao_social: enriquecido.razao_social,
      cnae_principal: enriquecido.cnae_principal ?? null,
      cnaes_secundarios: enriquecido.cnaes_secundarios ?? null,
      anexo: enriquecido.anexo ?? anexoPorCnae(enriquecido.cnae_principal) ?? null,
      porte: enriquecido.porte ?? null,
      situacao: enriquecido.situacao ?? null,
      regime: enriquecido.regime ?? null,
      faturamento_faixa: enriquecido.faturamento_faixa ?? null,
      /**
       * O QUE NÃO VEIO NO ARQUIVO NÃO APAGA O QUE JÁ EXISTE — 08/08/2026.
       *
       * Isto é um UPSERT por (tenant_id, cnpj). Escrever `?? null` nestes quatro
       * campos fazia a reimportação ZERAR a RBT12 e o contato que o contador
       * tinha corrigido à mão, silenciosamente, no meio de uma operação que ele
       * fez para acrescentar empresas novas. E era o mesmo defeito visto do
       * outro lado: a tela dizia "não veio RBT12" e a empresa aparecia com
       * RBT12 — ou sem, dependendo de qual importação foi a última.
       *
       * `undefined` some do objeto e a coluna fica como está. Só o valor que
       * VEIO no arquivo sobrescreve.
       */
      rbt12: l.rbt12 ?? undefined,
      contato_nome: l.contato_nome ?? undefined,
      contato_email: l.contato_email ?? undefined,
      contato_telefone: l.contato_telefone ?? undefined,
      faixa: t.faixa,
      motivo_triagem: t.motivo,
      prioridade_maxima: t.prioridade_maxima,
      fonte_dados: veioDaReceita ? "receita" : "csv",
    };
  });

  const resumo = resumir(
    registros.map((r) => ({
      faixa: r.faixa,
      motivo: r.motivo_triagem,
      prioridade_maxima: r.prioridade_maxima,
    }))
  );
  const enriquecidas = registros.filter((r) => r.fonte_dados === "receita").length;

  const { data: imp, error: impErr } = await supabase
    .from("importacoes")
    .insert({
      tenant_id: tenantId,
      arquivo: corpo.arquivo ?? null,
      total_lidas: corpo.stats?.total_lidas ?? linhas.length,
      gravadas: registros.length,
      descartadas: corpo.stats?.descartadas ?? 0,
      duplicadas: corpo.stats?.duplicadas ?? 0,
      enriquecidas,
      receita_ativa: ativo,
      resumo_faixas: resumo,
    })
    .select("id")
    .single();

  if (impErr) {
    return NextResponse.json({ erro: impErr.message }, { status: 500 });
  }

  const comLote = registros.map((r) => ({ ...r, importacao_id: imp.id }));

  const { error: upErr } = await supabase
    .from("empresas")
    .upsert(comLote, { onConflict: "tenant_id,cnpj" });

  if (upErr) {
    return NextResponse.json({ erro: upErr.message }, { status: 500 });
  }

  // ids das empresas que entram na fila de análise — a tela usa para disparar
  // o lote logo em seguida e nunca mostrar uma carteira sem recomendação
  const { data: paraAnalisar } = await supabase
    .from("empresas")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("importacao_id", imp.id)
    .in("faixa", ["A", "B"])
    .limit(1000);

  return NextResponse.json({
    ok: true,
    gravadas: registros.length,
    enriquecidas,
    /**
     * QUANTAS LINHAS TROUXERAM RBT12 DE VERDADE.
     *
     * A tela dizia "não encontrei RBT12" olhando o CABEÇALHO do arquivo, não os
     * valores. Arquivo com a coluna certa e as células vazias passava como se
     * tivesse trazido tudo; arquivo com a coluna de nome estranho passava como
     * se não tivesse trazido nada, mesmo quando a empresa já tinha o número
     * gravado de antes. Contar o dado é a única versão que não mente.
     */
    com_rbt12: registros.filter((r) => r.rbt12 != null && Number(r.rbt12) > 0).length,
    receita_ativa: ativo,
    receita_configurada: configurado,
    receita_falhas: falhas,
    receita_detalhe: detalhe ?? null,
    /**
     * ONDE A RECEITA DISCORDA DO SEU ARQUIVO — 10/08/2026.
     *
     * Até hoje a Receita simplesmente vencia, calada. Agora o arquivo vence e
     * a discordância é dita: quantas empresas, em quais campos, com os dois
     * valores lado a lado. São os campos que MUDAM A FAIXA — divergir em
     * telefone não muda fila de ninguém.
     *
     * Devolvo no máximo 50 para a resposta não virar um despejo; o total vai
     * separado, porque "8 de 143" e "8 de 8" pedem reações diferentes.
     */
    divergencias_total: divergencias.length,
    divergencias_empresas: new Set(divergencias.map((d) => d.cnpj)).size,
    divergencias: divergencias.slice(0, 50),
    // sem os dados essenciais no arquivo E sem a Receita respondendo, a
    // triagem não separa nada — a tela precisa dizer isso em vez de exibir
    // uma carteira inteira em "baixo risco" como se fosse resultado
    triagem_cega:
      !ativo && registros.every((r) => !r.cnae_principal),
    /**
     * A REDE DO REGIME (07/08/2026): a leitura do campo ficou robusta, mas o
     * próximo export exótico vai existir. Quando quase toda a carteira cai em
     * "fora do Simples" POR REGIME, a chance de ser leitura errada é maior do
     * que a de um escritório inteiro de Lucro Presumido usar o produto — e a
     * tela mostra o valor bruto que causou, para o diagnóstico ser de um
     * olhar, não de um chamado.
     */
    regime_suspeito: (() => {
      const porRegime = registros.filter(
        (r) => r.faixa === "FORA" && (r.motivo_triagem ?? "").includes("fora do Simples")
      );
      /* 08/08/2026: era 0.8, e a carteira que motivou esta rede não a acendia.
         Com a coluna de anexo lida como regime, o Anexo I continuava entrando
         como optante e segurava o total abaixo do corte — a rede existia e não
         disparava. O aviso não bloqueia nada, só mostra o valor bruto que
         causou: falso positivo custa uma linha de texto, falso negativo custa
         a carteira inteira sumindo da tela. */
      if (registros.length < 5 || porRegime.length / registros.length < 0.55) return null;
      const exemplo = porRegime.find((r) => r.regime)?.regime ?? null;
      return { quantas: porRegime.length, total: registros.length, exemplo };
    })(),
    empresas_para_analisar: (paraAnalisar ?? []).map((e) => e.id),
    resumo,
  });
}
