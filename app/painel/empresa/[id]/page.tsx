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
      <Link href="/painel" className="text-[12.5px] text-accentdeep">
        ← voltar ao cockpit
      </Link>
      <div className="mt-2">
        <PainelEmpresa empresaId={params.id} modo="pagina" abaInicial="dossie" />
      </div>
    </div>
  );
}
