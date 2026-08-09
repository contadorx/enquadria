import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-admin";
import type { Escritorio } from "@/lib/escritorio";
import { LaudoFolha } from "@/components/LaudoFolha";
import type { AnaliseGravada } from "@/lib/laudo";
import type { Metadata } from "next";
import { situacaoDoLink } from "@/lib/token-validade";
import { LinkEncerrado } from "@/components/LinkEncerrado";

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
 * O LAUDO NO ENDEREÇO DO CLIENTE.
 *
 * POR QUE ESTA PÁGINA EXISTE. `/doc/laudo/[id]` lê com o cliente do USUÁRIO e
 * exige sessão: mandar aquele link ao cliente o levaria a uma tela de login.
 * Enquanto isso, o laudo — o entregável que sustenta o honorário — nunca saía
 * do painel. O produto parava um passo antes do próprio desfecho.
 *
 * O TOKEN É A CHAVE, e só de leitura. Mesma escolha da coleta e do termo: pedir
 * cadastro ao dono da empresa para ler o documento que ele pagou é garantir que
 * ele não leia. O endereço é um UUID (122 bits) e o conteúdo é o snapshot
 * CONGELADO na emissão — não há nada aqui que o portador possa alterar.
 *
 * O CLIENTE VÊ O LAUDO INTEIRO, com a memória de cálculo. Entregar uma versão
 * resumida "para não assustar" esvaziaria justamente a peça que faz o documento
 * valer quatro dígitos e sobreviver a uma pergunta do Fisco.
 *
 * Lê pelo cliente de SERVIÇO porque não há sessão — o token é a autorização.
 * Repare que a consulta é por `token`, nunca por `id`: não existe caminho aqui
 * para enumerar laudos.
 */

export const dynamic = "force-dynamic";

export default async function LaudoPublico({ params }: { params: { token: string } }) {
  const supabase = createAdminClient();
  if (!supabase) return <Indisponivel />;

  const { data: laudo } = await supabase
    .from("laudos")
    .select("numero, emitido_em, analise_id, snapshot, token_expira_em, revogado_em")
    .eq("token", params.token)
    .maybeSingle();
  if (!laudo) notFound();

  /* O LINK TEM PRAZO — 08/08/2026. Antes da migration 0068 nenhum documento por
     token tinha validade nem revogação: um endereço reencaminhado abria CNPJ e
     receita de um cliente de terceiro anos depois. `notFound()` seria a resposta
     errada aqui — o documento existe; o que acabou foi o acesso por este link. */
  const situacao = situacaoDoLink(laudo);
  if (situacao !== "valido") return <LinkEncerrado motivo={situacao} tipo="laudo" />;

  const snap = laudo.snapshot as {
    analise?: Record<string, unknown>;
    empresa?: {
      razao_social?: string;
      cnpj?: string;
      anexo?: number;
      regime?: string;
      faixa?: string;
      motivo_triagem?: string;
    };
    escritorio?: Escritorio;
  } | null;

  /**
   * SEM SNAPSHOT, NÃO ABRE. Na rota do contador dá para recompor do estado atual
   * da análise, porque quem está olhando é quem produziu. Aqui não: recompor ao
   * vivo faria o cliente ver um documento diferente do que foi emitido, e o
   * laudo é prova — prova que muda sozinha não é prova. Laudo antigo demais
   * para ter snapshot se resolve reemitindo, com número novo e data nova.
   */
  if (!snap?.analise) notFound();

  return (
    <LaudoFolha
      dados={{
        numero: laudo.numero,
        emitido_em: laudo.emitido_em,
        analise: snap.analise as unknown as AnaliseGravada,
        empresa: snap.empresa ?? null,
        escritorio: snap.escritorio ?? null,
      }}
      publico
    />
  );
}

function Indisponivel() {
  return (
    <div className="mx-auto max-w-lg p-10 text-center">
      <p className="text-[14px] text-slate2">
        Documento temporariamente indisponível. Peça ao seu contador para reenviar o link em
        instantes.
      </p>
    </div>
  );
}
