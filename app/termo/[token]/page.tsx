import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-admin";
import { BotaoImprimir } from "@/components/BotaoImprimir";
import { FolhaTermo } from "@/components/FolhaTermo";
import { trilhaEmTexto } from "@/lib/esign";
import { decisaoDoSnapshot } from "@/lib/termo";
import type { Metadata } from "next";

/**
 * NOINDEX NA PRÓPRIA PÁGINA — 08/08/2026.
 *
 * Esta rota serve documento com razão social, CNPJ, RBT12 e recomendação
 * tributária de um cliente de terceiro. A proteção era só o `Disallow` do
 * robots.txt (que impede rastrear, não impede indexar uma URL descoberta por
 * link ou referer) mais o `X-Robots-Tag` do middleware — que só é injetado
 * quando o host é o `app.`. As mesmas URLs respondem no domínio de ápice sem
 * cabeçalho nenhum. `/coleta` e `/certificado` já declaravam; estas cinco não,
 * e a regra escrita em app/robots.ts é LGPD antes de SEO.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };


/**
 * O TERMO ASSINADO NO ENDEREÇO DO CLIENTE.
 *
 * POR QUE ESTA PÁGINA EXISTE. O e-mail de confirmação da assinatura tem um
 * botão escrito "Guardar uma cópia do termo" — e ele levava para
 * `/assinar/[token]`, que, depois de assinado, mostra um aviso verde com o
 * hash. Aviso não é cópia. Quem assinou ficava com a promessa de um documento
 * que nunca conseguiu abrir, e a única via imprimível estava atrás do login do
 * contador, isto é, na mão da outra parte.
 *
 * Termo de ciência serve exatamente para o dia em que alguém questiona a
 * decisão. Nesse dia, prova que só uma das partes consegue imprimir vale pouco.
 *
 * O TOKEN É A CHAVE, de leitura, igual ao laudo público: UUID de 122 bits,
 * consulta por `token` e nunca por `id`, sem caminho para enumerar. E o
 * conteúdo vem do SNAPSHOT congelado na emissão — o que a pessoa imprime hoje é
 * o que ela leu na hora de assinar, mesmo que o escritório troque de logo ou a
 * empresa mude de razão social depois.
 *
 * PDF: impressão do navegador ("Salvar como PDF"). Gerar o arquivo no servidor
 * acrescentaria uma dependência de render para produzir a MESMA folha — e o
 * que dá validade ao documento é o hash + a trilha, que já estão impressos
 * nela, não o programa que desenhou a página.
 */

export const dynamic = "force-dynamic";

export default async function TermoPublico({ params }: { params: { token: string } }) {
  const supabase = createAdminClient();
  if (!supabase) return <Indisponivel />;

  const { data: termo } = await supabase
    .from("termos")
    .select(
      "decisao, assinante_nome, assinante_cpf, assinante_email, assinado_em, assinatura_status, metodo, hash_documento, evidencia, carimbo, analise_id, snapshot"
    )
    .eq("token", params.token)
    .maybeSingle();
  if (!termo) notFound();

  const assinado = termo.assinatura_status === "assinado" || !!termo.assinado_em;

  // ainda não assinado: o lugar certo é a página de assinatura, não uma folha
  // "aguardando" que o cliente não sabe o que fazer com
  if (!assinado) redirect(`/assinar/${params.token}`);

  const snap = termo.snapshot as {
    decisao?: "optar" | "permanecer";
    empresa?: { razao_social?: string; cnpj?: string };
    escritorio?: { nome?: string; crc?: string; logo_url?: string };
  } | null;

  let empresa: { razao_social?: string | null; cnpj?: string | null } | null = snap?.empresa ?? null;
  let escritorio: { nome?: string | null; crc?: string | null; logo_url?: string | null } | null =
    snap?.escritorio ?? null;

  // termos antigos, emitidos antes do snapshot: monta na hora
  if (!empresa || !escritorio?.nome) {
    const { data: analise } = await supabase
      .from("analises")
      .select("empresa_id, tenant_id")
      .eq("id", termo.analise_id)
      .maybeSingle();

    if (!empresa && analise) {
      const { data: emp } = await supabase
        .from("empresas")
        .select("razao_social, cnpj")
        .eq("id", analise.empresa_id)
        .maybeSingle();
      empresa = emp;
    }
    if (!escritorio?.nome && analise?.tenant_id) {
      const { data: tenant } = await supabase
        .from("tenants")
        .select("nome, crc, logo_url")
        .eq("id", analise.tenant_id)
        .maybeSingle();
      escritorio = tenant;
    }
  }

  /* a via do cliente lê o MESMO snapshot que o dossiê do contador — duas partes
     lendo folhas diferentes seria pior que folha nenhuma */
  const parte = decisaoDoSnapshot(termo.snapshot);

  const trilha = trilhaEmTexto({
    assinante_nome: termo.assinante_nome,
    assinante_cpf: termo.assinante_cpf,
    assinante_email: termo.assinante_email,
    assinado_em: termo.assinado_em,
    metodo: termo.metodo,
    hash_documento: termo.hash_documento,
    evidencia: termo.evidencia as never,
    carimbo: termo.carimbo as never,
  });

  return (
    <div className="doc">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[46ch] text-[12.5px] leading-relaxed text-muted">
          Esta é a sua via do termo assinado. Guarde o link ou salve em PDF pelo botão ao lado
          (na janela de impressão, escolha <b>Salvar como PDF</b>).
        </p>
        <BotaoImprimir rotulo="Salvar em PDF / imprimir" />
      </div>

      <FolhaTermo
        empresa={empresa}
        escritorio={escritorio}
        decisao={(snap?.decisao ?? termo.decisao ?? "permanecer") as "optar" | "permanecer"}
        recomendacao={parte.recomendacao}
        tipo_decisao={parte.tipo_decisao}
        motivo_divergencia={parte.motivo_divergencia}
        pontos={parte.pontos}
        clausulas={parte.clausulas}
        laudo_url={parte.laudo_url}
        laudo_numero={parte.laudo_numero}
        assinado
        assinante_nome={termo.assinante_nome}
        assinado_em={termo.assinado_em}
        hash_documento={termo.hash_documento}
        trilha={trilha}
      />
    </div>
  );
}

function Indisponivel() {
  return (
    <div className="mx-auto max-w-[560px] px-4 py-16 text-center text-[14px] text-slate2">
      Documento temporariamente indisponível. Tente de novo em instantes ou peça o arquivo ao seu
      contador.
    </div>
  );
}
