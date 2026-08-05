"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { calcularMetricas, moedaBR, valorReal, ehPagante, type ContaMetrica } from "@/lib/cobranca";
import { mesBr } from "@/lib/negocio-calc";
import { ExcluirConta } from "@/components/ExcluirConta";

/**
 * AS CONTAS — a tela onde uma conta vira teste, cortesia ou cancelada.
 *
 * Existe por um motivo datado: este banco já tem contas criadas em teste, e
 * marcar depois nunca acontece. Quando a primeira métrica de receita for olhada
 * a sério, ninguém vai lembrar quais eram quais.
 *
 * O CABEÇALHO DIZ O QUE FICOU DE FORA. "MRR R$ 494" é um número; "MRR R$ 494,
 * 1 conta de teste fora da conta" é um número auditável. A diferença entre os
 * dois é a chance de alguém perceber que a marcação está errada.
 */

interface Conta extends ContaMetrica {
  id: string;
  nome: string;
  crc: string | null;
  obs_admin: string | null;
  proximo_vencimento: string | null;
  cortesia_ate: string | null;
  cortesia_motivo: string | null;
}

const STATUS = ["ativa", "trial", "cortesia", "inadimplente", "cancelada", "suspensa"];

export default function ContasAdmin() {
  const router = useRouter();
  const [contas, setContas] = useState<Conta[]>([]);
  const [sel, setSel] = useState<Conta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [ok, setOk] = useState(false);

  async function carregar() {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("tenants")
      .select("id, nome, crc, status, is_teste, acesso_cortesia, cortesia_ate, cortesia_motivo, valor_mensal, ciclo_cobranca, ultimo_pagamento, ultimo_pagamento_valor, proximo_vencimento, cancelado_em, obs_admin")
      .order("nome");
    if (error) {
      setErro(
        /column|does not exist/i.test(error.message)
          ? "As migrations 0030 e 0031 ainda não foram rodadas neste banco."
          : error.message
      );
      return;
    }
    setContas((data ?? []) as unknown as Conta[]);
  }

  useEffect(() => {
    void carregar();
  }, []);

  async function gravar(id: string, campos: Record<string, unknown>) {
    setSalvando(true);
    setErro(null);
    const supabase = createClient();
    /**
     * `.select()` NO UPDATE — e isto não é enfeite.
     *
     * Quando a RLS recusa uma escrita, o Postgres não devolve erro: devolve
     * ZERO LINHAS afetadas. Sem o `select`, `error` vem nulo, a tela mostra
     * "salvo" e nada foi salvo. Foi exatamente o que aconteceu enquanto
     * `tenants` não tinha política de gestor (ver 0043): marcar outra conta
     * como teste não gravava, e a tela dizia que sim.
     *
     * Pedindo a linha de volta, "nada voltou" vira aviso.
     */
    const { data: alterado, error } = await supabase
      .from("tenants")
      .update(campos)
      .eq("id", id)
      .select("id");
    setSalvando(false);
    if (error) {
      setErro(error.message);
      return;
    }
    if (!alterado?.length) {
      setErro(
        "O banco não alterou nenhuma linha — provavelmente falta permissão para editar esta conta. Rode a migration 0043."
      );
      return;
    }
    setOk(true);
    setTimeout(() => setOk(false), 2000);
    await carregar();
    setSel((s) => (s && s.id === id ? ({ ...s, ...campos } as Conta) : s));
    router.refresh();
  }

  /* mês no calendário brasileiro: `toISOString` é UTC, e depois das 21h do
     dia 31 o churn do mês zerava sozinho — apagando cancelamentos reais e
     jogando um cancelamento das 21h30 para o mês seguinte */
  const mes = mesBr(new Date());
  const m = calcularMetricas(contas, mes);

  return (
    <div>
      <h1 className="text-[19px] font-bold tracking-tight">Contas</h1>
      <p className="mt-0.5 max-w-[70ch] text-[13px] text-muted">
        Marcar teste e cortesia aqui é o que mantém o MRR honesto. Uma conta entra na receita
        pelo <b>pagamento confirmado</b>, nunca pelo status do gateway — que fica ativo antes
        de o primeiro pagamento cair.
      </p>

      {erro && (
        <p className="mt-4 rounded-sm bg-vermelhowash px-3 py-2 text-[12.5px] text-vermelho">{erro}</p>
      )}
      {ok && (
        <p className="mt-4 rounded-sm bg-verdewash px-3 py-2 text-[12.5px] text-verde">Salvo ✓</p>
      )}

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

      <div className="mt-5 overflow-hidden rounded border border-line bg-surface">
        <table className="w-full border-collapse text-[12.5px]">
          <tbody>
            {contas.map((c) => (
              <tr key={c.id} className="border-b border-linesoft last:border-b-0">
                <td className="px-3 py-2">
                  <button
                    onClick={() => setSel(c)}
                    className="text-left font-semibold hover:text-accentdeep"
                  >
                    {c.nome || "(sem nome)"}
                  </button>
                  <div className="font-mono text-[10.5px] text-muted">{c.crc || "sem CRC"}</div>
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-sm px-1.5 py-0.5 font-mono text-[9.5px] uppercase ${
                      c.is_teste
                        ? "bg-surface2 text-muted"
                        : c.status === "ativa"
                          ? "bg-verdewash text-verde"
                          : c.status === "cancelada"
                            ? "bg-vermelhowash text-vermelho"
                            : "bg-amarelowash text-slate2"
                    }`}
                  >
                    {c.is_teste ? "teste" : c.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  {ehPagante(c) ? moedaBR(valorReal(c)) : "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => void gravar(c.id, { is_teste: !c.is_teste })}
                    disabled={salvando}
                    className="rounded-sm border border-line px-2.5 py-1 text-[11.5px] font-semibold text-slate2 disabled:opacity-50"
                  >
                    {c.is_teste ? "não é teste" : "marcar teste"}
                  </button>
                </td>
              </tr>
            ))}
            {contas.length === 0 && (
              <tr>
                <td className="px-3 py-4 text-muted">Nenhuma conta.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {sel && (
        <div className="mt-5 rounded border border-line bg-surface p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[15px] font-bold">{sel.nome}</div>
              <div className="font-mono text-[10.5px] text-muted">{sel.id}</div>
            </div>
            <button onClick={() => setSel(null)} className="text-[12px] text-muted">
              fechar
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[12.5px] font-semibold">Status</span>
              <select
                value={sel.status}
                onChange={(e) => void gravar(sel.id, { status: e.target.value })}
                className="w-full rounded-sm border border-line px-3 py-2 text-sm"
              >
                {STATUS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[12.5px] font-semibold">
                Valor mensal <span className="font-normal text-muted">(em reais)</span>
              </span>
              <input
                type="number"
                defaultValue={sel.valor_mensal ?? 0}
                /**
                 * `Number(e.target.value)` VIRAVA ZERO no formato brasileiro.
                 *
                 * Num `input type="number"`, digitar "297,00" deixa o `value`
                 * VAZIO — o navegador não aceita a vírgula. `Number("")` é 0, e
                 * o campo gravava `valor_mensal = 0` com "Salvo ✓" na tela: o
                 * escritório saía do MRR sem ninguém perceber.
                 *
                 * Campo vazio agora não grava nada. Vazio é "não digitei",
                 * nunca "vale zero".
                 */
                onBlur={(e) => {
                  const bruto = e.target.value.trim();
                  if (!bruto) return;
                  const n = Number(bruto);
                  if (!Number.isFinite(n) || n < 0) {
                    setErro("Valor mensal inválido. Use ponto para centavos (297.00), sem R$.");
                    return;
                  }
                  void gravar(sel.id, { valor_mensal: Math.round(n) });
                }}
                className="w-full rounded-sm border border-line px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12.5px] font-semibold">Último pagamento</span>
              <input
                type="date"
                defaultValue={sel.ultimo_pagamento?.slice(0, 10) ?? ""}
                onBlur={(e) => void gravar(sel.id, { ultimo_pagamento: e.target.value || null })}
                className="w-full rounded-sm border border-line px-3 py-2 text-sm"
              />
              <span className="mt-1 block text-[11px] text-muted">
                É este campo que faz a conta entrar no MRR — não o status.
              </span>
            </label>
            <label className="block">
              <span className="mb-1 block text-[12.5px] font-semibold">Próximo vencimento</span>
              <input
                type="date"
                defaultValue={sel.proximo_vencimento?.slice(0, 10) ?? ""}
                onBlur={(e) => void gravar(sel.id, { proximo_vencimento: e.target.value || null })}
                className="w-full rounded-sm border border-line px-3 py-2 text-sm"
              />
              <span className="mt-1 block text-[11px] text-muted">
                A régua de cobrança se ancora nele.
              </span>
            </label>
          </div>

          <div className="mt-4 rounded-sm border border-line bg-surface2 p-3">
            <label className="flex items-center gap-2 text-[13px] font-semibold">
              <input
                type="checkbox"
                checked={sel.acesso_cortesia}
                onChange={(e) =>
                  void gravar(sel.id, {
                    acesso_cortesia: e.target.checked,
                    status: e.target.checked ? "cortesia" : "ativa",
                  })
                }
              />
              Acesso cortesia
            </label>
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
              Acesso pleno sem entrar na receita. É o caso do aluno do curso que ganha 12 meses:
              plano de R$ 0 puxaria o ticket médio para baixo, e trial eterno esconderia a data
              em que o acesso acaba. Conta em cortesia também fica fora da régua de cobrança.
            </p>
            {sel.acesso_cortesia && (
              <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                <input
                  type="date"
                  defaultValue={sel.cortesia_ate ?? ""}
                  onBlur={(e) => void gravar(sel.id, { cortesia_ate: e.target.value || null })}
                  className="rounded-sm border border-line px-3 py-2 text-sm"
                />
                <input
                  placeholder="motivo (aluno, parceiro, comercial…)"
                  defaultValue={sel.cortesia_motivo ?? ""}
                  onBlur={(e) => void gravar(sel.id, { cortesia_motivo: e.target.value || null })}
                  className="rounded-sm border border-line px-3 py-2 text-sm"
                />
              </div>
            )}
          </div>

          <label className="mt-4 block">
            <span className="mb-1 block text-[12.5px] font-semibold">Observação interna</span>
            <textarea
              rows={2}
              defaultValue={sel.obs_admin ?? ""}
              onBlur={(e) => void gravar(sel.id, { obs_admin: e.target.value || null })}
              placeholder="Por que esta conta é exceção. É a memória que some quando ninguém anota."
              className="w-full rounded-sm border border-line px-3 py-2 text-[13px]"
            />
          </label>

          <ExcluirConta
            /* `key` pelo id: sem ele, trocar de conta com o painel aberto
               reaproveitaria o estado do componente — a prévia da conta
               anterior ficaria na tela ao lado do nome da nova. É exatamente o
               engano que a confirmação por nome existe para impedir. */
            key={sel.id}
            tenantId={sel.id}
            nome={sel.nome}
            onExcluida={() => {
              setSel(null);
              void carregar();
              router.refresh();
            }}
          />
        </div>
      )}
    </div>
  );
}
