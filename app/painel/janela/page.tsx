import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { Regua } from "@/components/Regua";

const JANELA = { abre: "2026-09-01", fecha: "2026-09-30" };

export default async function Janela() {
  const supabase = createClient();

  const { count: totalAnalise } = await supabase
    .from("empresas")
    .select("id", { count: "exact", head: true })
    .in("faixa", ["A", "B"]);

  const { data: analises } = await supabase
    .from("analises")
    .select("status");

  const { count: laudos } = await supabase
    .from("laudos")
    .select("id", { count: "exact", head: true });

  const { data: termos } = await supabase
    .from("termos")
    .select("assinado_em");

  const fila = totalAnalise ?? 0;
  const emitidos = laudos ?? 0;
  const termosAssinados = (termos ?? []).filter((t) => t.assinado_em).length;
  const semDecisao = Math.max(fila - (analises ?? []).length, 0);

  const pendencias = [
    {
      empresa: "Análises não iniciadas",
      pend: `${semDecisao} empresas da fila ainda sem nenhuma análise`,
      rec: "Analisar",
    },
    {
      empresa: "Laudos sem termo",
      pend: `${Math.max(emitidos - (termos ?? []).length, 0)} laudos emitidos sem termo enviado`,
      rec: "Enviar termo",
    },
    {
      empresa: "Termos sem assinatura",
      pend: `${Math.max((termos ?? []).length - termosAssinados, 0)} termos aguardando assinatura`,
      rec: "Cobrar assinatura",
    },
  ];

  const cards = [
    { n: fila, l: "análises na fila", pct: 100, cor: "bg-accent" },
    { n: emitidos, l: "laudos emitidos", pct: fila ? Math.round((emitidos / fila) * 100) : 0, cor: "bg-accent" },
    { n: termosAssinados, l: "termos assinados", pct: fila ? Math.round((termosAssinados / fila) * 100) : 0, cor: "bg-accent" },
    { n: semDecisao, l: "sem decisão registrada", pct: fila ? Math.round((semDecisao / fila) * 100) : 0, cor: "bg-vermelho" },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[19px] font-bold tracking-tight">Janela de setembro de 2026</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            Efeito no 1º semestre de 2027 · a opção vale por semestre e volta a ser decidida
          </p>
        </div>
        <a
          href="/doc/relatorio"
          target="_blank"
          rel="noreferrer"
          className="rounded-sm border border-line px-4 py-2 text-sm font-semibold text-slate2"
        >
          Exportar relatório do escritório
        </a>
      </div>

      <div className="mt-4 rounded border border-line bg-ink px-4 py-3">
        <Regua abre={JANELA.abre} fecha={JANELA.fecha} />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3.5 md:grid-cols-4">
        {cards.map((c) => (
          <div key={c.l} className="rounded border border-line bg-surface p-3.5">
            <div className={`font-mono text-[22px] font-semibold ${c.cor === "bg-vermelho" ? "text-vermelho" : ""}`}>
              {c.n}
            </div>
            <div className="mt-1 text-[11.5px] text-muted">{c.l}</div>
            <div className="mt-2.5 h-[3px] overflow-hidden rounded-full bg-linesoft">
              <div className={`h-full ${c.cor}`} style={{ width: `${Math.min(c.pct, 100)}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 h-px bg-linesoft" />
      <div className="mt-5 text-[15px] font-bold">O que ainda depende de você</div>
      <table className="mt-3 w-full border-collapse text-[13.5px]">
        <thead>
          <tr>
            {["Frente", "Pendência", ""].map((h) => (
              <th
                key={h}
                className="border-b border-line px-2.5 pb-2 text-left font-mono text-[9.5px] font-medium uppercase tracking-[0.12em] text-muted"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pendencias.map((p) => (
            <tr key={p.empresa}>
              <td className="border-b border-linesoft px-2.5 py-2.5 font-semibold">{p.empresa}</td>
              <td className="border-b border-linesoft px-2.5 py-2.5 text-muted">{p.pend}</td>
              <td className="border-b border-linesoft px-2.5 py-2.5 text-right">
                <Link
                  href="/painel/fila"
                  className="rounded-sm border border-line px-3 py-1.5 text-[12.5px] font-semibold text-slate2"
                >
                  {p.rec}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-5 rounded border border-[#A5F3FC] bg-accentwash px-4 py-4">
        <p className="max-w-[52ch] text-[13.5px] text-slate2">
          A opção vale por semestre: a decisão volta. Quando o ICMS e o ISS começarem a sair do
          DAS, a conta vira para vários destes clientes — e você já terá o histórico deles aqui
          dentro. A <b>Revisão da carteira</b> mostra quem muda a cada novo parâmetro.
        </p>
        <Link
          href="/painel/revisao"
          className="whitespace-nowrap rounded-sm border border-accentdeep px-3.5 py-2 text-[13px] font-semibold text-accentdeep"
        >
          Ver a revisão
        </Link>
      </div>
    </div>
  );
}
