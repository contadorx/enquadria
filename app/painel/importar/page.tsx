import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { Importador } from "@/components/Importador";

/**
 * A tela muda de nome conforme a carteira já existe ou não.
 *
 * "Importar carteira" numa conta que já tem 143 empresas soa como SUBSTITUIR, e
 * esse medo trava o contador exatamente quando ele deveria adicionar o cliente
 * que entrou esta semana. A gravação sempre foi aditiva (upsert por
 * tenant+CNPJ), mas isso só estava escrito no código — e o que só está no
 * código não tranquiliza ninguém.
 */

export const dynamic = "force-dynamic";

export default async function ImportarPage() {
  const supabase = createClient();
  const { count } = await supabase
    .from("empresas")
    .select("id", { count: "exact", head: true });
  const jaTem = count ?? 0;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[19px] font-bold tracking-tight">
            {jaTem > 0 ? "Adicionar empresas" : "Importar carteira"}
          </h1>
          <p className="mt-0.5 max-w-[68ch] text-[13px] text-muted">
            {jaTem > 0 ? (
              <>
                Sua carteira já tem <b className="text-slate2">{jaTem}</b>{" "}
                {jaTem === 1 ? "empresa" : "empresas"}. O que você subir aqui{" "}
                <b className="text-slate2">soma</b> — nada é apagado. CNPJ que já está lá
                tem os dados atualizados e mantém a análise, o laudo e o termo.
              </>
            ) : (
              "Cole os CNPJs ou suba um CSV. A triagem separa quem precisa decidir até 30/09."
            )}
          </p>
        </div>
        {jaTem > 0 && (
          <Link
            href="/painel"
            className="shrink-0 rounded-sm border border-line px-3 py-2 text-[12.5px] font-semibold text-slate2"
          >
            Voltar ao cockpit
          </Link>
        )}
      </div>
      <div className="mt-5">
        <Importador jaTem={jaTem} />
      </div>
    </div>
  );
}
