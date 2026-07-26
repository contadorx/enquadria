import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { MapaRisco } from "@/components/MapaRisco";
import { Trilha } from "@/components/Trilha";
import type { Faixa } from "@/lib/triagem";
import type { ContagemFaixas } from "@/lib/potencial";
import { atingidas, ordenar, type ItemRadar, type EmpresaRadar } from "@/lib/radar";

const ORDEM: Faixa[] = ["A", "B", "C", "D", "MEI", "FORA"];

/** quantos marcos da transição atingem clientes desta carteira */
async function impactoDoRadar(
  supabase: ReturnType<typeof createClient>
): Promise<{ marcos: number; naoLidos: number; clientes: number; titulo: string | null }> {
  const { data: itens, error } = await supabase
    .from("radar_itens")
    .select("id, titulo, resumo, o_que_fazer, fonte, publicado_em, vigencia_em, severidade, criterio")
    .eq("ativo", true);
  if (error || !itens?.length) return { marcos: 0, naoLidos: 0, clientes: 0, titulo: null };

  const { data: emp } = await supabase
    .from("empresas")
    .select("id, razao_social, cnpj, anexo, faixa, cnae_principal");
  const { data: an } = await supabase.from("analises").select("empresa_id, saida");
  const porEmpresa = new Map((an ?? []).map((a) => [a.empresa_id, a.saida]));

  const empresas: EmpresaRadar[] = (emp ?? []).map((e) => ({
    id: e.id,
    razao_social: e.razao_social,
    cnpj: e.cnpj,
    anexo: e.anexo,
    faixa: e.faixa,
    cnae_principal: e.cnae_principal,
    saida: porEmpresa.get(e.id) ?? null,
    tem_analise: porEmpresa.has(e.id),
  }));

  const { data: leituras } = await supabase.from("radar_leituras").select("item_id");
  const lidos = new Set((leituras ?? []).map((l) => l.item_id));

  const hoje = new Date().toISOString().slice(0, 10);
  const ordenados = ordenar(itens as unknown as ItemRadar[], hoje);
  const afetados = new Set<string>();
  let marcos = 0;
  let naoLidos = 0;
  let titulo: string | null = null;

  for (const item of ordenados) {
    const alvo = atingidas(item, empresas);
    if (alvo.length > 0) {
      marcos++;
      if (!lidos.has(item.id)) {
        naoLidos++;
        // o destaque é sempre a novidade, não o item mais antigo já lido
        if (!titulo) titulo = item.titulo;
      }
      alvo.forEach((e) => afetados.add(e.id));
    }
  }
  return { marcos, naoLidos, clientes: afetados.size, titulo };
}

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

  const radar = await impactoDoRadar(supabase);

  // estado da trilha de ativação
  const { count: nAnalises } = await supabase
    .from("analises")
    .select("id", { count: "exact", head: true });
  const { data: termosT } = await supabase
    .from("termos")
    .select("assinatura_status, assinado_em");
  const assinados = (termosT ?? []).filter(
    (x) => x.assinatura_status === "assinado" || x.assinado_em
  ).length;

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-[19px] font-bold tracking-tight">Mapa de risco da carteira</h1>
        <p className="mt-0.5 text-[13px] text-muted">{total} empresas · triagem concluída</p>
      </div>

      <Trilha
        estado={{
          empresas: total,
          analises: nAnalises ?? 0,
          laudos: comLaudo ?? 0,
          termos: (termosT ?? []).length,
          assinados,
          fila: contagem.A + contagem.B,
        }}
      />

      <MapaRisco contagem={contagem} comLaudo={comLaudo ?? 0} />

      {/* NOTIFICAÇÃO POR IMPACTO — só aparece quando atinge cliente seu */}
      {radar.clientes > 0 && (
        <Link
          href="/painel/radar"
          className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded border border-line bg-surface px-4 py-3.5 shadow-card hover:border-accent"
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accentwash text-accentdeep">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 19V5M4 19h16M8 15l3-4 3 2 4-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                {radar.naoLidos > 0 && (
                  <span className="rounded-full bg-accent px-2 py-0.5 font-mono text-[10px] font-semibold text-[#04212B]">
                    {radar.naoLidos} {radar.naoLidos === 1 ? "novidade" : "novidades"}
                  </span>
                )}
                <span className="text-[13.5px] font-semibold">
                  {radar.marcos} {radar.marcos === 1 ? "marco da transição atinge" : "marcos da transição atingem"}{" "}
                  <span className="text-accentdeep">{radar.clientes}</span>{" "}
                  {radar.clientes === 1 ? "cliente seu" : "clientes seus"}
                </span>
              </div>
              {radar.titulo && (
                <div className="mt-0.5 text-[12.5px] text-muted">Ainda não lido: {radar.titulo}</div>
              )}
            </div>
          </div>
          <span className="whitespace-nowrap rounded-sm border border-accentdeep px-3.5 py-2 text-[13px] font-semibold text-accentdeep">
            Ver o radar
          </span>
        </Link>
      )}
    </div>
  );
}
