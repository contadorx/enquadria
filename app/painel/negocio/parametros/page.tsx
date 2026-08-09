import { createClient } from "@/lib/supabase-server";
import { ParametrosExercicio } from "@/components/ParametrosExercicio";
import { PARAMETROS_2027, MARCOS_ALIQUOTA } from "@/lib/motor";

/**
 * NEGÓCIO → ALÍQUOTA: publicar a referência sem abrir o banco.
 *
 * Mesmo diagnóstico do radar, com consequência maior. `parametros_exercicio` é
 * lida em quatro pontos do produto — a análise unitária, o lote, a rodada nova
 * e o aviso do cockpit — e nunca era escrita: sem migration, sem rota, sem
 * tela. O número só mudava por SQL em produção.
 *
 * E não é um número qualquer. A alíquota de referência de IBS/CBS é fixada por
 * Resolução do Senado até 31/10/2026, um mês DEPOIS de a janela fechar. O
 * produto vende por e-mail que, quando ela sair, cada laudo de setembro vira
 * revisão cobrável. Sem esta tela, o trabalho estava vendido e o instrumento
 * não existia.
 */
export const dynamic = "force-dynamic";

export default async function ParametrosNegocio() {
  const supabase = createClient();

  const { data } = await supabase
    .from("parametros_exercicio")
    .select("exercicio, aliquota_cbs, aliquota_ibs, fronteira_min, fronteira_max, fixada, fonte, atualizado_em")
    .order("exercicio", { ascending: true });

  const linhas = (data ?? []) as {
    exercicio: number;
    aliquota_cbs: number;
    aliquota_ibs: number;
    fronteira_min: number;
    fronteira_max: number;
    fixada: boolean | null;
    fonte: string | null;
    atualizado_em: string | null;
  }[];

  /**
   * QUANTAS ANÁLISES FORAM CALCULADAS COM O NÚMERO DE HOJE.
   *
   * Não é estatística: é a medida do trabalho de revisão que nasce no instante
   * em que a alíquota mudar. É por este número que se decide se o aviso aos
   * escritórios sai hoje ou na segunda — e quantos laudos vão precisar de uma
   * segunda via.
   */
  const { count: analises } = await supabase
    .from("analises")
    .select("id", { count: "exact", head: true });
  const { count: laudos } = await supabase
    .from("laudos")
    .select("id", { count: "exact", head: true });

  return (
    <div>
      <h1 className="text-[19px] font-bold tracking-tight">Alíquota de referência</h1>
      <p className="mt-0.5 max-w-[76ch] text-[13px] leading-relaxed text-muted">
        Um valor por exercício, <b>igual para todos os escritórios</b>. A alíquota é norma, não
        preferência: dois laudos verificáveis do mesmo período não podem discordar sem explicação
        no papel. Gravar aqui <b>não recalcula nada</b> — nenhuma análise é tocada e nenhum laudo
        muda. A carteira só se move quando o contador pedir uma rodada nova, que cria análises
        novas e preserva as anteriores.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded border border-line bg-surface p-3.5">
          <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
            prazo da Resolução
          </div>
          <div className="mt-1 font-mono text-[18px] font-semibold text-ink">
            {MARCOS_ALIQUOTA.fixacao_ate}
          </div>
          <p className="mt-1 text-[11.5px] leading-snug text-slate2">
            um mês depois de a janela fechar
          </p>
        </div>
        <div className="rounded border border-line bg-surface p-3.5">
          <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
            análises com o número atual
          </div>
          <div className="mt-1 font-mono text-[18px] font-semibold text-ink">{analises ?? 0}</div>
          <p className="mt-1 text-[11.5px] leading-snug text-slate2">
            viram trabalho de revisão quando o valor mudar
          </p>
        </div>
        <div className="rounded border border-line bg-surface p-3.5">
          <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
            laudos já emitidos
          </div>
          <div className="mt-1 font-mono text-[18px] font-semibold text-ink">{laudos ?? 0}</div>
          <p className="mt-1 text-[11.5px] leading-snug text-slate2">
            continuam congelados — mudar aqui não reescreve documento
          </p>
        </div>
      </div>

      <ParametrosExercicio
        linhas={linhas}
        padrao={{
          aliquota: PARAMETROS_2027.aliquota,
          fronteiraMin: PARAMETROS_2027.fronteiraMin ?? 0.8,
          fronteiraMax: PARAMETROS_2027.fronteiraMax ?? 1.2,
        }}
      />
    </div>
  );
}
