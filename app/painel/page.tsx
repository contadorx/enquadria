import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { ROTULO_FAIXA, type Faixa } from "@/lib/triagem";

const ORDEM: Faixa[] = ["MEI", "FORA", "A", "B", "C", "D"];
const COR: Record<Faixa, string> = {
  MEI: "text-neutro",
  FORA: "text-muted",
  A: "text-vermelho",
  B: "text-amarelo",
  C: "text-slate1",
  D: "text-muted",
};

export default async function Painel() {
  const supabase = createClient();
  const { data: empresas } = await supabase.from("empresas").select("faixa");

  const contagem = ORDEM.reduce(
    (acc, f) => ({ ...acc, [f]: 0 }),
    {} as Record<Faixa, number>
  );
  for (const e of empresas ?? []) {
    const f = e.faixa as Faixa | null;
    if (f && f in contagem) contagem[f]++;
  }
  const total = empresas?.length ?? 0;
  const analises = contagem.A + contagem.B;
  const curtos = contagem.C + contagem.D;

  if (total === 0) {
    return (
      <div>
        <h1 className="text-[19px] font-bold tracking-tight">Mapa de risco da carteira</h1>
        <p className="mt-0.5 text-[13px] text-muted">Nenhuma empresa importada ainda.</p>

        <div className="mt-6 rounded border border-dashed border-line bg-surface p-8 text-center">
          <p className="mx-auto max-w-md text-sm text-slate2">
            Importe a carteira e a triagem separa, sem nenhuma pergunta, quem precisa
            decidir sobre o regime híbrido de quem pode ser descartado com segurança.
          </p>
          <Link
            href="/painel/importar"
            className="mt-5 inline-block rounded-sm bg-ink px-4 py-2.5 text-sm font-semibold text-white"
          >
            Importar carteira
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-[19px] font-bold tracking-tight">Mapa de risco da carteira</h1>
      <p className="mt-0.5 text-[13px] text-muted">
        {total} empresas · triagem concluída
      </p>

      <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded border border-linesoft bg-linesoft md:grid-cols-6">
        {ORDEM.map((f) => (
          <div key={f} className="bg-surface p-3.5">
            <div className={`font-mono text-[26px] font-semibold leading-none ${COR[f]}`}>
              {contagem[f]}
            </div>
            <div className="mt-1.5 text-[11.5px] leading-tight text-muted">
              {ROTULO_FAIXA[f]}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-5 rounded border border-[#A5F3FC] bg-accentwash px-4 py-4">
        <p className="max-w-[52ch] text-[13.5px] text-slate2">
          {analises} análises completas e {curtos} laudos curtos. O trabalho de triagem
          que levaria três dias já está feito.
        </p>
        <Link
          href="/painel/carteira"
          className="whitespace-nowrap rounded-sm border border-accentdeep px-3.5 py-2 text-[13px] font-semibold text-accentdeep"
        >
          Ver a fila
        </Link>
      </div>
    </div>
  );
}
