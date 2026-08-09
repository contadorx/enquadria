"use client";

import { useState } from "react";
import {
  decidir,
  dDASefetivo,
  cenarios,
  emReais,
  sensibilidade,
  alertaFatorR,
  dDASsegregado,
  fatorRSegregado,
  somaSegmentos,
  segmentosFechados,
  derivarQual,
  derivarCred,
  pct,
  moeda,
  SAIDAS,
  ALIQUOTA_ALTERNATIVA,
  PARAMETROS_2027,
  type Respostas,
  type DetalheQual,
  type DetalheCred,
  type Segmento,
} from "@/lib/motor";
import { projetarRBT12, decidirComProjecao, rbt12AnteriorPorCrescimento } from "@/lib/projecao";
import { anexoPorCnae } from "@/lib/triagem";
import { leituraDoDinheiro } from "@/lib/roteiro";
import { parseValorBRL } from "@/lib/csv";
import { Gauge } from "@/components/Gauge";

/**
 * AS PERGUNTAS E A CONTA — agora um componente, não uma tela.
 *
 * Vive dentro da gaveta da fila e da página da empresa. A prévia roda no
 * navegador só para o contador ver o número mudar enquanto responde; o valor
 * que vale é sempre o que o servidor recalcula ao salvar.
 *
 * DUAS PERGUNTAS FORAM DESDOBRADAS (fatia 7). "Quantos clientes aproveitam
 * crédito" e "quanto das compras gera crédito" eram as respostas mais chutadas
 * do questionário — e são as duas de maior alavanca no resultado. Agora cada
 * uma é composta por perguntas que o contador consegue responder olhando a
 * escrituração, e o valor final é DERIVADO. O motor continua consumindo `qual`
 * e `cred`, então as análises antigas seguem válidas.
 */

type Origem = "coleta" | "informada" | "estimada" | "padrao";

/** o contador conhece os anexos pelo número; o rótulo é para não errar a linha */
const ROTULO_ANEXO: Record<number, string> = {
  1: "comércio",
  2: "indústria",
  3: "serviço (III)",
  4: "serviço (IV)",
  5: "serviço (V)",
};

const ROTULO_ORIGEM: Record<Origem, string> = {
  coleta: "respondida pelo cliente no formulário",
  informada: "informada pelo cliente",
  estimada: "estimada pelo contador",
  padrao: "padrão do sistema",
};

const CLASSE_SAIDA: Record<string, string> = {
  vermelho: "bg-vermelho",
  amarelo: "bg-amarelo",
  neutro: "bg-neutro",
  verde: "bg-verde",
};

export const RESPOSTAS_PADRAO: Respostas = {
  b2b: 0.9,
  qual: 0.92,
  cred: 0.7,
  folha: 0.12,
  preco: 2,
  conc: 1,
  exig: 0,
};

const QUAL_PADRAO: DetalheQual = { fora_simples: 0.92, sem_aproveitamento: 0 };
const CRED_PADRAO: DetalheCred = { insumos: 0.45, servicos: 0.15, outros: 0.1 };

type Opcao = [string, number];

function Escolha({
  titulo,
  dica,
  opcoes,
  valor,
  onEscolher,
  doCliente,
}: {
  titulo: string;
  dica?: string;
  opcoes: Opcao[];
  valor: number;
  onEscolher: (v: number) => void;
  /**
   * Esta resposta veio do formulário que o CLIENTE preencheu — e ainda não foi
   * tocada pelo contador. Sem o selo, uma resposta do cliente e um padrão do
   * sistema são visualmente idênticos: o contador não sabe o que pode ajustar
   * à vontade e o que já é informação de quem conhece o negócio.
   */
  doCliente?: boolean;
}) {
  return (
    <div className="mb-3.5 border-b border-linesoft pb-3.5 last:mb-0 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[13.5px] font-semibold">{titulo}</span>
        {doCliente && (
          <span className="rounded-sm bg-accentwash px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-accentdeep">
            resposta do cliente
          </span>
        )}
      </div>
      {dica && <p className="mb-1 mt-0.5 text-[12px] text-muted">{dica}</p>}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {opcoes.map(([rotulo, v]) => {
          const ativo = Math.abs(valor - v) < 1e-9;
          return (
            <button
              key={rotulo}
              onClick={() => onEscolher(v)}
              className={`min-h-[38px] rounded-sm border px-2.5 py-1.5 font-mono text-[11.5px] ${
                ativo
                  ? "border-ink bg-ink font-medium text-white"
                  : "border-line bg-surface text-slate2 hover:border-accent"
              }`}
            >
              {rotulo}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function FormAnalise({
  empresaId,
  anexo,
  cnae,
  rbt12Inicial,
  respostasIniciais,
  detalhesIniciais,
  custoInicial,
  crescimentoInicial,
  segmentosIniciais,
  estimada,
  chavesDaColeta,
  aoSalvar,
  calculadoEmInicial = null,
}: {
  empresaId: string;
  anexo: number | null;
  cnae: string | null;
  rbt12Inicial: number | null;
  respostasIniciais: Respostas | null;
  detalhesIniciais?: { qual?: DetalheQual; cred?: DetalheCred } | null;
  custoInicial?: number | null;
  /**
   * Crescimento anual em fração (0,12 = 12%), reconstruído da análise gravada.
   *
   * Reabrir uma análise perdia a projeção: o campo nascia vazio e o próximo
   * "salvar" gravava sem ela. O laudo emitido depois de uma correção qualquer
   * ficava sem a seção que o anterior tinha — e ninguém entendia por quê.
   */
  crescimentoInicial?: number | null;
  /** segregação congelada numa análise anterior, para reabrir como estava */
  segmentosIniciais?: Segmento[] | null;
  /** premissas vieram do lote por CNAE — o contador precisa confirmar antes do papel */
  estimada?: boolean;
  /**
   * Chaves cujo valor veio do formulário respondido pelo CLIENTE.
   *
   * Existe separado de `respostasIniciais` porque as duas coisas chegam pelo
   * mesmo caminho e significam o oposto: reabrir uma análise antiga também
   * preenche as respostas, mas ali quem respondeu foi o contador. Sem separar,
   * o laudo diria "informada pelo cliente" sobre um palpite do escritório.
   */
  chavesDaColeta?: string[];
  aoSalvar?: (analiseId: string) => void;
  /**
   * `calculado_em` da análise que esta tela LEU ao abrir. Vai junto no
   * salvamento para o servidor detectar que um colega gravou no meio — ver o
   * conflito em `app/api/analise/route.ts`. Sem ele, o comportamento é o de
   * antes: grava por cima.
   */
  calculadoEmInicial?: string | null;
}) {
  const inicial = respostasIniciais ?? RESPOSTAS_PADRAO;
  /* nunca houve análise: nem respostas salvas, nem premissas estimadas do lote */
  const semAnalise = !respostasIniciais && !estimada;

  const [r, setR] = useState<Respostas>(inicial);
  // ao reabrir uma análise antiga sem detalhes, o desdobramento parte do valor
  // agregado: fora_simples = qual, insumos = cred. Nada muda de resultado.
  const [dq, setDq] = useState<DetalheQual>(
    detalhesIniciais?.qual ?? { fora_simples: inicial.qual, sem_aproveitamento: 0 }
  );
  const [dc, setDc] = useState<DetalheCred>(
    detalhesIniciais?.cred ?? { insumos: inicial.cred, servicos: 0, outros: 0 }
  );
  const [rbt12, setRbt12] = useState(rbt12Inicial != null ? String(rbt12Inicial) : "");
  /**
   * C6 — O CRESCIMENTO DA RECEITA, perguntado direto (08/08/2026).
   *
   * Antes o campo pedia a RBT12 dos doze meses ANTERIORES, em reais. O motivo
   * era bom — é medição, não expectativa — mas o preço era alto: para responder,
   * o contador tinha de abrir outro relatório e achar um segundo valor de seis
   * dígitos, no meio de um formulário que ele já estava querendo terminar. Campo
   * caro de responder é campo que fica em branco, e em branco o laudo perde a
   * projeção inteira.
   *
   * A pergunta agora é a que ele responde de cabeça: quanto a receita cresceu no
   * último ano. Continua sendo MEDIÇÃO — é o ano que passou, não o que vem —, e
   * o valor anterior é reconstruído aqui mesmo: `rbt12 / (1 + g)`. A conta é
   * exata e reversível, então o motor, o laudo e a análise gravada continuam
   * recebendo exatamente o que sempre receberam.
   */
  const [crescimento, setCrescimento] = useState(
    crescimentoInicial != null ? String(Math.round(crescimentoInicial * 1000) / 10).replace(".", ",") : ""
  );
  const [custo, setCusto] = useState(custoInicial != null ? String(custoInicial) : "");
  const [anexoSel, setAnexoSel] = useState<number>(anexo ?? anexoPorCnae(cnae) ?? 1);
  const [anexoConfirmado, setAnexoConfirmado] = useState(false);
  /**
   * SEGREGAÇÃO DE RECEITA. Fechada por padrão: a maioria das empresas tem um
   * anexo só, e um formulário que abre com cinco campos de percentual assusta
   * quem não precisa deles. Quem precisa abre num clique — e quem precisa
   * costuma saber muito bem que precisa.
   */
  const [segregar, setSegregar] = useState<boolean>(
    (segmentosIniciais?.length ?? 0) > 1
  );
  const [segmentos, setSegmentos] = useState<Segmento[]>(
    segmentosIniciais && segmentosIniciais.length > 1
      ? segmentosIniciais
      : [{ anexo: anexo ?? anexoPorCnae(cnae) ?? 1, share: 1 }]
  );

  function mudarSegmento(a: number, texto: string) {
    const n = Number(texto.replace(",", ".").replace(/[^\d.]/g, ""));
    const share = Number.isFinite(n) ? Math.min(Math.max(n, 0), 100) / 100 : 0;
    const outros = segmentos.filter((s) => s.anexo !== a);
    setSegmentos(share > 0 ? [...outros, { anexo: a, share }].sort((x, y) => x.anexo - y.anexo) : outros);
  }
  const [tocadas, setTocadas] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /** um colega gravou entre a abertura desta tela e o clique em salvar */
  const [conflito, setConflito] = useState<string | null>(null);
  const [base_visto, setBaseVisto] = useState<string | null>(calculadoEmInicial);

  function tocar(chave: string) {
    setTocadas((s) => new Set(s).add(chave));
  }

  /** origem de cada premissa: quem não foi tocado é padrão (ou estimado, se veio do lote) */
  const daColeta = new Set(chavesDaColeta ?? []);

  function origemDe(chave: string): Origem {
    // tocar sobrepõe tudo: se o contador mexeu, a premissa é dele
    if (tocadas.has(chave)) return "informada";
    if (daColeta.has(chave)) return "coleta";
    if (estimada) return "estimada";
    if (respostasIniciais) return "informada";
    return "padrao";
  }

  const qual = derivarQual(dq);
  const cred = derivarCred(dc);
  const respostas: Respostas = { ...r, qual, cred };

  const rbt12Num = parseValorBRL(rbt12) ?? null;
  const custoNum = parseValorBRL(custo) ?? null;
  /**
   * A prévia só usa a segregação quando ela FECHA 100%. Enquanto o contador
   * digita — "60" e ainda vai digitar "40" — a soma está em 60%, e usar isso
   * mostraria um dDAS escalado para baixo, com a saída pulando na tela a cada
   * tecla. Melhor manter o anexo único até a composição fechar.
   */
  const somaPct = somaSegmentos(segmentos) * 100;
  const fechado = segregar && segmentosFechados(segmentos) && segmentos.length > 1;
  const ddas = fechado ? dDASsegregado(segmentos, rbt12Num) : dDASefetivo(anexoSel, rbt12Num);
  const base = { ...PARAMETROS_2027, das: ddas.das, rbt12: rbt12Num };
  const alertaSeg = fechado ? fatorRSegregado(segmentos, r.folha) : null;

  const res = decidir(respostas, base);
  const saida = SAIDAS[res.saida];
  const dois = cenarios(respostas, base);
  const dinheiro = emReais(res, rbt12Num, custoNum);
  /**
   * DO CRESCIMENTO DE VOLTA PARA O VALOR ANTERIOR.
   *
   * `rbt12_anterior = rbt12 / (1 + g)`. Guardar o valor reconstruído em vez do
   * percentual é o que mantém intacto tudo o que veio antes: o motor continua
   * medindo o crescimento do jeito dele, o laudo continua tratando como MEDIDO
   * (é o ano que passou, não uma expectativa sobre o que vem) e a análise
   * gravada não muda de formato — nenhuma migration, nenhum laudo antigo relido
   * de outro jeito.
   *
   * Queda de 100% ou mais seria receita zero ou negativa: aí não há projeção.
   */
  const crescNum = (() => {
    const t = crescimento.replace(/[^\d,.-]/g, "").replace(",", ".");
    if (!t || t === "-" || t === "." || t === "-.") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n / 100 : null;
  })();
  const rbt12AntNum = rbt12AnteriorPorCrescimento(rbt12Num, crescNum);
  const projecao =
    rbt12Num != null && rbt12AntNum != null
      ? projetarRBT12({ rbt12: rbt12Num, rbt12_anterior: rbt12AntNum, anexo: ddas.anexo })
      : null;
  const comProjecao = projecao ? decidirComProjecao(respostas, base, projecao) : null;
  const sens = sensibilidade(respostas, base, dinheiro);
  const alerta = alertaFatorR(anexoSel, r.folha);

  async function salvar(forcar = false) {
    setSalvando(true);
    setErro(null);
    if (forcar) setConflito(null);
    try {
      const origens = Object.fromEntries(
        ["b2b", "qual", "cred", "folha", "preco", "conc", "exig"].map((k) => [k, origemDe(k)])
      );
      const resp = await fetch("/api/analise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_id: empresaId,
          respostas,
          rbt12: rbt12Num,
          rbt12_anterior: rbt12AntNum,
          custo_apuracao_anual: custoNum,
          detalhes: { qual: dq, cred: dc },
          origens,
          anexo: fechado ? ddas.anexo : anexoSel,
          anexo_confirmado: anexoConfirmado,
          segmentos: fechado ? segmentos : null,
          /* o que esta tela viu ao abrir; o servidor compara e recusa uma vez
             se um colega gravou no meio (08/08/2026) */
          base_calculado_em: base_visto,
          sobrescrever: forcar,
        }),
      });
      const json = await resp.json();
      if (resp.ok && json.analise_id) {
        setSalvo(true);
        setConflito(null);
        /* a próxima gravação compara contra o que ACABOU de ser gravado —
           sem isto, salvar duas vezes seguidas acusaria conflito consigo mesmo */
        if (typeof json.calculado_em === "string") setBaseVisto(json.calculado_em);
        setTimeout(() => setSalvo(false), 2500);
        aoSalvar?.(json.analise_id as string);
      } else if (json.conflito) {
        /* não é erro de formulário: é decisão. O texto do servidor traz nome e
           hora, e o botão de gravar por cima aparece ao lado */
        setConflito(json.erro as string);
      } else {
        setErro(json.erro ?? "não foi possível salvar a análise");
      }
    } catch {
      setErro("falha de rede ao salvar a análise — nada foi gravado.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-4">
      {/**
        * O QUE FAZER NESTA TELA — acrescentado em 07/08/2026.
        *
        * O aviso anterior explicava a SITUAÇÃO ("as premissas foram estimadas")
        * e não a TAREFA. Quem abria a empresa pela primeira vez lia, concordava,
        * e saía sem tocar em nada — porque nada dizia que havia trabalho a
        * fazer, nem quanto. Aviso que descreve estado não move ninguém; os três
        * passos numerados movem, e o último é o que o contador entrega.
        */}
      {estimada && (
        <div className="rounded border border-amarelo bg-amarelowash px-3.5 py-3">
          <div className="text-[13px] font-bold text-ink">
            Estas premissas foram estimadas pelo CNAE — confirme antes de emitir.
          </div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-slate2">
            Elas ordenam a fila; não assinam um laudo.
          </p>
          <ol className="mt-2.5 space-y-1 pl-4 text-[12.5px] leading-relaxed text-slate2">
            <li style={{ listStyle: "decimal" }}>
              Informe a <b>RBT12</b> — é o que troca a alíquota estimada pela efetiva.
            </li>
            <li style={{ listStyle: "decimal" }}>
              Percorra as <b>perguntas</b> e ajuste o que não corresponder ao cliente.
            </li>
            <li style={{ listStyle: "decimal" }}>
              <b>Salve a análise.</b> Só então o laudo sai com a sua assinatura em cima.
            </li>
          </ol>
        </div>
      )}

      {/* Sem análise nenhuma: a tela precisa dizer que ESTE formulário é o
          trabalho, senão ele parece um cadastro opcional. */}
      {!estimada && semAnalise && (
        <div className="rounded border border-accent bg-accentwash px-3.5 py-3">
          <div className="text-[13px] font-bold text-accentdeep">
            Esta empresa ainda não tem análise.
          </div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-slate2">
            Responda e salve. Nenhuma pergunta exige consultar documento.
          </p>
        </div>
      )}

      {/* ---------------------------------------------------- a empresa */}
      <div className="rounded border border-line bg-surface p-4">
        <div className="mb-3 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
          A empresa
        </div>

        <div className="mb-3.5 border-b border-linesoft pb-3.5">
          <div className="text-[13.5px] font-semibold">Receita bruta dos últimos 12 meses (RBT12)</div>
          <p className="mb-2 mt-0.5 text-[12px] text-muted">
            Torna a alíquota do Simples EFETIVA, e é a única coisa que permite converter a decisão em
            reais. Sem ela, o cálculo usa a faixa {ddas.faixa} e o laudo sai sem os valores anuais.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-sm border border-line px-2.5 focus-within:border-accent">
              <span className="font-mono text-[12px] text-muted">R$</span>
              <input
                value={rbt12}
                onChange={(e) => setRbt12(e.target.value)}
                inputMode="decimal"
                placeholder="ex.: 480.000"
                className="w-36 bg-transparent px-2 py-1.5 font-mono text-[13px] outline-none"
              />
            </div>
            <span
              className={`rounded-sm px-2 py-1 font-mono text-[11px] ${
                ddas.fonte === "efetiva" ? "bg-verdewash text-verde" : "bg-accentwash text-accentdeep"
              }`}
            >
              faixa {ddas.faixa} ·{" "}
              {ddas.fonte === "efetiva" ? `efetiva ${pct(ddas.aliquota)}` : `topo ${pct(ddas.aliquota)} (estimado)`}
            </span>
          </div>
          {ddas.acimaDoTeto && (
            <p className="mt-2 rounded-sm bg-vermelhowash px-2.5 py-2 text-[12px] text-vermelho">
              RBT12 acima do teto do Simples (R$ 4,8 milhões). Esta empresa está excluída do Simples e
              não tem decisão a tomar nesta janela.
            </p>
          )}
          {res.banda_sublimite && (
            <p className="mt-2 rounded-sm bg-amarelowash px-2.5 py-2 text-[12px] text-slate2">
              RBT12 na faixa em torno do sublimite de {moeda(PARAMETROS_2027.sublimite ?? 3600000)}:
              a decisão vai para o empresário com os dois cenários à vista.
            </p>
          )}

          {/**
            * C6 — O CRESCIMENTO DA RECEITA.
            *
            * A opção se exerce em setembro de 2026 e vale de janeiro a junho de
            * 2027. Com a RBT12 de hoje só, o laudo afirma um número para um
            * período em que ele pode já não valer: empresa que cresce muda de
            * faixa dentro do efeito, e a parcela que sai do DAS muda com ela.
            *
            * A pergunta é o CRESCIMENTO DO ANO QUE PASSOU, não uma expectativa
            * sobre o que vem — continua sendo medição, e é a medição que o
            * contador tem na cabeça. O valor anterior em reais é reconstruído
            * daqui (ver `rbt12AntNum`), então nada mudou do motor para baixo.
            *
            * Opcional. Sem ele nada é projetado, e o laudo não ganha a seção —
            * melhor do que ganhar uma seção construída sobre um chute.
            */}
          <div className="mt-3">
            <div className="text-[12.5px] font-semibold">
              Quanto a receita cresceu no último ano{" "}
              <span className="font-normal text-muted">· opcional</span>
            </div>
            <p className="mb-2 mt-0.5 max-w-[70ch] text-[12px] text-muted">
              Com ele o laudo projeta até junho/2027. Sem ele, só a foto de hoje.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center rounded-sm border border-line px-2.5 focus-within:border-accent">
                <input
                  value={crescimento}
                  onChange={(e) => setCrescimento(e.target.value)}
                  inputMode="decimal"
                  placeholder="ex.: 12"
                  className="w-20 bg-transparent px-2 py-1.5 font-mono text-[13px] outline-none"
                />
                <span className="font-mono text-[12px] text-muted">%</span>
              </div>
              {/* caiu é resposta legítima e ninguém digita "-" sem ser
                  convidado: o atalho existe para não perder a informação de
                  quem encolheu */}
              {!crescimento && (
                <div className="flex gap-1">
                  {[-10, 0, 10, 25].map((v) => (
                    <button
                      key={v}
                      onClick={() => setCrescimento(String(v))}
                      className="rounded-sm border border-line px-2 py-1 font-mono text-[11px] text-slate2"
                    >
                      {v > 0 ? `+${v}%` : `${v}%`}
                    </button>
                  ))}
                </div>
              )}
              {projecao && (
                <span className="rounded-sm bg-accentwash px-2 py-1 font-mono text-[11px] text-accentdeep">
                  {(projecao.crescimento * 100).toFixed(1).replace(".", ",")}% a.a. →{" "}
                  {moeda(projecao.rbt12_projetado)} em jun/27
                  {projecao.muda_faixa
                    ? ` · faixa ${projecao.faixa}→${projecao.faixa_projetada}`
                    : " · mesma faixa"}
                </span>
              )}
            </div>
            {comProjecao?.divergem && (
              <p className="mt-2 rounded-sm bg-amarelowash px-2.5 py-2 text-[12px] text-slate2">
                <b>As duas contas discordam.</b> Com a RBT12 de hoje, {comProjecao.hoje.saida}; com a
                projetada, {comProjecao.projetado.saida}. A decisão passa a depender do faturamento
                de 2027 — vai ao empresário com os dois cenários.
              </p>
            )}
            {projecao?.cruza_teto && (
              <p className="mt-2 rounded-sm bg-vermelhowash px-2.5 py-2 text-[12px] text-vermelho">
                A projeção ultrapassa o teto do Simples ({moeda(4800000)}) dentro do período de
                efeito: se confirmar, a empresa apura pelo regime regular de qualquer forma e a opção
                perde objeto.
              </p>
            )}
            {projecao?.cruza_sublimite && (
              <p className="mt-2 rounded-sm bg-amarelowash px-2.5 py-2 text-[12px] text-slate2">
                A projeção ultrapassa o sublimite ({moeda(3600000)}) dentro do período de efeito:
                ICMS e ISS saem do documento único no meio do exercício.
              </p>
            )}
          </div>
        </div>

        <div className="mb-3.5 border-b border-linesoft pb-3.5">
          <div className="text-[13.5px] font-semibold">Anexo do Simples</div>

          {/* A segregação vivia como link sublinhado no canto DIREITO, alinhado
              pelo justify-between. Ninguém via — e empresa que fatura em dois
              anexos analisada como se fosse um só produz laudo errado, não
              apenas incompleto. Virou controle à esquerda, no fluxo de leitura,
              com estado visível de ligado/desligado. */}
          <button
            onClick={() => setSegregar(!segregar)}
            aria-pressed={segregar}
            className={`mt-2 flex items-center gap-2 rounded-sm border px-2.5 py-1.5 text-left text-[12px] font-semibold ${
              segregar
                ? "border-accent bg-accentwash text-accentdeep"
                : "border-line bg-surface text-slate2 hover:border-accent"
            }`}
          >
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border ${
                segregar ? "border-accentdeep bg-accentdeep text-white" : "border-line bg-surface"
              }`}
            >
              {segregar ? "✓" : ""}
            </span>
            A empresa fatura em mais de um anexo
          </button>
          {!segregar && (
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
              Comércio e serviço, por exemplo. A alíquota muda, e com ela a conclusão.
            </p>
          )}

          {!segregar ? (
            <div className="mt-2 flex gap-1.5">
              {[1, 2, 3, 4, 5].map((a) => (
                <button
                  key={a}
                  onClick={() => setAnexoSel(a)}
                  className={`h-9 w-9 rounded-sm border font-mono text-[12px] ${
                    anexoSel === a ? "border-ink bg-ink font-medium text-white" : "border-line bg-surface text-slate2"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-2">
              {/* A SEGREGAÇÃO NÃO É DETALHE DE CADASTRO.
                  Cada anexo tem partilha de PIS/Cofins própria — de 14,0% no
                  Anexo II a 19,15% no V — e `das` É essa partilha. Uma empresa
                  meio comércio, meio serviço tratada por um anexo só chega a
                  errar o dDAS em quase metade, e isso vira outra saída da
                  árvore num documento assinado. */}
              <p className="mb-2 text-[12px] leading-relaxed text-muted">
                Quanto da receita cai em cada anexo, como no PGDAS.
              </p>
              <div className="space-y-1.5">
                {[1, 2, 3, 4, 5].map((a) => {
                  const s = segmentos.find((x) => x.anexo === a);
                  const v = s ? Math.round(s.share * 1000) / 10 : 0;
                  return (
                    <div key={a} className="flex items-center gap-2.5">
                      <span className="w-[132px] flex-none font-mono text-[11.5px] text-slate2">
                        Anexo {a} · {ROTULO_ANEXO[a]}
                      </span>
                      <input
                        value={v === 0 ? "" : String(v).replace(".", ",")}
                        onChange={(e) => mudarSegmento(a, e.target.value)}
                        inputMode="decimal"
                        placeholder="0"
                        className="w-[76px] rounded-sm border border-line px-2 py-1 text-right font-mono text-[12.5px] outline-none focus:border-accent"
                      />
                      <span className="font-mono text-[11px] text-muted">% da receita</span>
                    </div>
                  );
                })}
              </div>
              <div
                className={`mt-2 flex items-baseline justify-between rounded-sm px-2.5 py-1.5 text-[12.5px] ${
                  fechado ? "bg-verdewash text-verde" : "bg-amarelowash text-slate2"
                }`}
              >
                <span>Soma das participações</span>
                <b className="font-mono">{(somaPct).toFixed(1).replace(".", ",")}%</b>
              </div>
              {/**
                * A FRASE PROMETIA UMA TRAVA QUE NÃO EXISTIA — achado da
                * auditoria de uso, 08/08/2026.
                *
                * Ela dizia "precisa fechar 100% para salvar" e o botão de salvar
                * continuava ativo. Quem segregava 60% + 30% e salvava recebia
                * "Análise salva ✓" em verde — e o que foi gravado era
                * `segmentos: null` com o anexo do seletor ÚNICO, aquele que ele
                * nunca tocou porque estava segregando. O dDAS sai do anexo
                * errado, e o comentário logo acima já dizia o tamanho do estrago:
                * erro de quase metade, capaz de trocar a saída da árvore num
                * documento assinado.
                *
                * Agora a trava existe de verdade (ver o `disabled` do botão) e a
                * frase diz quanto falta, em vez de mandar fechar sem dizer o
                * tamanho do buraco.
                */}
              {!fechado && (
                <p className="mt-1 text-[11px] text-amarelo">
                  Falta {(100 - somaPct).toFixed(1).replace(".", ",")}% para fechar — e sem fechar
                  não dá para salvar: a conta usaria um anexo só.
                </p>
              )}
              {fechado && (
                <p className="mt-1.5 font-mono text-[11px] text-muted">
                  dDAS ponderado = {(ddas.das * 100).toFixed(3).replace(".", ",")}% da receita
                </p>
              )}
              {alertaSeg && (
                <div className="mt-2.5 rounded-sm border border-amarelo bg-amarelowash px-3 py-2.5">
                  <div className="text-[12.5px] font-semibold text-ink">
                    Fator R e o anexo do serviço não batem
                  </div>
                  <p className="mt-0.5 text-[12.5px] text-slate2">{alertaSeg.texto}</p>
                  <label className="mt-2 flex items-center gap-2 text-[12.5px] text-slate2">
                    <input
                      type="checkbox"
                      checked={anexoConfirmado}
                      onChange={(e) => setAnexoConfirmado(e.target.checked)}
                    />
                    Confirmo a segregação como está
                  </label>
                </div>
              )}
            </div>
          )}

          {!segregar && alerta && (
            <div className="mt-2.5 rounded-sm border border-amarelo bg-amarelowash px-3 py-2.5">
              <div className="text-[12.5px] font-semibold text-ink">
                Fator R e anexo declarado não batem
              </div>
              <p className="mt-0.5 text-[12.5px] text-slate2">{alerta.texto}</p>
              <label className="mt-2 flex items-center gap-2 text-[12.5px] text-slate2">
                <input
                  type="checkbox"
                  checked={anexoConfirmado}
                  onChange={(e) => setAnexoConfirmado(e.target.checked)}
                />
                Confirmo que o Anexo {alerta.anexoDeclarado} é o correto para esta empresa
              </label>
              {/* "Isto é um aviso, não um bloqueio" saiu: se não bloqueia, não
                  precisa dizer que não bloqueia — o botão de salvar segue ativo
                  e isso já é a prova. Fica só o que o contador não sabe: que a
                  confirmação dele vira registro. */}
              <p className="mt-1 text-[11px] text-muted">
                A confirmação fica registrada na análise.
              </p>
            </div>
          )}
        </div>

        <div>
          <div className="text-[13.5px] font-semibold">
            Custo anual de apurar IBS/CBS fora do DAS <span className="font-normal text-muted">(opcional)</span>
          </div>
          <p className="mb-2 mt-0.5 text-[12px] text-muted">
            Honorário adicional, sistema, obrigações acessórias. Sem ele, o laudo não calcula
            payback.
          </p>
          <div className="flex items-center rounded-sm border border-line px-2.5 focus-within:border-accent">
            <span className="font-mono text-[12px] text-muted">R$</span>
            <input
              value={custo}
              onChange={(e) => setCusto(e.target.value)}
              inputMode="decimal"
              placeholder="por ano"
              className="w-36 bg-transparent px-2 py-1.5 font-mono text-[13px] outline-none"
            />
          </div>
        </div>
      </div>

      {/* ------------------------------------------------- para quem vende */}
      <div className="rounded border border-line bg-surface p-4">
        <div className="mb-3 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
          Para quem a empresa vende
        </div>

        <Escolha
          titulo="Quanto do faturamento vem de vendas para outras empresas?"
          opcoes={[["até 20%", 0.12], ["20–40%", 0.3], ["40–60%", 0.5], ["60–80%", 0.7], ["mais de 80%", 0.9]]}
          valor={r.b2b}
          onEscolher={(v) => {
            setR({ ...r, b2b: v });
            tocar("b2b");
          }}
          doCliente={origemDe("b2b") === "coleta"}
        />

        <Escolha
          titulo="Desses clientes empresa, quantos estão fora do Simples (Lucro Real ou Presumido)?"
          dica="Cliente no Simples tradicional ou MEI não aproveita o crédito integral."
          opcoes={[["quase nenhum", 0.1], ["menos da metade", 0.33], ["mais da metade", 0.65], ["quase todos", 0.92]]}
          valor={dq.fora_simples}
          onEscolher={(v) => {
            setDq({ ...dq, fora_simples: v });
            tocar("qual");
          }}
        />

        <Escolha
          titulo="E desses, quantos ainda assim NÃO aproveitariam o crédito?"
          dica="Órgão público, entidade imune, ou quem revende direto ao consumidor final e não usa o crédito na prática."
          opcoes={[["nenhum", 0], ["poucos", 0.15], ["cerca de um terço", 0.33], ["mais da metade", 0.6]]}
          valor={dq.sem_aproveitamento}
          onEscolher={(v) => {
            setDq({ ...dq, sem_aproveitamento: v });
            tocar("qual");
          }}
        />

        <p className="mt-2 rounded-sm bg-surface2 px-2.5 py-2 font-mono text-[11.5px] text-slate2">
          receita qualificada = {pct(r.b2b)} × {pct(qual)} = <b>{pct(res.rq)}</b> da receita
        </p>
      </div>

      {/* -------------------------------------------------- o que ela compra */}
      <div className="rounded border border-line bg-surface p-4">
        <div className="mb-3 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
          O que a empresa compra com crédito
        </div>
        <p className="mb-3 text-[12px] text-muted">
          Somadas, dão a fatia da receita que gera crédito.{" "}
          <b className="font-semibold">Fora:</b> folha, pró-labore, aluguel de PF, compras do
          Simples.
        </p>

        <Escolha
          titulo="Mercadorias e insumos comprados de fornecedor fora do Simples"
          opcoes={[["nada", 0], ["até 10%", 0.07], ["10–20%", 0.15], ["20–35%", 0.27], ["mais de 35%", 0.45]]}
          valor={dc.insumos}
          onEscolher={(v) => {
            setDc({ ...dc, insumos: v });
            tocar("cred");
          }}
        />
        <Escolha
          titulo="Serviços tomados de pessoa jurídica fora do Simples"
          opcoes={[["nada", 0], ["até 5%", 0.03], ["5–10%", 0.07], ["mais de 10%", 0.15]]}
          valor={dc.servicos}
          onEscolher={(v) => {
            setDc({ ...dc, servicos: v });
            tocar("cred");
          }}
        />
        <Escolha
          titulo="Energia, aluguel de PJ, fretes e demais insumos com crédito"
          opcoes={[["nada", 0], ["até 5%", 0.03], ["5–10%", 0.07], ["mais de 10%", 0.13]]}
          valor={dc.outros}
          onEscolher={(v) => {
            setDc({ ...dc, outros: v });
            tocar("cred");
          }}
        />

        <p className="mt-2 rounded-sm bg-surface2 px-2.5 py-2 font-mono text-[11.5px] text-slate2">
          compras com crédito = {pct(dc.insumos)} + {pct(dc.servicos)} + {pct(dc.outros)} ={" "}
          <b>{pct(cred)}</b> da receita
        </p>
      </div>

      {/* ------------------------------------------------------ negociação */}
      <div className="rounded border border-line bg-surface p-4">
        <div className="mb-3 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
          Folha e poder de negociação
        </div>
        <Escolha
          titulo="A folha representa quanto do faturamento?"
          dica="Entra no fator R e serve de conferência do anexo declarado."
          opcoes={[["até 15%", 0.12], ["15–30%", 0.22], ["30–45%", 0.37], ["mais de 45%", 0.55]]}
          valor={r.folha}
          onEscolher={(v) => {
            setR({ ...r, folha: v });
            tocar("folha");
          }}
        />
        <Escolha
          titulo="A empresa consegue renegociar preço com os clientes empresa?"
          opcoes={[["tem poder de preço", 3], ["com esforço", 2], ["contratos travados", 1], ["não, o mercado define", 0]]}
          valor={r.preco}
          onEscolher={(v) => {
            setR({ ...r, preco: v });
            tocar("preco");
          }}
          doCliente={origemDe("preco") === "coleta"}
        />
        <Escolha
          titulo="Os concorrentes diretos estão majoritariamente fora do Simples?"
          opcoes={[["sim", 1], ["não", 0]]}
          valor={r.conc}
          onEscolher={(v) => {
            setR({ ...r, conc: v });
            tocar("conc");
          }}
          doCliente={origemDe("conc") === "coleta"}
        />
        <Escolha
          titulo="Algum cliente já sinalizou que vai exigir crédito integral em 2027?"
          opcoes={[["sim", 1], ["não", 0]]}
          valor={r.exig}
          onEscolher={(v) => {
            setR({ ...r, exig: v });
            tocar("exig");
          }}
          doCliente={origemDe("exig") === "coleta"}
        />
      </div>

      {/* --------------------------------------------------------- resultado */}
      <div className="rounded border border-line bg-surface p-4">
        <div className="mb-3 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
          A decisão em uma linha
        </div>
        <Gauge re={res.re} fc={res.fc} />

        <div className="mt-4 overflow-hidden rounded border border-line">
          <div className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-white ${CLASSE_SAIDA[saida.cor]}`}>
            <span className="font-mono text-[11px] tracking-[0.14em]">{res.saida}</span>
            <span className="text-[14.5px] font-bold">{saida.titulo}</span>
          </div>
          <div className="bg-surface px-4 py-3.5 text-[13.5px] text-slate2">
            {res.motivo}
            {res.prioridade && (
              <div className="mt-2.5 rounded-sm bg-vermelhowash px-2.5 py-2 font-mono text-[11px] tracking-wide text-vermelho">
                PRIORIDADE FORÇADA — a decisão já saiu do campo fiscal.
              </div>
            )}
          </div>
        </div>

        {/* OS DOIS CENÁRIOS */}
        <div className="mt-4">
          <div className="mb-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
            Os dois cenários de alíquota
          </div>
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                <th className="border-b border-line pb-1 text-left">cenário</th>
                <th className="border-b border-line pb-1 text-right">repasse</th>
                <th className="border-b border-line pb-1 text-right">ganho do comprador</th>
                <th className="border-b border-line pb-1 text-right">saída</th>
              </tr>
            </thead>
            <tbody>
              {dois.map((c) => (
                <tr key={c.aliquota}>
                  <td className="border-b border-linesoft py-2 pr-2">
                    {pct(c.aliquota)}
                    <span className="ml-1.5 font-mono text-[10.5px] text-muted">
                      {c.principal ? "estimativa de trabalho" : "sensibilidade"}
                    </span>
                  </td>
                  <td className="border-b border-linesoft py-2 text-right font-mono">
                    {isFinite(c.resultado.re) ? pct(c.resultado.re) : "—"}
                  </td>
                  <td className="border-b border-linesoft py-2 text-right font-mono">{pct(c.resultado.fc)}</td>
                  <td className="border-b border-linesoft py-2 text-right font-mono font-semibold">
                    {c.resultado.saida}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1.5 text-[11px] text-muted">
            A alíquota de referência só é fixada por Resolução do Senado até 31/10/2026 — depois do
            fechamento desta janela. O cenário de {pct(ALIQUOTA_ALTERNATIVA)} é sensibilidade
            declarada, não norma publicada.
          </p>
        </div>

        {/* EM REAIS */}
        {dinheiro.receita != null && (
          <div className="mt-4 rounded-sm bg-surface2 p-3">
            {/*
              O TÍTULO DIZ DE QUEM É O DINHEIRO.
              "O que isso vale no ano" não dizia para quem, e o número já foi
              lido como honorário do escritório. É a conta da EMPRESA.
            */}
            <div className="mb-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
              O que isso vale no ano — para a empresa
            </div>
            <table className="w-full border-collapse text-[13px]">
              <tbody>
                <tr>
                  <td className="py-1 pr-2 text-muted">
                    Ganho da empresa se optar
                    <span className="block font-mono text-[10.5px] text-muted">
                      folga da negociação × receita qualificada × receita
                    </span>
                  </td>
                  <td className="py-1 text-right font-mono font-semibold">
                    {dinheiro.ganho_anual != null && dinheiro.ganho_anual > 0
                      ? moeda(dinheiro.ganho_anual)
                      : "sem ganho no cenário"}
                  </td>
                </tr>
                <tr>
                  <td className="py-1 pr-2 text-muted">
                    Custo de apurar IBS/CBS por fora
                    <span className="block font-mono text-[10.5px] text-muted">
                      premissa sua, informada acima
                    </span>
                  </td>
                  <td className="py-1 text-right font-mono">
                    {dinheiro.custo_anual != null ? moeda(dinheiro.custo_anual) : "não informado"}
                  </td>
                </tr>
                <tr>
                  {/* "Payback" era a única palavra em inglês da tela — e a que
                      mais precisava ser entendida na reunião com o cliente */}
                  <td className="py-1 pr-2 text-muted">Em quanto tempo o ganho cobre esse custo</td>
                  <td className="py-1 text-right font-mono">
                    {dinheiro.payback_meses != null
                      ? `${dinheiro.payback_meses.toFixed(1).replace(".", ",")} meses`
                      : "não calculado"}
                  </td>
                </tr>
                <tr>
                  <td className="py-1 pr-2 text-muted">
                    Se o cliente dela não aceitar o repasse, a empresa absorve
                  </td>
                  <td className="py-1 text-right font-mono text-vermelho">
                    {dinheiro.absorvido_anual != null ? moeda(dinheiro.absorvido_anual) : "—"}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* A CONCLUSÃO EM UMA LINHA — a frase que o contador diria ao
                cliente. Quatro números certos e nenhuma leitura era o que
                fazia esta tabela parecer difícil. Ver lib/roteiro. */}
            {leituraDoDinheiro(dinheiro) && (
              <p className="mt-2.5 border-t border-line pt-2.5 text-[12.5px] leading-relaxed text-slate2">
                {leituraDoDinheiro(dinheiro)}
              </p>
            )}
          </div>
        )}

        {/* SENSIBILIDADE */}
        <div className="mt-4">
          <div className="mb-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
            Sensibilidade
          </div>
          <ul className="space-y-1.5 text-[12.5px] text-slate2">
            {sens.map((l) => (
              <li key={l.titulo} className="rounded-sm border border-linesoft px-2.5 py-2">
                <b>{l.titulo}.</b> {l.efeito}
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
          {ddas.fonte === "efetiva"
            ? `dDAS pela alíquota efetiva do Simples sobre a RBT12 de ${moeda(ddas.rbt12)} (Anexo ${ddas.anexo}, faixa ${ddas.faixa}). `
            : `RBT12 não informada — dDAS pelo topo da faixa ${ddas.faixa} do Anexo ${ddas.anexo} (estimativa conservadora). `}
          Estimativa de cenário a partir das premissas informadas; não substitui apuração com dados
          fiscais efetivos. A decisão e a responsabilidade técnica são do contador que assina.
        </p>
        <p className="mt-1.5 font-mono text-[10.5px] text-muted">
          origem das premissas: {ROTULO_ORIGEM[origemDe("b2b")]} · marcada por resposta no laudo
        </p>
      </div>

      {erro && <p className="rounded-sm bg-vermelhowash px-3 py-2 text-[12.5px] text-vermelho">{erro}</p>}

      {/* ux-ok: a decisão aparece no mesmo lugar do botão que a provocou.
          Conflito não é erro de preenchimento — é trabalho de outra pessoa em
          risco, e por isso tem cor de aviso e dois caminhos, não uma mensagem
          vermelha e um beco. */}
      {conflito && (
        <div className="rounded-sm border border-amarelo bg-amarelowash px-3 py-2.5">
          <p className="text-[12.5px] leading-relaxed text-amarelo">{conflito}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={() => window.location.reload()}
              className="rounded-sm border border-line bg-surface px-3 py-1.5 text-[12px] font-semibold text-slate2"
            >
              Recarregar e ver o que mudou
            </button>
            <button
              onClick={() => void salvar(true)}
              disabled={salvando}
              className="rounded-sm border border-amarelo px-3 py-1.5 text-[12px] font-semibold text-amarelo disabled:opacity-40"
            >
              {salvando ? "…" : "Gravar a minha versão por cima"}
            </button>
          </div>
        </div>
      )}

      {/* texto-ok: a explicação do bloqueio fica no aviso da segregação, a três
          linhas do checkbox que o causa — pô-la aqui, no rodapé do formulário,
          seria repetir longe de onde a pessoa mexeu. */}
      <button
        /* o argumento vira o MouseEvent se passado direto — e um evento é
           `truthy`, o que faria todo salvamento normal gravar por cima do
           colega sem perguntar. A seta existe por isso. */
        onClick={() => void salvar()}
        disabled={salvando || (segregar && !fechado)}
        title={
          segregar && !fechado
            ? "Feche 100% da segregação por anexo para salvar"
            : undefined
        }
        className="w-full rounded-sm bg-ink px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
      >
        {salvando ? "Salvando..." : salvo ? "Análise salva ✓" : "Salvar análise"}
      </button>
    </div>
  );
}
