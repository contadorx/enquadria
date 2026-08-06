"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CriterioRadar, ItemRadar } from "@/lib/radar";
import { ROTULO_SEVERIDADE, COR_SEVERIDADE } from "@/lib/radar";
import {
  SEVERIDADES, validar, bloqueado, descreverCriterio, limparCriterio, divisoesDe,
  type Rascunho, type Problema,
} from "@/lib/radar-form";

/**
 * PUBLICAR NO RADAR — a porta que faltava.
 *
 * Até 05/08/2026 a única forma de publicar era rodar INSERT no Supabase de
 * produção. Resultado medido: quatro itens, todos de 24 de abril, cento e
 * quatro dias parados.
 *
 * O desenho tem uma decisão que não é óbvia: o ALCANCE é consultado ANTES de
 * salvar, não depois. O erro típico do radar não é de sintaxe — é de escopo.
 * Publicar para todo mundo um item que só vale para o Anexo IV enche a tela de
 * quem não tem nada a ver com aquilo, e é assim que o contador aprende a não
 * abrir a aba. Ver o número de empresas atingidas antes de clicar em publicar é
 * o que impede isso.
 */

const FAIXAS = ["A", "B", "C", "D", "MEI", "FORA"];
const SAIDAS = ["S1", "S2", "S3", "S4", "S5"];
const ANEXOS = [1, 2, 3, 4, 5];

const VAZIO: Rascunho = {
  titulo: "", resumo: "", o_que_fazer: "", fonte: "",
  publicado_em: new Date().toISOString().slice(0, 10),
  vigencia_em: "", severidade: "media", criterio: {}, ativo: true,
};

export function RadarItens({ itens }: { itens: ItemRadar[] }) {
  const router = useRouter();
  const [r, setR] = useState<Rascunho>(VAZIO);
  const [editando, setEditando] = useState<string | null>(null);
  const [cnaeTexto, setCnaeTexto] = useState("");
  const [alcance, setAlcance] = useState<{ empresas: number; escritorios: number } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const problemas = validar(r);
  const trava = bloqueado(problemas);
  const doCampo = (c: keyof Rascunho) => problemas.filter((p) => p.campo === c);

  function mexer(p: Partial<Rascunho>) {
    setR((x) => ({ ...x, ...p }));
    setAlcance(null); // critério mudou: o número de antes deixou de valer
  }
  function alternar<T>(lista: T[] | undefined, v: T): T[] {
    const l = lista ?? [];
    return l.includes(v) ? l.filter((x) => x !== v) : [...l, v];
  }
  function crit(p: Partial<CriterioRadar>) {
    mexer({ criterio: { ...r.criterio, ...p } });
  }

  async function verAlcance() {
    setOcupado(true); setErro(null);
    try {
      const resp = await fetch("/api/radar/alcance", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ criterio: limparCriterio(r.criterio) }),
      });
      const j = await resp.json();
      if (!resp.ok) throw new Error(j.erro ?? "não consegui medir o alcance");
      setAlcance(j);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "erro inesperado");
    } finally { setOcupado(false); }
  }

  async function salvar() {
    if (trava) return;
    setOcupado(true); setErro(null);
    try {
      const resp = await fetch("/api/radar", {
        method: editando ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editando, ...r, criterio: limparCriterio(r.criterio) }),
      });
      const j = await resp.json();
      if (!resp.ok) throw new Error(j.erro ?? "não consegui salvar");
      setR(VAZIO); setCnaeTexto(""); setEditando(null); setAlcance(null);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "erro inesperado");
    } finally { setOcupado(false); }
  }

  function editar(i: ItemRadar) {
    setEditando(i.id);
    setR({
      titulo: i.titulo, resumo: i.resumo, o_que_fazer: i.o_que_fazer ?? "",
      fonte: i.fonte ?? "", publicado_em: i.publicado_em?.slice(0, 10) ?? "",
      vigencia_em: i.vigencia_em?.slice(0, 10) ?? "", severidade: i.severidade,
      criterio: i.criterio ?? {}, ativo: true,
    });
    setCnaeTexto((i.criterio?.divisoes_cnae ?? []).join(", "));
    setAlcance(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function alternarAtivo(id: string, ativo: boolean) {
    setOcupado(true);
    try {
      await fetch("/api/radar", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ativo }),
      });
      router.refresh();
    } finally { setOcupado(false); }
  }

  const campo = "w-full rounded-sm border border-line px-3 py-2 text-[13px] outline-none focus:border-accent";
  const rotulo = "mb-1 block text-[12px] font-semibold text-slate2";

  return (
    <div className="space-y-6">
      {/* ─────────────────────────────────────────── o formulário */}
      <div className="rounded border border-line bg-surface p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[13px] font-bold">
            {editando ? "Editando um item publicado" : "Novo item do radar"}
          </div>
          {editando && (
            <button
              onClick={() => { setEditando(null); setR(VAZIO); setCnaeTexto(""); setAlcance(null); }}
              className="text-[12px] font-semibold text-accentdeep"
            >
              cancelar edição
            </button>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <label className={rotulo}>Título — o que faz o contador parar</label>
            <input value={r.titulo} onChange={(e) => mexer({ titulo: e.target.value })}
              placeholder="Ex.: Resolução CGSN fixa a janela de opção em setembro"
              className={campo} />
            <Avisos lista={doCampo("titulo")} />
          </div>

          <div>
            <label className={rotulo}>Resumo — o que ele lê. É o produto.</label>
            <textarea value={r.resumo} onChange={(e) => mexer({ resumo: e.target.value })} rows={3}
              placeholder="Duas ou três frases, sem juridiquês. O que mudou e para quem."
              className={campo} />
            <Avisos lista={doCampo("resumo")} />
          </div>

          <div>
            <label className={rotulo}>O que fazer — a ação, não o conselho</label>
            <textarea value={r.o_que_fazer} onChange={(e) => mexer({ o_que_fazer: e.target.value })} rows={2}
              placeholder="Ex.: abra a carteira e confira quem tem RBT12 acima de 3,6 mi antes de 30/09."
              className={campo} />
            <Avisos lista={doCampo("o_que_fazer")} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={rotulo}>Fonte (link)</label>
              <input value={r.fonte} onChange={(e) => mexer({ fonte: e.target.value })}
                placeholder="https://..." className={campo} />
              <Avisos lista={doCampo("fonte")} />
            </div>
            <div>
              <label className={rotulo}>Severidade</label>
              <select value={r.severidade} onChange={(e) => mexer({ severidade: e.target.value })} className={campo}>
                {SEVERIDADES.map((s) => (
                  <option key={s.valor} value={s.valor}>{s.rotulo} — {s.quando}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={rotulo}>Publicado em</label>
              <input type="date" value={r.publicado_em} onChange={(e) => mexer({ publicado_em: e.target.value })} className={campo} />
              <Avisos lista={doCampo("publicado_em")} />
            </div>
            <div>
              <label className={rotulo}>Vigência (quando passa a valer)</label>
              <input type="date" value={r.vigencia_em} onChange={(e) => mexer({ vigencia_em: e.target.value })} className={campo} />
              <Avisos lista={doCampo("vigencia_em")} />
            </div>
          </div>

          {/* ──────────────────────────────── o critério */}
          <div className="rounded-sm border border-line bg-surface2 p-3.5">
            <div className="text-[12px] font-bold">Quem isto alcança</div>
            <p className="mt-0.5 text-[11.5px] text-muted">
              Deixe tudo em branco para alcançar todo mundo. Cada filtro RESTRINGE.
            </p>

            <div className="mt-2.5 space-y-2">
              <Linha rotulo="Anexos">
                {ANEXOS.map((a) => (
                  <Pilula key={a} ativa={!!r.criterio.anexos?.includes(a)}
                    onClick={() => crit({ anexos: alternar(r.criterio.anexos, a) })}>{a}</Pilula>
                ))}
              </Linha>
              <Linha rotulo="Faixas">
                {FAIXAS.map((f) => (
                  <Pilula key={f} ativa={!!r.criterio.faixas?.includes(f)}
                    onClick={() => crit({ faixas: alternar(r.criterio.faixas, f) })}>{f}</Pilula>
                ))}
              </Linha>
              <Linha rotulo="Saídas">
                {SAIDAS.map((s) => (
                  <Pilula key={s} ativa={!!r.criterio.saidas?.includes(s)}
                    onClick={() => crit({ saidas: alternar(r.criterio.saidas, s) })}>{s}</Pilula>
                ))}
              </Linha>
              <div>
                <div className="mb-1 text-[11.5px] font-semibold text-slate2">Divisões de CNAE</div>
                <input value={cnaeTexto}
                  onChange={(e) => { setCnaeTexto(e.target.value); crit({ divisoes_cnae: divisoesDe(e.target.value) }); }}
                  placeholder="47, 62 — ou cole o CNAE inteiro, eu corto"
                  className={campo} />
                {!!r.criterio.divisoes_cnae?.length && (
                  <p className="mt-1 font-mono text-[11px] text-accentdeep">
                    divisões: {r.criterio.divisoes_cnae.join(" · ")}
                  </p>
                )}
              </div>
              <label className="flex items-center gap-2 text-[12px] text-slate2">
                <input type="checkbox" checked={!!r.criterio.somente_com_analise}
                  onChange={(e) => crit({ somente_com_analise: e.target.checked })} />
                só empresas que já têm análise salva
              </label>
            </div>

            <p className="mt-2.5 rounded-sm bg-surface px-3 py-2 text-[12px] font-semibold text-ink">
              {descreverCriterio(limparCriterio(r.criterio))}
            </p>

            {/* O ALCANCE É CONSULTADO ANTES DE SALVAR. O erro típico do radar é
                de escopo, e escopo errado não dá erro — dá um item que não
                atinge ninguém, ou que atinge todo mundo. */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button onClick={verAlcance} disabled={ocupado}
                className="rounded-sm border border-line px-3 py-1.5 text-[12px] font-semibold text-accentdeep disabled:opacity-40">
                {ocupado ? "…" : "Quantas empresas isso alcança?"}
              </button>
              {alcance && (
                <span className={`text-[12.5px] font-semibold ${alcance.empresas === 0 ? "text-vermelho" : "text-verde"}`}>
                  {alcance.empresas === 0
                    ? "nenhuma empresa — este item não vai aparecer para ninguém"
                    : `${alcance.empresas} empresa(s) em ${alcance.escritorios} escritório(s)`}
                </span>
              )}
            </div>
          </div>

          {erro && <p className="rounded-sm bg-vermelhowash px-3 py-2 text-[12.5px] text-vermelho">{erro}</p>}

          <button onClick={salvar} disabled={ocupado || trava}
            className="rounded-sm bg-ink px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-40">
            {ocupado ? "Salvando…" : editando ? "Salvar alterações" : "Publicar no radar"}
          </button>
          {trava && (
            <p className="text-[11.5px] text-muted">
              Resolva os pontos em vermelho acima para publicar.
            </p>
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────── o que já está no ar */}
      <div>
        <div className="mb-2 text-[13px] font-bold">No ar ({itens.length})</div>
        {!itens.length && (
          <p className="rounded border border-line bg-surface p-4 text-[12.5px] text-muted">
            Nenhum item ainda. O primeiro é o que tira a aba Reforma do estado de abandono.
          </p>
        )}
        <div className="space-y-2">
          {itens.map((i) => (
            <div key={i.id} className="rounded border border-line bg-surface p-3.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`font-mono text-[10px] uppercase tracking-wide ${COR_SEVERIDADE[i.severidade] ?? "text-muted"}`}>
                      {ROTULO_SEVERIDADE[i.severidade] ?? i.severidade}
                    </span>
                    <span className="font-mono text-[10px] text-muted">
                      {new Date(i.publicado_em).toLocaleDateString("pt-BR")}
                      {i.vigencia_em ? ` · vigência ${new Date(i.vigencia_em).toLocaleDateString("pt-BR")}` : ""}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[13.5px] font-semibold">{i.titulo}</div>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-slate2">{i.resumo}</p>
                  <p className="mt-1 font-mono text-[11px] text-muted">{descreverCriterio(i.criterio)}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {/* o efeito deste clique é o formulário lá em cima, e `editar()`
                      termina com um scroll até ele. O auditor mede distância em
                      linhas e não enxerga o scroll — a regra está certa, e a
                      ux-ok: resposta a ela é levar a pessoa ATÉ o efeito. */}
                  <button onClick={() => editar(i)}
                    className="rounded-sm border border-line px-3 py-1.5 text-[12px] font-semibold text-accentdeep">
                    editar
                  </button>
                  <button onClick={() => alternarAtivo(i.id, false)} disabled={ocupado}
                    className="rounded-sm border border-line px-3 py-1.5 text-[12px] font-semibold text-slate2 disabled:opacity-40">
                    tirar do ar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Avisos({ lista }: { lista: Problema[] }) {
  if (!lista.length) return null;
  return (
    <div className="mt-1 space-y-0.5">
      {lista.map((p, i) => (
        <p key={i} className={`text-[11.5px] ${p.bloqueia ? "text-vermelho" : "text-amarelo"}`}>{p.texto}</p>
      ))}
    </div>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-[62px] shrink-0 text-[11.5px] font-semibold text-slate2">{rotulo}</span>
      {children}
    </div>
  );
}

function Pilula({ ativa, onClick, children }: { ativa: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`rounded-sm border px-2.5 py-1 text-[12px] font-semibold transition ${
        ativa ? "border-accent bg-accent/10 text-accentdeep" : "border-line text-muted"
      }`}>
      {children}
    </button>
  );
}
