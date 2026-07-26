import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import {
  atingidas,
  ordenar,
  diasPara,
  COR_SEVERIDADE,
  ROTULO_SEVERIDADE,
  type ItemRadar,
  type EmpresaRadar,
} from "@/lib/radar";
import { MarcarLido } from "@/components/MarcarLido";

/**
 * RADAR DA TRANSIÇÃO — o pulso mensal.
 *
 * A notícia sozinha não vale nada: todo mundo recebe newsletter. O que o
 * contador precisa é da tradução — "isto atinge ESTES 12 clientes seus". É essa
 * ponte que transforma mudança de norma em motivo de contato e em revisão
 * cobrável, e que dá razão para ele abrir o app fora da janela.
 */

export const dynamic = "force-dynamic";

export default async function Radar() {
  const supabase = createClient();
  const hoje = new Date().toISOString().slice(0, 10);

  const { data: itensRaw, error } = await supabase
    .from("radar_itens")
    .select("id, titulo, resumo, o_que_fazer, fonte, publicado_em, vigencia_em, severidade, criterio")
    .eq("ativo", true);

  const { data: empresasRaw } = await supabase
    .from("empresas")
    .select("id, razao_social, cnpj, anexo, faixa, cnae_principal");

  const { data: analises } = await supabase.from("analises").select("empresa_id, saida");
  const porEmpresa = new Map((analises ?? []).map((a) => [a.empresa_id, a.saida]));

  const { data: leituras } = await supabase.from("radar_leituras").select("item_id");
  const lidos = new Set((leituras ?? []).map((l) => l.item_id));

  const empresas: EmpresaRadar[] = (empresasRaw ?? []).map((e) => ({
    id: e.id,
    razao_social: e.razao_social,
    cnpj: e.cnpj,
    anexo: e.anexo,
    faixa: e.faixa,
    cnae_principal: e.cnae_principal,
    saida: porEmpresa.get(e.id) ?? null,
    tem_analise: porEmpresa.has(e.id),
  }));

  if (error) {
    return (
      <div>
        <h1 className="text-[19px] font-bold tracking-tight">Radar da transição</h1>
        <div className="mt-5 rounded border border-amarelo bg-amarelowash px-4 py-3.5 text-[13.5px] text-slate2">
          O radar ainda não está disponível neste workspace. Se a mensagem mencionar
          <span className="font-mono"> radar_itens</span>, a migration 0011 ainda não foi aplicada no banco.
        </div>
      </div>
    );
  }

  const itens = ordenar((itensRaw ?? []) as unknown as ItemRadar[], hoje);

  return (
    <div>
      <div>
        <h1 className="text-[19px] font-bold tracking-tight">Radar da transição</h1>
        <p className="mt-0.5 text-[13px] text-muted">
          O que muda até 2033 e, principalmente, quais clientes seus são atingidos
        </p>
      </div>

      {itens.length === 0 ? (
        <div className="mt-6 rounded border border-dashed border-line bg-surface p-8 text-center text-sm text-slate2">
          Nenhum marco cadastrado ainda.
        </div>
      ) : (
        <div className="mt-5 space-y-3.5">
          {itens.map((item) => {
            const alvo = atingidas(item, empresas);
            const dias = diasPara(item.vigencia_em, hoje);
            const vigente = dias != null && dias <= 0;
            const lido = lidos.has(item.id);
            const novo = alvo.length > 0 && !lido;

            return (
              <div
                key={item.id}
                className={`rounded border bg-surface p-4 shadow-card ${
                  novo ? "border-accent" : "border-line"
                } ${lido ? "opacity-70" : ""}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {novo && (
                        <span className="rounded-full bg-accent px-2 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[#04212B]">
                          novo
                        </span>
                      )}
                      <span
                        className={`font-mono text-[9.5px] uppercase tracking-[0.14em] ${
                          COR_SEVERIDADE[item.severidade] ?? "text-muted"
                        }`}
                      >
                        {ROTULO_SEVERIDADE[item.severidade] ?? item.severidade}
                      </span>
                      {item.vigencia_em && (
                        <span className="font-mono text-[10.5px] text-muted">
                          · {vigente ? "em vigor desde" : "a partir de"}{" "}
                          {new Date(item.vigencia_em).toLocaleDateString("pt-BR")}
                          {dias != null && dias > 0 && dias <= 120 && (
                            <span className="text-accentdeep"> · faltam {dias} dias</span>
                          )}
                        </span>
                      )}
                    </div>
                    <h2 className="mt-1 text-[15.5px] font-bold leading-snug">{item.titulo}</h2>
                  </div>

                  <div className="shrink-0 text-right">
                    <div
                      className={`font-mono text-[24px] font-semibold leading-none ${
                        alvo.length ? "text-accentdeep" : "text-muted"
                      }`}
                    >
                      {alvo.length}
                    </div>
                    <div className="mt-0.5 text-[10.5px] text-muted">
                      {alvo.length === 1 ? "cliente atingido" : "clientes atingidos"}
                    </div>
                  </div>
                </div>

                <p className="mt-2 max-w-[80ch] text-[13.5px] text-slate2">{item.resumo}</p>

                {item.o_que_fazer && (
                  <p className="mt-2 rounded-sm bg-accentwash px-3 py-2 text-[13px] text-accentdeep">
                    <b>O que fazer:</b> {item.o_que_fazer}
                  </p>
                )}

                {alvo.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {alvo.slice(0, 8).map((e) => (
                      <Link
                        key={e.id}
                        href={`/painel/empresa/${e.id}`}
                        className="rounded-full border border-line px-2.5 py-1 text-[11.5px] text-slate2 hover:border-accent hover:text-accentdeep"
                      >
                        {e.razao_social}
                      </Link>
                    ))}
                    {alvo.length > 8 && (
                      <span className="self-center font-mono text-[11px] text-muted">
                        + {alvo.length - 8}
                      </span>
                    )}
                  </div>
                )}

                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                  {item.fonte ? (
                    <p className="font-mono text-[10.5px] text-muted">fonte: {item.fonte}</p>
                  ) : (
                    <span />
                  )}
                  {alvo.length > 0 && <MarcarLido itemId={item.id} lido={lido} />}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-5 max-w-[80ch] text-[11.5px] leading-relaxed text-muted">
        O radar aponta o que mudou e quem é afetado, para orientar a conversa com o cliente. A
        análise de cada empresa e a responsabilidade técnica continuam sendo do contador.
      </p>
    </div>
  );
}
