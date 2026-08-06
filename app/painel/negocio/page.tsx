import Link from "next/link";
import { carregarNegocio, brl, type Acao } from "@/lib/negocio";
import { BotaoFoto } from "@/components/NegocioUI";
import { BlocoContas } from "@/components/BlocoContas";

export const dynamic = "force-dynamic";

const URGENCIA: Record<string, string> = {
  alta: "bg-vermelhowash text-vermelho",
  media: "bg-amarelowash text-amarelo",
  baixa: "bg-neutrowash text-neutro",
};

function Bloco({ titulo, valor, nota, cor }: { titulo: string; valor: string; nota?: string; cor?: string }) {
  return (
    <div className="rounded border border-line bg-surface p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{titulo}</p>
      <p className={`mt-1 font-mono text-[22px] font-semibold ${cor || ""}`}>{valor}</p>
      {nota && <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{nota}</p>}
    </div>
  );
}

export default async function NegocioVisao() {
  const n = await carregarNegocio();

  if (n.erro) {
    return (
      <div className="rounded-lg border border-amarelo/40 bg-amarelowash p-5">
        <p className="text-[15px] font-bold">Não consegui ler os dados do negócio</p>
        <p className="mt-2 text-[13px]">{n.erro}</p>
      </div>
    );
  }

  const maxMrr = Math.max(1, ...n.historico.map((h) => h.mrr));
  const pctMeta = n.meta.mrr ? Math.min(100, Math.round((n.mrr / n.meta.mrr) * 100)) : 0;

  const porTipo: Record<string, Acao[]> = {};
  for (const a of n.acoes) (porTipo[a.tipo] = porTipo[a.tipo] || []).push(a);

  return (
    <div className="space-y-7">
      {/* ───────────────────────────────────────────── a janela manda no ritmo */}
      <div className="rounded-lg border border-accent/30 bg-accentwash px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[13px] font-bold text-accentdeep">
            {n.janela.dias > 0
              ? `Faltam ${n.janela.dias} dias para a janela fechar (${new Date(n.janela.fecha + "T12:00:00").toLocaleDateString("pt-BR")})`
              : "A janela de setembro já fechou"}
          </p>
          <p className="text-[11.5px] text-accentdeep">
            {n.uso.laudos} laudo(s) emitido(s) na base · {n.uso.assinados} termo(s) assinado(s)
          </p>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/70">
          <div className="h-full rounded-full bg-accent" style={{ width: `${n.janela.pct}%` }} />
        </div>
        <p className="mt-1.5 text-[11px] text-accentdeep/80">
          O prazo é o motor da demanda. Enquanto ele corre, todo escritório na base tem uma razão
          concreta para usar o produto — e depois de 30/09 a conversa muda de urgência para recorrência.
        </p>
      </div>

      {/* zero por falha de leitura não pode passar por zero de verdade */}
      {n.avisos.length > 0 && (
        <div className="rounded border border-amarelo/40 bg-amarelowash p-4">
          <p className="text-[13px] font-bold text-amarelo">Parte dos números não pôde ser lida</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[12.5px] text-slate2">
            {n.avisos.map((a) => <li key={a}>{a}</li>)}
          </ul>
          <p className="mt-1.5 text-[11.5px] text-muted">
            Os cartões abaixo mostram zero onde a leitura falhou — não trate como receita zerada.
          </p>
        </div>
      )}

      {/* ──────────────────────────────────────── receita RECORRENTE (projeção) */}
      <section>
        <h2 className="mb-2 text-[14px] font-bold">
          Receita recorrente <span className="font-normal text-muted">— o que a base vale por mês</span>
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Bloco titulo="MRR" valor={brl(n.mrr)} nota={`${n.assinantes} assinante(s) · ticket ${brl(n.ticket)}`} cor="text-verde" />
          <Bloco titulo="ARR projetado" valor={brl(n.arr)} nota="MRR × 12, sem considerar churn" />
          <Bloco titulo="MRR em risco" valor={brl(n.mrrEmRisco)} nota="vencendo em 10 dias + parados há 21" cor={n.mrrEmRisco ? "text-vermelho" : ""} />
          <Bloco titulo="Novos no mês" valor={String(n.novosNoMes)} nota={`${n.gratuitos} escritório(s) no gratuito`} />
        </div>
      </section>

      {/* ───────────────────────────────────────────── o dinheiro que ENTROU
          MRR é promessa: o que a base vale por mês SE todo mundo continuar. O
          painel inteiro falava dele e não tinha uma linha sobre o que caiu na
          conta — a pergunta que se faz olhando o extrato. Agora tem resposta,
          porque a central de faturas existe. */}
      <section>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[14px] font-bold">
            Caixa <span className="font-normal text-muted">— o que entrou de verdade</span>
          </h2>
          <p className="text-[11.5px] text-muted">
            {n.caixa.pagas} cobrança(s) paga(s) · fonte: central de faturas
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Bloco
            titulo="Recebido no mês"
            valor={brl(n.caixa.recebido_mes)}
            nota="pagamentos confirmados neste mês"
            cor="text-verde"
          />
          <Bloco titulo="Recebido total" valor={brl(n.caixa.recebido_total)} nota="desde o começo" />
          <Bloco
            titulo="Em aberto"
            valor={brl(n.caixa.aberto)}
            nota="cobrança emitida, ainda no prazo"
            cor={n.caixa.aberto ? "text-amarelo" : ""}
          />
          <Bloco
            titulo="Vencido"
            valor={brl(n.caixa.vencido)}
            nota={`${n.caixa.vencidas} cobrança(s) venceram sem pagamento`}
            cor={n.caixa.vencido ? "text-vermelho" : ""}
          />
        </div>
      </section>

      {n.meta.mrr > 0 && (
        <div className="rounded border border-line bg-surface p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[13px] font-bold">Meta de MRR</p>
            <p className="text-[12.5px] text-muted">
              {brl(n.mrr)} de {brl(n.meta.mrr)} · <b className="text-slate1">{pctMeta}%</b>
            </p>
          </div>
          <div className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-linesoft">
            <div className="h-full rounded-full bg-accent" style={{ width: `${pctMeta}%` }} />
          </div>
          <p className="mt-1.5 text-[11.5px] text-muted">
            Faltam {brl(Math.max(n.meta.mrr - n.mrr, 0))} — o equivalente a{" "}
            {n.ticket > 0 ? Math.ceil(Math.max(n.meta.mrr - n.mrr, 0) / n.ticket) : "—"} assinante(s) no ticket de hoje.
          </p>
        </div>
      )}

      {/* ──────────────────────────────────────── histórico + composição */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded border border-line bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[13px] font-bold">Receita mês a mês</p>
              <p className="mt-0.5 text-[11.5px] text-muted">
                O anual entra dividido por 12 — senão dezembro parece milagre e janeiro, catástrofe.
              </p>
            </div>
            <BotaoFoto />
          </div>
          <div className="mt-4 flex items-end gap-3" style={{ height: 120 }}>
            {n.historico.map((h, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <span className="font-mono text-[10.5px] font-semibold">{brl(h.mrr)}</span>
                <div className="w-full rounded-t bg-accent" style={{ height: `${(h.mrr / maxMrr) * 84}px`, minHeight: h.mrr ? 4 : 0 }} />
                <span className="text-[10.5px] text-muted">{h.mes}</span>
              </div>
            ))}
          </div>
          {n.historico.length < 2 && (
            <p className="mt-2 text-[11.5px] text-muted">
              Só há uma foto até agora. A série fica útil a partir do segundo mês.
            </p>
          )}
        </div>

        <div className="rounded border border-line bg-surface p-4">
          <p className="text-[13px] font-bold">Receita por plano</p>
          {n.porPlano.length ? (
            <div className="mt-3 space-y-2.5">
              {n.porPlano.map((p) => (
                <div key={p.nome}>
                  <div className="flex items-baseline justify-between text-[12.5px]">
                    <span className="font-semibold">{p.nome}</span>
                    <span className="text-muted">
                      {p.assinantes} · <b className="font-mono text-slate1">{brl(p.mrr)}</b> ({p.pct}%)
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-linesoft">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${p.pct}%` }} />
                  </div>
                </div>
              ))}
              <p className="pt-1 text-[11.5px] text-muted">
                Concentração é risco: se quase tudo está num plano, o churn de poucos escritórios move o total.
                O anual é a defesa contra o churn de outubro, quando a urgência da janela passa.
              </p>
            </div>
          ) : (
            <p className="mt-3 text-[13px] text-muted">Nenhuma assinatura ativa ainda.</p>
          )}
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────── funil */}
      <section className="rounded border border-line bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[13px] font-bold">Funil de ativação</p>
          <p className="text-[12px] text-muted">
            {n.provaram} escritório(s) já emitiram laudo · <b className="text-slate1">{n.conversao}%</b> desses assinam
          </p>
        </div>
        <p className="mt-0.5 max-w-[80ch] text-[11.5px] text-muted">
          A conversão que importa não é cadastro→pago: é <b>provou→pago</b>. Quem emitiu um laudo viu o produto
          inteiro. Se não assinou depois disso, o problema é preço ou valor percebido, não onboarding.
        </p>
        {/* ══════════════════════════════════════════════ A ESTEIRA
            Cada escritório aparece em UM degrau só — o mais avançado que ele
            alcançou. A versão anterior contava cada etapa isoladamente e
            produzia a leitura mais enganosa possível: "38 importaram, 12
            analisaram" faz parecer que 26 estão analisando agora. Não estão.
            Pararam. A coluna "pararam aqui" é a que gera trabalho. */}
        <div className="mt-3 overflow-x-auto rounded border border-line bg-surface">
          <table className="w-full text-[13px]">
            <thead className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Degrau</th>
                <th className="px-3 py-2.5 font-semibold">Chegaram até aqui</th>
                <th className="px-3 py-2.5 text-right font-semibold">Passagem</th>
                <th className="px-3 py-2.5 text-right font-semibold">Pararam aqui</th>
              </tr>
            </thead>
            <tbody>
              {n.esteira.map((d) => (
                <tr
                  key={d.chave}
                  className={`border-b border-linesoft last:border-0 ${
                    n.ondeTrava?.chave === d.chave ? "bg-amarelowash" : ""
                  }`}
                >
                  <td className="px-3 py-2 font-medium">{d.titulo}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-40 overflow-hidden rounded-sm bg-linesoft">
                        <div
                          className="h-full rounded-sm bg-accent"
                          style={{ width: `${Math.max((d.chegaram / Math.max(1, n.esteira[0].chegaram)) * 100, 4)}%` }}
                        />
                      </div>
                      <span className="font-mono text-[12.5px]">{d.chegaram}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-[12.5px]">
                    {d.passagem == null ? <span className="text-muted">—</span> : `${d.passagem}%`}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono text-[12.5px] ${d.pararam > 0 ? "font-semibold" : "text-muted"}`}>
                    {d.pararam}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* O GARGALO — e a lista de quem contactar. Sem a lista isto vira
            painel de contemplação: o número aponta o problema e não diz com
            quem falar. */}
        {n.ondeTrava ? (
          <div className="mt-3 rounded border border-amarelo/40 bg-amarelowash p-4">
            <p className="text-[13px] font-bold text-amarelo">
              Onde a base trava: {n.ondeTrava.titulo.toLowerCase()} — só {n.ondeTrava.passagem}% passam
            </p>
            <p className="mt-1 max-w-[85ch] text-[12.5px] leading-relaxed text-slate2">
              O degrau com mais gente parada quase sempre é o primeiro, porque todo mundo passa por
              ele. O que interessa é onde a <b>passagem</b> despenca: é ali que a tela, o texto ou o
              produto estão pedindo algo que a pessoa não consegue dar.
            </p>
            {n.paradosNoGargalo.length > 0 && (
              <>
                <p className="mt-2.5 text-[12px] font-semibold text-slate2">
                  Parados logo antes, do mais antigo para o mais novo:
                </p>
                <ul className="mt-1 space-y-0.5 text-[12.5px] text-slate2">
                  {n.paradosNoGargalo.map((e) => (
                    <li key={e.tenant_id} className="flex flex-wrap items-baseline gap-2">
                      <b>{e.nome}</b>
                      <span className="text-muted">
                        {e.empresas} empresa(s) · {e.analises} análise(s) ·{" "}
                        <span className={e.diasParado >= 7 ? "text-amarelo" : ""}>
                          há {e.diasParado} dia(s)
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11.5px] text-muted">
                  Esta é a lista do suporte proativo: uma mensagem curta com UM próximo passo vale
                  mais que um e-mail explicando o produto inteiro.
                </p>
              </>
            )}
          </div>
        ) : (
          <p className="mt-3 text-[11.5px] text-muted">
            Base ainda pequena para apontar gargalo — com poucos escritórios, qualquer percentual é
            ruído, e agir sobre ruído é pior do que não agir.
          </p>
        )}
      </section>

      {/* ────────────────────────────────────────────────────────────── uso */}
      <section>
        <h2 className="mb-2 text-[15px] font-bold">O que a base produziu</h2>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Bloco titulo="Empresas" valor={n.uso.empresas.toLocaleString("pt-BR")} nota="nas carteiras importadas" />
          <Bloco titulo="Análises" valor={n.uso.analises.toLocaleString("pt-BR")} />
          <Bloco titulo="Laudos" valor={n.uso.laudos.toLocaleString("pt-BR")} nota="o entregável cobrável" />
          <Bloco titulo="Termos" valor={n.uso.termos.toLocaleString("pt-BR")} />
          <Bloco titulo="Assinados" valor={n.uso.assinados.toLocaleString("pt-BR")} nota="ciência formalizada" cor="text-verde" />
        </div>
      </section>

      {/* ────────────────────────────────────────────────────── fila de ação */}
      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15px] font-bold">O que fazer hoje</h2>
          <div className="flex gap-2">
            <Link href="/painel/negocio/cobrancas" className="text-[12.5px] font-semibold text-accentdeep hover:underline">Cobranças →</Link>
            <Link href="/painel/negocio/emails" className="text-[12.5px] font-semibold text-accentdeep hover:underline">Réguas →</Link>
          </div>
        </div>

        {!n.acoes.length ? (
          <div className="rounded-lg border border-line bg-surface p-7 text-center">
            <p className="text-[15px] font-bold text-verde">Nada pendente.</p>
            <p className="mt-1 text-[13px] text-muted">
              Ninguém no limite do gratuito, nenhuma assinatura vencendo e nenhum assinante parado.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {Object.entries(porTipo).map(([tipo, itens]) => (
              <div key={tipo} className="overflow-hidden rounded border border-line bg-surface">
                <div className="flex items-center justify-between border-b border-linesoft px-4 py-2.5">
                  <p className="text-[12.5px] font-bold">{tipo}</p>
                  <span className="text-[11.5px] text-muted">{itens.length} caso(s)</span>
                </div>
                <div className="divide-y divide-linesoft">
                  {itens.map((a, i) => (
                    <div key={i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] font-semibold">{a.escritorio}</p>
                        <p className="text-[11.5px] text-muted">{a.detalhe}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        {a.valor ? <span className="font-mono text-[12.5px] font-semibold">{brl(a.valor)}</span> : null}
                        <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${URGENCIA[a.urgencia]}`}>
                          {a.urgencia}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* A LISTA VEM DEPOIS DO AGREGADO. Quem entra para decidir lê o topo;
          quem entra para mexer numa conta rola até aqui — e não em outro clique. */}
      <BlocoContas n={n} />

      <p className="text-[11.5px] leading-relaxed text-muted">
        O MRR é normalizado: assinatura mensal entra pelo valor cheio, anual entra dividido por 12. Um escritório
        só conta como assinante se a assinatura está ativa <i>e</i> dentro da validade — status &ldquo;ativa&rdquo;
        com data vencida aparece na fila de ação, não na receita.
      </p>
    </div>
  );
}
