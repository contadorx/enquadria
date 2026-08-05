import { carregarNegocio, brl } from "@/lib/negocio";
import { LinhaEscritorio, RodarReguas } from "@/components/NegocioUI";
import { createClient } from "@/lib/supabase-server";
import {
  ROTULO_STATUS,
  dataBR,
  moedaCentavos,
  ordenarFaturas,
  statusEfetivo,
  type Fatura,
} from "@/lib/faturas";

export const dynamic = "force-dynamic";

export default async function Cobrancas() {
  const n = await carregarNegocio();

  /**
   * AS ÚLTIMAS FATURAS, do lado de quem recebe.
   *
   * A tela de cobranças mostra o ESTADO de cada escritório (ativo, pendente,
   * vencendo). O que faltava era o EXTRATO: o que o Asaas confirmou, quando e
   * de quem. É o que responde "esse pagamento entrou?" sem abrir o Asaas.
   */
  const supabase = createClient();
  const { data: faturas, error: eFaturas } = await supabase
    .from("faturas")
    .select("id, tenant_id, plano_nome, descricao, valor_centavos, status, vencimento, pago_em, link_pagamento")
    .order("vencimento", { ascending: false })
    .limit(30);

  /* "Nenhuma fatura registrada ainda" é a frase que a própria tela ensina a
     interpretar como "o webhook não entregou". Um erro de LEITURA virando essa
     frase transforma falha de banco em diagnóstico errado sobre o Asaas. */
  const erroFaturas = eFaturas ? eFaturas.message : null;
  const ultimas = (faturas ?? []) as unknown as Fatura[];
  const hoje2 = new Date();
  const temAsaas = !!process.env.ASAAS_API_KEY;
  const temServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (n.erro) {
    return (
      <div className="rounded-lg border border-amarelo/40 bg-amarelowash p-5">
        <p className="text-[15px] font-bold">Não consegui ler a cobrança</p>
        <p className="mt-2 text-[13px]">{n.erro}</p>
      </div>
    );
  }

  const planos = n.planos
    .filter((p) => p.ativo)
    .map((p) => ({ id: p.id, nome: p.nome, preco_centavos: p.preco_centavos, ciclo: p.ciclo }));

  const hoje = new Date();
  const dias = (d: string) => Math.floor((hoje.getTime() - new Date(d).getTime()) / 86_400_000);

  const pendentes = n.escritorios.filter((e) => e.status === "pendente");
  /* com a queda para o preço do plano: assinatura sem valor gravado fazia o
     card "A receber" mostrar R$ 0,00 contradizendo o MRR da mesma página */
  const valorDe = (e: (typeof n.escritorios)[number]) =>
    Number(e.valor_centavos || 0) ||
    Number(n.planos.find((p) => p.id === e.plano_id)?.preco_centavos || 0);
  const aReceber = pendentes.reduce((s, e) => s + valorDe(e), 0);

  const ativos = n.escritorios.filter((e) => e.status === "ativa" && e.vencimento);
  const degraus = [
    { nome: "Vence em até 10 dias", regra: "aviso de renovação", itens: ativos.filter((e) => dias(e.vencimento!) <= 0 && dias(e.vencimento!) >= -10) },
    { nome: "Vencido D+1 a D+4", regra: "lembrete gentil", itens: ativos.filter((e) => dias(e.vencimento!) >= 1 && dias(e.vencimento!) < 5) },
    { nome: "Vencido D+5 ou mais", regra: "aviso de acesso", itens: ativos.filter((e) => dias(e.vencimento!) >= 5) },
    { nome: "Cobrança em aberto", regra: "pendente de pagamento", itens: pendentes },
  ];

  return (
    <div className="space-y-7">
      {!temAsaas && (
        <div className="rounded border border-amarelo/40 bg-amarelowash p-3.5 text-[12.5px] text-amarelo">
          <b>ASAAS_API_KEY não está no ambiente.</b> Você consegue lançar e gerir assinaturas à mão, mas a cobrança
          não é criada no Asaas e nenhum link de pagamento é gerado. Configure em Negócio → Planos &amp; Asaas.
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded border border-line bg-surface p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">A receber</p>
          <p className="mt-1 font-mono text-[22px] font-semibold">{brl(aReceber)}</p>
          <p className="mt-0.5 text-[11.5px] text-muted">{pendentes.length} cobrança(s) aguardando pagamento</p>
        </div>
        <div className="rounded border border-line bg-surface p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">MRR ativo</p>
          <p className="mt-1 font-mono text-[22px] font-semibold text-verde">{brl(n.mrr)}</p>
          <p className="mt-0.5 text-[11.5px] text-muted">{n.assinantes} assinante(s)</p>
        </div>
        <div className="rounded border border-line bg-surface p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Vencendo em 10 dias</p>
          <p className={`mt-1 font-mono text-[22px] font-semibold ${n.vencendo ? "text-amarelo" : ""}`}>{n.vencendo}</p>
          <p className="mt-0.5 text-[11.5px] text-muted">no mensal, isso acontece todo mês</p>
        </div>
        <div className="rounded border border-line bg-surface p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Vencidos sem baixa</p>
          <p className={`mt-1 font-mono text-[22px] font-semibold ${n.vencidos ? "text-vermelho" : ""}`}>{n.vencidos}</p>
          <p className="mt-0.5 text-[11.5px] text-muted">status ativa, data no passado</p>
        </div>
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-bold">Régua de cobrança</h2>
            <p className="max-w-[70ch] text-[12.5px] text-muted">
              Cada degrau tem um e-mail próprio, editável em <b>E-mails proativos</b>. O envio é do cron diário —
              os botões aqui servem para antecipar ou conferir.
            </p>
          </div>
          <RodarReguas />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {degraus.map((d, i) => {
            const total = d.itens.reduce((s, e) => s + Number(e.valor_centavos || 0), 0);
            const critico = i === 2 && d.itens.length > 0;
            return (
              <div key={d.nome} className={`rounded border p-3.5 ${critico ? "border-vermelho/40 bg-vermelhowash" : "border-line bg-surface"}`}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{d.nome}</p>
                <p className={`mt-1 font-mono text-[20px] font-semibold ${critico ? "text-vermelho" : ""}`}>{d.itens.length}</p>
                <p className="font-mono text-[11.5px] text-muted">{brl(total)}</p>
                <p className="mt-1.5 text-[11px] text-muted">{d.regra}</p>
                {d.itens.slice(0, 3).map((e) => (
                  <p key={e.id} className="mt-1 truncate text-[11px] font-medium">{e.nome}</p>
                ))}
                {d.itens.length > 3 && <p className="mt-1 text-[11px] text-muted">+{d.itens.length - 3}</p>}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-[15px] font-bold">Escritórios e assinaturas</h2>
        {!temServiceRole && (
          <div className="mb-2 rounded border border-line bg-accentwash p-3 text-[11.5px] text-accentdeep">
            Sem <b>SUPABASE_SERVICE_ROLE_KEY</b> no ambiente. A leitura funciona (função do banco), mas gravar
            assinatura de outro escritório depende dessa chave — a RLS bloqueia a escrita cruzada.
          </div>
        )}
        <div className="overflow-x-auto rounded border border-line bg-surface">
          <table className="w-full text-[13px]">
            <thead className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Escritório</th>
                <th className="px-3 py-2.5 font-semibold">Plano</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 font-semibold">Valor</th>
                <th className="px-3 py-2.5 font-semibold">Acesso até</th>
                <th className="px-3 py-2.5 font-semibold">Uso</th>
                <th className="px-3 py-2.5 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {n.escritorios.map((e) => (
                <LinhaEscritorio key={e.id} e={e} planos={planos} temAsaas={temAsaas && temServiceRole} />
              ))}
              {!n.escritorios.length && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-muted">Nenhum escritório cadastrado ainda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-[11.5px] leading-relaxed text-muted">
        O webhook do Asaas (<code>/api/asaas</code>) ativa a assinatura sozinho quando o pagamento confirma, e agora
        concede exatamente os dias declarados no plano — antes eram 365 para qualquer pagamento, inclusive o mensal
        de R$ 47. &ldquo;Sincronizar&rdquo; existe para o dia em que o webhook falhar: pergunta ao Asaas o que
        aconteceu com aquela cobrança e alinha o banco, sem apagar nada.
      </p>
    
      {/* ------------------------------------------------ EXTRATO DE FATURAS */}
      <section>
        <h2 className="text-[15px] font-bold">Últimas faturas</h2>
        <p className="mb-2 mt-0.5 text-[12.5px] text-muted">
          O que o Asaas confirmou, direto da tabela alimentada pelo webhook. Fatura que não aparece
          aqui é fatura que o webhook não entregou.
        </p>
        {erroFaturas ? (
          <p className="rounded border border-amarelo/40 bg-amarelowash p-4 text-[13px]">
            Não consegui ler as faturas: {erroFaturas}. Isto é falha de leitura, <b>não</b> significa
            que o webhook deixou de entregar.
          </p>
        ) : ultimas.length === 0 ? (
          <p className="rounded border border-line bg-surface p-4 text-[13px] text-muted">
            Nenhuma fatura registrada ainda.
          </p>
        ) : (
          <div className="overflow-hidden rounded border border-line bg-surface">
            <table className="w-full border-collapse text-[13px]">
              <tbody>
                {ordenarFaturas(ultimas, hoje2).map((f) => (
                  <tr key={f.id}>
                    <td className="border-b border-linesoft px-3 py-2">
                      {f.descricao ?? f.plano_nome ?? "Assinatura"}
                    </td>
                    <td className="border-b border-linesoft px-3 py-2 font-mono text-[12px] text-muted">
                      {dataBR(f.vencimento)}
                    </td>
                    <td className="border-b border-linesoft px-3 py-2 text-right font-mono text-[12px]">
                      {moedaCentavos(f.valor_centavos)}
                    </td>
                    <td className="border-b border-linesoft px-3 py-2 text-right text-[12px] font-semibold">
                      {ROTULO_STATUS[statusEfetivo(f, hoje2)]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

</div>
  );
}