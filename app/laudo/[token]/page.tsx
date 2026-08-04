import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-admin";
import type { Escritorio } from "@/lib/escritorio";
import { LaudoFolha } from "@/components/LaudoFolha";
import type { AnaliseGravada } from "@/lib/laudo";

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
    .select("numero, emitido_em, analise_id, snapshot")
    .eq("token", params.token)
    .maybeSingle();
  if (!laudo) notFound();

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
