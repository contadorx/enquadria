import { carregarNegocio } from "@/lib/negocio";
import { ContaLinha } from "@/components/ContaLinha";
import { calcularMetricas, comoMetrica, divergencias, moedaBR } from "@/lib/cobranca";
import { mesBr } from "@/lib/negocio-calc";

/**
 * AS CONTAS — agora dentro da Visão, no rodapé.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * POR QUE DEIXOU DE SER UMA TELA.
 *
 * Visão respondia "como vai o negócio?" e Contas respondia "quem são as
 * contas?", e as duas liam a MESMA carregarNegocio(). Duas rotas para uma
 * leitura só é o mesmo defeito que Contas × Cobranças tinha antes da fusão:
 * a pessoa abre uma, não acha o que quer, abre a outra, e passa a checar as
 * duas sempre — porque nenhuma das duas fica na memória como "a completa".
 *
 * A ordem importa e é deliberada: em cima o AGREGADO (MRR, funil, fila de
 * ação), embaixo a LISTA. Quem entra para decidir olha o topo; quem entra para
 * mexer numa conta específica rola até o fim, e a lista está lá — não em outro
 * clique.
 */
export async function BlocoContas({ n }: { n: Awaited<ReturnType<typeof carregarNegocio>> }) {
  const metricas = n.escritorios.map(comoMetrica);
  /* mês no calendário brasileiro: `toISOString` é UTC, e depois das 21h do dia
     31 o churn do mês zerava sozinho */
  const m = calcularMetricas(metricas, mesBr(new Date()));

  const comDivergencia = n.escritorios.filter((e) => divergencias(comoMetrica(e)).length > 0);
  const planos = n.planos.filter((p) => p.ativo).map((p) => ({ ...p }));
  const temAsaas = !!process.env.ASAAS_API_KEY && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  return (
    <section id="contas" className="scroll-mt-6">
      <h2 className="text-[16px] font-bold tracking-tight">Contas</h2>
      <p className="mt-0.5 max-w-[76ch] text-[13px] leading-relaxed text-muted">
        Contrato, pagamento e marcações do mesmo escritório. Uma conta entra na receita pelo{" "}
        <b>pagamento confirmado</b> — a fatura paga vale mais que o campo digitado, e o valor mostra
        de onde veio. O extrato de faturas e a régua ficam em <b>Faturas &amp; régua</b>.
      </p>
      <div className="mt-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["MRR", moedaBR(m.mrr), `${m.pagantes} pagante${m.pagantes === 1 ? "" : "s"}`],
          ["Ticket médio", moedaBR(m.ticket), `ARR ${moedaBR(m.arr)}`],
          ["MRR potencial", moedaBR(m.mrrPotencial), "trials e cortesias"],
          [
            "Churn do mês",
            m.churnPct === null ? "—" : `${m.churnPct.toFixed(1)}%`,
            m.ltv === null ? "LTV indefinido sem churn" : `LTV ${moedaBR(m.ltv)}`,
          ],
        ].map(([t, v, sub]) => (
          <div key={t} className="rounded border border-line bg-surface p-4">
            <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">{t}</div>
            <div className="mt-1 text-[20px] font-bold">{v}</div>
            <div className="text-[11.5px] text-muted">{sub}</div>
          </div>
        ))}
      </div>

      {m.ignoradasTeste > 0 && (
        <p className="mt-2 text-[12px] text-muted">
          {m.ignoradasTeste} conta{m.ignoradasTeste === 1 ? "" : "s"} de teste fora de todos os
          números acima.
        </p>
      )}

      {/**
       * O PAINEL DE DIVERGÊNCIA — a razão pela qual a fusão veio antes do
       * conforto. Enquanto eram duas telas, este número era zero por definição:
       * ninguém comparava. Ele existindo, a decisão de limpar os campos
       * digitados passa a ser tomada com dado.
       */}
      {comDivergencia.length > 0 && (
        <div className="mt-4 rounded border border-amarelo/40 bg-amarelowash p-3.5">
          <p className="text-[13px] font-bold text-slate2">
            {comDivergencia.length} conta{comDivergencia.length > 1 ? "s" : ""} com o campo digitado
            diferente do que existe em fatura ou contrato
          </p>
          <p className="mt-1 max-w-[80ch] text-[12px] leading-relaxed text-slate2">
            Não é necessariamente erro: pagamento por fora do gateway e negociação mais nova que o
            contrato produzem isso. Mas o MRR usa a fatura, e o campo digitado continua na tela —
            abra a conta para ver os dois números e decidir qual sai.
          </p>
          <p className="mt-1.5 text-[12px] font-medium text-slate2">
            {comDivergencia.slice(0, 6).map((e) => e.nome || "(sem nome)").join(" · ")}
            {comDivergencia.length > 6 && ` · +${comDivergencia.length - 6}`}
          </p>
        </div>
      )}

      <div className="mt-5 overflow-x-auto rounded border border-line bg-surface">
        <table className="w-full border-collapse text-[12.5px]">
          <thead className="border-b border-line text-left text-[10.5px] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Escritório</th>
              <th className="px-3 py-2.5 font-semibold">Conta</th>
              <th className="px-3 py-2.5 font-semibold">Plano</th>
              <th className="px-3 py-2.5 font-semibold">No MRR</th>
              <th className="px-3 py-2.5 font-semibold">Último pagamento</th>
              <th className="px-3 py-2.5 font-semibold">Acesso até</th>
              <th className="px-3 py-2.5 font-semibold">Uso</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {n.escritorios.map((e) => (
              <ContaLinha key={e.id} e={e} planos={planos} temAsaas={temAsaas} />
            ))}
            {!n.escritorios.length && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-muted">Nenhuma conta.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
