"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import {
  filtrarFeed,
  paginar,
  resumoFeed,
  FILTRO_VAZIO,
  type FiltroFeed,
  type LinhaFeed,
} from "@/lib/reforma";
import { COR_SEVERIDADE, ROTULO_SEVERIDADE, diasPara } from "@/lib/radar";

/**
 * O PAINEL DA REFORMA — uma lista, não uma pilha de cartões abertos.
 *
 * O QUE ESTAVA ERRADO ATÉ 06/08/2026: cada publicação vinha com resumo, "o que
 * fazer" e fonte abertos ao mesmo tempo. Com quatro itens já dava uma tela e
 * meia de rolagem, e — pior — o item mais longo parecia o mais importante.
 * Comprimento de texto virava hierarquia. Não é.
 *
 * AS QUATRO DECISÕES DESTA TELA:
 *
 *   1. UMA LINHA POR PUBLICAÇÃO. Título truncado, sem exceção. O que decide se
 *      vale abrir não é o resumo: é a data, o alcance na carteira e a data do
 *      efeito — e os três cabem na linha.
 *
 *   2. NEGRITO É NÃO LIDO. Peso de fonte é o sinal mais barato que existe e o
 *      único que se lê sem parar para pensar. Lido fica em peso normal e cor
 *      apagada; a linha continua ali, porque histórico é o valor desta aba.
 *
 *   3. ABRIR MARCA COMO LIDO. É o que qualquer caixa de entrada faz, e é o que
 *      a pessoa espera. Tem desfazer ("marcar como não lido") para o caso de
 *      abrir por engano — sem desfazer, marcar automático vira armadilha.
 *
 *   4. A DATA DO EFEITO É COLUNA, não frase perdida no meio do texto. Nesta
 *      transição a data de publicação quase não importa; a que importa é
 *      quando a regra passa a valer, e ela precisa ser comparável de relance
 *      entre uma linha e outra.
 *
 * Filtros e paginação são estado local: o feed inteiro já veio do servidor
 * (dezenas de itens, não milhares), e filtrar no navegador responde na hora.
 */

const POR_PAGINA = 12;

const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "06 ago" — dia e mês bastam num feed cronológico; o ano só quando muda */
function dataCurta(iso: string | null, anoAtual: number): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!a || !m || !d) return "—";
  return `${String(d).padStart(2, "0")} ${MES[m - 1]}${a !== anoAtual ? ` ${String(a).slice(2)}` : ""}`;
}

function dataBR(iso: string | null): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

export function FeedReforma({ linhas, hoje }: { linhas: LinhaFeed[]; hoje: string }) {
  const router = useRouter();
  const anoAtual = Number(hoje.slice(0, 4));

  const [filtro, setFiltro] = useState<FiltroFeed>(FILTRO_VAZIO);
  const [pagina, setPagina] = useState(1);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  /** leituras feitas nesta sessão — a tela responde antes da rede */
  const [lidos, setLidos] = useState<Set<string>>(new Set());
  const [naoLidos, setNaoLidos] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState<string | null>(null);

  /** verdade combinada: o que veio do servidor, corrigido pelo que fiz agora */
  const estaNovo = (l: LinhaFeed) =>
    naoLidos.has(l.id) ? true : lidos.has(l.id) ? false : l.novo;

  const comLeitura = useMemo(
    () => linhas.map((l) => ({ ...l, novo: estaNovo(l) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [linhas, lidos, naoLidos]
  );

  const resumo = resumoFeed(comLeitura);
  const filtradas = filtrarFeed(comLeitura, filtro, hoje);
  const pag = paginar(filtradas, pagina, POR_PAGINA);

  /** todo controle de filtro volta para a página 1 — senão a lista some */
  function mudar(parcial: Partial<FiltroFeed>) {
    setFiltro((f) => ({ ...f, ...parcial }));
    setPagina(1);
  }

  async function gravarLeitura(l: LinhaFeed, lido: boolean) {
    if (l.tipo === "radar") {
      await fetch("/api/radar/leitura", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: l.id, lido }),
      });
      return;
    }
    /* a notícia é leitura por PESSOA (ajuda_leituras), não por escritório —
       e por isso vai direto pelo cliente do Supabase, com a RLS de sempre */
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    if (lido) {
      await supabase
        .from("ajuda_leituras")
        .upsert(
          { user_id: user.id, artigo_id: l.id, lido_em: new Date().toISOString() },
          { onConflict: "user_id,artigo_id" }
        );
    } else {
      await supabase.from("ajuda_leituras").delete().eq("user_id", user.id).eq("artigo_id", l.id);
    }
  }

  /** abrir e fechar; abrir marca como lido, que é o que caixa de entrada faz */
  async function alternarAberto(l: LinhaFeed) {
    const abrindo = !abertos.has(l.id);
    setAbertos((s) => {
      const n = new Set(s);
      if (abrindo) n.add(l.id);
      else n.delete(l.id);
      return n;
    });
    if (!abrindo || !estaNovo(l)) return;
    setLidos((s) => new Set(s).add(l.id));
    setNaoLidos((s) => {
      const n = new Set(s);
      n.delete(l.id);
      return n;
    });
    try {
      await gravarLeitura(l, true);
    } catch {
      /* a leitura é acessória: se a rede falhar, a linha volta a "não lido" no
         próximo carregamento. O lado seguro do erro é insistir, não sumir. */
      setLidos((s) => {
        const n = new Set(s);
        n.delete(l.id);
        return n;
      });
    }
  }

  async function marcarComo(l: LinhaFeed, lido: boolean) {
    setOcupado(l.id);
    if (lido) {
      setLidos((s) => new Set(s).add(l.id));
      setNaoLidos((s) => {
        const n = new Set(s);
        n.delete(l.id);
        return n;
      });
    } else {
      setNaoLidos((s) => new Set(s).add(l.id));
      setLidos((s) => {
        const n = new Set(s);
        n.delete(l.id);
        return n;
      });
    }
    try {
      await gravarLeitura(l, lido);
      router.refresh(); // o contador do menu também precisa saber
    } finally {
      setOcupado(null);
    }
  }

  /** marca tudo o que está VISÍVEL com o filtro atual — não a base inteira */
  async function marcarTudo() {
    const alvo = filtradas.filter((l) => l.novo);
    if (alvo.length === 0) return;
    setOcupado("tudo");
    setLidos((s) => {
      const n = new Set(s);
      alvo.forEach((l) => n.add(l.id));
      return n;
    });
    setNaoLidos(new Set());
    try {
      for (const l of alvo) await gravarLeitura(l, true);
      router.refresh();
    } finally {
      setOcupado(null);
    }
  }

  const filtrando =
    filtro.busca !== "" ||
    filtro.naoLidas ||
    filtro.minhaCarteira ||
    filtro.severidade !== "todas" ||
    filtro.efeito !== "todos";

  return (
    <div>
      {/* ─────────────────────────────────────────────────── os três números */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-muted">
        <span>
          <b className="text-ink">{resumo.total}</b> publicações
        </span>
        <span>
          <b className={resumo.naoLidas > 0 ? "text-accentdeep" : "text-ink"}>{resumo.naoLidas}</b> não
          lidas
        </span>
        <span>
          <b className="text-ink">{resumo.atingem}</b> atingem a sua carteira
        </span>
        {resumo.naoLidas > 0 && (
          /* comentário de JS, não de JSX: aqui dentro é posição de EXPRESSÃO —
             `{/* … *\/}` só vale onde cabe filho de elemento.
             ux-ok: o efeito é a lista logo abaixo perdendo o negrito e este
             mesmo contador caindo para zero. */
          <button
            onClick={marcarTudo}
            disabled={ocupado === "tudo"}
            className="ml-auto rounded-sm border border-line px-2.5 py-1 text-[12px] font-semibold text-slate2 disabled:opacity-40"
          >
            {ocupado === "tudo" ? "marcando…" : "Marcar as visíveis como lidas"}
          </button>
        )}
      </div>

      {/* ──────────────────────────────────────────────────────────── filtros */}
      <div className="mt-3 rounded border border-line bg-surface p-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={filtro.busca}
            onChange={(e) => mudar({ busca: e.target.value })}
            placeholder="Buscar por palavra, norma ou fonte…"
            className="min-w-[220px] flex-1 rounded-sm border border-line bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-accent"
          />

          <select
            value={filtro.severidade}
            onChange={(e) => mudar({ severidade: e.target.value as FiltroFeed["severidade"] })}
            className="rounded-sm border border-line bg-white px-2 py-1.5 text-[12.5px]"
          >
            <option value="todas">Todas as severidades</option>
            <option value="alta">Só severidade alta</option>
            <option value="media">Só severidade média</option>
            <option value="baixa">Só informativo</option>
          </select>

          <select
            value={filtro.efeito}
            onChange={(e) => mudar({ efeito: e.target.value as FiltroFeed["efeito"] })}
            className="rounded-sm border border-line bg-white px-2 py-1.5 text-[12.5px]"
          >
            <option value="todos">Qualquer data de efeito</option>
            <option value="a_vigorar">Ainda vai valer</option>
            <option value="em_vigor">Já está valendo</option>
          </select>

          <label className="flex cursor-pointer items-center gap-1.5 text-[12.5px] text-slate2">
            <input
              type="checkbox"
              checked={filtro.naoLidas}
              onChange={(e) => mudar({ naoLidas: e.target.checked })}
            />
            não lidas
          </label>

          <label className="flex cursor-pointer items-center gap-1.5 text-[12.5px] text-slate2">
            <input
              type="checkbox"
              checked={filtro.minhaCarteira}
              onChange={(e) => mudar({ minhaCarteira: e.target.checked })}
            />
            atingem minha carteira
          </label>

          {filtrando && (
            <button
              onClick={() => {
                setFiltro(FILTRO_VAZIO);
                setPagina(1);
              }}
              className="rounded-sm px-2 py-1 text-[12px] font-semibold text-accentdeep underline"
            >
              limpar
            </button>
          )}
        </div>

        {/* filtro de severidade e de efeito são campos que a notícia não tem —
            dizer isso é mais honesto que ela sumir sem explicação */}
        {(filtro.severidade !== "todas" || filtro.efeito !== "todos") && (
          <p className="mt-2 text-[11.5px] text-muted">
            Com este recorte a lista mostra só itens do radar: matéria não tem severidade nem data
            de efeito.
          </p>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────── a lista */}
      <div className="mt-3 overflow-hidden rounded border border-line bg-surface">
        {pag.itens.length === 0 && (
          <p className="px-4 py-8 text-center text-[13px] text-muted">
            {resumo.total === 0
              ? "Nenhuma publicação ainda."
              : "Nenhuma publicação com esse recorte. Tente limpar os filtros."}
          </p>
        )}

        {pag.itens.map((l, idx) => {
          const aberto = abertos.has(l.id);
          const dias = diasPara(l.vigencia_em, hoje);
          const urgente = dias != null && dias >= 0 && dias <= 60;

          return (
            <div key={`${l.tipo}-${l.id}`} className={idx > 0 ? "border-t border-line" : ""}>
              {/* ── A LINHA. Tudo o que decide se vale abrir cabe aqui. ── */}
              {/* o clique abre a própria linha, logo abaixo do cursor, e tira o
                  negrito dela na hora. A gravação é idempotente (upsert por
                  chave, delete por chave): clicar duas vezes não duplica nada.
                  ux-ok: o efeito é a própria linha, e não há o que travar. */}
              <button
                onClick={() => alternarAberto(l)}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface2 ${
                  l.novo ? "border-l-[3px] border-accent" : "border-l-[3px] border-transparent"
                }`}
              >
                {/* no celular a data sai da frente: entre saber QUANDO foi
                    publicado e QUANTOS clientes aquilo atinge, a segunda vence
                    — e no lugar dela o título ganha a largura que faltava */}
                <span className="hidden w-[62px] shrink-0 font-mono text-[10.5px] text-muted sm:block">
                  {dataCurta(l.publicado_em, anoAtual)}
                </span>

                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-[13.5px] ${
                      l.novo ? "font-bold text-ink" : "font-normal text-slate2"
                    }`}
                    title={l.titulo}
                  >
                    {l.titulo}
                  </span>
                  {/* a segunda linha existe SÓ no celular: é onde cabem os dois
                      números que as colunas da direita carregam no desktop */}
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] sm:hidden">
                    <span className="font-mono text-muted">
                      {dataCurta(l.publicado_em, anoAtual)}
                    </span>
                    {l.tipo === "artigo" ? (
                      <span className="text-muted">· matéria</span>
                    ) : (l.alcance ?? 0) > 0 ? (
                      <span className="font-semibold text-accentdeep">
                        · {l.alcance} {l.alcance === 1 ? "cliente" : "clientes"}
                      </span>
                    ) : (
                      <span className="text-muted">· sem alcance</span>
                    )}
                    {l.vigencia_em && (
                      <span className={urgente ? "text-amarelo" : "text-muted"}>
                        · efeito {dataBR(l.vigencia_em)}
                      </span>
                    )}
                  </span>
                </span>

                {/* impacto na carteira — o número que só este produto escreve */}
                <span className="hidden w-[104px] shrink-0 text-right text-[11.5px] sm:block">
                  {l.tipo === "artigo" ? (
                    <span className="text-muted">matéria</span>
                  ) : (l.alcance ?? 0) > 0 ? (
                    <span className="font-semibold text-accentdeep">
                      {l.alcance} {l.alcance === 1 ? "cliente" : "clientes"}
                    </span>
                  ) : (
                    <span className="text-muted">sem alcance</span>
                  )}
                </span>

                {/* a data do EFEITO */}
                <span className="hidden w-[112px] shrink-0 text-right font-mono text-[10.5px] sm:block">
                  {l.vigencia_em ? (
                    <span className={urgente ? "text-amarelo" : "text-muted"}>
                      {dias != null && dias > 0 && dias <= 60
                        ? `em ${dias} dia${dias === 1 ? "" : "s"}`
                        : dataBR(l.vigencia_em)}
                    </span>
                  ) : (
                    <span className="text-line">—</span>
                  )}
                </span>

                {/* o ponto de severidade tem `title`: cor sozinha não é rótulo,
                    e quem não distingue vermelho de âmbar precisa do texto */}
                <span
                  title={l.severidade ? `Severidade: ${ROTULO_SEVERIDADE[l.severidade] ?? l.severidade}` : ""}
                  className={`shrink-0 text-[11px] ${
                    l.severidade ? COR_SEVERIDADE[l.severidade] ?? "text-muted" : "text-transparent"
                  }`}
                >
                  ●
                </span>

                <span className="shrink-0 text-[11px] text-muted">{aberto ? "▲" : "▼"}</span>
              </button>

              {/* ── ABERTA. O corpo nasce logo abaixo do clique, de propósito. ── */}
              {aberto && (
                <div className="border-t border-line bg-surface2 px-3 py-3 pl-[74px]">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
                    <span>Publicado em {dataBR(l.publicado_em)}</span>
                    {l.vigencia_em && (
                      <span>
                        · Efeito a partir de <b className="text-slate2">{dataBR(l.vigencia_em)}</b>
                        {dias != null && dias > 0 ? ` (faltam ${dias} dias)` : ""}
                        {dias != null && dias <= 0 ? " (já em vigor)" : ""}
                      </span>
                    )}
                    {l.severidade && (
                      <span className={COR_SEVERIDADE[l.severidade] ?? "text-muted"}>
                        · {ROTULO_SEVERIDADE[l.severidade] ?? l.severidade}
                      </span>
                    )}
                  </div>

                  {l.tipo === "radar" && (
                    <p className="mt-1.5 text-[12.5px]">
                      {(l.alcance ?? 0) > 0 ? (
                        <span className="font-semibold text-accentdeep">
                          Atinge {l.alcance} {l.alcance === 1 ? "cliente seu" : "clientes seus"}.
                        </span>
                      ) : (
                        <span className="text-muted">
                          Não atinge nenhum cliente da sua carteira — fica aqui para você saber que
                          existe.
                        </span>
                      )}
                    </p>
                  )}

                  {l.resumo && (
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate2">{l.resumo}</p>
                  )}

                  {l.o_que_fazer && (
                    <div className="mt-2 rounded-sm border-l-[3px] border-accent bg-surface px-3 py-2">
                      <div className="font-mono text-[9.5px] uppercase tracking-wider text-muted">
                        O que fazer
                      </div>
                      <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate2">
                        {l.o_que_fazer}
                      </p>
                    </div>
                  )}

                  {l.fonte && <p className="mt-1.5 text-[11px] text-muted">Fonte: {l.fonte}</p>}

                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    {l.tipo === "artigo" && l.slug && (
                      <Link
                        href={`/painel/ajuda/${l.slug}`}
                        className="rounded-sm bg-ink px-3 py-1.5 text-[12.5px] font-semibold text-white"
                      >
                        Ler a matéria completa
                      </Link>
                    )}
                    {/* o rótulo do próprio botão troca entre "marcar como lido"
                        e "marcar como não lido", e o negrito da linha muda logo
                        acima.  ux-ok: o efeito está na mesma tela. */}
                    <button
                      onClick={() => marcarComo(l, l.novo)}
                      disabled={ocupado === l.id}
                      className="rounded-sm border border-line px-3 py-1.5 text-[12.5px] font-semibold text-slate2 disabled:opacity-40"
                    >
                      {ocupado === l.id
                        ? "…"
                        : l.novo
                          ? "Marcar como lido"
                          : "Marcar como não lido"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ───────────────────────────────────────────────────────── paginação */}
      {pag.total > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
          <span>
            {pag.primeiro}–{pag.ultimo} de {pag.total}
            {filtrando ? ` (filtrado de ${resumo.total})` : ""}
          </span>
          {pag.paginas > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPagina(pag.pagina - 1)}
                disabled={pag.pagina <= 1}
                className="rounded-sm border border-line px-2.5 py-1 font-semibold text-slate2 disabled:opacity-30"
                title="página anterior"
              >
                ← anterior
              </button>
              <span className="font-mono">
                {pag.pagina} / {pag.paginas}
              </span>
              <button
                onClick={() => setPagina(pag.pagina + 1)}
                disabled={pag.pagina >= pag.paginas}
                className="rounded-sm border border-line px-2.5 py-1 font-semibold text-slate2 disabled:opacity-30"
                title="próxima página"
              >
                próxima →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
