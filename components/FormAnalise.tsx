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
import { projetarRBT12, decidirComProjecao } from "@/lib/projecao";
import { mascaraMoeda, valorDaMascara, moedaParaMascara } from "@/lib/mascaras";
import { anexoPorCnae } from "@/lib/triagem";
import { leituraDoDinheiro } from "@/lib/roteiro";
import { parseValorBRL } from "@/lib/csv";
import { resolverOrigem, ORIGENS, CHAVES_DE_PREMISSA } from "@/lib/origem-premissa";
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

/* os mesmos quatro rótulos do laudo, e pelo mesmo motivo — ver a nota longa em
   `ORIGEM_ROTULO`, em lib/laudo.ts. A tela e o documento não podem discordar
   sobre de quem é a premissa: é a única coisa que o laudo afirma sobre si. */
const ROTULO_ORIGEM: Record<Origem, string> = {
  coleta: "respondida pelo cliente no formulário",
  informada: "informada pelo contador",
  estimada: "estimada pelo perfil do CNAE",
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

/**
 * A OPÇÃO, E O NÚMERO QUE ELA VIRA — 10/08/2026.
 *
 * O terceiro elemento é a EQUIVALÊNCIA, e ele existe pela mesma razão que o
 * `equivale` de `lib/coleta.ts`, escrito para o formulário do cliente: quem
 * responde tem o número na cabeça — o contador sabe que "uns 60% dos clientes
 * dele são Presumido" — e sem ver a equivalência não tem como perceber que
 * marcou a faixa errada.
 *
 * Aqui o defeito era pior do que no formulário do cliente, porque este é o
 * lado do contador: ele clicava "quase todos", o motor gravava 0,92 e a linha
 * de baixo mostrava "receita qualificada = 70%" sem que nada na tela explicasse
 * de onde saíram os 70. Premissa que o signatário não consegue ler é premissa
 * que ele não pode defender — e isto vira laudo assinado.
 *
 * É TEXTO E NÃO CÁLCULO de propósito. `Math.round(0.92 * 100)` daria "92%", que
 * finge medição: o valor é um ponto representativo da faixa, não uma medida.
 * "mais de 90%" diz a verdade sobre o que foi declarado.
 *
 * Fica vazio onde não há percentual — "sim"/"não" valem 1 e 0, "com esforço"
 * vale 2, e escrever "100%" ou "200%" ali seria pior do que não escrever nada.
 */
type Opcao = [rotulo: string, valor: number, equivale?: string];

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
        {opcoes.map(([rotulo, v, equivale]) => {
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
              {equivale && (
                <span className={ativo ? "ml-1.5 text-white/70" : "ml-1.5 text-muted"}>
                  {equivale}
                </span>
              )}
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
  emBranco = false,
  respostasIniciais,
  detalhesIniciais,
  custoInicial,
  crescimentoInicial,
  segmentosIniciais,
  estimada,
  chavesDaColeta,
  origensIniciais,
  aoSalvar,
  calculadoEmInicial = null,
}: {
  empresaId: string;
  anexo: number | null;
  cnae: string | null;
  rbt12Inicial: number | null;
  /** "preencher diretamente": abre sem nenhuma opção marcada */
  emBranco?: boolean;
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
  /**
   * AS ORIGENS JÁ GRAVADAS — 11/08/2026.
   *
   * Sem elas, reabrir e salvar de novo APAGAVA a proveniência. `origemDe` só
   * conhecia o estado desta sessão: `tocadas` nasce vazio a cada abertura e
   * `chavesDaColeta` só chega no instante em que as respostas do cliente são
   * aplicadas. Numa reabertura qualquer, tudo o que o contador não tocasse caía
   * no ramo `respostasIniciais` e virava "informada" — inclusive as seis
   * respostas que o CLIENTE tinha preenchido no formulário.
   *
   * Ou seja: a origem mais forte que o produto sabe produzir era destruída por
   * um segundo clique em salvar, sem aviso e sem que nada na tela mudasse. E o
   * laudo seguinte deixava de poder dizer "respondida pelo cliente" sobre a
   * única coisa que o cliente de fato respondeu.
   *
   * Agora o que já foi gravado vale, e só perde para duas coisas: um toque do
   * contador nesta sessão (a premissa passou a ser dele) e uma coleta recém
   * aplicada (mais recente e mais forte).
   */
  origensIniciais?: Record<string, string> | null;
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
  /**
   * O CAMPO DE RBT12 ERA UM NÚMERO CRU — conserto de 10/08/2026.
   *
   * Ele nascia com `String(2400000)` e recebia o que fosse digitado, sem
   * formatação: a pessoa lia `2400000` e tinha de contar os zeros para saber se
   * eram dois milhões e quatrocentos mil ou vinte e quatro milhões. Numa tela em
   * que esse número TROCA A ALÍQUOTA e vira valor no laudo, contar zero com o
   * olho é a forma mais barata de errar uma faixa inteira.
   *
   * `mascaraMoeda` é acumulador de centavos (lib/mascaras.ts): o texto se forma
   * da direita para a esquerda, como no terminal de cartão, em vez de
   * reformatar o que já está escrito — reformatar joga o cursor para o fim a
   * cada tecla e torna impossível corrigir o meio do número.
   */
  const [rbt12, setRbt12] = useState(moedaParaMascara(rbt12Inicial));
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
   * A pergunta virou uma linha de percentual, que ele responde de cabeça.
   *
   * EM 10/08/2026 ela deixou de ser medição e passou a ser EXPECTATIVA — ver a
   * nota longa junto de `projetarRBT12`, mais abaixo, que é onde a mudança tem
   * consequência. Resumo: a opção se exerce em setembro de 2026 e vale de
   * janeiro a junho de 2027, então o que decide se a empresa troca de faixa
   * dentro do efeito é o que ela espera faturar, não o que faturou. Este estado
   * guarda o texto digitado; quem interpreta é a projeção.
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
  /**
   * A DECISÃO SÓ APARECE DEPOIS DE MANDAR CALCULAR — ver a nota do botão.
   *
   * Empresa que já tem análise do contador mostra tudo de cara: ali não há
   * surpresa a preservar, e quem reabre para ajustar uma premissa precisa ver o
   * efeito na hora. Análise ESTIMADA pelo lote não conta — ela é chute do CNAE,
   * e mostrar a decisão como se fosse resultado é o que faz o contador emitir
   * laudo sem conferir.
   */
  const [calculou, setCalculou] = useState(!semAnalise && !estimada);

  /**
   * O MODO "PREENCHER DIRETAMENTE" — 10/08/2026.
   *
   * Escolher esse caminho e encontrar o formulário preenchido pela estimativa
   * do CNAE é a armadilha que o roteiro existe para desarmar: a tela parece
   * pronta, o contador confirma sem ler, e o chute entra num laudo assinado.
   *
   * Aqui nenhuma opção nasce marcada. O truque é passar `NaN` como valor
   * selecionado enquanto o campo não foi tocado: a comparação de cada botão é
   * `Math.abs(valor - v) < 1e-9`, e NaN não casa com nada — sem inventar um
   * estado nulo que o motor teria de entender.
   *
   * E o cálculo fica travado até as DEZ estarem respondidas — dez, e não sete,
   * porque `qual` e `cred` são agregadas de duas e três perguntas na tela, e
   * contar a agregada faria o aviso dizer "faltam 3" com seis botões ainda
   * apagados. Salvar com metade em branco gravaria o padrão do sistema como se
   * fosse premissa do contador, que é exatamente o que este caminho evita.
   */
  const CHAVES_OBRIGATORIAS = [
    "b2b",
    "qual.fora_simples",
    "qual.sem_aproveitamento",
    "cred.insumos",
    "cred.servicos",
    "cred.outros",
    "folha",
    "preco",
    "conc",
    "exig",
  ];
  const faltamResponder = emBranco
    ? CHAVES_OBRIGATORIAS.filter((k) => !tocadas.has(k)).length
    : 0;
  /** o valor que a Escolha recebe: NaN esconde a seleção até alguém tocar */
  const vis = (chave: string, v: number) => (emBranco && !tocadas.has(chave) ? NaN : v);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /** um colega gravou entre a abertura desta tela e o clique em salvar */
  const [conflito, setConflito] = useState<string | null>(null);
  const [base_visto, setBaseVisto] = useState<string | null>(calculadoEmInicial);

  /**
   * UM CLIQUE PODE MARCAR DUAS CHAVES — e precisa marcar.
   *
   * `qual` e `cred` são premissas AGREGADAS: o motor consome uma, mas a tela
   * pergunta duas e três. A origem ("informada pelo contador") é da agregada,
   * porque é ela que vai para a análise. A seleção visual é de cada sub-campo.
   *
   * Antes disto um clique em "insumos" marcava a chave `cred` inteira e as
   * outras duas perguntas do bloco acendiam sozinhas, mostrando `nada`
   * selecionado — resposta que ninguém deu, no modo cuja promessa é justamente
   * que nada vem preenchido.
   */
  function tocar(...chaves: string[]) {
    setTocadas((s) => {
      const n = new Set(s);
      for (const c of chaves) n.add(c);
      return n;
    });
  }

  /** origem de cada premissa: quem não foi tocado é padrão (ou estimado, se veio do lote) */
  const daColeta = new Set(chavesDaColeta ?? []);

  /* a regra mora em lib/origem-premissa.ts, com teste: é ela que decide o que o
     laudo AFIRMA sobre quem respondeu, e viveu aqui sem trava até 11/08/2026 */
  function origemDe(chave: string): Origem {
    return resolverOrigem({
      tocada: tocadas.has(chave),
      daColetaAgora: daColeta.has(chave),
      gravada: origensIniciais?.[chave] ?? null,
      doLoteCnae: !!estimada,
      temRespostasIniciais: !!respostasIniciais,
    });
  }

  const qual = derivarQual(dq);
  const cred = derivarCred(dc);
  const respostas: Respostas = { ...r, qual, cred };

  const rbt12Num = valorDaMascara(rbt12);
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
  /* mostrar quando: já havia análise do contador ao abrir, ou ele acabou de
     mandar calcular nesta sessão */
  const mostrarResultado = calculou || salvo;

  const saida = SAIDAS[res.saida];
  const dois = cenarios(respostas, base);
  const dinheiro = emReais(res, rbt12Num, custoNum);
  /**
   * O CAMPO PASSOU A SER EXPECTATIVA, E ISSO MUDA DE ONDE A PROJEÇÃO SAI —
   * 10/08/2026.
   *
   * Ele perguntava "quanto a receita cresceu no último ano": medição do
   * passado, que o motor reconstruía como `rbt12_anterior = rbt12 / (1 + g)` e
   * gravava como valor medido. Agora pergunta a EXPECTATIVA de crescimento
   * anual, e a diferença não é de rótulo:
   *
   *   · a opção se exerce em setembro de 2026 e vale de janeiro a junho de
   *     2027. O que decide se a empresa muda de faixa DENTRO do efeito é o que
   *     ela espera faturar, não o que faturou;
   *   · e reconstruir um `rbt12_anterior` a partir de uma expectativa gravaria
   *     um passado que nunca foi medido, dentro de uma análise que vira laudo
   *     assinado. Número inventado em documento assinado não tem conserto.
   *
   * Então a projeção passa a receber o crescimento DIRETO — `projetarRBT12` já
   * aceita, com `origem: "informado"` —, e `rbt12_anterior` deixa de ser
   * gravado. O laudo passa a chamar isso de expectativa declarada, que é o que
   * é, em vez de medição.
   *
   * Queda de 100% ou mais seria receita zero ou negativa: aí não há projeção.
   */
  const crescNum = (() => {
    const t = crescimento.replace(/[^\d,.-]/g, "").replace(",", ".");
    if (!t || t === "-" || t === "." || t === "-.") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n / 100 : null;
  })();
  const projecao =
    rbt12Num != null && crescNum != null
      ? projetarRBT12({ rbt12: rbt12Num, crescimento: crescNum, anexo: ddas.anexo })
      : null;
  const comProjecao = projecao ? decidirComProjecao(respostas, base, projecao) : null;
  const sens = sensibilidade(respostas, base, dinheiro);
  const alerta = alertaFatorR(anexoSel, r.folha);
  /* mesma guarda do laudo: piso e teto para uma faixa inexistente é tabela
     degenerada, e tabela degenerada parece número sem ser */
  const temFaixaDeNegociacao = dinheiro.ganho_anual != null && dinheiro.ganho_anual > 0;

  /* a divisão real das sete premissas — ver a nota da linha que a imprime */
  const contagemOrigens = CHAVES_DE_PREMISSA.reduce<Record<string, number>>((acc, k) => {
    const o = origemDe(k);
    acc[o] = (acc[o] ?? 0) + 1;
    return acc;
  }, {});
  /* ORIGENS já vem da mais forte para a mais fraca — é a ordem de leitura */
  const presentes = ORIGENS.filter((o) => (contagemOrigens[o] ?? 0) > 0);
  const resumoDasOrigens =
    presentes.length === 1
      ? ROTULO_ORIGEM[presentes[0]]
      : presentes.map((o) => `${contagemOrigens[o]} ${ROTULO_ORIGEM[o]}`).join(" · ");

  async function salvar(forcar = false) {
    setSalvando(true);
    setErro(null);
    if (forcar) setConflito(null);
    try {
      const origens = Object.fromEntries(CHAVES_DE_PREMISSA.map((k) => [k, origemDe(k)]));
      const resp = await fetch("/api/analise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_id: empresaId,
          respostas,
          rbt12: rbt12Num,
          /* o campo virou EXPECTATIVA (ver a nota acima): mandar um
             `rbt12_anterior` reconstruído a partir dela gravaria um passado que
             ninguém mediu, dentro do que vira laudo assinado */
          crescimento_esperado: crescNum,
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
        /* `salvo` volta a false em 2,5s (é o "✓" do botão). `calculou` não
           volta: a partir daqui a decisão fica na tela, porque o contador vai
           ajustar premissa e precisa ver o efeito na hora. */
        setCalculou(true);
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
                onChange={(e) => setRbt12(mascaraMoeda(e.target.value))}
                inputMode="numeric"
                placeholder="480.000,00"
                className="w-40 bg-transparent px-2 py-1.5 text-right font-mono text-[13px] outline-none"
              />
            </div>
            <span
              className={`rounded-sm px-2 py-1 font-mono text-[11px] ${
                ddas.fonte === "efetiva" ? "bg-verdewash text-verde" : "bg-accentwash text-accentdeep"
              }`}
            >
              faixa {ddas.faixa} ·{" "}
              {/* duas casas, como na memória de cálculo do laudo: a tela dizia
                  10,7% e o documento gerado a partir dela dizia 10,66% */}
              {ddas.fonte === "efetiva"
                ? `efetiva ${pct(ddas.aliquota, 2)}`
                : `topo ${pct(ddas.aliquota, 2)} (estimado)`}
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
            * A pergunta é a EXPECTATIVA de crescimento, e não o que já foi
            * medido — mudou em 10/08/2026. O período que a decisão cobre é
            * futuro, então é a expectativa que diz se a empresa troca de faixa
            * dentro do efeito. Nenhum `rbt12_anterior` é reconstruído a partir
            * daqui: isso gravaria um passado que ninguém mediu dentro de uma
            * análise que vira laudo assinado.
            *
            * Opcional. Sem ele nada é projetado, e o laudo não ganha a seção —
            * melhor do que ganhar uma seção construída sobre um chute.
            */}
          <div className="mt-3">
            <div className="text-[12.5px] font-semibold">
              Expectativa de crescimento anual{" "}
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
          valor={vis("b2b", r.b2b)}
          onEscolher={(v) => {
            setR({ ...r, b2b: v });
            tocar("b2b");
          }}
          doCliente={origemDe("b2b") === "coleta"}
        />

        <Escolha
          titulo="Desses clientes empresa, quantos estão fora do Simples (Lucro Real ou Presumido)?"
          dica="Cliente no Simples tradicional ou MEI não aproveita o crédito integral."
          opcoes={[
            ["quase nenhum", 0.1, "uns 10%"],
            ["menos da metade", 0.33, "uns 33%"],
            ["mais da metade", 0.65, "uns 65%"],
            ["quase todos", 0.92, "mais de 90%"],
          ]}
          valor={vis("qual.fora_simples", dq.fora_simples)}
          onEscolher={(v) => {
            setDq({ ...dq, fora_simples: v });
            tocar("qual", "qual.fora_simples");
          }}
        />

        <Escolha
          titulo="E desses, quantos ainda assim NÃO aproveitariam o crédito?"
          dica="Órgão público, entidade imune, ou quem revende direto ao consumidor final e não usa o crédito na prática."
          opcoes={[
            ["nenhum", 0, "0%"],
            ["poucos", 0.15, "uns 15%"],
            ["cerca de um terço", 0.33, "uns 33%"],
            ["mais da metade", 0.6, "uns 60%"],
          ]}
          valor={vis("qual.sem_aproveitamento", dq.sem_aproveitamento)}
          onEscolher={(v) => {
            setDq({ ...dq, sem_aproveitamento: v });
            tocar("qual", "qual.sem_aproveitamento");
          }}
        />

        {/* A SOMA NÃO PODE APARECER ANTES DAS PARCELAS — 10/08/2026.

            No modo em branco os botões não nascem marcados, mas o estado por
            trás deles continua tendo o padrão do sistema. Sem esta guarda a
            linha derivada mostraria "receita qualificada = 90% × 78,2% =
            70,4%" com as três perguntas acima ainda intocadas — um número que
            ninguém respondeu, no lugar exato onde a tela promete que nada vem
            preenchido. */}
        {(!emBranco || (tocadas.has("b2b") && tocadas.has("qual.fora_simples") && tocadas.has("qual.sem_aproveitamento"))) && (
          <p className="mt-2 rounded-sm bg-surface2 px-2.5 py-2 font-mono text-[11.5px] text-slate2">
            receita qualificada = {pct(r.b2b)} × {pct(qual)} = <b>{pct(res.rq)}</b> da receita
          </p>
        )}
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
          valor={vis("cred.insumos", dc.insumos)}
          onEscolher={(v) => {
            setDc({ ...dc, insumos: v });
            tocar("cred", "cred.insumos");
          }}
        />
        <Escolha
          titulo="Serviços tomados de pessoa jurídica fora do Simples"
          opcoes={[["nada", 0], ["até 5%", 0.03], ["5–10%", 0.07], ["mais de 10%", 0.15]]}
          valor={vis("cred.servicos", dc.servicos)}
          onEscolher={(v) => {
            setDc({ ...dc, servicos: v });
            tocar("cred", "cred.servicos");
          }}
        />
        <Escolha
          titulo="Energia, aluguel de PJ, fretes e demais insumos com crédito"
          opcoes={[["nada", 0], ["até 5%", 0.03], ["5–10%", 0.07], ["mais de 10%", 0.13]]}
          valor={vis("cred.outros", dc.outros)}
          onEscolher={(v) => {
            setDc({ ...dc, outros: v });
            tocar("cred", "cred.outros");
          }}
        />

        {/* mesma regra da linha acima: soma só depois das parcelas */}
        {(!emBranco || (tocadas.has("cred.insumos") && tocadas.has("cred.servicos") && tocadas.has("cred.outros"))) && (
          <p className="mt-2 rounded-sm bg-surface2 px-2.5 py-2 font-mono text-[11.5px] text-slate2">
            compras com crédito = {pct(dc.insumos)} + {pct(dc.servicos)} + {pct(dc.outros)} ={" "}
            <b>{pct(cred)}</b> da receita
          </p>
        )}
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
          valor={vis("folha", r.folha)}
          onEscolher={(v) => {
            setR({ ...r, folha: v });
            tocar("folha");
          }}
        />
        <Escolha
          titulo="A empresa consegue renegociar preço com os clientes empresa?"
          opcoes={[["tem poder de preço", 3], ["com esforço", 2], ["contratos travados", 1], ["não, o mercado define", 0]]}
          valor={vis("preco", r.preco)}
          onEscolher={(v) => {
            setR({ ...r, preco: v });
            tocar("preco");
          }}
          doCliente={origemDe("preco") === "coleta"}
        />
        <Escolha
          titulo="Os concorrentes diretos estão majoritariamente fora do Simples?"
          opcoes={[["sim", 1], ["não", 0]]}
          valor={vis("conc", r.conc)}
          onEscolher={(v) => {
            setR({ ...r, conc: v });
            tocar("conc");
          }}
          doCliente={origemDe("conc") === "coleta"}
        />
        <Escolha
          titulo="Algum cliente já sinalizou que vai exigir crédito integral em 2027?"
          opcoes={[["sim", 1], ["não", 0]]}
          valor={vis("exig", r.exig)}
          onEscolher={(v) => {
            setR({ ...r, exig: v });
            tocar("exig");
          }}
          doCliente={origemDe("exig") === "coleta"}
        />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          O BOTÃO DE SALVAR SUBIU PARA CÁ — 10/08/2026.

          Ele ficava no rodapé, DEPOIS do resultado, dos dois cenários, da
          sensibilidade e da tabela em reais. E o resultado era calculado ao
          vivo, a cada clique numa opção. O efeito é que a decisão aparecia
          enquanto o contador ainda respondia: quando ele chegava ao botão, já
          sabia a resposta havia três blocos, e "Salvar análise" virava
          burocracia no fim de uma leitura.

          Invertido, a tela conta a história certa: você responde, você manda
          calcular, o sistema devolve a decisão. É a mesma informação, na ordem
          em que o trabalho acontece — e é a ordem que o laudo depois afirma.

          O resultado continua ao vivo DEPOIS de existir análise salva: quem
          reabre a empresa para ajustar uma premissa precisa ver o efeito na
          hora, e aí já não há surpresa a preservar.
          ═══════════════════════════════════════════════════════════════════ */}
      {erro && <p className="rounded-sm bg-vermelhowash px-3 py-2 text-[12.5px] text-vermelho">{erro}</p>}

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

      <button
        /* o argumento vira o MouseEvent se passado direto — e um evento é
           `truthy`, o que faria todo salvamento normal gravar por cima do
           colega sem perguntar. A seta existe por isso. */
        onClick={() => void salvar()}
        disabled={salvando || (segregar && !fechado) || faltamResponder > 0}
        title={
          faltamResponder > 0
            ? `Faltam ${faltamResponder} respostas`
            : segregar && !fechado
              ? "Feche 100% da segregação por anexo para salvar"
              : undefined
        }
        className="w-full rounded-sm bg-ink px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
      >
        {salvando
          ? "Calculando..."
          : salvo
            ? "Análise salva ✓"
            : mostrarResultado
              ? "Salvar análise"
              : "Calcular e salvar a análise"}
      </button>

      {!mostrarResultado && (
        <p className="text-center text-[12px] text-muted">
          {faltamResponder > 0 ? (
            <>
              Faltam <b>{faltamResponder}</b>{" "}
              {faltamResponder === 1 ? "resposta" : "respostas"} para calcular.
            </>
          ) : (
            "A decisão, os dois cenários e a sensibilidade aparecem aqui depois de calcular."
          )}
        </p>
      )}

      {/* --------------------------------------------------------- resultado */}
      <div className={mostrarResultado ? "rounded border border-line bg-surface p-4" : "hidden"}>
        <div className="mb-3 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
          A decisão em uma linha
        </div>
        <Gauge re={res.re} reLiquido={res.re_liquido} fc={res.fc} />

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
                {/**
                  * A MESMA FAIXA DO LAUDO, COM AS DUAS PONTAS — 10/08/2026.
                  *
                  * "Ganho da empresa se optar" é o TOPO da faixa de negociação:
                  * o que a empresa levaria capturando tudo o que está na mesa. O
                  * laudo parou de chamar isso de ganho; a tela não tinha ido
                  * junto, e passou algumas horas afirmando um resultado que o
                  * documento gerado a partir dela recusava afirmar.
                  *
                  * Duas telas discordando sobre o mesmo número é pior do que as
                  * duas erradas do mesmo jeito: o contador confere uma contra a
                  * outra, e é assim que ele perde a confiança nas duas.
                  */}
                {/* sem ganho não há faixa: ver a mesma guarda em LaudoFolha */}
                {temFaixaDeNegociacao ? (
                  <>
                <tr>
                  <td className="py-1 pr-2 text-muted">
                    Se o repasse ficar no mínimo que equilibra
                    <span className="block font-mono text-[10.5px] text-muted">
                      a empresa não perde e não ganha
                    </span>
                  </td>
                  <td className="py-1 text-right font-mono">R$ 0</td>
                </tr>
                <tr>
                  <td className="py-1 pr-2 text-muted">
                    Se for negociado até o limite do cliente
                    <span className="block font-mono text-[10.5px] text-muted">
                      teto da faixa — não é previsão
                    </span>
                  </td>
                  <td className="py-1 text-right font-mono font-semibold">
                    {moeda(dinheiro.ganho_anual)}
                  </td>
                </tr>
                  </>
                ) : (
                  <tr>
                    <td className="py-1 pr-2 text-muted">
                      Não há faixa de negociação neste cenário
                      <span className="block font-mono text-[10.5px] text-muted">
                        o repasse que equilibra já passa do que o cliente comporta
                      </span>
                    </td>
                    <td className="py-1 text-right font-mono font-semibold">sem ganho a negociar</td>
                  </tr>
                )}
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
                  <td className="py-1 pr-2 text-muted">
                    {temFaixaDeNegociacao
                      ? "Em quanto tempo o teto da faixa cobre esse custo"
                      : "Em quanto tempo o ganho cobriria esse custo"}
                  </td>
                  <td className="py-1 text-right font-mono">
                    {dinheiro.payback_meses != null
                      ? `${dinheiro.payback_meses.toFixed(1).replace(".", ",")} meses`
                      : "não calculado"}
                  </td>
                </tr>
                <tr>
                  <td className="py-1 pr-2 text-muted">
                    Se não houver repasse nenhum, a empresa absorve
                    <span className="block font-mono text-[10.5px] text-muted">
                      {temFaixaDeNegociacao ? "a outra ponta da mesma faixa" : "para onde a conta vai sem negociação"}
                    </span>
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
        {/**
          * UMA PREMISSA NÃO FALA PELAS SETE — 11/08/2026.
          *
          * Esta linha resumia a proveniência de TODAS lendo `origemDe("b2b")`,
          * a primeira pergunta do formulário. Num caso real as sete se
          * dividiam em quatro estimadas pelo CNAE e três escolhidas pelo
          * contador, e a tela anunciava uma só — a de b2b — como se fosse a
          * origem do conjunto. O laudo, que lista uma a uma, dizia outra coisa.
          *
          * Agora conta. Quando as sete concordam, sai a frase de antes; quando
          * não, sai a divisão, que é o dado que interessa: é ela que diz quanto
          * do documento ainda depende de palpite.
          */}
        <p className="mt-1.5 font-mono text-[10.5px] text-muted">
          origem das premissas: {resumoDasOrigens} · marcada por resposta no laudo
        </p>
      </div>

    </div>
  );
}
