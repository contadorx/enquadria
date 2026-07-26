"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import { mascararCnpj } from "@/lib/cnpj";
import { SAIDAS, type Saida } from "@/lib/motor";

/**
 * ESTEIRA DE ENTREGA — de análise a documento assinado.
 *
 * A tela que mostra, para a carteira inteira, em que etapa cada cliente está:
 * analisada → laudo emitido → termo enviado → assinado. E permite empurrar
 * todo mundo de uma vez, em vez de clicar empresa por empresa.
 *
 * É aqui que o contador cobra assinatura — a parte que trava a maioria dos
 * projetos e que ninguém acompanha em planilha.
 */

type Etapa = "sem_analise" | "analisada" | "laudo" | "termo" | "assinado";

interface Linha {
  empresa_id: string;
  analise_id: string | null;
  nome: string;
  cnpj: string;
  saida: Saida | null;
  contato_nome: string | null;
  contato_email: string | null;
  laudo_id: string | null;
  numero: number | null;
  termo_id: string | null;
  token: string | null;
  assinado: boolean;
  assinado_em: string | null;
  etapa: Etapa;
}

const ROTULO_ETAPA: Record<Etapa, string> = {
  sem_analise: "Sem análise",
  analisada: "Analisada",
  laudo: "Laudo emitido",
  termo: "Aguardando assinatura",
  assinado: "Assinado",
};

const COR_ETAPA: Record<Etapa, string> = {
  sem_analise: "bg-neutrowash text-muted",
  analisada: "bg-accentwash text-accentdeep",
  laudo: "bg-amarelowash text-amarelo",
  termo: "bg-amarelowash text-amarelo",
  assinado: "bg-verdewash text-verde",
};

const ORDEM_ETAPA: Etapa[] = ["sem_analise", "analisada", "laudo", "termo", "assinado"];

export default function Entrega() {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Etapa | "TODAS">("TODAS");
  const [copiado, setCopiado] = useState<string | null>(null);

  async function carregar() {
    const supabase = createClient();
    const { data: empresas } = await supabase
      .from("empresas")
      .select("id, razao_social, cnpj, contato_nome, contato_email")
      .in("faixa", ["A", "B"])
      .limit(1000);
    const { data: analises } = await supabase.from("analises").select("id, empresa_id, saida");
    const ids = (analises ?? []).map((a) => a.id);
    const { data: laudos } = ids.length
      ? await supabase.from("laudos").select("id, analise_id, numero").in("analise_id", ids)
      : { data: [] as never[] };
    const { data: termos } = ids.length
      ? await supabase
          .from("termos")
          .select("id, analise_id, token, assinatura_status, assinado_em")
          .in("analise_id", ids)
      : { data: [] as never[] };

    const porEmpresa = new Map((analises ?? []).map((a) => [a.empresa_id, a]));
    const porAnaliseL = new Map((laudos ?? []).map((l) => [l.analise_id, l]));
    const porAnaliseT = new Map((termos ?? []).map((t) => [t.analise_id, t]));

    const montadas: Linha[] = (empresas ?? []).map((e) => {
      const a = porEmpresa.get(e.id);
      const l = a ? porAnaliseL.get(a.id) : null;
      const t = a ? porAnaliseT.get(a.id) : null;
      const assinado = t?.assinatura_status === "assinado" || !!t?.assinado_em;
      const etapa: Etapa = !a
        ? "sem_analise"
        : assinado
        ? "assinado"
        : t
        ? "termo"
        : l
        ? "laudo"
        : "analisada";
      return {
        empresa_id: e.id,
        analise_id: a?.id ?? null,
        nome: e.razao_social,
        cnpj: e.cnpj,
        saida: (a?.saida ?? null) as Saida | null,
        contato_nome: e.contato_nome,
        contato_email: e.contato_email,
        laudo_id: l?.id ?? null,
        numero: l?.numero ?? null,
        termo_id: t?.id ?? null,
        token: t?.token ?? null,
        assinado,
        assinado_em: t?.assinado_em ?? null,
        etapa,
      };
    });

    setLinhas(montadas);
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  const contagem = useMemo(() => {
    const c: Record<string, number> = { TODAS: linhas.length };
    for (const e of ORDEM_ETAPA) c[e] = 0;
    for (const l of linhas) c[l.etapa]++;
    return c;
  }, [linhas]);

  const visiveis = filtro === "TODAS" ? linhas : linhas.filter((l) => l.etapa === filtro);
  const semContato = linhas.filter((l) => !l.contato_email).length;
  const prontasParaLaudo = linhas.filter((l) => l.etapa === "analisada").length;
  const prontasParaTermo = linhas.filter((l) => l.etapa === "laudo" && l.contato_email).length;

  async function emitirLaudos() {
    setOcupado("laudos");
    setErro(null);
    setAviso(null);
    try {
      const r = await fetch("/api/laudo/lote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro ?? "falha ao emitir");
      setAviso(
        `${j.emitidos} laudos emitidos.` +
          (j.bloqueados > 0
            ? ` ${j.bloqueados} ficaram de fora pelo limite do plano gratuito — assine o PRO para emitir sem teto.`
            : "")
      );
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "erro inesperado");
    } finally {
      setOcupado(null);
    }
  }

  async function enviarTermos() {
    setOcupado("termos");
    setErro(null);
    setAviso(null);
    try {
      const r = await fetch("/api/termo/lote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enviar_email: true }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro ?? "falha ao gerar termos");
      setAviso(
        `${j.criados} termos gerados` +
          (j.enviados > 0
            ? ` e ${j.enviados} convites enviados por e-mail.`
            : ". O envio automático não está configurado — copie os links abaixo e mande você mesmo.") +
          (j.sem_contato > 0 ? ` ${j.sem_contato} empresas ainda não têm contato cadastrado.` : "")
      );
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "erro inesperado");
    } finally {
      setOcupado(null);
    }
  }

  function copiar(token: string) {
    const url = `${window.location.origin}/assinar/${token}`;
    navigator.clipboard?.writeText(url);
    setCopiado(token);
    setTimeout(() => setCopiado(null), 2000);
  }

  if (carregando) return <div className="text-sm text-muted">Carregando a esteira…</div>;

  if (linhas.length === 0) {
    return (
      <div>
        <h1 className="text-[19px] font-bold tracking-tight">Entrega</h1>
        <div className="mt-6 rounded border border-dashed border-line bg-surface p-8 text-center text-sm text-slate2">
          Nenhuma empresa na faixa de análise ainda.{" "}
          <Link href="/painel/importar" className="font-semibold text-accentdeep">
            Importe a carteira
          </Link>
          .
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[19px] font-bold tracking-tight">Entrega</h1>
          <p className="mt-0.5 max-w-[72ch] text-[13px] text-muted">
            Em que etapa está cada cliente, da análise ao documento assinado — e o que falta para
            fechar a janela.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={emitirLaudos}
            disabled={!!ocupado || prontasParaLaudo === 0}
            className="rounded-sm border border-line px-4 py-2.5 text-[13px] font-semibold text-slate2 disabled:opacity-40"
          >
            {ocupado === "laudos" ? "Emitindo…" : `Emitir ${prontasParaLaudo} laudos`}
          </button>
          <button
            onClick={enviarTermos}
            disabled={!!ocupado || prontasParaTermo === 0}
            className="rounded-sm bg-ink px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-40"
          >
            {ocupado === "termos" ? "Enviando…" : `Enviar ${prontasParaTermo} termos`}
          </button>
        </div>
      </div>

      {aviso && (
        <p className="mt-4 rounded-sm border border-accent bg-accentwash px-3.5 py-2.5 text-[13px] text-slate2">
          {aviso}
        </p>
      )}
      {erro && (
        <p className="mt-4 rounded-sm bg-vermelhowash px-3 py-2 text-[13px] text-vermelho">{erro}</p>
      )}

      {semContato > 0 && (
        <p className="mt-4 rounded-sm border border-amarelo bg-amarelowash px-3.5 py-2.5 text-[13px] text-slate2">
          <b className="text-ink">{semContato} empresas sem contato cadastrado.</b> Sem nome e
          e-mail do responsável não dá para enviar o termo. Inclua as colunas &quot;contato&quot; e
          &quot;email&quot; no CSV e importe de novo, ou preencha no dossiê de cada uma.
        </p>
      )}

      {/* FUNIL */}
      <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded border border-linesoft bg-linesoft md:grid-cols-5">
        {ORDEM_ETAPA.map((e) => (
          <button
            key={e}
            onClick={() => setFiltro(filtro === e ? "TODAS" : e)}
            className={`bg-surface p-3.5 text-left hover:bg-surface2 ${
              filtro === e ? "ring-1 ring-inset ring-accent" : ""
            }`}
          >
            <div className="font-mono text-[22px] font-semibold">{contagem[e] ?? 0}</div>
            <div className="mt-1 text-[11.5px] leading-tight text-muted">{ROTULO_ETAPA[e]}</div>
          </button>
        ))}
      </div>

      {filtro !== "TODAS" && (
        <button onClick={() => setFiltro("TODAS")} className="mt-2.5 text-[12px] text-accentdeep">
          ← ver todas as {linhas.length} empresas
        </button>
      )}

      <table className="mt-4 w-full border-collapse text-[13.5px]">
        <thead>
          <tr>
            {["Empresa", "Contato", "Decisão", "Etapa", "Documentos"].map((h) => (
              <th
                key={h}
                className="border-b border-line px-2.5 pb-2 text-left font-mono text-[9.5px] font-medium uppercase tracking-[0.12em] text-muted"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visiveis.map((l) => (
            <tr key={l.empresa_id}>
              <td className="border-b border-linesoft px-2.5 py-2.5">
                <Link href={`/painel/empresa/${l.empresa_id}`} className="font-semibold text-ink hover:text-accentdeep">
                  {l.nome}
                </Link>
                <div className="font-mono text-[10.5px] text-muted">{mascararCnpj(l.cnpj)}</div>
              </td>
              <td className="border-b border-linesoft px-2.5 py-2.5 text-[12px]">
                {l.contato_email ? (
                  <>
                    <div>{l.contato_nome}</div>
                    <div className="font-mono text-[10.5px] text-muted">{l.contato_email}</div>
                  </>
                ) : (
                  <span className="text-amarelo">sem contato</span>
                )}
              </td>
              <td className="border-b border-linesoft px-2.5 py-2.5">
                {l.saida ? (
                  <span className="font-mono text-[11.5px]">
                    {l.saida}{" "}
                    <span className="text-[11px] text-muted">
                      {SAIDAS[l.saida].titulo.split(" —")[0]}
                    </span>
                  </span>
                ) : (
                  <span className="text-[12px] text-muted">—</span>
                )}
              </td>
              <td className="border-b border-linesoft px-2.5 py-2.5">
                <span
                  className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${COR_ETAPA[l.etapa]}`}
                >
                  {ROTULO_ETAPA[l.etapa]}
                </span>
                {l.assinado_em && (
                  <div className="mt-0.5 font-mono text-[10px] text-muted">
                    {new Date(l.assinado_em).toLocaleDateString("pt-BR")}
                  </div>
                )}
              </td>
              <td className="border-b border-linesoft px-2.5 py-2.5">
                <div className="flex flex-wrap justify-end gap-1.5">
                  {l.laudo_id && (
                    <a
                      href={`/doc/laudo/${l.laudo_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-sm border border-line px-2.5 py-1 text-[11.5px] font-semibold text-slate2"
                    >
                      Laudo {String(l.numero).padStart(4, "0")}
                    </a>
                  )}
                  {l.token && !l.assinado && (
                    <button
                      onClick={() => copiar(l.token!)}
                      className="rounded-sm border border-accentdeep px-2.5 py-1 text-[11.5px] font-semibold text-accentdeep"
                    >
                      {copiado === l.token ? "Copiado ✓" : "Copiar link"}
                    </button>
                  )}
                  {l.termo_id && (
                    <a
                      href={`/doc/termo/${l.termo_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-sm border border-line px-2.5 py-1 text-[11.5px] font-semibold text-slate2"
                    >
                      Termo
                    </a>
                  )}
                  {!l.analise_id && (
                    <Link
                      href={`/painel/motor?empresa=${l.empresa_id}`}
                      className="rounded-sm border border-line px-2.5 py-1 text-[11.5px] font-semibold text-slate2"
                    >
                      Analisar
                    </Link>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-4 max-w-[80ch] text-[11px] leading-relaxed text-muted">
        O envio automático usa o e-mail cadastrado de cada empresa. Sem serviço de e-mail
        configurado, os termos são criados do mesmo jeito e você copia o link de assinatura aqui
        para enviar por WhatsApp ou pelo seu e-mail.
      </p>
    </div>
  );
}
