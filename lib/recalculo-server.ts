import type { SupabaseClient } from "@supabase/supabase-js";
import { recalcular, camposRecalculados } from "./recalculo";
import type { AnaliseGravada } from "./laudo";

/**
 * REFAZER A ANÁLISE NA EMISSÃO — decidido em 05/08/2026.
 *
 * O caso que motivou: uma análise gravada como S4 ("optar condicionado a
 * repasse") cujo custo líquido é NEGATIVO. A árvore de hoje manda esse caso
 * para S5 ("optar por vantagem direta"); a gravada é de antes de o S5 existir.
 * O termo saiu com o título de um e o fundamento do outro.
 *
 * A alternativa era bloquear a emissão e mandar recalcular à mão. Foi
 * descartada: o documento é o produto, e travar o produto por dívida do motor
 * empurra o problema para o pior momento — a reunião com o cliente marcada.
 *
 * O RISCO DESTA ESCOLHA, dito sem maquiagem: a recomendação pode mudar entre o
 * clique e o papel, e quem assina o laudo é o contador. Por isso o recálculo
 * NUNCA é silencioso — a rota devolve `recalculada: {de, para, aviso}` e a tela
 * é obrigada a mostrar. Recálculo automático sem aviso seria trocar um
 * documento incoerente por um documento que mudou sozinho, o que é pior: o
 * primeiro pelo menos se denuncia na leitura.
 *
 * SÓ MEXE QUANDO A SAÍDA MUDA. Diferença de casas decimais não reescreve
 * análise: o que justifica regravar é a decisão ter virado outra.
 *
 * Falhar aqui NÃO derruba a emissão. Um laudo com a análise antiga é pior que
 * um laudo com a nova, e é muito melhor que nenhum laudo.
 */
export interface AvisoRecalculo {
  de: string | null;
  para: string | null;
  aviso: string;
}

export async function garantirAnaliseCoerente(
  supabase: SupabaseClient,
  analiseId: string
): Promise<AvisoRecalculo | null> {
  try {
    const { data } = await supabase
      .from("analises")
      .select("id, rq, ch, cl, re, fc, saida, prioridade, respostas, calculado_em, parametros")
      .eq("id", analiseId)
      .maybeSingle();
    if (!data) return null;

    const rc = recalcular(data as unknown as AnaliseGravada);
    if (!rc.mudou) return null;

    const campos = camposRecalculados(rc, (data.parametros ?? {}) as Record<string, unknown>);
    if (!campos) return null;
    campos.parametros.recalculada_em = new Date().toISOString();

    const { error } = await supabase.from("analises").update(campos).eq("id", analiseId);
    /* se a gravação falhou, NÃO avisa que recalculou: o documento vai sair com
       os números antigos, e um aviso dizendo o contrário seria pior que o
       silêncio */
    if (error) {
      console.error("[recalculo] não consegui regravar a análise:", error.message);
      return null;
    }

    return { de: rc.de, para: rc.para, aviso: rc.aviso ?? "" };
  } catch (e) {
    console.error("[recalculo] falhou:", e instanceof Error ? e.message : e);
    return null;
  }
}
