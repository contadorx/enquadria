import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-admin";
import { formatarCnpj } from "@/lib/cnpj";
import { CLAUSULAS_CIENCIA } from "@/lib/esign";
import { decisaoDoSnapshot } from "@/lib/termo";
import { Assinatura } from "@/components/Assinatura";
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


export const dynamic = "force-dynamic";

export default async function AssinarPage({ params }: { params: { token: string } }) {
  const supabase = createAdminClient();

  if (!supabase) {
    return (
      <Casca>
        <div className="rounded border border-line bg-surface p-6 text-center text-[14px] text-slate2">
          Assinatura eletrônica temporariamente indisponível. Peça ao seu contador para tentar novamente em instantes.
        </div>
      </Casca>
    );
  }

  const { data: termo } = await supabase
    .from("termos")
    .select(
      "assinatura_status, decisao, assinante_nome, assinado_em, metodo, hash_documento, analise_id, snapshot"
    )
    .eq("token", params.token)
    .maybeSingle();
  if (!termo) notFound();

  const { data: analise } = await supabase
    .from("analises")
    .select("empresa_id")
    .eq("id", termo.analise_id)
    .maybeSingle();
  const { data: empresa } = analise
    ? await supabase.from("empresas").select("razao_social, cnpj").eq("id", analise.empresa_id).maybeSingle()
    : { data: null };

  /**
   * O LAUDO QUE EMBASA A DECISÃO — anexado ao termo, não citado de memória.
   *
   * O termo pede que o cliente declare ciência de uma escolha tributária com
   * efeito em 2027. Ele estava assinando a conclusão sem poder abrir a conta
   * que levou até ela: o laudo existia, com memória de cálculo completa, e
   * ficava a um e-mail de distância — em outra mensagem, que pode ter caído no
   * spam ou nem ter sido enviada.
   *
   * Ciência sem acesso ao documento é assinatura no escuro, e é exatamente o
   * que um termo de ciência não pode ser.
   */
  // schema-ok: laudos.token é criado pela migration 0028 (alter dinâmico)
  const { data: laudo } = await supabase
    .from("laudos")
    .select("token, numero")
    .eq("analise_id", termo.analise_id)
    .maybeSingle();
  const linkLaudo = laudo?.token ? `/laudo/${laudo.token}` : null;

  /**
   * O QUE A PESSOA ASSINA PRECISA SER O QUE ELA LÊ.
   *
   * A recomendação, o tipo da decisão e o motivo declarado ENTRAM no conteúdo
   * canônico desde 05/08/2026 — ou seja, viram hash. Mostrá-los aqui não é
   * enfeite: sem isso o signatário estaria assinando um documento com trechos
   * que ele não viu, que é a definição de assinatura no escuro.
   */
  const parte = decisaoDoSnapshot(termo.snapshot);

  if (termo.assinatura_status === "assinado") {
    return (
      <Casca>
        <div className="rounded border border-verde bg-verdewash p-6 text-center">
          <h2 className="text-[18px] font-bold text-ink">Termo já assinado</h2>
          <p className="mt-1 text-[13.5px] text-slate2">
            Este termo foi assinado por <b>{termo.assinante_nome}</b>
            {termo.assinado_em ? ` em ${new Date(termo.assinado_em).toLocaleString("pt-BR")}` : ""}.
          </p>
          <p className="mt-3 break-all font-mono text-[10.5px] text-muted">hash: {termo.hash_documento}</p>
          {/*
            Quem volta a este endereço veio buscar o DOCUMENTO — é para cá que
            aponta o botão "guardar uma cópia" do e-mail de confirmação. Antes
            encontrava só o aviso, e a via imprimível ficava atrás do login do
            contador.
          */}
          <a
            href={`/termo/${params.token}`}
            className="mt-4 inline-block rounded-sm bg-ink px-4 py-2.5 text-[13px] font-semibold text-white"
          >
            Abrir e salvar o termo assinado
          </a>
        </div>
      </Casca>
    );
  }

  return (
    <Casca>
      <Assinatura
        token={params.token}
        empresa={empresa?.razao_social ?? "Empresa"}
        cnpj={empresa?.cnpj ? formatarCnpj(empresa.cnpj) : ""}
        /* `sem_decisao` até a assinatura — quem escolhe é quem assina. O
           componente usa este valor só como base para o rótulo enquanto nada
           foi escolhido. */
        decisao={(termo.decisao === "optar" ? "optar" : "permanecer") as "optar" | "permanecer"}
        /* a lista CONGELADA na emissão: é ela que entrou no hash que a pessoa
           está prestes a assinar. Imprimir a constante viva fazia a tela
           mostrar 7 cláusulas sobre um documento cujo hash cobre 4. */
        clausulas={parte.clausulas ?? CLAUSULAS_CIENCIA}
        recomendacao={parte.recomendacao}
        tipoDecisao={parte.tipo_decisao}
        motivo={parte.motivo_divergencia}
        pontos={parte.pontos}
        linkLaudo={parte.laudo_url ?? linkLaudo}
        numeroLaudo={parte.laudo_numero ?? laudo?.numero ?? null}
        hash={termo.hash_documento ?? ""}
      />
    </Casca>
  );
}

function Casca({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg px-4 py-10">
      <div className="mx-auto max-w-[560px]">
        <div className="mb-5 flex items-center gap-2">
          <svg width="26" height="26" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0B1220" /><path d="M20 16h24M20 16v32M20 48h24M20 32h16" stroke="#06B6D4" strokeWidth="5" strokeLinecap="round" fill="none" /><circle cx="46" cy="32" r="4" fill="#06B6D4" /></svg>
          <span className="text-[17px] font-extrabold tracking-tight text-ink">Enquadria</span>
        </div>
        {children}
        <p className="mt-5 text-center text-[11px] text-muted">
          Assinatura eletrônica com validade jurídica (Lei 14.063/2020). Documento e trilha ficam arquivados no dossiê do contador.
        </p>
      </div>
    </div>
  );
}
