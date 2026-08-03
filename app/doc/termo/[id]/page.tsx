import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { BotaoImprimir } from "@/components/BotaoImprimir";
import { FolhaTermo } from "@/components/FolhaTermo";
import { trilhaEmTexto } from "@/lib/esign";

export default async function TermoDoc({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: termo } = await supabase
    .from("termos")
    .select(
      "decisao, assinante_nome, assinante_cpf, assinante_email, assinado_em, assinatura_status, token, metodo, hash_documento, evidencia, carimbo, criado_em, analise_id, snapshot"
    )
    .eq("id", params.id)
    .maybeSingle();
  if (!termo) notFound();

  /**
   * Como no laudo: o termo é prova e lê o que foi congelado na criação. O
   * hash_documento continua sendo a garantia de integridade do que o signatário
   * aceitou; o snapshot garante que a APRESENTAÇÃO também não mude depois.
   */
  const snap = termo.snapshot as {
    decisao?: "optar" | "permanecer";
    empresa?: { razao_social?: string; cnpj?: string };
    escritorio?: { nome?: string; crc?: string; logo_url?: string };
  } | null;

  let empresa: { razao_social?: string; cnpj?: string } | null = snap?.empresa ?? null;
  let t: { nome?: string; crc?: string; logo_url?: string } | null = snap?.escritorio ?? null;

  if (!empresa) {
    const { data: analise } = await supabase
      .from("analises")
      .select("empresa_id")
      .eq("id", termo.analise_id)
      .maybeSingle();
    const { data: emp } = analise
      ? await supabase
          .from("empresas")
          .select("razao_social, cnpj")
          .eq("id", analise.empresa_id)
          .maybeSingle()
      : { data: null };
    empresa = emp;
  }

  if (!t?.nome) {
    const { data: perfil } = await supabase
      .from("profiles")
      .select("tenants(nome, crc, logo_url)")
      .maybeSingle();
    t = perfil?.tenants as { nome?: string; crc?: string; logo_url?: string } | null;
  }

  const optou = (snap?.decisao ?? termo.decisao) === "optar";
  const assinado = termo.assinatura_status === "assinado" || !!termo.assinado_em;
  const trilha = assinado
    ? trilhaEmTexto({
        assinante_nome: termo.assinante_nome,
        assinante_cpf: termo.assinante_cpf,
        assinante_email: termo.assinante_email,
        assinado_em: termo.assinado_em,
        metodo: termo.metodo,
        hash_documento: termo.hash_documento,
        evidencia: termo.evidencia as never,
        carimbo: termo.carimbo as never,
      })
    : [];

  return (
    <div className="doc">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href="/painel" className="text-sm text-accentdeep">← voltar ao cockpit</Link>
        <div className="flex gap-2">
          {!assinado && termo.token && (
            <a
              href={`/assinar/${termo.token}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-sm border border-line px-4 py-2 text-sm font-semibold text-accentdeep"
            >
              Abrir página de assinatura
            </a>
          )}
          <BotaoImprimir rotulo="Imprimir termo" />
        </div>
      </div>

      <FolhaTermo
        empresa={empresa}
        escritorio={t ? { nome: t.nome, crc: t.crc, logo_url: t.logo_url } : null}
        decisao={optou ? "optar" : "permanecer"}
        assinado={assinado}
        assinante_nome={termo.assinante_nome}
        assinado_em={termo.assinado_em}
        hash_documento={termo.hash_documento}
        trilha={trilha}
      />
    </div>
  );
}
