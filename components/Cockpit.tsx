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

/* "Toda a carteira" vem primeiro porque é o padrão — chip ativo no fim da
   fileira faz o padrão parecer escolha exótica */
const GRUPOS: { chave: Grupo; rotulo: string; faixas: Faixa[] | null }[] = [
  { chave: "todas", rotulo: "Toda a carteira", faixas: null },
  { chave: "trabalho", rotulo: "Precisam decidir", faixas: FAIXAS_TRABALHO },
  { chave: "curtas", rotulo: "Laudo curto", faixas: FAIXAS_CURTAS },
  { chave: "fora", rotulo: "Fora da janela", faixas: FAIXAS_FORA },
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
  /**
   * ABRE EM "TODAS" — decisão de 07/08/2026, e o caso que a provocou importa:
   * a primeira empresa importada numa conta era de Lucro Presumido (faixa
   * FORA), o filtro padrão era "Precisam decidir" (A/B), e a tela abriu VAZIA
   * segundos depois de uma importação bem-sucedida. Parecia importação
   * perdida; era filtro.
   *
   * E há mérito além do susto: a triagem classifica pelo CNAE PRINCIPAL, e
   * empresa com atividades secundárias pode estar na faixa errada. Filtro que
   * esconde por padrão transforma uma estimativa de prioridade em veredito
   * silencioso. A classificação ordena a fila; não pode omitir empresa.
   */
  const [grupo, setGrupo] = useState<Grupo>("todas");
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

  /**
   * QUEM ORIENTA ESTA TELA — a Trilha ou o Empurrão, nunca os dois.
   *
   * Sem escritório preenchido a Trilha manda, porque é a única que pede nome e
   * CRC. Fora isso, quem existir: o Empurrão tem prioridade porque é a
   * instrução melhor (empresa pelo nome, botão que executa).
   */
  const mostrarTrilha = !trilha.temEscritorio || !empurrao;

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
        const r = j as {
          emitidos: number;
          ja_tinham: number;
          bloqueados: number;
          sem_confirmar?: number;
        };
        /* O QUE FICOU DE FORA É A PARTE IMPORTANTE DESTE RECADO. O lote não
           emite sobre premissa estimada — e se a tela não contar quantas
           ficaram, o contador conclui que emitiu a carteira inteira. */
        return (
          `${r.emitidos} laudos emitidos${r.ja_tinham ? `, ${r.ja_tinham} já existiam` : ""}${
            r.bloqueados ? `, ${r.bloqueados} bloqueados pelo limite do plano gratuito` : ""
          }.` +
          (r.sem_confirmar
            ? ` ${r.sem_confirmar} ficaram de fora porque as premissas ainda são estimadas — abra cada uma, confira e salve.`
            : "")
        );
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
        {/* OS OUTROS TRÊS PASSOS NUMERADOS SAÍRAM DAQUI (08/08/2026).
            Esta tela mostrava DUAS listas numeradas do mesmo assunto — os 4
            passos da Trilha e mais 3 aqui, ambas começando em 1. Sete passos
            para um único caminho, e o segundo bloco era o mais fraco: não sabia
            o que já tinha sido feito, não marcava nada como concluído, e ainda
            pedia a carteira inteira ("suba um CSV") quando a Trilha pede — com
            razão — uma empresa só.

            Sobra o que ele tinha de útil e a Trilha não garante: um caminho
            para importar mesmo se a pessoa ocultar a Trilha. */}
        <div className="rounded border border-line bg-surface p-5 text-center shadow-card">
          <p className="text-[13px] text-slate2">
            Sua carteira ainda está vazia.
          </p>
          <Link
            href="/painel/importar"
            className="mt-3 inline-block rounded-sm bg-ink px-5 py-2.5 text-[13px] font-semibold text-white"
          >
            Adicionar empresas
          </Link>
        </div>
      </>
    );
  }

  return (
    <div className="pb-2">
      {/* UMA TELA, UM ORIENTADOR (08/08/2026).
       *
       * A Trilha e o Empurrão diziam a mesma coisa ao mesmo tempo — "emita o
       * primeiro laudo" aparecia nos dois, um em cima do outro. Duas vozes com
       * a mesma ordem não orientam mais: orientam menos.
       *
       * A escolha entre elas não é de gosto, é de qualidade da instrução: o
       * Empurrão cita a empresa pelo nome, sabe qual é o gargalo da carteira e
       * o botão dele EXECUTA ali mesmo. A Trilha é genérica. Então o Empurrão
       * ganha sempre que existe.
       *
       * A exceção é o escritório em branco. Aí a Trilha volta, porque é a única
       * que pede nome e CRC — e deixar o Empurrão emitir o primeiro laudo antes
       * disso seria entregar ao cliente o documento sem a marca de quem assina.
       */}
      {mostrarTrilha && (
        <Trilha estado={trilha} aoAbrirEmpresa={(id, aba) => setGaveta({ id, aba })} />
      )}

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
            {/* Os dois eram mono 10,5px — um deles um sublinhado solto. Tinham
                tamanho de legenda e nome de substantivo ("+ empresas",
                "relatório do escritório"), então não liam como coisa clicável.
                Viraram botões com verbo: o que a pessoa procura é a AÇÃO. */}
            {/* E AGORA COM DESTAQUE. Os dois botões eram visualmente idênticos
                — mesma borda, mesmo fundo, mesmo peso — e um deles é a ação que
                faz o produto andar (sem carteira não há o que analisar),
                enquanto o outro é consulta. Dois botões iguais lado a lado não
                têm hierarquia: a pessoa lê os dois, toda vez. */}
            <Link
              href="/painel/importar"
              className="rounded-sm bg-accentdeep px-3 py-1.5 text-[12px] font-semibold text-white shadow-card hover:bg-accent"
            >
              + Adicionar empresas
            </Link>
            <a
              href="/doc/relatorio"
              target="_blank"
              rel="noreferrer"
              className="rounded-sm border border-line bg-surface px-3 py-1.5 text-[12px] font-semibold text-accentdeep hover:border-accent"
            >
              Abrir relatório do escritório
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

        {/*
          "PRECISAM DECIDIR" É UNIVERSO, NÃO PENDÊNCIA.
          O número não baixa conforme o trabalho anda — é a faixa A+B inteira.
          Clicar nele trazia empresas já decididas no meio da lista sem dizer
          isso em lugar nenhum. Esta linha é a diferença entre as duas coisas,
          e só aparece quando o filtro está ligado.
        */}
        {etapa === "decidem" && (
          <div className="mt-2 rounded-sm bg-surface2 px-3 py-2 text-[12px] leading-relaxed text-slate2">
            {esteira.decidem_pendentes === 0 ? (
              <>
                As <b>{esteira.decidem}</b> empresas desta janela já têm laudo emitido. O que sobra
                aqui é acompanhamento de assinatura.
              </>
            ) : (
              <>
                <b>{esteira.decidem_pendentes}</b> das {esteira.decidem} ainda não têm laudo — as
                demais já foram avaliadas e aparecem como decididas. A fila começa pelas pendentes.{" "}
                <button
                  // ux-ok: o clique refaz a própria lista logo abaixo
                  onClick={() => {
                    setEtapa("decidem_pendentes");
                    setMostrar(PAGINA);
                  }}
                  className="font-semibold text-accentdeep underline underline-offset-2"
                >
                  ver só as pendentes
                </button>
              </>
            )}
          </div>
        )}

        {etapa === "decidem_pendentes" && (
          <div className="mt-2 rounded-sm bg-surface2 px-3 py-2 text-[12px] text-slate2">
            Mostrando só as <b>{esteira.decidem_pendentes}</b> sem laudo.{" "}
            <button
              // ux-ok: o clique refaz a própria lista logo abaixo
              onClick={() => {
                setEtapa("decidem");
                setMostrar(PAGINA);
              }}
              className="font-semibold text-accentdeep underline underline-offset-2"
            >
              ver as {esteira.decidem} da janela
            </button>
          </div>
        )}

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
          aparecem juntos, o que decide se o contador age é qual está no topo.

          `!mostrarTrilha` é o outro lado da regra de um orientador só: enquanto
          o escritório não tem nome, quem manda é a Trilha e este bloco se cala.
          Sem isso, o Empurrão emitiria o primeiro laudo sem marca nenhuma. */}
      {empurrao && !mostrarTrilha && (
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

      {/* ========================================== 4. AVISOS QUE GERAM TRABALHO
          SÓ OS NÃO LIDOS (07/08/2026). O card marcado como lido continuava na
          tela — o selo "novo" sumia e o resto ficava, para sempre, em toda
          visita. Aviso lido é história, e história mora no radar (aba Reforma),
          não na mesa de trabalho. O rodapé diz quantos foram para lá. */}
      {(() => {
        const vivos = avisos.filter(
          (av) => av.tipo !== "radar" || (av.nao_lido !== false && !avisosLidos.has(av.id))
        );
        const ocultos = avisos.length - vivos.length;
        if (vivos.length === 0) {
          return ocultos > 0 ? (
            <p className="mt-3 text-[11.5px] text-muted">
              {ocultos} aviso{ocultos > 1 ? "s" : ""} lido{ocultos > 1 ? "s" : ""} —{" "}
              <Link href="/painel/reforma" className="underline underline-offset-2 hover:text-accentdeep">
                histórico no radar
              </Link>
            </p>
          ) : null;
        }
        return (
        <div className="mt-3 space-y-2">
          {(todosAvisos ? vivos : vivos.slice(0, 2)).map((av) => (
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
          {vivos.length > 2 && (
            <button
              onClick={() => setTodosAvisos((v) => !v)}
              className="w-full rounded border border-dashed border-line px-3 py-2 text-[12.5px] font-semibold text-slate2"
            >
              {todosAvisos
                ? "Ocultar os avisos extras"
                : `Ver os outros ${vivos.length - 2} avisos`}
            </button>
          )}
          {ocultos > 0 && (
            <p className="text-[11px] text-muted">
              {ocultos} lido{ocultos > 1 ? "s" : ""} —{" "}
              <Link href="/painel/reforma" className="underline underline-offset-2 hover:text-accentdeep">
                histórico no radar
              </Link>
            </p>
          )}
        </div>
        );
      })()}

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
            <div>
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
              {/* uma linha, de propósito: a faixa é estimativa por CNAE
                  principal — o filtro agrupa, não dispensa ninguém de análise */}
              <p className="mt-1.5 text-[11.5px] text-muted">
                A faixa vem do CNAE principal — atividade secundária pode mudar o quadro. O
                filtro agrupa; a análise é de todas.
              </p>
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
          <>
          {/* CABEÇALHO DAS COLUNAS (07/08/2026) — a linha era um parágrafo de
              chips: com enquadramento numas empresas e não noutras, o olho não
              tinha coluna para descer. Empresa · RBT12 · Enquadramento · Faixa
              agora são colunas de verdade; os chips de fluxo (laudo, termo,
              coleta) continuam na sublinha, porque são estado, não cadastro. */}
          <div className="hidden border-b border-linesoft px-3 py-1.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted md:grid md:grid-cols-[1.25rem_minmax(0,1fr)_6.5rem_9rem_8.5rem_auto] md:items-center md:gap-x-3">
            <span />
            <span>Empresa</span>
            <span className="text-right">RBT12</span>
            <span>Enquadramento</span>
            <span>Faixa</span>
            <span />
          </div>
          <ul>
            {visiveis.map((l) => (
              <li
                key={l.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-linesoft px-3 py-2.5 last:border-b-0 md:grid md:grid-cols-[1.25rem_minmax(0,1fr)_6.5rem_9rem_8.5rem_auto]"
              >
                <input
                  type="checkbox"
                  checked={selecao.has(l.id)}
                  onChange={() => alternar(l.id)}
                  aria-label={`Selecionar ${l.razao_social}`}
                  className="shrink-0"
                />

                {/* Clicar no NOME abre a ficha — menos quando não há análise:
                    aí a ficha só diz "nenhuma análise registrada", e o clique
                    que deveria começar o trabalho o esconde. (07/08/2026) */}
                <button
                  onClick={() =>
                    setGaveta({ id: l.id, aba: l.analise_id ? "dossie" : "decisao" })
                  }
                  className="min-w-0 flex-1 text-left md:flex-none"
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
                    <span className={`rounded-full px-1.5 md:hidden ${COR_FAIXA[l.faixa]}`}>{ROTULO_FAIXA[l.faixa]}</span>
                    <span className="md:hidden">{l.regime ?? ""}</span>
                    {l.saida && <span>{l.saida}</span>}
                    {l.re != null && <span>repasse {pct(l.re)}</span>}
                    {l.estimada && <span className="text-amarelo">premissas estimadas</span>}
                    {/*
                      O ESTADO DO FORMULÁRIO, na fila.
                      Quem manda 20 pedidos de dados na segunda precisa saber na
                      terça quem respondeu — e isso morava dentro de cada
                      empresa, uma por uma. "respondeu" em destaque porque é o
                      único destes estados que pede ação AGORA.
                    */}
                    {l.coleta === "aguardando" && <span className="text-amarelo">formulário enviado</span>}
                    {l.coleta === "respondida" && (
                      <span className="rounded-full bg-verdewash px-1.5 font-semibold text-verde">
                        respondeu ✓
                      </span>
                    )}
                    {l.coleta === "usada" && <span className="text-muted">respostas aplicadas</span>}
                    {l.laudo_numero != null && <span className="text-verde">laudo {String(l.laudo_numero).padStart(4, "0")}</span>}
                    {l.assinado && <span className="text-verde">assinado</span>}
                  </div>
                </button>

                {/* as três colunas de cadastro — só no grid de desktop */}
                <span className="hidden text-right font-mono text-[11px] text-slate2 md:block">
                  {l.rbt12 != null ? Math.round(l.rbt12).toLocaleString("pt-BR") : "—"}
                </span>
                <span className="hidden truncate font-mono text-[10.5px] text-slate2 md:block" title={l.regime ?? undefined}>
                  {l.regime ?? "—"}
                </span>
                <span className="hidden md:block">
                  <span className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${COR_FAIXA[l.faixa]}`}>
                    {ROTULO_FAIXA[l.faixa]}
                  </span>
                </span>

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
          </>
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

      {/* O DISCLAIMER COMPLETO MORA NO DOCUMENTO, não aqui. É no laudo que ele
          protege — é o laudo que vai ao cliente e, um dia, a um processo. Na
          tela de trabalho ele é ruído: o contador já sabe, e leu ontem. Fica a
          versão curta, com os três fatos que mudam decisão. */}
      <p className="mt-3 max-w-[80ch] text-[11px] leading-relaxed text-muted">
        Estimativa de cenário. A alíquota de referência só é fixada até 31/10/2026. Quem assina
        decide.
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
