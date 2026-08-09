import Link from "next/link";
import { PainelEmpresa } from "@/components/PainelEmpresa";

/**
 * O DOSSIÊ COMO PÁGINA — só para o link direto.
 *
 * O caminho normal é a gaveta que abre sobre a fila: ver o dossiê não pode
 * custar sair do trabalho. Esta rota continua existindo porque links diretos
 * (e-mail, digest, favorito) precisam abrir em algum lugar — e o conteúdo é
 * exatamente o mesmo componente, não uma segunda montagem do mesmo dossiê.
 */
export default function Empresa({ params }: { params: { id: string } }) {
  return (
    <div>
      {/* O CAMINHO DE VOLTA COM CONTEXTO — 08/08/2026.
          Esta rota não monta a Trilha nem o Empurrão (os dois vivem dentro do
          Cockpit) e a bolha do assistente não tinha regra para ela: era a única
          tela de trabalho do produto sem nenhum orientador. Quem chega por link
          de e-mail via a ficha de uma empresa e nada sobre onde ela está na
          esteira. A regra agora existe em `lib/passos.ts`; esta linha é a parte
          que não depende de o assistente estar ligado. */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Link href="/painel" className="text-[12.5px] text-accentdeep">
          ← voltar ao cockpit
        </Link>
        <span className="text-[11.5px] text-muted">
          Você abriu uma empresa por link direto. A fila de trabalho está no cockpit.
        </span>
      </div>
      <div className="mt-2">
        <PainelEmpresa empresaId={params.id} modo="pagina" abaInicial="dossie" />
      </div>
    </div>
  );
}
