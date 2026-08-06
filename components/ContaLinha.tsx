"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { ExcluirConta } from "@/components/ExcluirConta";
import { divergencias, moedaBR, origemDoValor, valorReal, ehPagante, comoMetrica } from "@/lib/cobranca";
import type { Escritorio, Plano } from "@/lib/negocio-calc";

/**
 * A LINHA DA CONTA — uma tela onde antes havia duas.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * O QUE ISTO SUBSTITUI, e por que não era só redundância.
 *
 * Negócio → Contas lia `tenants` direto e escrevia em `tenants`; Negócio →
 * Cobranças lia a RPC e escrevia em `assinaturas`. O mesmo escritório tinha
 * STATUS em dois lugares e VALOR em dois, e mudar num não mudava no outro. O
 * MRR saía do lado digitado à mão, a cobrança real do outro — e os dois podiam
 * discordar sem que ninguém visse.
 *
 * Aqui a leitura é uma só (a RPC da 0047, que traz contrato, pagamento real e
 * campos digitados lado a lado). A escrita continua em duas tabelas, porque
 * são coisas diferentes: contrato vai para `assinaturas`, marcação de conta vai
 * para `tenants`. A diferença é que agora isso está declarado na tela, com o
 * rótulo de qual campo vive onde.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * A DIVERGÊNCIA APARECE. Não é erro — é normal quando o pagamento entrou por
 * fora do gateway ou a negociação mudou antes do contrato. O que não pode é
 * ser invisível, que era exatamente o estado anterior.
 */

const campo = "w-full rounded-sm border border-line px-2.5 py-1.5 text-[12.5px] outline-none focus:border-accent";
const rotulo = "font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted";

const STATUS_CONTA = ["ativa", "trial", "cortesia", "inadimplente", "cancelada", "suspensa"];

const dataBR = (d?: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");
const brl = (c?: number | null) => (c == null ? "—" : moedaBR(c / 100));

/**
 * O ADAPTADOR `comoMetrica` MORAVA AQUI, e este arquivo é `"use client"`.
 *
 * A tela de Contas (Server Component) o importava daqui. Compilava, o build
 * passava, e a página respondia com "Application error: a server-side
 * exception has occurred" — porque todo export de um módulo cliente vira um
 * PROXY do lado do servidor. Chamar o proxy lança.
 *
 * Ele foi para `lib/cobranca.ts`, junto das métricas que alimenta, e a
 * fronteira agora tem trava: `ferramentas/auditar-fronteira.mjs`.
 */

async function acao(corpo: Record<string, unknown>): Promise<Record<string, unknown>> {
  const r = await fetch("/api/negocio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  return (await r.json()) as Record<string, unknown>;
}

export function ContaLinha({
  e,
  planos,
  temAsaas,
}: {
  e: Escritorio;
  planos: Plano[];
  temAsaas: boolean;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pend, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [novoPlano, setNovoPlano] = useState(planos[0]?.id ?? "");

  const m = comoMetrica(e);
  const diverge = divergencias(m);
  const pagante = ehPagante(m);
  const origem = origemDoValor(m);

  /** grava em `tenants` — as marcações da conta, que não são contrato */
  function gravar(campos: Record<string, unknown>) {
    start(async () => {
      setErro(null);
      const supabase = createClient();
      /* `.select()` no update: RLS que recusa devolve ZERO LINHAS, não erro.
         Sem isto a tela diz "salvo" e nada foi salvo — ver 0043. */
      const { data, error } = await supabase.from("tenants").update(campos).eq("id", e.id).select("id");
      if (error) { setErro(error.message); return; }
      if (!data?.length) {
        setErro("O banco não alterou nenhuma linha — provavelmente falta permissão. Rode a migration 0043.");
        return;
      }
      setMsg("Salvo.");
      setTimeout(() => setMsg(null), 2000);
      router.refresh();
    });
  }

  const cor = e.is_teste
    ? "bg-surface2 text-muted"
    : (e.status_conta ?? "ativa") === "ativa"
      ? "bg-verdewash text-verde"
      : (e.status_conta ?? "") === "cancelada"
        ? "bg-vermelhowash text-vermelho"
        : "bg-amarelowash text-slate2";

  return (
    <>
      <tr className="border-b border-linesoft align-top">
        <td className="px-3 py-2.5">
          <button onClick={() => setAberto((v) => !v)} className="text-left font-semibold hover:text-accentdeep">
            {e.nome || "(sem nome)"}
          </button>
          <div className="text-[11.5px] text-muted">{e.email || "sem e-mail"}</div>
          {!!diverge.length && (
            <div className="mt-1 inline-block rounded-sm bg-amarelowash px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-slate2">
              {diverge.length} divergência{diverge.length > 1 ? "s" : ""}
            </div>
          )}
        </td>
        <td className="px-3 py-2.5">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${cor}`}>
            {e.is_teste ? "teste" : (e.status_conta ?? "ativa")}
          </span>
          <div className="mt-0.5 text-[11px] text-muted">contrato: {e.status}</div>
        </td>
        <td className="px-3 py-2.5 text-muted">{e.plano_nome || "—"}</td>
        <td className="px-3 py-2.5">
          <span className="font-mono">{pagante ? moedaBR(valorReal(m)) : "—"}</span>
          {/* de onde saiu o número: sem isto, dois valores diferentes na mesma
              página parecem bug em vez de fontes distintas */}
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted">
            {pagante ? origem : e.status === "ativa" ? "sem pagamento" : ""}
          </div>
        </td>
        <td className="px-3 py-2.5 text-[12px] text-muted">
          {dataBR(e.pago_em ?? e.t_ultimo_pagamento)}
          {e.pagas ? <span className="ml-1 text-[10px]">({e.pagas} fatura{e.pagas > 1 ? "s" : ""})</span> : null}
        </td>
        <td className="px-3 py-2.5 text-[12px] text-muted">{dataBR(e.vencimento)}</td>
        <td className="px-3 py-2.5 text-[12px] text-muted">
          {e.empresas} emp · {e.laudos} laudo(s)
        </td>
        <td className="px-3 py-2.5 text-right">
          <button onClick={() => setAberto((v) => !v)} className="text-[12px] font-semibold text-accentdeep hover:underline">
            {aberto ? "fechar" : "gerir"}
          </button>
        </td>
      </tr>

      {aberto && (
        <tr className="border-b border-linesoft bg-surface2">
          <td colSpan={8} className="px-3 py-4">
            {msg && <p className="mb-3 rounded-sm bg-verdewash px-2.5 py-1.5 text-[12px] text-verde">{msg}</p>}
            {erro && <p className="mb-3 rounded-sm bg-vermelhowash px-2.5 py-1.5 text-[12px] text-vermelho">{erro}</p>}

            {/* ─────────────────────────────────────────────── divergências */}
            {!!diverge.length && (
              <div className="mb-4 rounded-sm border border-amarelo/40 bg-amarelowash p-3">
                <div className="text-[12px] font-bold text-slate2">
                  O que está digitado não bate com o que existe
                </div>
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-slate2">
                  Não é necessariamente erro — pagamento por fora do gateway e negociação mais nova
                  que o contrato produzem isso. Mas enquanto eram duas telas, ninguém via.
                </p>
                <ul className="mt-2 space-y-1.5">
                  {diverge.map((d) => (
                    <li key={d.campo} className="text-[12px] text-slate2">
                      <b>{d.campo}</b>: digitado <span className="font-mono">{d.digitado}</span> ·
                      real <span className="font-mono">{d.real}</span>
                      <div className="text-[11.5px] text-muted">{d.saida}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid gap-5 lg:grid-cols-2">
              {/* ───────────────────────────────── o CONTRATO (assinaturas) */}
              <div className="rounded-sm border border-line bg-surface p-3.5">
                <div className={rotulo}>contrato · tabela assinaturas</div>
                <dl className="mt-2 space-y-1 text-[12.5px]">
                  <div className="flex justify-between"><dt className="text-muted">plano</dt><dd>{e.plano_nome ?? "—"}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted">status</dt><dd>{e.status}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted">valor</dt><dd className="font-mono">{brl(e.valor_centavos)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted">acesso até</dt><dd className="font-mono">{dataBR(e.vencimento)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted">em aberto</dt><dd className="font-mono">{brl(e.fatura_aberta_centavos)} {e.fatura_aberta_vence ? `· ${dataBR(e.fatura_aberta_vence)}` : ""}</dd></div>
                </dl>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select className={`${campo} w-auto`} value={novoPlano} onChange={(ev) => setNovoPlano(ev.target.value)}>
                    {planos.filter((p) => p.preco_centavos > 0).map((p) => (
                      <option key={p.id} value={p.id}>{p.nome} · {brl(p.preco_centavos)}</option>
                    ))}
                  </select>
                  <button
                    className="rounded-sm border border-line px-3 py-1.5 text-[12px] font-semibold disabled:opacity-40"
                    /* nasce cinza quando não há plano com preço cadastrado —
                       sem esta frase, o botão parece quebrado */
                    title={novoPlano ? "Cria a cobrança no Asaas e devolve o link" : "Escolha um plano na lista ao lado"}
                    disabled={pend || !novoPlano}
                    onClick={() =>
                      start(async () => {
                        const r = await acao({ acao: "gerar_cobranca", tenant_id: e.id, plano_id: novoPlano });
                        if (r.erro) setErro(String(r.erro));
                        else {
                          /* dizer só "criada" fazia parecer que o cliente já
                             tinha sido avisado; agora o e-mail é explícito */
                          const em = r.email as { enviado?: boolean; motivo?: string } | undefined;
                          setMsg(
                            `Cobrança de ${r.valor} criada.` +
                            (em?.enviado
                              ? " E-mail com o link enviado."
                              : ` O e-mail NÃO saiu (${em?.motivo ?? "motivo não informado"}) — mande o link à mão.`)
                          );
                          router.refresh();
                        }
                      })
                    }
                  >
                    Gerar cobrança
                  </button>
                  {temAsaas && e.asaas_id && e.assinatura_id && (
                    <button
                      className="text-[12px] text-muted hover:underline disabled:opacity-40"
                      disabled={pend}
                      onClick={() =>
                        start(async () => {
                          const r = await acao({ acao: "reconciliar", assinatura_id: e.assinatura_id });
                          setMsg(r.erro ? null : r.pago ? `Pago. Acesso até ${dataBR(String(r.valido_ate))}.` : `No Asaas: ${r.status}.`);
                          if (r.erro) setErro(String(r.erro)); else router.refresh();
                        })
                      }
                    >
                      sincronizar com o Asaas
                    </button>
                  )}
                  {e.checkout_url && (
                    <a href={e.checkout_url} target="_blank" rel="noreferrer" className="text-[12px] text-muted hover:underline">
                      link de pagamento
                    </a>
                  )}
                </div>
              </div>

              {/* ─────────────────────────────────── a CONTA (tenants) */}
              <div className="rounded-sm border border-line bg-surface p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className={rotulo}>conta · tabela tenants</div>
                  {/* a confirmação fica COLADA nos campos que gravam. O aviso do
                      topo do painel some do campo de visão quando a conta tem
                      divergência e o bloco desce — quem clica não vê nada mudar,
                      e clica de novo. */}
                  <span className="text-[11px]">
                    {pend ? <span className="text-muted">salvando…</span>
                      : erro ? <span className="font-semibold text-vermelho">não salvou</span>
                      : msg ? <span className="font-semibold text-verde">salvo ✓</span> : null}
                  </span>
                </div>

                <div className="mt-2 grid gap-2.5 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-[11.5px] font-semibold">Status comercial</span>
                    <select className={campo} value={e.status_conta ?? "ativa"} onChange={(ev) => gravar({ status: ev.target.value })}>
                      {STATUS_CONTA.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11.5px] font-semibold">Marcação</span>
                    <button
                      className="w-full rounded-sm border border-line px-2.5 py-1.5 text-[12px] font-semibold disabled:opacity-50"
                      disabled={pend}
                      onClick={() => gravar({ is_teste: !e.is_teste })}
                    >
                      {e.is_teste ? "não é teste" : "marcar como teste"}
                    </button>
                  </label>
                </div>

                <div className="mt-3 rounded-sm border border-line bg-surface2 p-2.5">
                  <label className="flex items-center gap-2 text-[12.5px] font-semibold">
                    <input
                      type="checkbox"
                      checked={!!e.acesso_cortesia}
                      onChange={(ev) => gravar({ acesso_cortesia: ev.target.checked, status: ev.target.checked ? "cortesia" : "ativa" })}
                    />
                    Acesso cortesia
                  </label>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted">
                    Acesso pleno sem entrar na receita — o aluno do curso que ganha 12 meses. Conta
                    em cortesia fica fora da régua de cobrança.
                  </p>
                  {e.acesso_cortesia && (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <input type="date" defaultValue={e.cortesia_ate ?? ""} className={campo}
                        onBlur={(ev) => gravar({ cortesia_ate: ev.target.value || null })} />
                      <input placeholder="motivo (aluno, parceiro…)" defaultValue={e.cortesia_motivo ?? ""} className={campo}
                        onBlur={(ev) => gravar({ cortesia_motivo: ev.target.value || null })} />
                    </div>
                  )}
                </div>

                <label className="mt-3 block">
                  <span className="mb-1 block text-[11.5px] font-semibold">Observação interna</span>
                  <textarea
                    rows={2}
                    defaultValue={e.obs_admin ?? ""}
                    placeholder="Por que esta conta é exceção. É a memória que some quando ninguém anota."
                    className={campo}
                    onBlur={(ev) => gravar({ obs_admin: ev.target.value || null })}
                  />
                </label>

                {/**
                 * OS CAMPOS DIGITADOS DE DINHEIRO ficam aqui, no fim, e com o
                 * aviso — porque agora eles são a ÚLTIMA fonte, não a primeira.
                 * Continuam existindo para o pagamento que não passou pelo
                 * gateway; deixaram de mandar no MRR quando existe fatura.
                 */}
                <details className="mt-3">
                  <summary className="cursor-pointer text-[11.5px] font-semibold text-muted">
                    pagamento lançado à mão (só para o que não passou pelo gateway)
                  </summary>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-[11px] text-muted">Último pagamento</span>
                      <input type="date" defaultValue={e.t_ultimo_pagamento?.slice(0, 10) ?? ""} className={campo}
                        onBlur={(ev) => gravar({ ultimo_pagamento: ev.target.value || null })} />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[11px] text-muted">Valor mensal (R$)</span>
                      <input
                        type="number" step="0.01" defaultValue={e.t_valor_mensal ?? ""} className={campo}
                        /* campo vazio NÃO grava: `Number("")` é 0, e foi assim
                           que um escritório saiu do MRR sem ninguém perceber */
                        onBlur={(ev) => {
                          const bruto = ev.target.value.trim();
                          if (!bruto) return;
                          const n = Number(bruto);
                          if (!Number.isFinite(n) || n < 0) { setErro("Valor inválido. Use ponto para centavos."); return; }
                          gravar({ valor_mensal: Math.round(n) });
                        }}
                      />
                    </label>
                  </div>
                </details>
              </div>
            </div>

            <ExcluirConta
              key={e.id}
              tenantId={e.id}
              nome={e.nome}
              onExcluida={() => { setAberto(false); router.refresh(); }}
            />
          </td>
        </tr>
      )}
    </>
  );
}
