import { Abas } from "@/components/Abas";
import { ABAS_ESTUDOS } from "@/lib/nav";
import { Comparativo } from "@/components/Comparativo";

/**
 * COMPARATIVO DE REGIMES, AVULSO — onde ele tinha se perdido.
 *
 * O comparativo existe desde sempre, mas só DENTRO do dossiê de uma empresa da
 * carteira. Consequência prática: para responder "vale a pena sair do Simples?"
 * de um prospecto, era preciso primeiro cadastrar uma empresa que não é
 * cliente — e ninguém faz isso no meio de uma conversa.
 *
 * A rota da API sempre aceitou `empresa_id: null`; o que faltava era a porta.
 * Aqui está ela, ao lado do estudo de abertura: os dois serviços que atendem
 * quem ainda não está na carteira.
 *
 * Dentro da empresa o comparativo CONTINUA existindo, já preenchido com o
 * anexo e a receita dela — lá o valor é não redigitar o que o sistema sabe.
 */
export const dynamic = "force-dynamic";

export default function Estudos() {
  return (
    <div>
      <Abas itens={ABAS_ESTUDOS} />
      <h1 className="text-[19px] font-bold tracking-tight">Comparativo de regimes</h1>
      <p className="mt-0.5 max-w-[76ch] text-[13px] leading-relaxed text-muted">
        Simples, híbrido, Presumido e Real lado a lado, no mundo IBS/CBS. Sem precisar cadastrar a
        empresa — use para responder o prospecto na hora. Para uma empresa da carteira, abra o
        dossiê dela: o comparativo já vem preenchido com o anexo e a receita.
      </p>

      <div className="mt-5">
        <Comparativo empresaId={null} nome="Cenário avulso" anexoInicial={null} receitaInicial={null} />
      </div>
    </div>
  );
}
