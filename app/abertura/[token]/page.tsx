import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-admin";
import { FolhaAbertura } from "@/components/FolhaAbertura";
import type { EstudoAbertura } from "@/lib/abertura";
import type { Escritorio } from "@/lib/escritorio";
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
 * O ESTUDO NO ENDEREÇO DO PROSPECTO.
 *
 * Este é o único documento do produto cujo destinatário NÃO É CLIENTE de
 * ninguém ainda: é quem pediu uma opinião sobre abrir empresa. Exigir cadastro
 * para ler o estudo que deveria conquistá-lo seria perder o cliente na porta.
 *
 * Token de leitura, consulta por `token` e nunca por `id`, conteúdo vindo do
 * snapshot congelado na emissão — as mesmas regras do laudo público.
 */
export const dynamic = "force-dynamic";

export default async function AberturaPublica({ params }: { params: { token: string } }) {
  const supabase = createAdminClient();
  if (!supabase) return <Indisponivel />;

  const { data: doc } = await supabase
    .from("aberturas")
    .select("numero, emitido_em, nome_negocio, responsavel, resultado, escritorio")
    .eq("token", params.token)
    .maybeSingle();
  if (!doc) notFound();

  return (
    <FolhaAbertura
      publico
      dados={{
        numero: doc.numero as number,
        emitido_em: doc.emitido_em as string,
        nome_negocio: doc.nome_negocio as string,
        responsavel: (doc.responsavel as string | null) ?? null,
        estudo: doc.resultado as unknown as EstudoAbertura,
        escritorio: (doc.escritorio as Escritorio | null) ?? null,
      }}
    />
  );
}

function Indisponivel() {
  return (
    <div className="mx-auto max-w-[560px] px-4 py-16 text-center text-[14px] text-slate2">
      Estudo temporariamente indisponível. Tente de novo em instantes ou peça o arquivo ao seu
      contador.
    </div>
  );
}
