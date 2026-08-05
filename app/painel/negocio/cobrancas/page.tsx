import { carregarNegocio, brl } from "@/lib/negocio";
import { RodarReguas } from "@/components/NegocioUI";
import { createClient } from "@/lib/supabase-server";
import { type Fatura } from "@/lib/faturas";
import { LIMITE_SEGURO } from "@/lib/filtro-faturas";
import { ExtratoFaturas } from "@/components/ExtratoFaturas";
import { PlanosEAsaas } from "@/components/PlanosEAsaas";

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
    /* eram 30. Trinta responde "o que aconteceu esta semana" e nenhuma das
       perguntas que aparecem quando alguém liga. O teto está declarado em
       LIMITE_SEGURO e a tela AVISA quando bate nele, em vez de truncar calada. */
    .limit(LIMITE_SEGURO);

  /* "Nenhuma fatura registrada ainda" é a frase que a própria tela ensina a
     interpretar como "o webhook não entregou". Um erro de LEITURA virando essa
     frase transforma falha de banco em diagnóstico errado sobre o Asaas. */
  const erroFaturas = eFaturas ? eFaturas.message : null;
  const ultimas = (faturas ?? []) as unknown as Fatura[];
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

  /* tenant_id → nome: sem isto o seletor de contratante mostraria uuid, e uuid
     em relatório não é informação */
  const nomes: Record<string, string> = {};
  for (const e of n.escritorios) nomes[e.id] = e.nome ?? "(sem nome)";

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

      {!temServiceRole && (
        <div className="rounded border border-line bg-accentwash p-3 text-[11.5px] text-accentdeep">
          Sem <b>SUPABASE_SERVICE_ROLE_KEY</b> no ambiente. A leitura funciona (função do banco), mas gravar
          assinatura de outro escritório depende dessa chave — a RLS bloqueia a escrita cruzada.
        </div>
      )}

      <p className="text-[11.5px] leading-relaxed text-muted">
        O webhook do Asaas (<code>/api/asaas</code>) ativa a assinatura sozinho quando o pagamento confirma, e
        concede exatamente os dias declarados no plano. Para gerir uma assinatura, sincronizar com o Asaas ou
        gerar cobrança, abra a conta em <b>Contas</b> — desde 05/08/2026 existe uma tela só, porque as duas
        liam fontes diferentes do mesmo escritório e podiam discordar sem que ninguém visse.
      </p>

      {/* ------------------------------------------------ EXTRATO DE FATURAS */}
      {erroFaturas ? (
        <p className="rounded border border-amarelo/40 bg-amarelowash p-4 text-[13px]">
          Não consegui ler as faturas: {erroFaturas}. Isto é falha de leitura, <b>não</b> significa
          que o webhook deixou de entregar.
        </p>
      ) : (
        <ExtratoFaturas faturas={ultimas} nomes={nomes} />
      )}

      {/**
        * PLANOS E ASAAS descem para cá, e deixam de ser uma rota.
        *
        * Eram um item de menu próprio, e a pergunta que leva alguém até lá é a
        * mesma que leva a esta tela: "como o dinheiro entra?". Um plano existe
        * para virar fatura; a chave do Asaas existe para a fatura ser criada.
        * Separar em duas rotas obrigava a lembrar em qual das duas estava a
        * coisa — e ninguém lembra.
        */}
      <PlanosEAsaas />

    </div>
  );
}