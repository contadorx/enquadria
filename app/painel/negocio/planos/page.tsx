import { carregarNegocio, brl } from "@/lib/negocio";
import { statusAsaas } from "@/lib/asaas";
import { PlanoCartao, NovoPlano, TestarAsaas } from "@/components/NegocioUI";

export const dynamic = "force-dynamic";

export default async function PlanosNegocio() {
  const n = await carregarNegocio();
  const status = await statusAsaas();

  if (n.erro) {
    return (
      <div className="rounded-lg border border-amarelo/40 bg-amarelowash p-5">
        <p className="text-[15px] font-bold">Não consegui ler os planos</p>
        <p className="mt-2 text-[13px]">{n.erro}</p>
      </div>
    );
  }

  // quantos assinantes ativos por plano — para não mexer no preço às cegas
  const uso: Record<string, { n: number; mrr: number }> = {};
  for (const e of n.escritorios) {
    if (e.status !== "ativa" || !e.plano_id) continue;
    if (e.vencimento && new Date(e.vencimento) < new Date()) continue;
    uso[e.plano_id] = uso[e.plano_id] || { n: 0, mrr: 0 };
    uso[e.plano_id].n++;
    const v = Number(e.valor_centavos || 0);
    uso[e.plano_id].mrr += e.plano_ciclo === "anual" ? Math.round(v / 12) : e.plano_ciclo === "mensal" ? v : 0;
  }

  const publicos = n.planos.filter((p) => p.ativo && p.publico);
  const semDiasAcesso = n.planos.filter((p) => p.ativo && p.ciclo !== "avulso" && !p.dias_acesso);

  return (
    <div className="space-y-7">
      {/* ─────────────────────────────────────────────────────────── Asaas */}
      <section className="rounded-lg border border-line bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-[70ch]">
            <h2 className="text-[15px] font-bold">Conexão com o Asaas</h2>
            <p className="mt-0.5 text-[12.5px] text-muted">
              O Asaas é quem cobra: cria o cliente, gera a cobrança e devolve o link de Pix, boleto ou cartão. O app
              não guarda dado de cartão em lugar nenhum.
            </p>
          </div>
          <TestarAsaas inicial={status as unknown as Record<string, unknown>} />
        </div>

        <div className="mt-4 grid gap-4 border-t border-linesoft pt-4 md:grid-cols-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Ambiente</p>
            <p className="mt-1 text-[13px] font-bold">
              {status.ambiente === "sandbox"
                ? <span className="text-amarelo">Sandbox (teste)</span>
                : <span className="text-verde">Produção</span>}
            </p>
            <p className="mt-1 text-[11px] leading-snug text-muted">
              Vem de <code>ASAAS_ENV</code>. <b>Atenção:</b> aqui o padrão é <i>sandbox</i> quando a variável está em
              branco — o inverso do que se espera. Em produção, declare <code>ASAAS_ENV=production</code>.
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Chave da API</p>
            <p className={`mt-1 text-[13px] font-bold ${status.tem_chave ? "text-verde" : "text-vermelho"}`}>
              {status.tem_chave ? "configurada" : "ausente"}
            </p>
            <p className="mt-1 text-[11px] leading-snug text-muted">
              <code>ASAAS_API_KEY</code> no ambiente do Vercel. Sem ela, nenhuma cobrança é gerada.
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Webhook</p>
            <p className="mt-1 break-all font-mono text-[11px]">{status.url_webhook}</p>
            <p className="mt-1 text-[11px] leading-snug text-muted">
              No Asaas: Integrações → Webhooks. Eventos <b>PAYMENT_CONFIRMED</b> e <b>PAYMENT_RECEIVED</b>.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 text-[11.5px] leading-relaxed text-muted md:grid-cols-2">
          <p>
            <b className="text-slate1">Quando o contador assina:</b> o app cria a assinatura como pendente, gera a
            cobrança no Asaas com <code>externalReference</code> apontando para ela, e devolve o link. O acesso só
            abre quando o webhook confirma o pagamento.
          </p>
          <p>
            <b className="text-slate1">Se o webhook falhar:</b> nada quebra, mas o cliente pagou e não entrou. Em
            Cobranças, o botão <b>sincronizar</b> pergunta ao Asaas o que aconteceu com aquela cobrança e alinha o
            banco. Webhook é entrega best-effort, não garantia.
          </p>
        </div>
      </section>

      {/* ────────────────────────────────────────── o vazamento de receita */}
      <section className="rounded-lg border border-vermelho/30 bg-vermelhowash p-4">
        <p className="text-[13px] font-bold text-vermelho">Dias de acesso — leia antes de mexer no preço</p>
        <p className="mt-1 max-w-[85ch] text-[12px] leading-relaxed text-slate2">
          Até a migration 0020, o webhook concedia <b>365 dias</b> de acesso a qualquer pagamento confirmado —
          inclusive ao PRO mensal de R$ 47. Um pagamento de um mês liberava um ano, e isso não aparecia em lugar
          nenhum. Agora cada plano declara <b>dias de acesso por pagamento</b>, e é esse número que o webhook usa.
          {semDiasAcesso.length > 0 && (
            <>
              {" "}
              <b className="text-vermelho">
                {semDiasAcesso.length} plano(s) recorrente(s) ainda estão sem esse número: {semDiasAcesso.map((p) => p.nome).join(", ")}.
              </b>
            </>
          )}
        </p>
        <p className="mt-1.5 text-[11.5px] text-muted">
          A parte 9 da migration lista quem hoje está com validade esticada. Ela só mostra — corrigir cada caso é
          decisão sua, e dá para fazer pela tela de Cobranças.
        </p>
      </section>

      {/* ─────────────────────────────────────────────────────────── planos */}
      <section>
        <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-bold">Desenho dos planos</h2>
            <p className="mt-0.5 max-w-[75ch] text-[12.5px] text-muted">
              Preço, limites e recursos vivem no banco — não no código. O que você marcar aqui é o que o contador vê
              na tela de Planos e o que o sistema aplica.
            </p>
          </div>
          <NovoPlano />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {n.planos.map((p) => (
            <PlanoCartao key={p.id} p={p} recursos={n.recursos} emUso={uso[p.id]} />
          ))}
        </div>

        {!n.planos.length && (
          <div className="rounded-lg border border-line bg-surface p-7 text-center text-[13px] text-muted">
            Nenhum plano cadastrado. Rode a migration 0020 ou crie o primeiro acima.
          </div>
        )}
      </section>

      {/* ────────────────────────────────────────────────────── comparativo */}
      <section>
        <h2 className="mb-1 text-[15px] font-bold">Como o contador vê</h2>
        <p className="mb-2 text-[12.5px] text-muted">Só os planos ativos e visíveis. É esta lista que a tela de Planos monta.</p>

        {!publicos.length ? (
          <div className="rounded border border-line bg-surface p-5 text-center text-[13px] text-amarelo">
            Nenhum plano visível. A tela de Planos está vazia para quem paga.
          </div>
        ) : (
          <div className="overflow-x-auto rounded border border-line bg-surface">
            <table className="w-full text-[13px]">
              <thead className="border-b border-line text-left">
                <tr>
                  <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Recurso</th>
                  {publicos.map((p) => (
                    <th key={p.id} className="px-3 py-2.5">
                      <span className="text-[13.5px] font-bold">{p.nome}</span>
                      <span className="block font-mono text-[11.5px] font-normal text-muted">
                        {p.preco_centavos === 0 ? "R$ 0" : brl(p.preco_centavos)}
                        {p.ciclo === "mensal" ? "/mês" : p.ciclo === "anual" ? "/ano" : ""}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {n.recursos.map((r) => (
                  <tr key={r.chave} className="border-b border-linesoft last:border-0">
                    <td className="px-3 py-2">
                      {r.nome}
                      <span className="block text-[11px] text-muted">{r.descricao}</span>
                    </td>
                    {publicos.map((p) => (
                      <td key={p.id} className="px-3 py-2">
                        {p.recursos.includes(r.chave)
                          ? <span className="font-bold text-verde">✓</span>
                          : <span className="text-muted">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t-2 border-line bg-surface2">
                  <td className="px-3 py-2 font-semibold">Laudos e termos</td>
                  {publicos.map((p) => (
                    <td key={p.id} className="px-3 py-2 font-mono font-semibold">
                      {p.limite_analises == null ? "ilimitado" : p.limite_analises}
                    </td>
                  ))}
                </tr>
                <tr className="bg-surface2">
                  <td className="px-3 py-2 font-semibold">Empresas na carteira</td>
                  {publicos.map((p) => (
                    <td key={p.id} className="px-3 py-2 font-mono font-semibold">
                      {p.limite_empresas == null ? "ilimitado" : p.limite_empresas}
                    </td>
                  ))}
                </tr>
                <tr className="bg-surface2">
                  <td className="px-3 py-2 font-semibold">Usuários</td>
                  {publicos.map((p) => (
                    <td key={p.id} className="px-3 py-2 font-mono font-semibold">
                      {p.limite_usuarios == null ? "ilimitado" : p.limite_usuarios}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
