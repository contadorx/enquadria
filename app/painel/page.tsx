import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { MapaRisco } from "@/components/MapaRisco";
import type { Faixa } from "@/lib/triagem";
import type { ContagemFaixas } from "@/lib/potencial";

const ORDEM: Faixa[] = ["A", "B", "C", "D", "MEI", "FORA"];

export default async function Painel() {
  const supabase = createClient();
  const { data: empresas } = await supabase.from("empresas").select("faixa");
  const { count: comLaudo } = await supabase
    .from("laudos")
    .select("id", { count: "exact", head: true });

  const contagem = ORDEM.reduce(
    (acc, f) => ({ ...acc, [f]: 0 }),
    {} as ContagemFaixas
  );
  for (const e of empresas ?? []) {
    const f = e.faixa as Faixa | null;
    if (f && f in contagem) contagem[f]++;
  }
  const total = empresas?.length ?? 0;

  if (total === 0) {
    return (
      <div>
        <h1 className="text-[19px] font-bold tracking-tight">Mapa de risco da carteira</h1>
        <p className="mt-0.5 text-[13px] text-muted">Nenhuma empresa importada ainda.</p>

        <div className="mt-6 rounded border border-line bg-surface p-8 shadow-card">
          <div className="mx-auto max-w-md text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accentwash text-accentdeep">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 16V4M7 9l5-5 5 5M4 20h16" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 className="text-[16px] font-bold text-ink">Comece pela sua carteira</h2>
            <p className="mt-1.5 text-[13.5px] text-slate2">
              Suba um CSV com CNPJ e razão social. Em segundos você vê quantos clientes precisam
              decidir até 30 de setembro — e quanto isso vale em honorário.
            </p>
          </div>

          <div className="mx-auto mt-6 grid max-w-lg gap-2.5">
            {[
              ["1", "Importe a carteira", "Aceita a exportação do seu sistema, sem formato rígido."],
              ["2", "Veja o mapa de risco", "A triagem elimina 60-80% da base sozinha."],
              ["3", "Emita laudo e termo", "Papel cobrável com a sua marca."],
            ].map(([n, t, d]) => (
              <div key={n} className="flex items-start gap-3 rounded-sm border border-linesoft bg-surface2 px-3.5 py-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-[11px] text-white">
                  {n}
                </span>
                <div>
                  <div className="text-[13px] font-semibold">{t}</div>
                  <div className="text-[12px] text-muted">{d}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 text-center">
            <Link
              href="/painel/importar"
              className="inline-block rounded-sm bg-ink px-5 py-2.5 text-sm font-semibold text-white"
            >
              Importar carteira
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-[19px] font-bold tracking-tight">Mapa de risco da carteira</h1>
        <p className="mt-0.5 text-[13px] text-muted">{total} empresas · triagem concluída</p>
      </div>
      <MapaRisco contagem={contagem} comLaudo={comLaudo ?? 0} />
    </div>
  );
}
