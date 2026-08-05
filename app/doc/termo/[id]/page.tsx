import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { COLUNAS_ESCRITORIO, type Escritorio } from "@/lib/escritorio";
import { comResponsavel } from "@/lib/escritorio-server";
import { BotaoImprimir } from "@/components/BotaoImprimir";
import { FolhaTermo } from "@/components/FolhaTermo";
import { trilhaEmTexto } from "@/lib/esign";
import { decisaoDoSnapshot } from "@/lib/termo";

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
    escritorio?: Escritorio;
  } | null;

  let empresa: { razao_social?: string; cnpj?: string } | null = snap?.empresa ?? null;
  let t: Escritorio | null = snap?.escritorio ?? null;

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
    /**
     * `.maybeSingle()` sem filtro de id só funciona em escritório de UMA
     * pessoa: com equipe, a RLS devolve os colegas também, a consulta erra por
     * "múltiplas linhas" e o documento sai com o cabeçalho genérico. O filtro
     * pelo próprio usuário é o que faltava.
     */
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: perfil } = await supabase
      .from("profiles")
      .select(`tenant_id, tenants(${COLUNAS_ESCRITORIO})`)
      .eq("id", user?.id ?? "")
      .maybeSingle();
    t = await comResponsavel(
      supabase,
      (perfil?.tenants as Escritorio | null) ?? null,
      (perfil?.tenant_id as string | null) ?? null
    );
  }

  /* recomendação, pontos e decisão saem do que foi CONGELADO na emissão —
     recalcular aqui faria o termo de agosto mudar de texto em outubro */
  const parte = decisaoDoSnapshot(termo.snapshot);

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
        recomendacao={parte.recomendacao}
        tipo_decisao={parte.tipo_decisao}
        motivo_divergencia={parte.motivo_divergencia}
        pontos={parte.pontos}
        laudo_url={parte.laudo_url}
        laudo_numero={parte.laudo_numero}
        assinado={assinado}
        assinante_nome={termo.assinante_nome}
        assinado_em={termo.assinado_em}
        hash_documento={termo.hash_documento}
        trilha={trilha}
      />
    </div>
  );
}
