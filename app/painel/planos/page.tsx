"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { LIMITE_GRATIS } from "@/lib/plano";
import { CentralFaturas } from "@/components/CentralFaturas";
import type { Fatura } from "@/lib/faturas";
import { criticaDocumento, documentoValido } from "@/lib/documento";

interface Plano {
  id: string;
  nome: string;
  descricao: string | null;
  preco_centavos: number;
  recorrente: boolean;
}

const brl = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });

export default function Planos() {
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [ativo, setAtivo] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [laudos, setLaudos] = useState(0);
  const [ilimitado, setIlimitado] = useState(false);
  /** o histórico de cobranças deste escritório — ver components/CentralFaturas */
  const [faturas, setFaturas] = useState<Fatura[]>([]);
  /**
   * O CPF/CNPJ DE QUEM PAGA.
   *
   * O Asaas não cria cliente sem ele. Sem este campo, "Assinar" não fazia
   * nada — literalmente nada, sem erro na tela. Vem preenchido do cadastro do
   * escritório a partir da segunda vez.
   */
  const [documento, setDocumento] = useState("");
  const [pedindoDoc, setPedindoDoc] = useState<string | null>(null);
  const [erroCheckout, setErroCheckout] = useState<string | null>(null);
  /**
   * A ASSINATURA CONTRATADA E AINDA NÃO PAGA.
   *
   * `assinatura_ativa` só devolve o que já está ATIVO — e é assim que tem que
   * ser, porque é ela que libera o produto. O efeito colateral era esta tela:
   * quem contratava e ia pagar o boleto voltava e via "Plano gratuito" com o
   * botão "Assinar" de novo, como se nada tivesse acontecido. O terceiro
   * estado — contratado, aguardando pagamento — não existia.
   */
  const [pendente, setPendente] = useState<{ plano_id: string } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      /* a RLS de `faturas` já limita ao próprio escritório */
      supabase
        .from("profiles")
        .select("tenants(cpf_cnpj)")
        .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
        .maybeSingle()
        .then(({ data: pf }) => {
          const t = pf?.tenants as { cpf_cnpj?: string } | { cpf_cnpj?: string }[] | null;
          const doc = (Array.isArray(t) ? t[0]?.cpf_cnpj : t?.cpf_cnpj) ?? "";
          if (doc) setDocumento(doc);
        });

      supabase
        .from("faturas")
        .select("id, asaas_id, descricao, valor_centavos, status, vencimento, pago_em, link_pagamento, link_boleto, criado_em")
        .then(({ data: fs }) => setFaturas((fs ?? []) as unknown as Fatura[]));

      const { data } = await supabase
        .from("planos")
        .select("id, nome, descricao, preco_centavos, recorrente")
        .eq("ativo", true)
        .order("ordem");
      if (data) setPlanos(data);

      const { data: assin } = await supabase.rpc("assinatura_ativa");
      const a = Array.isArray(assin) ? assin[0] : assin;
      if (a?.plano_id) {
        setAtivo(a.plano_id);
        setIlimitado(a.limite_analises == null);
      } else {
        /* sem assinatura ativa: será que existe uma esperando pagamento? */
        /* sem ordenar por data: a auditoria de schema mostrou que
           `assinaturas.criado_em` não tem proveniência nas migrations deste
           repositório, e pedir coluna que talvez não exista quebra em
           produção sem quebrar aqui. Qual das pendentes aparece não importa —
           a tela só precisa saber que existe uma. */
        const { data: pend } = await supabase
          .from("assinaturas")
          .select("id, plano_id")
          .eq("status", "pendente")
          .limit(1);
        const p0 = (pend ?? [])[0] as { plano_id?: string } | undefined;
        if (p0?.plano_id) setPendente({ plano_id: p0.plano_id });
      }

      const { count } = await supabase
        .from("laudos")
        .select("id", { count: "exact", head: true });
      setLaudos(count ?? 0);
    })();
  }, []);

  const semAssinatura = !ativo;
  const restantes = Math.max(LIMITE_GRATIS - laudos, 0);

  async function contratar(planoId: string) {
    // sem documento, nem sai daqui: o Asaas recusaria e o clique morreria
    if (!documentoValido(documento)) {
      setPedindoDoc(planoId);
      setErroCheckout(criticaDocumento(documento));
      return;
    }

    setOcupado(planoId);
    setErroCheckout(null);
    try {
      const resp = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plano_id: planoId, cpf_cnpj: documento }),
      });
      const json = (await resp.json().catch(() => ({}))) as {
        erro?: string;
        checkout_url?: string;
        asaas_ativo?: boolean;
        falta_documento?: boolean;
      };

      if (resp.ok && json.checkout_url) {
        const janela = window.open(json.checkout_url, "_blank");
        /* bloqueador de pop-up faz o clique parecer perdido — o link fica na
           tela para a pessoa abrir na mão */
        if (!janela) setErroCheckout(`Cobrança gerada. O navegador bloqueou a janela — abra em: ${json.checkout_url}`);
        setPedindoDoc(null);
        return;
      }

      if (resp.ok && !json.asaas_ativo) {
        setErroCheckout(
          "Assinatura registrada. O pagamento automático ainda não está ligado — vou combinar a cobrança com você e liberar o acesso."
        );
        return;
      }

      /* O CASO QUE NÃO EXISTIA: Asaas ligado e sem link. Era aqui que o
         botão não fazia nada. Agora o motivo aparece. */
      if (json.falta_documento) setPedindoDoc(planoId);
      setErroCheckout(json.erro ?? "Não consegui gerar a cobrança. Tente de novo em instantes.");
    } catch (e) {
      setErroCheckout(`Não consegui falar com o servidor: ${e instanceof Error ? e.message : "rede"}`);
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div>
      <h1 className="text-[19px] font-bold tracking-tight">Planos</h1>
      <p className="mt-0.5 max-w-[70ch] text-[13px] text-muted">
        Uma análise cobrada do seu cliente paga o ano inteiro de Enquadria. O plano gratuito
        serve para você ver a carteira e sentir o entregável; o PRO libera o papel cobrável sem
        limite.
      </p>

      {/* CONSUMO ATUAL */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded border border-line bg-surface px-4 py-3.5">
        <div>
          <div className="text-[13px] font-semibold">
            {ativo ? "Plano ativo" : pendente ? "Contratado — aguardando pagamento" : "Plano gratuito"}
          </div>
          <div className="mt-0.5 text-[12.5px] text-muted">
            {ilimitado ? (
              <>Laudos e termos ilimitados.</>
            ) : (
              <>
                {laudos} de {LIMITE_GRATIS} laudos de degustação usados
                {restantes > 0 ? ` · restam ${restantes}` : " · limite atingido"}.
              </>
            )}
          </div>
        </div>
        {!ilimitado && (
          <div className="flex gap-1">
            {Array.from({ length: LIMITE_GRATIS }).map((_, i) => (
              <span
                key={i}
                className={`h-2.5 w-10 rounded-full ${i < laudos ? "bg-accent" : "bg-linesoft"}`}
              />
            ))}
          </div>
        )}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {planos.map((p) => {
          const eAtivo = ativo === p.id;
          /* contratado e esperando o pagamento cair — nem grátis, nem ativo */
          const ePendente = !eAtivo && pendente?.plano_id === p.id;
          const gratuito = p.preco_centavos === 0;
          const destaque = p.id === "assinatura" || p.id === "pro_anual";
          const atualGratuito = gratuito && semAssinatura;
          return (
            <div
              key={p.id}
              className={`flex flex-col rounded-lg border bg-surface p-5 ${
                destaque ? "border-accent shadow-card" : "border-line"
              }`}
            >
              {destaque && !eAtivo && (
                <span className="mb-2 inline-block w-fit rounded-full bg-accentwash px-2.5 py-0.5 text-[11px] font-semibold text-accentdeep">
                  {p.id === "pro_anual" ? "2 meses grátis" : "mais escolhido"}
                </span>
              )}
              <div className="text-[15px] font-bold">{p.nome}</div>
              <div className="mt-1 min-h-[36px] text-[12.5px] text-muted">{p.descricao}</div>
              <div className="mt-4 font-mono text-[26px] font-semibold">
                {gratuito ? "R$ 0" : brl(p.preco_centavos)}
                {p.recorrente && (
                  <span className="text-[13px] text-muted">
                    {p.id === "pro_anual" ? "/ano" : "/mês"}
                  </span>
                )}
              </div>

              {gratuito ? (
                <div
                  className={`mt-5 rounded-sm py-2.5 text-center text-sm font-semibold ${
                    atualGratuito ? "bg-verdewash text-verde" : "bg-surface2 text-muted"
                  }`}
                >
                  {atualGratuito ? "Seu plano atual" : "Incluso em todos os planos"}
                </div>
              ) : (
                <>
                <button
                  onClick={() => contratar(p.id)}
                  disabled={ocupado === p.id || eAtivo}
                  title={ePendente ? "Já existe uma cobrança em aberto deste plano" : undefined}
                  className={`mt-5 rounded-sm py-2.5 text-sm font-semibold ${
                    eAtivo
                      ? "bg-verdewash text-verde"
                      : ePendente
                        ? "border border-amarelo bg-amarelowash text-amarelo"
                        : "bg-ink text-white disabled:opacity-40"
                  }`}
                >
                  {eAtivo
                    ? "Plano ativo"
                    : ocupado === p.id
                      ? "..."
                      : ePendente
                        ? "Gerar nova cobrança"
                        : "Assinar"}
                </button>
                {ePendente && (
                  <p className="mt-2 text-[11.5px] leading-relaxed text-amarelo">
                    Contratado, aguardando o pagamento. A cobrança está em <b>Minhas faturas</b>,
                    logo abaixo — o acesso abre sozinho quando o pagamento for confirmado.
                  </p>
                )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* ------------------------------------------- QUEM PAGA (CPF/CNPJ) */}
      {(pedindoDoc || erroCheckout) && (
        <div className="mt-4 rounded border border-accentdeep bg-accentwash p-4">
          <div className="text-[13.5px] font-bold text-ink">
            {pedindoDoc ? "Falta o CPF ou CNPJ de quem vai pagar" : "Sobre a contratação"}
          </div>
          {pedindoDoc && (
            <>
              <p className="mt-1 max-w-[70ch] text-[12.5px] leading-relaxed text-slate2">
                O meio de pagamento exige o documento do pagador para emitir a cobrança. Peço uma
                vez só — nas próximas ele já vem preenchido, e ele não aparece em nenhum documento
                que você emite.
              </p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  value={documento}
                  onChange={(ev) => setDocumento(ev.target.value)}
                  placeholder="CPF ou CNPJ"
                  inputMode="numeric"
                  className="min-w-0 flex-1 rounded-sm border border-line px-3 py-2 text-[16px] outline-none focus:border-accent sm:max-w-[260px] sm:text-[13.5px]"
                />
                <button
                  // ux-ok: o erro e o resultado aparecem nesta mesma caixa
                  onClick={() => contratar(pedindoDoc)}
                  disabled={ocupado === pedindoDoc}
                  className="whitespace-nowrap rounded-sm bg-ink px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
                >
                  {ocupado === pedindoDoc ? "Gerando…" : "Continuar"}
                </button>
              </div>
            </>
          )}
          {erroCheckout && (
            <p className="mt-2 break-words rounded-sm bg-surface px-3 py-2 text-[12.5px] leading-relaxed text-slate2">
              {erroCheckout}
            </p>
          )}
        </div>
      )}

      {/* ------------------------------------------------- CENTRAL DE FATURAS
          Fica NESTA tela, e não num item de menu novo: quem procura a segunda
          via de um boleto vai a "Planos" — é lá que a assinatura mora na
          cabeça de quem paga. */}
      <div className="mt-8">
        <h2 className="text-[15px] font-bold">Minhas faturas</h2>
        <p className="mb-3 mt-0.5 max-w-[70ch] text-[12.5px] text-muted">
          Todo o histórico de cobrança, com segunda via de quem está em aberto. Não precisa
          procurar e-mail antigo nem me chamar.
        </p>
        <CentralFaturas faturas={faturas} />
      </div>

      <p className="mt-6 max-w-[70ch] text-[12px] leading-relaxed text-muted">
        Pagamento processado pelo Asaas (Pix, boleto ou cartão). A liberação é automática
        após a confirmação. No mensal você cancela quando quiser; o anual é pré-pago pelo período.
        Sem o Asaas configurado, a assinatura fica pendente para ativação manual.
      </p>
    </div>
  );
}
