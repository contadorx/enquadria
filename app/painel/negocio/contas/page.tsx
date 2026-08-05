import { carregarNegocio } from "@/lib/negocio";
/* `comoMetrica` vem de `lib/`, NÃO de ContaLinha: função exportada por módulo
   `"use client"` chega ao servidor como PROXY, e chamá-la derruba a página.
   Foi exatamente assim que esta tela quebrou em produção. */
import { ContaLinha } from "@/components/ContaLinha";
import { calcularMetricas, comoMetrica, divergencias, moedaBR } from "@/lib/cobranca";
import { mesBr } from "@/lib/negocio-calc";

/**
 * AS CONTAS — uma tela onde antes havia duas.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * O QUE ESTAVA ERRADO, e não era só duplicação.
 *
 * Esta tela lia `tenants` direto do browser e escrevia em `tenants`. Cobranças
 * lia a RPC e escrevia em `assinaturas`. Resultado: o mesmo escritório tinha
 * STATUS em dois lugares e VALOR em dois. O MRR saía do lado digitado à mão; a
 * cobrança de verdade, do outro. Os dois podiam discordar indefinidamente, e a
 * única forma de descobrir era abrir as duas telas e comparar de cabeça.
 *
 * Agora a leitura é uma só — a RPC da 0047, que traz o contrato, o pagamento
 * real (fatura paga, que ninguém digita) e os campos digitados, lado a lado.
 * A tela não escolhe em silêncio: quando eles discordam, ela DIZ.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * O CABEÇALHO DIZ O QUE FICOU DE FORA. "MRR R$ 494" é um número; "MRR R$ 494,
 * 1 conta de teste fora da conta" é um número auditável. A diferença entre os
 * dois é a chance de alguém perceber que a marcação está errada.
 */
export const dynamic = "force-dynamic";

export default async function ContasAdmin() {
  const n = await carregarNegocio();

  if (n.erro) {
    return (
      <div className="rounded-lg border border-amarelo/40 bg-amarelowash p-5">
        <p className="text-[15px] font-bold">Não consegui ler as contas</p>
        <p className="mt-2 text-[13px]">{n.erro}</p>
        <p className="mt-2 text-[12.5px] text-muted">
          Se a mensagem falar em coluna que não existe, falta rodar a migration
          <b> 0047_uma_fonte_para_o_dinheiro.sql</b>.
        </p>
      </div>
    );
  }

  const metricas = n.escritorios.map(comoMetrica);
  /* mês no calendário brasileiro: `toISOString` é UTC, e depois das 21h do dia
     31 o churn do mês zerava sozinho */
  const m = calcularMetricas(metricas, mesBr(new Date()));

  const comDivergencia = n.escritorios.filter((e) => divergencias(comoMetrica(e)).length > 0);
  const planos = n.planos
    .filter((p) => p.ativo)
    .map((p) => ({ ...p }));
  const temAsaas = !!process.env.ASAAS_API_KEY && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  return (
    <div>
      <h1 className="text-[19px] font-bold tracking-tight">Contas</h1>
      <p className="mt-0.5 max-w-[76ch] text-[13px] leading-relaxed text-muted">
        Contrato, pagamento e marcações do mesmo escritório, numa tela só. Uma conta entra na
        receita pelo <b>pagamento confirmado</b> — a fatura paga vale mais que o campo digitado, e
        o valor mostra de onde veio. O extrato de faturas e a régua ficam em <b>Faturas &amp; régua</b>.
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
    </div>
  );
}
