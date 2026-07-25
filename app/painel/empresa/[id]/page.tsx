import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { formatarCnpj } from "@/lib/cnpj";
import { pct, moeda, SAIDAS, type Saida } from "@/lib/motor";
import { ROTULO_FAIXA, type Faixa } from "@/lib/triagem";
import { premissasEmTexto, baseDeCalculo, type AnaliseGravada } from "@/lib/laudo";
import { trilhaEmTexto } from "@/lib/esign";

/**
 * DOSSIÊ DA EMPRESA — o cofre.
 *
 * Reúne numa tela só o que hoje estava espalhado: cadastro, triagem, análise,
 * laudo e termo com a trilha da assinatura. É o que o contador abre no dia em
 * que o cliente (ou o Fisco) pergunta "e aí, o que foi decidido e por quê?".
 */

const COR_FAIXA: Record<string, string> = {
  A: "bg-vermelhowash text-vermelho",
  B: "bg-amarelowash text-amarelo",
  C: "bg-verdewash text-verde",
  D: "bg-neutrowash text-muted",
  MEI: "bg-neutrowash text-neutro",
  FORA: "bg-neutrowash text-muted",
};

const COR_SAIDA: Record<string, string> = {
  vermelho: "bg-vermelho",
  amarelo: "bg-amarelo",
  neutro: "bg-neutro",
  verde: "bg-verde",
};

function Bloco({ titulo, children, acao }: { titulo: string; children: React.ReactNode; acao?: React.ReactNode }) {
  return (
    <div className="rounded border border-line bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">{titulo}</div>
        {acao}
      </div>
      {children}
    </div>
  );
}

function Vazio({ texto, cta }: { texto: string; cta?: React.ReactNode }) {
  return (
    <div className="rounded-sm border border-dashed border-line px-3 py-4 text-center">
      <p className="text-[12.5px] text-muted">{texto}</p>
      {cta && <div className="mt-2.5">{cta}</div>}
    </div>
  );
}

export default async function Dossie({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: empresa } = await supabase
    .from("empresas")
    .select("id, cnpj, razao_social, cnae_principal, porte, situacao, regime, anexo, rbt12, faixa, motivo_triagem, prioridade_maxima, fonte_dados")
    .eq("id", params.id)
    .maybeSingle();
  if (!empresa) notFound();

  const { data: analise } = await supabase
    .from("analises")
    .select("id, rq, ch, cl, re, fc, saida, prioridade, respostas, calculado_em, parametros, status")
    .eq("empresa_id", params.id)
    .maybeSingle();

  const { data: laudo } = analise
    ? await supabase
        .from("laudos")
        .select("id, numero, emitido_em")
        .eq("analise_id", analise.id)
        .maybeSingle()
    : { data: null };

  const { data: termo } = analise
    ? await supabase
        .from("termos")
        .select("id, token, decisao, assinatura_status, assinante_nome, assinante_cpf, assinante_email, assinado_em, metodo, hash_documento, evidencia, carimbo")
        .eq("analise_id", analise.id)
        .maybeSingle()
    : { data: null };

  const a = analise as unknown as AnaliseGravada | null;
  const faixa = (empresa.faixa ?? "C") as Faixa;
  const saida = a?.saida ? SAIDAS[a.saida as Saida] : null;
  const premissas = a ? premissasEmTexto(a.respostas) : [];
  const base = a ? baseDeCalculo(a) : [];
  const assinado = termo?.assinatura_status === "assinado" || !!termo?.assinado_em;
  const trilha = assinado && termo ? trilhaEmTexto(termo as never) : [];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/painel/fila" className="text-[12.5px] text-accentdeep">← voltar à fila</Link>
          <h1 className="mt-1 text-[19px] font-bold tracking-tight">{empresa.razao_social}</h1>
          <p className="mt-0.5 font-mono text-[12px] text-muted">
            {formatarCnpj(empresa.cnpj)}
            {empresa.cnae_principal ? ` · CNAE ${empresa.cnae_principal}` : ""}
            {empresa.anexo ? ` · Anexo ${empresa.anexo}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/painel/comparativo?empresa=${empresa.id}`}
            className="rounded-sm border border-line px-4 py-2.5 text-sm font-semibold text-slate2"
          >
            Comparar regimes
          </Link>
          <Link
            href={`/painel/motor?empresa=${empresa.id}`}
            className="rounded-sm bg-ink px-4 py-2.5 text-sm font-semibold text-white"
          >
            {a ? "Rever análise" : "Analisar"}
          </Link>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_1fr]">
        {/* CADASTRO E TRIAGEM */}
        <Bloco titulo="Cadastro e triagem">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${COR_FAIXA[faixa]}`}>
              {ROTULO_FAIXA[faixa]}
            </span>
            {empresa.prioridade_maxima && (
              <span className="font-mono text-[10.5px] text-vermelho">· prioridade</span>
            )}
            <span className="ml-auto font-mono text-[10.5px] text-muted">
              origem: {empresa.fonte_dados === "receita" ? "base da Receita" : "arquivo"}
            </span>
          </div>
          <p className="text-[13px] text-slate2">{empresa.motivo_triagem}</p>
          <table className="mt-3 w-full border-collapse text-[13px]">
            <tbody>
              {[
                ["Regime", empresa.regime ?? "—"],
                ["Porte", empresa.porte ?? "—"],
                ["Situação", empresa.situacao ?? "—"],
                ["RBT12", empresa.rbt12 != null ? moeda(Number(empresa.rbt12)) : "não informada"],
              ].map(([k, v]) => (
                <tr key={k}>
                  <td className="border-b border-linesoft py-1.5 text-muted">{k}</td>
                  <td className="border-b border-linesoft py-1.5 text-right font-mono text-[12px]">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Bloco>

        {/* DECISÃO */}
        <Bloco titulo="Decisão">
          {!a || !saida ? (
            <Vazio
              texto="Nenhuma análise registrada para esta empresa."
              cta={
                <Link
                  href={`/painel/motor?empresa=${empresa.id}`}
                  className="inline-block rounded-sm bg-ink px-3.5 py-2 text-[12.5px] font-semibold text-white"
                >
                  Rodar a análise
                </Link>
              }
            />
          ) : (
            <>
              <div className="overflow-hidden rounded border border-line">
                <div className={`flex items-center justify-between gap-3 px-3.5 py-2.5 text-white ${COR_SAIDA[saida.cor]}`}>
                  <span className="font-mono text-[11px] tracking-[0.14em]">{a.saida}</span>
                  <span className="text-[14px] font-bold">{saida.titulo}</span>
                </div>
                <div className="bg-surface px-3.5 py-3 text-[13px] text-slate2">{saida.descricao}</div>
              </div>
              <table className="mt-3 w-full border-collapse text-[13px]">
                <tbody>
                  {[
                    ["Repasse necessário", a.re != null ? pct(Number(a.re)) : "—"],
                    ["Ganho do comprador", a.fc != null ? pct(Number(a.fc)) : "—"],
                    ["Receita qualificada", a.rq != null ? pct(Number(a.rq)) : "—"],
                    ["Calculada em", a.calculado_em ? new Date(a.calculado_em).toLocaleDateString("pt-BR") : "—"],
                  ].map(([k, v]) => (
                    <tr key={k}>
                      <td className="border-b border-linesoft py-1.5 text-muted">{k}</td>
                      <td className="border-b border-linesoft py-1.5 text-right font-mono text-[12px]">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {a.prioridade && (
                <div className="mt-2.5 rounded-sm bg-vermelhowash px-2.5 py-2 font-mono text-[10.5px] tracking-wide text-vermelho">
                  PRIORIDADE — a decisão saiu do campo fiscal.
                </div>
              )}
            </>
          )}
        </Bloco>

        {/* PREMISSAS E BASE */}
        {a && (
          <Bloco titulo="Premissas e base de cálculo">
            {premissas.length === 0 && base.length === 0 ? (
              <Vazio texto="Sem premissas registradas." />
            ) : (
              <ul className="list-disc pl-5 text-[12.5px] text-slate2">
                {premissas.map((p, i) => <li key={`p${i}`} className="mb-1">{p}</li>)}
                {base.map((b, i) => (
                  <li key={`b${i}`} className="mb-1" style={{ wordBreak: "break-all" }}>{b}</li>
                ))}
              </ul>
            )}
          </Bloco>
        )}

        {/* DOCUMENTOS */}
        <Bloco titulo="Documentos e prova">
          <div className="space-y-3">
            {/* LAUDO */}
            <div className="rounded-sm border border-line p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold">Laudo de enquadramento</span>
                {laudo ? (
                  <a
                    href={`/doc/laudo/${laudo.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-sm border border-line px-3 py-1.5 text-[12px] font-semibold text-accentdeep"
                  >
                    Abrir
                  </a>
                ) : (
                  <span className="font-mono text-[10.5px] text-muted">não emitido</span>
                )}
              </div>
              {laudo && (
                <p className="mt-1 font-mono text-[10.5px] text-muted">
                  nº {String(laudo.numero).padStart(4, "0")} · {new Date(laudo.emitido_em).toLocaleDateString("pt-BR")}
                </p>
              )}
            </div>

            {/* TERMO */}
            <div className="rounded-sm border border-line p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold">Termo de ciência</span>
                {termo ? (
                  <div className="flex gap-1.5">
                    {!assinado && termo.token && (
                      <a
                        href={`/assinar/${termo.token}`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-sm border border-line px-3 py-1.5 text-[12px] font-semibold text-accentdeep"
                      >
                        Link de assinatura
                      </a>
                    )}
                    <a
                      href={`/doc/termo/${termo.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-sm border border-line px-3 py-1.5 text-[12px] font-semibold text-slate2"
                    >
                      Abrir
                    </a>
                  </div>
                ) : (
                  <span className="font-mono text-[10.5px] text-muted">não gerado</span>
                )}
              </div>
              {termo && (
                <p className={`mt-1 font-mono text-[10.5px] ${assinado ? "text-verde" : "text-amarelo"}`}>
                  {assinado
                    ? `assinado por ${termo.assinante_nome} em ${new Date(termo.assinado_em!).toLocaleString("pt-BR")}`
                    : "aguardando assinatura"}
                </p>
              )}
            </div>

            {trilha.length > 0 && (
              <div className="rounded-sm bg-surface2 p-3">
                <div className="mb-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
                  Trilha de auditoria
                </div>
                <ul className="list-disc pl-4 text-[11.5px] text-slate2">
                  {trilha.map((l, i) => (
                    <li key={i} className="mb-1" style={{ wordBreak: "break-all" }}>{l}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Bloco>
      </div>
    </div>
  );
}
