"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { mascararCnpj } from "@/lib/cnpj";
import type { FaseAtual } from "@/lib/janela";
import { moeda, pct } from "@/lib/motor";
import { ROTULO_FAIXA, type Faixa } from "@/lib/triagem";
import { EXPLICA_FAIXA, HONORARIO_PADRAO } from "@/lib/potencial";
import {
  ACOES_LOTE,
  ETAPAS,
  FAIXAS_CURTAS,
  FAIXAS_FORA,
  FAIXAS_TRABALHO,
  ROTULO_ACAO,
  buscar,
  filtrarPorEtapa,
  naMesa,
  ordenarFila,
  proximoEmpurrao,
  type Acao,
  type Esteira,
  type Linha,
} from "@/lib/cockpit";
import { PainelEmpresa } from "@/components/PainelEmpresa";
import { Trilha, type EstadoTrilha } from "@/components/Trilha";

/**
 * O COCKPIT — uma tela onde havia sete.
 *
 * Carteira, fila, lote, entrega, painel da janela, radar e revisão eram a mesma
 * carteira vista de sete ângulos, e o contador trocava de endereço para fazer
 * gestos que são um só: pegar a lista, decidir, emitir o papel, colher a
 * assinatura. Aqui isso acontece numa lista, com a próxima ação em cada linha e
 * a mesma ação disponível em lote no topo. A empresa abre em gaveta POR CIMA da
 * fila: ver o dossiê não pode custar sair do trabalho.
 */

export interface Aviso {
  id: string;
  tipo: "radar" | "revisao" | "contato";
  titulo: string;
  detalhe?: string | null;
  o_que_fazer?: string | null;
  fonte?: string | null;
  /** ids das empresas que este aviso joga na fila — aviso sem trabalho não entra */
  empresas: string[];
  nao_lido?: boolean;
}

type Grupo = "trabalho" | "curtas" | "fora" | "todas";

const GRUPOS: { chave: Grupo; rotulo: string; faixas: Faixa[] | null }[] = [
  { chave: "trabalho", rotulo: "Precisam decidir", faixas: FAIXAS_TRABALHO },
  { chave: "curtas", rotulo: "Laudo curto", faixas: FAIXAS_CURTAS },
  { chave: "fora", rotulo: "Fora da janela", faixas: FAIXAS_FORA },
  { chave: "todas", rotulo: "Toda a carteira", faixas: null },
];

const COR_FAIXA: Record<string, string> = {
  A: "bg-vermelhowash text-vermelho",
  B: "bg-amarelowash text-amarelo",
  C: "bg-verdewash text-verde",
  D: "bg-neutrowash text-muted",
  MEI: "bg-neutrowash text-neutro",
  FORA: "bg-neutrowash text-muted",
};

/** ação principal da linha: destaque só onde há trabalho de verdade */
const FORTE: Acao[] = ["analisar", "confirmar", "emitir", "termo"];

const PAGINA = 50;

export function Cockpit({
  linhas,
  esteira,
  dias,
  posPct,
  fase,
  avisos,
  totalCarteira,
  temEscritorio,
}: {
  linhas: Linha[];
  esteira: Esteira;
  dias: number;
  posPct: number;
  fase: FaseAtual;
  avisos: Aviso[];
  totalCarteira: number;
  temEscritorio: boolean;
}) {
  const router = useRouter();
  const [etapa, setEtapa] = useState<keyof Esteira | null>(null);
  const [grupo, setGrupo] = useState<Grupo>("trabalho");
  const [busca, setBusca] = useState("");
  const [selecao, setSelecao] = useState<Set<string>>(new Set());
  const [foco, setFoco] = useState<{ aviso: Aviso; ids: Set<string> } | null>(null);
  const [gaveta, setGaveta] = useState<{ id: string; aba: "decisao" | "dossie" } | null>(null);
  const [honorario, setHonorario] = useState(HONORARIO_PADRAO);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [recado, setRecado] = useState<string | null>(null);
  const [mostrar, setMostrar] = useState(PAGINA);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [avisosLidos, setAvisosLidos] = useState<Set<string>>(new Set());
  const [todosAvisos, setTodosAvisos] = useState(false);
  // a gaveta larga é o padrão; quem precisa da mesa inteira (comparativo com as
  // três composições lado a lado) abre no máximo sem perder o lugar na fila
  const [gavetaMax, setGavetaMax] = useState(false);

  // a gaveta cobre a fila inteira no celular: sem travar o fundo, o dedo rola a
  // lista atrás do dossiê e a pessoa perde o lugar onde estava
  useEffect(() => {
    document.body.style.overflow = gaveta ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [gaveta]);

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") setGaveta(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filtradas = useMemo(() => {
    let base = linhas;
    if (foco) base = base.filter((l) => foco.ids.has(l.id));
    else {
      const g = GRUPOS.find((x) => x.chave === grupo);
      if (g?.faixas) base = base.filter((l) => g.faixas!.includes(l.faixa));
    }
    base = filtrarPorEtapa(base, etapa);
    base = buscar(base, busca);
    return ordenarFila(base);
  }, [linhas, foco, grupo, etapa, busca]);

  // a trilha lê a MESMA fila ordenada: o "próximo passo" que ela anuncia é
  // literalmente a primeira linha com trabalho pendente, não uma segunda regra
  const pendentes = useMemo(
    () => ordenarFila(linhas).filter((l) => !["pronto", "fora"].includes(l.acao)),
    [linhas]
  );
  const proxima = pendentes[0] ?? null;
  const trilha: EstadoTrilha = {
    temEscritorio,
    empresas: esteira.importadas,
    naFila: esteira.decidem,
    analises: esteira.analisadas,
    laudos: esteira.laudos,
    assinados: esteira.assinados,
    proxima: proxima ? { id: proxima.id, nome: proxima.razao_social } : null,
    proximaAcao: proxima
      ? (proxima.acao as "analisar" | "confirmar" | "emitir" | "termo" | "cobrar")
      : null,
  };

  const visiveis = filtradas.slice(0, mostrar);
  const mesa = naMesa(linhas, honorario);
  const selecionadas = filtradas.filter((l) => selecao.has(l.id));

  // O empurrão sai da carteira INTEIRA, não da fila filtrada: ele responde
  // "o que fazer agora", e essa resposta não pode mudar porque o contador
  // digitou algo na busca.
  const empurrao = useMemo(() => proximoEmpurrao(linhas), [linhas]);

  function agirEmpurrao() {
    if (!empurrao) return;
    if (empurrao.tipo === "emitir_primeiro" && empurrao.alvo?.analise_id) {
      return chamar(
        "/api/laudo",
        { analise_id: empurrao.alvo.analise_id },
        "empurrao",
        (j) => {
          const id = (j as { laudo_id?: string }).laudo_id;
          if (id) window.open(`/doc/laudo/${id}`, "_blank");
          return `Primeiro laudo emitido para ${empurrao.alvo?.razao_social}.`;
        }
      );
    }
    if (empurrao.tipo === "termo_pendente") {
      const ids = linhas
        .filter((l) => l.laudo_id && !l.termo_id && l.tem_contato)
        .map((l) => l.analise_id)
        .filter(Boolean) as string[];
      return chamar("/api/termo/lote", { analise_ids: ids, enviar_email: true }, "empurrao", (j) => {
        const r = j as { criados: number; enviados: number };
        return `${r.criados} termos gerados${r.enviados ? ` e ${r.enviados} enviados por e-mail` : ""}.`;
      });
    }
    // cobrar_assinatura: não há ação em massa segura — leva para quem falta
    setEtapa("laudos");
    setGrupo("trabalho");
    setBusca("");
  }

  function alternar(id: string) {
    setSelecao((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function selecionarTodas() {
    setSelecao((s) =>
      s.size === filtradas.length ? new Set() : new Set(filtradas.map((l) => l.id))
    );
  }

  async function chamar(url: string, corpo: unknown, chave: string, sucesso: (j: unknown) => string) {
    setOcupado(chave);
    setRecado(null);
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const json = await resp.json();
      if (!resp.ok) {
        setRecado(json.erro ?? "não foi possível concluir");
        return;
      }
      setRecado(sucesso(json));
      setSelecao(new Set());
      router.refresh();
    } catch {
      setRecado("falha de rede");
    } finally {
      setOcupado(null);
    }
  }

  /** a ação da LINHA: o que falta naquela empresa, executado ali mesmo */
  function agir(l: Linha) {
    if (l.acao === "emitir") {
      return chamar(
        "/api/laudo",
        { analise_id: l.analise_id },
        `linha-${l.id}`,
        (j) => {
          const laudo = (j as { laudo_id?: string }).laudo_id;
          if (laudo) window.open(`/doc/laudo/${laudo}`, "_blank");
          return `Laudo emitido para ${l.razao_social}.`;
        }
      );
    }
    if (l.acao === "termo") {
      return chamar(
        "/api/termo/lote",
        { analise_ids: [l.analise_id], enviar_email: true },
        `linha-${l.id}`,
        (j) => {
          const r = j as { criados: number; enviados: number };
          return r.criados === 0
            ? `Nenhum termo gerado para ${l.razao_social} — confira laudo e contato.`
            : `Termo gerado${r.enviados > 0 ? " e enviado por e-mail" : " (envie o link ao cliente)"}.`;
        }
      );
    }
    if (l.acao === "cobrar" && l.termo_token) {
      const link = `${window.location.origin}/assinar/${l.termo_token}`;
      navigator.clipboard?.writeText(link);
      setCopiado(l.id);
      setTimeout(() => setCopiado(null), 2000);
      setRecado(`Link de assinatura de ${l.razao_social} copiado.`);
      return;
    }
    setGaveta({ id: l.id, aba: l.acao === "contato" || l.acao === "fora" ? "dossie" : "decisao" });
  }

  function lote(chave: "analisar" | "emitir" | "enviar" | "termo") {
    const ids = selecionadas.map((l) => l.id);
    const analises = selecionadas.map((l) => l.analise_id).filter(Boolean) as string[];
    if (chave === "analisar") {
      return chamar("/api/analise/lote", { empresa_ids: ids }, "lote-analisar", (j) => {
        const r = j as { gravadas: number; puladas: number };
        return `${r.gravadas} análises gravadas com premissas estimadas pelo CNAE${
          r.puladas ? `, ${r.puladas} puladas por já terem análise sua` : ""
        }. Confirme cada uma antes de emitir o laudo.`;
      });
    }
    if (chave === "emitir") {
      return chamar("/api/laudo/lote", { analise_ids: analises }, "lote-emitir", (j) => {
        const r = j as { emitidos: number; ja_tinham: number; bloqueados: number };
        return `${r.emitidos} laudos emitidos${r.ja_tinham ? `, ${r.ja_tinham} já existiam` : ""}${
          r.bloqueados ? `, ${r.bloqueados} bloqueados pelo limite do plano gratuito` : ""
        }.`;
      });
    }
    if (chave === "enviar") {
      return chamar("/api/laudo/enviar", { analise_ids: analises }, "lote-enviar", (j) => {
        const r = j as { enviados: number; sem_contato: number; sem_laudo: number };
        return `${r.enviados} laudos enviados ao cliente${
          r.sem_contato ? `, ${r.sem_contato} sem e-mail de contato` : ""
        }${r.sem_laudo ? `, ${r.sem_laudo} ainda sem laudo emitido` : ""}.`;
      });
    }
    return chamar(
      "/api/termo/lote",
      { analise_ids: analises, enviar_email: true },
      "lote-termo",
      (j) => {
        const r = j as { criados: number; enviados: number; sem_contato: number; sem_laudo: number };
        return `${r.criados} termos gerados, ${r.enviados} enviados por e-mail${
          r.sem_contato ? `, ${r.sem_contato} sem contato cadastrado` : ""
        }${r.sem_laudo ? `, ${r.sem_laudo} ainda sem laudo` : ""}.`;
      }
    );
  }

  async function marcarLido(aviso: Aviso) {
    setAvisosLidos((s) => new Set(s).add(aviso.id));
    await fetch("/api/radar/leitura", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_id: aviso.id, lido: true }),
    });
    router.refresh();
  }

  // ------------------------------------------------------------- carteira vazia
  if (totalCarteira === 0) {
    return (
      <>
        <Trilha estado={trilha} aoAbrirEmpresa={(id, aba) => setGaveta({ id, aba })} />
        <div className="rounded border border-line bg-surface p-6 shadow-card">
        <div className="mx-auto max-w-md text-center">
          <h2 className="text-[16px] font-bold text-ink">Comece pela sua carteira</h2>
          <p className="mt-1.5 text-[13.5px] text-slate2">
            Suba um CSV com CNPJ e razão social. Em segundos você vê quantos clientes precisam
            decidir até 30 de setembro — e quanto isso vale em honorário.
          </p>
        </div>
        <div className="mx-auto mt-6 grid max-w-lg gap-2.5">
          {[
            ["1", "Importe a carteira", "Aceita a exportação do seu sistema, sem formato rígido."],
            ["2", "Veja quem precisa decidir", "A triagem elimina 60-80% da base sozinha."],
            ["3", "Emita laudo e termo", "Papel cobrável com a sua marca, sem trocar de tela."],
          ].map(([n, t, dsc]) => (
            <div key={n} className="flex items-start gap-3 rounded-sm border border-linesoft bg-surface2 px-3.5 py-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-[11px] text-white">
                {n}
              </span>
              <div>
                <div className="text-[13px] font-semibold">{t}</div>
                <div className="text-[12px] text-muted">{dsc}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 text-center">
          <Link
            href="/painel/importar"
            className="inline-block rounded-sm bg-ink px-5 py-3 text-sm font-semibold text-white"
          >
            Importar carteira
          </Link>
        </div>
        </div>
      </>
    );
  }

  return (
    <div className="pb-2">
      <Trilha estado={trilha} aoAbrirEmpresa={(id, aba) => setGaveta({ id, aba })} />

      {/* ================================================= 2. LINHA DE PRODUÇÃO */}
      <div className="rounded border border-line bg-surface p-3.5 shadow-card">
        <div className="mb-2 flex items-center justify-between gap-2 md:mb-3">
          <div className="flex items-center gap-2">
            <span className="hidden font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted md:inline">
              Linha de produção
            </span>
            {/* O selo saía de `dias > 0 ? ... : "janela encerrada"`, e a partir
                de 1º de outubro dizia "encerrada" para sempre — o contador que
                acabou de assinar lendo que o serviço acabou. Agora ele conta a
                FASE: alíquota sendo fixada, prazo de cancelamento, próxima
                janela. Ver lib/janela.ts. */}
            <span
              title={fase.chamada}
              className="rounded-full bg-accentwash px-2 py-0.5 font-mono text-[10.5px] font-semibold text-accentdeep"
            >
              {fase.selo}
              {fase.previsto && <span className="ml-1 opacity-70">(prevista)</span>}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* SEMPRE VISÍVEL, e não só na tela vazia.
                O link de importar existia apenas no estado inicial e no passo 2
                da trilha — os dois somem assim que a primeira carteira entra. A
                partir dali o contador que recebe um cliente novo não tinha por
                onde adicionar, e carteira de escritório muda toda semana. */}
            <Link
              href="/painel/importar"
              className="rounded-sm border border-line px-2.5 py-1 font-mono text-[10.5px] font-semibold text-accentdeep"
            >
              + empresas
            </Link>
            <a
              href="/doc/relatorio"
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[10.5px] text-accentdeep underline underline-offset-2"
            >
              relatório do escritório
            </a>
          </div>
        </div>

        <div className="h-1 overflow-hidden rounded-full bg-linesoft">
          <div className="h-full rounded-full bg-accent" style={{ width: `${posPct}%` }} />
        </div>

        {/* cinco colunas mesmo em 390px: a linha de produção é a resposta a "como
            está a carteira" e não pode empurrar a fila para fora da tela */}
        <div className="mt-3 grid grid-cols-5 gap-1">
          {ETAPAS.map((et) => {
            const ativo = etapa === et.chave;
            return (
              <button
                key={et.chave}
                title={et.ajuda}
                onClick={() => {
                  setEtapa(ativo ? null : et.chave);
                  setMostrar(PAGINA);
                  if (!ativo && et.chave !== "decidem") setGrupo("todas");
                  if (!ativo && et.chave === "decidem") setGrupo("trabalho");
                }}
                className={`rounded-sm border px-1.5 py-2 text-left md:px-2.5 ${
                  ativo ? "border-ink bg-ink text-white" : "border-line bg-surface2 hover:border-accent"
                }`}
              >
                <div className="font-mono text-[16px] font-semibold leading-none md:text-[17px]">
                  {esteira[et.chave]}
                </div>
                <div
                  className={`mt-1 text-[10px] leading-tight md:text-[11px] ${
                    ativo ? "text-white/80" : "text-muted"
                  }`}
                >
                  {et.rotulo}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-linesoft pt-2.5">
          <div className="text-[12.5px] text-slate2">
            <b className="font-mono text-[15px] text-ink">{moeda(mesa.valor)}</b> ainda na mesa —{" "}
            {mesa.empresas} {mesa.empresas === 1 ? "empresa urgente sem laudo" : "empresas urgentes sem laudo"}
          </div>
          <label className="flex items-center gap-1.5 text-[11.5px] text-muted">
            honorário
            <span className="flex items-center rounded-sm border border-line px-2">
              <span className="font-mono text-[11px] text-muted">R$</span>
              <input
                value={honorario}
                onChange={(ev) => setHonorario(Number(ev.target.value.replace(/\D/g, "")) || 0)}
                inputMode="numeric"
                className="w-16 bg-transparent px-1 py-1 font-mono text-[12px] outline-none"
              />
            </span>
          </label>
        </div>
      </div>

      {/* ================================= 3b. O EMPURRÃO — a UMA coisa a fazer
          Vem ANTES dos avisos de propósito. Avisos são uma lista do que existe;
          o empurrão é a próxima ação, com a empresa pelo nome. Quando os dois
          aparecem juntos, o que decide se o contador age é qual está no topo. */}
      {empurrao && (
        <div className="mt-3 rounded border-l-[3px] border-accent border-y border-r border-line bg-accentwash px-4 py-3.5 shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="max-w-[62ch]">
              <div className="text-[14.5px] font-bold text-ink">{empurrao.titulo}</div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-slate2">{empurrao.corpo}</p>
            </div>
            <button
              onClick={agirEmpurrao}
              disabled={ocupado === "empurrao"}
              className="shrink-0 rounded-sm bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {ocupado === "empurrao" ? "..." : empurrao.rotulo_acao}
            </button>
          </div>
        </div>
      )}

      {/* ========================================== 4. AVISOS QUE GERAM TRABALHO */}
      {avisos.length > 0 && (
        <div className="mt-3 space-y-2">
          {(todosAvisos ? avisos : avisos.slice(0, 2)).map((av) => (
            <div
              key={av.id}
              className="rounded border border-line bg-surface px-3 py-2.5 shadow-card"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {av.nao_lido && !avisosLidos.has(av.id) && (
                      <span className="rounded-full bg-accent px-2 py-0.5 font-mono text-[10px] font-semibold text-[#04212B]">
                        novo
                      </span>
                    )}
                    <span className="text-[13px] font-semibold leading-tight">{av.titulo}</span>
                  </div>
                  {/* o porquê fica dobrado: o aviso existe para gerar trabalho, e o
                      trabalho é o botão ao lado — não o texto */}
                  {(av.detalhe || av.o_que_fazer) && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-[12px] text-accentdeep">
                        por que isso apareceu
                      </summary>
                      {av.detalhe && <p className="mt-1 text-[12.5px] text-muted">{av.detalhe}</p>}
                      {av.o_que_fazer && (
                        <p className="mt-1 text-[12.5px] text-slate2">
                          <b>O que fazer:</b> {av.o_que_fazer}
                        </p>
                      )}
                      {av.fonte && (
                        <p className="mt-0.5 font-mono text-[10.5px] text-muted">fonte: {av.fonte}</p>
                      )}
                    </details>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  <button
                    onClick={() => {
                      setFoco({ aviso: av, ids: new Set(av.empresas) });
                      setEtapa(null);
                      setBusca("");
                      setMostrar(PAGINA);
                    }}
                    className="rounded-sm bg-ink px-3 py-2 text-[12.5px] font-semibold text-white"
                  >
                    Trazer {av.empresas.length} para a fila
                  </button>
                  {av.tipo === "radar" && (
                    <button
                      onClick={() => marcarLido(av)}
                      disabled={avisosLidos.has(av.id)}
                      className="rounded-sm border border-line px-3 py-2 text-[12.5px] font-semibold text-slate2 disabled:opacity-40"
                    >
                      {avisosLidos.has(av.id) ? "Lido ✓" : "Marcar como lido"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {avisos.length > 2 && (
            <button
              onClick={() => setTodosAvisos((v) => !v)}
              className="w-full rounded border border-dashed border-line px-3 py-2 text-[12.5px] font-semibold text-slate2"
            >
              {todosAvisos
                ? "Ocultar os avisos extras"
                : `Ver os outros ${avisos.length - 2} avisos`}
            </button>
          )}
        </div>
      )}

      {/* ============================================================= 3. A FILA */}
      <div className="mt-3 rounded border border-line bg-surface shadow-card">
        {/* filtros */}
        <div className="border-b border-linesoft p-3">
          {foco ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm bg-accentwash px-3 py-2">
              <span className="text-[12.5px] text-accentdeep">
                Mostrando só as {foco.ids.size} empresas de: <b>{foco.aviso.titulo}</b>
              </span>
              <button
                onClick={() => setFoco(null)}
                className="rounded-sm border border-accentdeep px-2.5 py-1 text-[12px] font-semibold text-accentdeep"
              >
                Limpar
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {GRUPOS.map((g) => (
                <button
                  key={g.chave}
                  onClick={() => {
                    setGrupo(g.chave);
                    setMostrar(PAGINA);
                  }}
                  className={`rounded-full px-3 py-1.5 text-[12px] font-semibold ${
                    grupo === g.chave ? "bg-ink text-white" : "border border-line bg-surface text-slate2"
                  }`}
                >
                  {g.rotulo}
                </button>
              ))}
            </div>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <input
              value={busca}
              onChange={(ev) => {
                setBusca(ev.target.value);
                setMostrar(PAGINA);
              }}
              placeholder="Buscar por nome, CNPJ ou CNAE"
              className="min-w-0 flex-1 rounded-sm border border-line px-3 py-2 text-[13px] outline-none focus:border-accent"
            />
            <button
              onClick={selecionarTodas}
              className="whitespace-nowrap rounded-sm border border-line px-3 py-2 text-[12.5px] font-semibold text-slate2"
            >
              {selecao.size === filtradas.length && filtradas.length > 0 ? "Limpar seleção" : "Selecionar tudo"}
            </button>
          </div>

          {grupo !== "todas" && !foco && (
            <p className="mt-2 text-[11.5px] text-muted">
              {grupo === "trabalho"
                ? EXPLICA_FAIXA.A.oQueFazer
                : grupo === "curtas"
                ? EXPLICA_FAIXA.D.oQueFazer
                : EXPLICA_FAIXA.MEI.oQueFazer}
            </p>
          )}
        </div>

        {/* barra de lote */}
        {selecao.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-linesoft bg-surface2 p-3">
            <span className="text-[12.5px] font-semibold">{selecionadas.length} selecionadas</span>
            {ACOES_LOTE.map((ac) => (
              <button
                key={ac.chave}
                title={ac.ajuda}
                onClick={() => lote(ac.chave)}
                disabled={!!ocupado}
                className="rounded-sm border border-ink bg-ink px-3 py-2 text-[12.5px] font-semibold text-white disabled:opacity-40"
              >
                {ocupado === `lote-${ac.chave}` ? "…" : ac.rotulo}
              </button>
            ))}
            <button
              onClick={() => setSelecao(new Set())}
              className="text-[12.5px] font-semibold text-muted underline underline-offset-2"
            >
              cancelar
            </button>
          </div>
        )}

        {recado && (
          <div className="border-b border-linesoft bg-accentwash px-3.5 py-2.5 text-[12.5px] text-accentdeep">
            {recado}
          </div>
        )}

        {/* linhas */}
        {filtradas.length === 0 ? (
          <p className="p-6 text-center text-[13px] text-muted">
            Nada aqui com estes filtros. Limpe a busca ou troque o grupo.
          </p>
        ) : (
          <ul>
            {visiveis.map((l) => (
              <li
                key={l.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-linesoft px-3 py-2.5 last:border-b-0"
              >
                <input
                  type="checkbox"
                  checked={selecao.has(l.id)}
                  onChange={() => alternar(l.id)}
                  aria-label={`Selecionar ${l.razao_social}`}
                  className="shrink-0"
                />

                <button
                  onClick={() => setGaveta({ id: l.id, aba: "dossie" })}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    {l.prioridade && (
                      <span className="rounded-full bg-vermelho px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-white">
                        prioridade
                      </span>
                    )}
                    <span className="truncate text-[13.5px] font-semibold">{l.razao_social}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10.5px] text-muted">
                    <span>{mascararCnpj(l.cnpj)}</span>
                    <span className={`rounded-full px-1.5 ${COR_FAIXA[l.faixa]}`}>{ROTULO_FAIXA[l.faixa]}</span>
                    {l.saida && <span>{l.saida}</span>}
                    {l.re != null && <span>repasse {pct(l.re)}</span>}
                    {l.estimada && <span className="text-amarelo">premissas estimadas</span>}
                    {l.laudo_numero != null && <span className="text-verde">laudo {String(l.laudo_numero).padStart(4, "0")}</span>}
                    {l.assinado && <span className="text-verde">assinado</span>}
                  </div>
                </button>

                <button
                  onClick={() => agir(l)}
                  disabled={ocupado === `linha-${l.id}` || l.acao === "pronto" || l.acao === "fora"}
                  className={`shrink-0 whitespace-nowrap rounded-sm px-3 py-2 text-[12.5px] font-semibold ${
                    FORTE.includes(l.acao)
                      ? "bg-ink text-white"
                      : l.acao === "cobrar"
                      ? "border border-accentdeep text-accentdeep"
                      : "border border-line text-muted"
                  } disabled:opacity-50`}
                >
                  {ocupado === `linha-${l.id}`
                    ? "…"
                    : copiado === l.id
                    ? "Link copiado ✓"
                    : ROTULO_ACAO[l.acao]}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-[11.5px] text-muted">
          <span>
            mostrando {visiveis.length} de {filtradas.length}
            {filtradas.length !== linhas.length ? ` (carteira: ${linhas.length})` : ""}
          </span>
          {visiveis.length < filtradas.length && (
            <button
              onClick={() => setMostrar((m) => m + PAGINA)}
              className="rounded-sm border border-line px-3 py-1.5 font-semibold text-slate2"
            >
              Mostrar mais {Math.min(PAGINA, filtradas.length - visiveis.length)}
            </button>
          )}
        </div>
      </div>

      <p className="mt-3 max-w-[80ch] text-[11px] leading-relaxed text-muted">
        Os números são estimativas de cenário a partir das premissas informadas. A alíquota de
        referência de IBS/CBS só é fixada por Resolução do Senado até 31/10/2026 — depois do
        fechamento desta janela. A decisão e a responsabilidade técnica são do contador que assina.
      </p>

      {/* ====================================================== 2. A GAVETA */}
      {gaveta && (
        <div className="fixed inset-0 z-50">
          <button
            aria-label="Fechar"
            onClick={() => setGaveta(null)}
            className="absolute inset-0 h-full w-full bg-ink/50"
          />
          {/* A LARGURA DA GAVETA É PARTE DA FERRAMENTA, NÃO ENFEITE.
              Ela era 560px fixos. Dentro disso, o comparativo — que divide
              campos e resultado em duas colunas a partir de telas grandes —
              ficava com 340px de formulário e o resto espremido, e as tabelas
              de composição só cabiam com rolagem lateral. Número de decisão
              que exige rolagem horizontal para ser lido é número que ninguém
              lê. Agora acompanha a tela até 1120px, e há o modo máximo. */}
          <div
            className={`absolute inset-x-0 bottom-0 top-8 flex flex-col overflow-hidden rounded-t-lg bg-surface2 shadow-card md:inset-y-0 md:left-auto md:right-0 md:top-0 md:rounded-none ${
              gavetaMax ? "md:w-[96vw]" : "md:w-[min(1120px,92vw)]"
            }`}
          >
            <div className="flex flex-none items-center justify-between gap-3 border-b border-line bg-surface2 px-4 py-2.5 md:px-6">
              <button
                onClick={() => setGaveta(null)}
                className="flex items-center gap-1.5 text-[12.5px] font-semibold text-accentdeep"
              >
                ← voltar à fila
              </button>
              <button
                onClick={() => setGavetaMax((v) => !v)}
                className="hidden rounded-sm border border-line px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted hover:border-accent hover:text-accentdeep md:block"
                title={gavetaMax ? "Voltar à largura normal" : "Ocupar a tela toda"}
              >
                {gavetaMax ? "reduzir" : "ampliar"}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 md:p-6">
              <PainelEmpresa
                empresaId={gaveta.id}
                modo="gaveta"
                abaInicial={gaveta.aba}
                aoMudar={() => router.refresh()}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
