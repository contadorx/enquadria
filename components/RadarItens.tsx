"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CriterioRadar } from "@/lib/radar";
import type { ItemPublicado } from "@/lib/radar-aviso";
import { ROTULO_SEVERIDADE, COR_SEVERIDADE } from "@/lib/radar";
import { paraSlug } from "@/lib/slug";
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
  titulo: "", slug: "", resumo: "", o_que_fazer: "", fonte: "",
  publicado_em: new Date().toISOString().slice(0, 10),
  vigencia_em: "", severidade: "media", criterio: {}, ativo: true, no_cockpit: true,
};

interface Previa {
  para: string; escritorio: string; empresas: number; assunto: string;
}
interface EstadoAviso {
  item_id: string;
  previa: Previa[];
  repetidos: number;
  erro: string | null;
  enviando: boolean;
  resultado: string | null;
  /** ignora quem já foi avisado — a saída para quando o e-mail não chegou */
  reenvio: boolean;
}

export function RadarItens({
  itens, avisados,
}: { itens: ItemPublicado[]; avisados: Record<string, number> }) {
  const router = useRouter();
  const [r, setR] = useState<Rascunho>(VAZIO);
  const [editando, setEditando] = useState<string | null>(null);
  const [cnaeTexto, setCnaeTexto] = useState("");
  const [alcance, setAlcance] = useState<{ empresas: number; escritorios: number } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<EstadoAviso | null>(null);

  const noAr = itens.filter((i) => i.ativo !== false);
  const foraDoAr = itens.filter((i) => i.ativo === false);

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

  function editar(i: ItemPublicado) {
    setEditando(i.id);
    setR({
      titulo: i.titulo,
      /* o endereço vem do banco e volta como está: editar o título de uma
         matéria já publicada não pode mudar a URL dela */
      slug: i.slug ?? "",
      resumo: i.resumo, o_que_fazer: i.o_que_fazer ?? "",
      fonte: i.fonte ?? "", publicado_em: i.publicado_em?.slice(0, 10) ?? "",
      vigencia_em: i.vigencia_em?.slice(0, 10) ?? "", severidade: i.severidade,
      /* preserva o estado: forçar `true` aqui republicava sem querer um item
         que a pessoa tinha tirado do ar de propósito */
      criterio: i.criterio ?? {}, ativo: i.ativo !== false,
      no_cockpit: i.no_cockpit !== false,
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

  /* ── O AVISO É EM DOIS TEMPOS, de propósito ──────────────────────────────
     Primeiro `?teste=1`, que devolve exatamente quem receberia e com que
     assunto, sem mandar nada. Só depois o envio. E-mail não tem CTRL+Z: um
     critério errado aqui não dá erro, dá cinco caixas de entrada. */
  async function conferirAviso(item: ItemPublicado, reenvio = false) {
    setAviso({ item_id: item.id, previa: [], repetidos: 0, erro: null, enviando: false, resultado: null, reenvio });
    try {
      const resp = await fetch(`/api/radar/avisar?teste=1${reenvio ? "&reenviar=1" : ""}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: item.id }),
      });
      const j = await resp.json();
      if (!resp.ok) {
        setAviso({ item_id: item.id, previa: [], repetidos: j.repetidos ?? 0, erro: j.erro ?? "não consegui conferir", enviando: false, resultado: null, reenvio });
        return;
      }
      setAviso({ item_id: item.id, previa: j.previa ?? [], repetidos: j.repetidos ?? 0, erro: null, enviando: false, resultado: null, reenvio });
    } catch (e) {
      setAviso({ item_id: item.id, previa: [], repetidos: 0, erro: e instanceof Error ? e.message : "erro inesperado", enviando: false, resultado: null, reenvio });
    }
  }

  async function enviarAviso(item: ItemPublicado) {
    setAviso((a) => (a ? { ...a, enviando: true, erro: null } : a));
    try {
      const resp = await fetch(`/api/radar/avisar${aviso?.reenvio ? "?reenviar=1" : ""}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: item.id }),
      });
      const j = await resp.json();
      if (!resp.ok) {
        setAviso((a) => (a ? { ...a, enviando: false, erro: j.erro ?? "não consegui enviar" } : a));
        return;
      }
      const falhas = (j.falhas ?? []).length;
      setAviso((a) => (a ? {
        ...a, enviando: false, previa: [],
        resultado: `${j.enviados} escritório(s) avisados${falhas ? ` · ${falhas} falha(s)` : ""}.`,
      } : a));
      router.refresh();
    } catch (e) {
      setAviso((a) => (a ? { ...a, enviando: false, erro: e instanceof Error ? e.message : "erro inesperado" } : a));
    }
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
            <label className={rotulo}>
              Endereço público {editando ? "— já publicado" : "(deixe vazio: sai do título)"}
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[12px] text-muted">/reforma/</span>
              <input value={r.slug} onChange={(e) => mexer({ slug: e.target.value })}
                placeholder={paraSlug(r.titulo) || "sai-do-titulo"}
                className={`${campo} flex-1 min-w-[220px] font-mono text-[12.5px]`} />
            </div>
            <p className="mt-1 text-[11.5px] text-muted">
              {editando
                ? "Trocar isto quebra os links já compartilhados e o que o Google indexou. Só mude se a matéria ainda não circulou."
                : "É a URL da matéria no site, e ela não muda mais depois. O título pode ser corrigido à vontade."}
            </p>
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

          {/* ──────────────────────────────── alerta ou notícia
            * A escolha que separa INTERROMPER de INFORMAR. O cockpit é fila de
            * trabalho; um aviso lá tira a pessoa do que ela estava fazendo. A
            * aba Reforma é feed e espera ser visitada.
            */}
          <div className="rounded-sm border border-line bg-surface2 p-3.5">
            <div className="text-[12px] font-bold">Onde isto aparece</div>
            <div className="mt-2 space-y-2">
              <label className="flex cursor-pointer items-start gap-2">
                <input type="radio" name="onde" className="mt-0.5" checked={r.no_cockpit}
                  onChange={() => mexer({ no_cockpit: true })} />
                <span className="text-[12.5px] leading-relaxed">
                  <b>Alerta</b> — entra no topo do cockpit de quem o critério alcança,
                  <b> e</b> na aba Reforma. Use quando muda o trabalho dele.
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2">
                <input type="radio" name="onde" className="mt-0.5" checked={!r.no_cockpit}
                  onChange={() => mexer({ no_cockpit: false })} />
                <span className="text-[12.5px] leading-relaxed">
                  <b>Notícia</b> — só na aba Reforma, para <b>todos</b> os escritórios. Use para
                  contexto, sem critério e sem interromper ninguém.
                </span>
              </label>
            </div>
          </div>

          {/* ──────────────────────────────── o critério */}
          <div className={`rounded-sm border border-line bg-surface2 p-3.5 ${r.no_cockpit ? "" : "opacity-55"}`}>
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
              {r.no_cockpit
                ? descreverCriterio(limparCriterio(r.criterio))
                : "Como notícia, o critério não filtra nada: a aba Reforma mostra para todos."}
            </p>
            <Avisos lista={doCampo("criterio" as keyof Rascunho)} />

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
        <div className="mb-2 text-[13px] font-bold">No ar ({noAr.length})</div>
        {!noAr.length && (
          <p className="rounded border border-line bg-surface p-4 text-[12.5px] text-muted">
            Nenhum item no ar. O primeiro é o que tira a aba Reforma do estado de abandono.
          </p>
        )}
        <div className="space-y-2">
          {noAr.map((i) => (
            <div key={i.id} className="rounded border border-line bg-surface p-3.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <Cabeca i={i} />
                <div className="flex shrink-0 gap-2">
                  {/* o efeito deste clique é o formulário lá em cima, e `editar()`
                      termina com um scroll até ele. O auditor mede distância em
                      linhas e não enxerga o scroll — a regra está certa, e a
                      ux-ok: resposta a ela é levar a pessoa ATÉ o efeito. */}
                  <button onClick={() => editar(i)}
                    className="rounded-sm border border-line px-3 py-1.5 text-[12px] font-semibold text-accentdeep">
                    editar
                  </button>
                  <button onClick={() => conferirAviso(i, false)} disabled={ocupado}
                    className="rounded-sm border border-accent px-3 py-1.5 text-[12px] font-semibold text-accentdeep disabled:opacity-40">
                    {avisados[i.id] ? `avisar (${avisados[i.id]} já)` : "avisar escritórios"}
                  </button>
                  {/* a saída para quando o envio consta como feito e ninguém
                      recebeu. Só aparece quando há histórico, e diz na cara que
                      vai repetir — reenvio em massa não pode ser um clique
                      parecido com o outro. */}
                  {!!avisados[i.id] && (
                    <button onClick={() => conferirAviso(i, true)} disabled={ocupado}
                      className="rounded-sm border border-line px-3 py-1.5 text-[12px] font-semibold text-amarelo disabled:opacity-40">
                      reenviar a todos
                    </button>
                  )}
                  <button onClick={() => alternarAtivo(i.id, false)} disabled={ocupado}
                    className="rounded-sm border border-line px-3 py-1.5 text-[12px] font-semibold text-slate2 disabled:opacity-40">
                    tirar do ar
                  </button>
                </div>
              </div>

              {/* ── a prévia do aviso, embaixo do próprio item ─────────────── */}
              {aviso?.item_id === i.id && (
                <div className="mt-3 rounded-sm border border-line bg-surface2 p-3">
                  {aviso.erro && (
                    <p className="text-[12.5px] leading-relaxed text-vermelho">{aviso.erro}</p>
                  )}
                  {aviso.resultado && (
                    <p className="text-[12.5px] font-semibold text-verde">{aviso.resultado}</p>
                  )}
                  {!aviso.erro && !aviso.resultado && (
                    <>
                      <div className="text-[12px] font-bold">
                        {aviso.previa.length
                          ? `${aviso.reenvio ? "REENVIO · " : ""}Vai para ${aviso.previa.length} escritório(s). Nada foi enviado ainda.`
                          : "Conferindo…"}
                      </div>
                      {aviso.reenvio && !!aviso.previa.length && (
                        <p className="mt-0.5 text-[11.5px] text-amarelo">
                          Quem já recebeu vai receber de novo. Use só quando o primeiro envio
                          não chegou.
                        </p>
                      )}
                      {aviso.repetidos > 0 && (
                        <p className="mt-0.5 text-[11.5px] text-muted">
                          {aviso.repetidos} escritório(s) já foram avisados deste item e ficam de fora.
                        </p>
                      )}
                      <ul className="mt-2 space-y-1">
                        {aviso.previa.map((p) => (
                          <li key={p.para} className="text-[11.5px] leading-relaxed text-slate2">
                            <b>{p.escritorio}</b> · {p.empresas} empresa(s) · {p.para}
                            <br />
                            <span className="font-mono text-[11px] text-muted">{p.assunto}</span>
                          </li>
                        ))}
                      </ul>
                      {!!aviso.previa.length && (
                        <div className="mt-2.5 flex gap-2">
                          <button onClick={() => enviarAviso(i)} disabled={aviso.enviando}
                            className="rounded-sm bg-ink px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40">
                            {aviso.enviando ? "Enviando…" : "Enviar agora"}
                          </button>
                          <button onClick={() => setAviso(null)}
                            className="rounded-sm border border-line px-3 py-1.5 text-[12px] font-semibold text-slate2">
                            cancelar
                          </button>
                        </div>
                      )}
                    </>
                  )}
                  {(aviso.erro || aviso.resultado) && (
                    <button onClick={() => setAviso(null)}
                      className="mt-2 text-[11.5px] font-semibold text-accentdeep">
                      fechar
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ──────────────────────────────────────────────── o que está fora do ar
        * ESTA SEÇÃO É O CONSERTO DE UMA PORTA DE MÃO ÚNICA.
        *
        * A tela listava só `ativo = true`. Quem clicava em "tirar do ar" via o
        * item desaparecer por inteiro, e não havia caminho de volta pela
        * interface — só abrindo o banco, que é exatamente o que esta tela
        * existe para evitar. Aconteceu com o item da NFS-e: publicado, certo,
        * com 55 empresas de alcance, e invisível.
        */}
      {!!foraDoAr.length && (
        <div>
          <div className="mb-2 text-[13px] font-bold text-muted">Fora do ar ({foraDoAr.length})</div>
          <p className="mb-2 text-[11.5px] text-muted">
            Estes itens existem, mas nenhum contador os vê. Item fora do ar também não pode ser
            avisado por e-mail — quem recebesse abriria a aba Reforma e não acharia nada.
          </p>
          <div className="space-y-2">
            {foraDoAr.map((i) => (
              <div key={i.id} className="rounded border border-dashed border-line bg-surface2 p-3.5 opacity-80">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Cabeca i={i} />
                  <div className="flex shrink-0 gap-2">
                    {/* mesmo caso do "editar" da lista de cima: o efeito é o
                        formulário no topo e `editar()` rola até lá.
                        ux-ok: levar a pessoa ATÉ o efeito é a resposta certa. */}
                    <button onClick={() => editar(i)}
                      className="rounded-sm border border-line px-3 py-1.5 text-[12px] font-semibold text-accentdeep">
                      editar
                    </button>
                    <button onClick={() => alternarAtivo(i.id, true)} disabled={ocupado}
                      className="rounded-sm bg-ink px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40">
                      voltar ao ar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Cabeca({ i }: { i: ItemPublicado }) {
  return (
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
      <div className="mt-0.5 text-[13.5px] font-semibold">
        {i.no_cockpit === false && (
          <span className="mr-1.5 rounded-sm bg-surface2 px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-muted">
            notícia
          </span>
        )}
        {i.titulo}
      </div>
      <p className="mt-0.5 text-[12px] leading-relaxed text-slate2">{i.resumo}</p>
      <p className="mt-1 font-mono text-[11px] text-muted">{descreverCriterio(i.criterio)}</p>
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
