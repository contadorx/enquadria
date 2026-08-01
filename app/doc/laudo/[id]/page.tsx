import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { LaudoFolha } from "@/components/LaudoFolha";
import type { AnaliseGravada } from "@/lib/laudo";

/**
 * O LAUDO — o entregável que sustenta o honorário.
 *
 * Antes tinha premissas, resultado e recomendação: um relatório de sistema.
 * Um documento assim não sustenta honorário de quatro dígitos e não sobrevive a
 * uma pergunta do Fisco. Agora tem dez seções, e a que muda tudo é a memória de
 * cálculo: fórmula, substituição numérica e resultado, linha a linha, para que
 * um terceiro refaça a conta no papel.
 *
 * FAIXAS C, D, MEI E FORA recebem a VERSÃO CURTA. O laudo existe para documentar
 * o descarte, não para simular uma decisão que não existe — quatro páginas de
 * memória de cálculo para dizer "não se aplica" seria enchimento, e enchimento
 * em documento assinado é o contrário de prova.
 */

export default async function LaudoDoc({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: laudo } = await supabase
    .from("laudos")
    .select("numero, emitido_em, analise_id, snapshot")
    .eq("id", params.id)
    .maybeSingle();
  if (!laudo) notFound();

  /**
   * O laudo é PROVA: lê o que foi congelado na emissão, não o estado atual da
   * análise. Sem isso, revisar a análise reescreveria retroativamente um
   * documento já entregue e com termo assinado.
   */
  const snap = laudo.snapshot as {
    analise?: Record<string, unknown>;
    empresa?: { razao_social?: string; cnpj?: string; anexo?: number; regime?: string; faixa?: string };
    escritorio?: { nome?: string; crc?: string; logo_url?: string };
    janela?: string | null;
  } | null;

  let analise: Record<string, unknown> | null = snap?.analise ?? null;
  let empresa: {
    razao_social?: string;
    cnpj?: string;
    anexo?: number;
    regime?: string;
    faixa?: string;
  } | null = snap?.empresa ?? null;
  let t: { nome?: string; crc?: string; logo_url?: string } | null = snap?.escritorio ?? null;

  if (!analise) {
    const { data: aoVivo } = await supabase
      .from("analises")
      .select("id, rq, ch, cl, re, fc, saida, prioridade, respostas, calculado_em, empresa_id, parametros")
      .eq("id", laudo.analise_id)
      .maybeSingle();
    if (!aoVivo) notFound();
    analise = aoVivo as unknown as Record<string, unknown>;
  }

  // a faixa da triagem decide o formato e nem sempre está no snapshot antigo
  if (!empresa?.faixa) {
    const empresaId = (analise.empresa_id as string) ?? null;
    if (empresaId) {
      const { data: emp } = await supabase
        .from("empresas")
        .select("razao_social, cnpj, anexo, regime, faixa, motivo_triagem")
        .eq("id", empresaId)
        .maybeSingle();
      if (emp) empresa = { ...(empresa ?? {}), ...emp };
    }
  }

  if (!t) {
    const { data: perfil } = await supabase
      .from("profiles")
      .select("tenants(nome, crc, logo_url)")
      .maybeSingle();
    t = perfil?.tenants as { nome?: string; crc?: string; logo_url?: string } | null;
  }

  return (
    <LaudoFolha
      dados={{
        numero: laudo.numero,
        emitido_em: laudo.emitido_em,
        analise: analise as unknown as AnaliseGravada,
        empresa,
        escritorio: t,
      }}
    />
  );
}
