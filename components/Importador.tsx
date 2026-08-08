"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  parsearCarteira,
  extrairCnpjs,
  csvDeCnpjs,
  CSV_EXEMPLO,
  CSV_PRIMEIRO_CASO,
  decodificarCsv,
  pareceMojibake,
  planilhaParaCsv,
  ehPlanilha,
  type ResultadoParse,
  type LinhaCarteira,
} from "@/lib/csv";
import { ROTULO_FAIXA, triar, type Faixa } from "@/lib/triagem";

/** o que cada campo faz — mostrado na confirmação de leitura do arquivo */
const CAMPOS: { chave: keyof LinhaCarteira; rotulo: string; papel: string; essencial?: boolean }[] = [
  { chave: "cnpj", rotulo: "CNPJ", papel: "identifica a empresa e busca os dados na Receita", essencial: true },
  { chave: "razao_social", rotulo: "Razão social", papel: "nome que aparece no laudo", essencial: true },
  { chave: "cnae_principal", rotulo: "CNAE", papel: "define a faixa da triagem" },
  { chave: "rbt12", rotulo: "RBT12", papel: "torna a alíquota efetiva, não estimada" },
  { chave: "anexo", rotulo: "Anexo", papel: "afina o cálculo do que sai do DAS" },
  { chave: "regime", rotulo: "Regime", papel: "separa quem já está fora do Simples" },
  { chave: "porte", rotulo: "Porte", papel: "identifica MEI" },
  { chave: "situacao", rotulo: "Situação", papel: "separa empresas inativas" },
  { chave: "contato_nome", rotulo: "Contato", papel: "quem assina o termo pela empresa" },
  { chave: "contato_email", rotulo: "E-mail", papel: "para enviar o link de assinatura em lote" },
  { chave: "contato_telefone", rotulo: "Telefone", papel: "acompanhamento comercial" },
];

const MODELO_CSV = `cnpj,razao_social,cnae_principal,porte,regime,anexo,rbt12,contato,email,telefone
11.222.333/0001-81,Distribuidora Exemplo Ltda,4649-4/08,EPP,Simples Nacional,1,480000,Marcos Aurélio,marcos@exemplo.com.br,(11) 90000-0000
07.526.557/0001-00,Restaurante Exemplo ME,5611-2/01,ME,Simples Nacional,3,220000,Helena Prado,helena@exemplo.com.br,(11) 90000-0001
22.333.444/0001-81,Transportes Exemplo Ltda,4930-2/02,EPP,Simples Nacional,3,1200000,Jorge Valle,jorge@exemplo.com.br,(11) 90000-0002`;

function baixarModelo() {
  const blob = new Blob(["﻿" + MODELO_CSV], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "modelo-carteira-enquadria.csv";
  a.click();
  URL.revokeObjectURL(url);
}

const ORDEM: Faixa[] = ["A", "B", "C", "D", "MEI", "FORA"];
const COR: Record<Faixa, string> = {
  A: "text-vermelho",
  B: "text-amarelo",
  C: "text-slate1",
  D: "text-muted",
  MEI: "text-neutro",
  FORA: "text-muted",
};

/** o que a tela de sucesso da importação mostra */
interface Feito {
  gravadas: number;
  enriquecidas: number;
  receita_ativa: boolean;
  receita_configurada?: boolean;
  receita_falhas?: number;
  com_rbt12?: number;
  triagem_cega?: boolean;
  regime_suspeito?: { quantas: number; total: number; exemplo: string | null } | null;
  analisadas?: number;
  /** a primeira passada falhou; a carteira está salva e dá para refazer */
  avisoAnalise?: string;
}

export function Importador({ jaTem = 0 }: { jaTem?: number }) {
  const router = useRouter();
  const [codificacao, setCodificacao] = useState<string | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState<string>("");
  const [parse, setParse] = useState<ResultadoParse | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [colando, setColando] = useState(true);
  const [texto, setTexto] = useState("");
  const [etapa, setEtapa] = useState<"gravando" | "analisando" | null>(null);
  const previaRef = useRef<HTMLDivElement>(null);

  /** leva o olho até a prévia — todo caminho que monta carteira passa por aqui */
  function rolarAtePrevia() {
    requestAnimationFrame(() =>
      previaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    );
  }
  const [feito, setFeito] = useState<Feito | null>(null);
  const [diag, setDiag] = useState<{
    veredito: string; sugestao: string | null; url: string | null;
    tem_token: boolean; tempo_ms: number; detalhe: string | null;
  } | null>(null);
  const [testando, setTestando] = useState(false);

  /**
   * A RESPOSTA PODE NÃO SER JSON — 08/08/2026.
   *
   * `await resp.json()` era incondicional. O enriquecimento contra a Receita
   * roda em blocos de 200 CNPJs com 12 s de teto cada, então uma carteira
   * grande pode estourar o tempo da função — e aí a plataforma responde HTML.
   * O `json()` lançava, o catch escrevia `e.message`, e o contador lia, em
   * inglês, `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`.
   */
  async function lerResposta(resp: Response): Promise<Record<string, unknown>> {
    const texto = await resp.text().catch(() => "");
    try {
      return texto ? (JSON.parse(texto) as Record<string, unknown>) : {};
    } catch {
      return {
        erro:
          resp.status === 504 || resp.status === 502
            ? "o servidor demorou demais e interrompeu no meio. Parte da carteira pode ter sido gravada — abra o cockpit e confira antes de importar de novo."
            : `o servidor respondeu ${resp.status} sem detalhe. Abra o cockpit e confira o que entrou antes de importar de novo.`,
      };
    }
  }

  /** o instrumento: uma chamada com CNPJ conhecido, e o motivo exato do erro */
  async function testarReceita() {
    setTestando(true);
    setDiag(null);
    try {
      const r = await fetch("/api/receita/teste", { cache: "no-store" });
      setDiag(await r.json());
    } catch {
      setDiag({
        veredito: "não consegui nem chamar o diagnóstico",
        sugestao: "Recarregue a página e tente de novo.",
        url: null, tem_token: false, tempo_ms: 0, detalhe: null,
      });
    } finally {
      setTestando(false);
    }
  }

  /**
   * A PRÉVIA SEM CNAE NÃO É PRÉVIA — é o estado ANTERIOR à consulta.
   *
   * Custou três diagnósticos errados em 07/08/2026 para isto ficar claro, e
   * quem se enganou foi quem escreveu o produto. O caminho de colar CNPJs
   * monta as linhas no navegador, onde só existe o número: a razão social sai
   * como "(sem razão social)", o CNAE sai vazio, e a triagem local — que
   * precisa de CNAE para separar qualquer coisa — despeja a carteira inteira
   * em "baixo risco". A consulta à Receita só acontece no servidor, ao
   * confirmar.
   *
   * O resultado era uma tela que afirmava, com números de 24px sob um título
   * chamado "Prévia da triagem", o oposto do que estava acontecendo: parecia
   * carteira analisada e sem risco, quando era carteira ainda não consultada.
   * A etiqueta "via Receita" na última coluna da tabela existia — e não
   * segurou. Texto de 12px não desmente número de 24px.
   *
   * A regra que fica: número que ainda vai mudar não aparece como resultado.
   * Sem CNAE em nenhuma linha, os contadores de faixa saem da tela e entra o
   * que é verdade — o que falta e o que o botão vai fazer.
   */
  const semCnae =
    !!parse && parse.linhas.length > 0 && parse.linhas.every((l) => !l.cnae_principal);

  /** valor da 1ª linha para um campo — o que denuncia coluna capturada errada */
  const exemplo = (chave: keyof LinhaCarteira): string | null => {
    const v = parse?.linhas[0]?.[chave];
    if (v == null || v === "") return null;
    return String(v);
  };

  // triagem local só para a prévia — o servidor recalcula ao gravar
  const previaFaixas = parse
    ? parse.linhas.reduce(
        (acc, l) => {
          const f = triar({
            cnpj: l.cnpj,
            razao_social: l.razao_social,
            cnae_principal: l.cnae_principal ?? null,
            porte: l.porte ?? null,
            situacao: l.situacao ?? null,
            regime: l.regime ?? null,
            faturamento_faixa: l.faturamento_faixa ?? null,
          }).faixa;
          acc[f] = (acc[f] ?? 0) + 1;
          return acc;
        },
        {} as Record<Faixa, number>
      )
    : null;

  async function aoSelecionar(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    setErro(null);
    setFeito(null);
    setNomeArquivo(arquivo.name);
    /**
     * Lemos os BYTES, não o texto. `arquivo.text()` assume UTF-8 sempre, e o
     * Excel brasileiro exporta em Windows-1252 — o acento chega corrompido e
     * vai assim para o banco, para o laudo e para o termo assinado.
     */
    const bytes = await arquivo.arrayBuffer();

    /**
     * Planilha do Excel entra pelo mesmo parser do CSV — só muda a porta.
     * Um caminho de leitura só significa um conjunto de regras só.
     */
    let texto: string;
    let codificacao: string;
    if (ehPlanilha(arquivo.name)) {
      try {
        texto = await planilhaParaCsv(bytes);
        codificacao = "planilha do Excel";
      } catch {
        /* saída primeiro: o que fazer, e só depois por quê */
        setErro(
          "Salve como CSV UTF-8 e tente de novo. Não consegui abrir esta planilha — pode ter senha ou ser muito antiga."
        );
        return;
      }
    } else {
      const lido = decodificarCsv(bytes);
      texto = lido.texto;
      codificacao = lido.codificacao;
    }
    setCodificacao(codificacao);
    const resultado = parsearCarteira(texto);
    if (!resultado.colunas_reconhecidas.cnpj) {
      const achadas = (resultado.colunas_ignoradas ?? []).slice(0, 6).join(", ");
      setErro(
        `Não encontrei a coluna de CNPJ.${
          achadas ? ` Li estas colunas: ${achadas}.` : ""
        } Renomeie a coluna dos documentos para "cnpj" (ou baixe o modelo e cole seus dados nele).`
      );
      setParse(null);
      return;
    }
    if (resultado.linhas.length === 0) {
      setErro(
        `Confira se os documentos têm os 14 dígitos. Li o cabeçalho, mas nenhuma linha tinha CNPJ válido — ${resultado.descartadas} descartadas.`
      );
      setParse(null);
      return;
    }
    setParse(resultado);
    rolarAtePrevia();
  }

  /**
   * O PRIMEIRO CASO GUIADO — uma empresa fictícia, para ver funcionando antes
   * de entregar dado de cliente. A hesitação é real e apareceu literal numa
   * conversa: criar a conta é barato; subir a carteira é entregar o ativo do
   * escritório a um sistema que a pessoa ainda não viu funcionar.
   */
  function usarPrimeiroCaso() {
    setErro(null);
    setFeito(null);
    setNomeArquivo("primeiro-caso.csv");
    setParse(parsearCarteira(CSV_PRIMEIRO_CASO));
    rolarAtePrevia();
  }

  function usarExemplo() {
    setErro(null);
    setFeito(null);
    setColando(false);
    setNomeArquivo("exemplo.csv");
    setParse(parsearCarteira(CSV_EXEMPLO));
    rolarAtePrevia();
  }

  /**
   * COLAR CNPJs — o caminho que tira o export do sistema da frente.
   *
   * Era aqui que a maior parte dos contadores parava: criava a conta, chegava
   * na importação e precisava ir buscar um CSV em outro programa. Metade não
   * voltava. O parser já aceitava um arquivo só com a coluna cnpj; faltava
   * oferecer isso na tela.
   *
   * A extração e a montagem do CSV vivem em `lib/csv.ts` (extrairCnpjs /
   * csvDeCnpjs) porque estão cobertas por teste — a primeira versão delas
   * quebrava no caso mais comum e ninguém teria percebido pela tela.
   * Aqui fica só o que é de tela: mensagem, estado e prévia.
   */
  function lerColados() {
    setErro(null);
    setFeito(null);
    const achados = extrairCnpjs(texto);

    if (achados.length === 0) {
      setErro(
        "Cole os documentos com os 14 dígitos — um por linha, ou separados por vírgula. Nenhum CNPJ completo veio aí."
      );
      setParse(null);
      return;
    }
    setNomeArquivo(`${achados.length} CNPJs colados`);
    setParse(parsearCarteira(csvDeCnpjs(achados)));

    /**
     * LEVAR O OLHO ATÉ O RESULTADO.
     *
     * O botão "Ler CNPJs" parecia não fazer nada: ele montava a prévia, mas a
     * prévia nasce noventa linhas abaixo, depois do bloco do CSV — fora da
     * tela. Do ponto de vista de quem clicou, o clique não teve efeito, e a
     * pessoa clica de novo. Fecho a caixa de colar (o trabalho dela terminou) e
     * rolo até a prévia.
     */
    setColando(false);
    rolarAtePrevia();
  }

  async function gravar() {
    if (!parse) return;
    setEnviando(true);
    setEtapa("gravando");
    setErro(null);
    try {
      const resp = await fetch("/api/importar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          linhas: parse.linhas,
          arquivo: nomeArquivo,
          stats: {
            total_lidas: parse.total_lidas,
            descartadas: parse.descartadas,
            duplicadas: parse.duplicadas,
          },
        }),
      });
      const json = await lerResposta(resp);
      if (!resp.ok) throw new Error((json.erro as string) ?? "falha ao gravar");

      /**
       * A PRIMEIRA PASSADA, ENCADEADA — o conserto de maior impacto do funil.
       *
       * Antes, a importação terminava com a carteira triada e ZERO análises: o
       * contador via a fila e precisava abrir empresa por empresa respondendo
       * sete perguntas. Para 46 empresas da faixa A, isso é meia tarde antes
       * do primeiro laudo — e é onde ele fechava a aba.
       *
       * A rota do lote já existia como ação em massa no cockpit. O que faltava
       * era ela rodar SOZINHA aqui, para que a carteira nunca apareça vazia:
       * ele chega com recomendação em cada linha e o trabalho vira REVISAR, e
       * não PREENCHER. A honestidade continua inteira — tudo marcado como
       * estimada (origem lote_cnae), e o laudo não sai sem ele confirmar.
       *
       * Falhar aqui NÃO desfaz a importação: as empresas já estão gravadas, e
       * o contador roda o lote pelo cockpit quando quiser.
       *
       * O QUE MUDOU EM 08/08/2026: o catch era MUDO. `analisadas` ficava
       * indefinida, o bloco que a exibe simplesmente não renderizava, e a tela
       * de sucesso saía idêntica à de quem teve tudo analisado — sem dizer que
       * a primeira passada falhou nem que dá para refazer. "Um erro na cereja
       * não pode parecer erro no bolo" continua valendo; parecer que não houve
       * erro nenhum é outra coisa. Agora a falha vira uma linha de aviso, com
       * a saída escrita, e a importação segue sendo sucesso.
       */
      let analisadas: number | undefined;
      let avisoAnalise: string | undefined;
      const ids: string[] = (json.empresas_para_analisar as string[]) ?? [];
      if (ids.length > 0) {
        setEtapa("analisando");
        try {
          const rl = await fetch("/api/analise/lote", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ empresa_ids: ids }),
          });
          const jl = await lerResposta(rl);
          if (rl.ok) analisadas = (jl.gravadas as number) ?? 0;
          else
            avisoAnalise = `A carteira foi gravada, mas a primeira análise automática não rodou (${
              (jl.erro as string) ?? `erro ${rl.status}`
            }). Abra o cockpit, selecione as empresas e clique em “Analisar”.`;
        } catch {
          avisoAnalise =
            "A carteira foi gravada, mas a primeira análise automática não rodou. Abra o cockpit, selecione as empresas e clique em “Analisar”.";
        }
      }

      setFeito({ ...(json as unknown as Feito), analisadas, avisoAnalise });
      setParse(null);
      setTexto("");
      router.refresh();
    } catch (e) {
      /* a mensagem do servidor já vem em português por `lerResposta`; o que
         sobra aqui é falha de rede de verdade, e ela precisa dizer que nada
         foi gravado — senão o contador não sabe se pode repetir */
      setErro(
        e instanceof Error && e.message
          ? e.message
          : "não foi possível falar com o servidor — nada foi gravado. Confira a conexão e tente de novo."
      );
    } finally {
      setEnviando(false);
      setEtapa(null);
    }
  }

  if (feito) {
    return (
      <div className="rounded border border-verde bg-verdewash p-6">
        <div className="flex items-center gap-2 text-verde">
          <span className="font-mono text-sm">✓</span>
          <span className="text-[15px] font-semibold">
            {feito.gravadas} {feito.gravadas === 1 ? "empresa" : "empresas"}{" "}
            {jaTem > 0 ? "adicionadas à carteira" : "na carteira"}
          </span>
        </div>
        {/*
          TRÊS ESTADOS, TRÊS DIAGNÓSTICOS DIFERENTES.
          Antes havia dois, e o segundo mentia: quando a integração estava
          configurada mas quebrada, a tela dizia "0 enriquecidas" — que soa
          como "a base não achou a sua carteira", quando na verdade a base não
          foi consultada. São problemas opostos e exigem ações opostas.
        */}
        <p className="mt-2 text-[13.5px] text-slate2">
          {feito.receita_ativa
            ? `${feito.enriquecidas} enriquecidas contra a base da Receita.`
            : feito.receita_configurada
            ? "A Receita não respondeu — a triagem usou os dados do arquivo."
            : "A Receita não está ligada — a triagem usou os dados do arquivo."}
        </p>

        {/* O DADO, NÃO O CABEÇALHO. A linha acima do arquivo fala de colunas
            encontradas; esta fala de quantas empresas ficaram com RBT12 de
            verdade — que é o que muda a alíquota de estimada para efetiva. */}
        {feito.com_rbt12 != null && (
          <p className="mt-1 text-[13.5px] text-slate2">
            {feito.com_rbt12 === 0
              ? "Nenhuma linha trouxe RBT12 — a alíquota sai estimada pelo topo da faixa até você informar a receita."
              : feito.com_rbt12 === feito.gravadas
                ? "Todas trouxeram RBT12 — a alíquota já sai efetiva."
                : `${feito.com_rbt12} de ${feito.gravadas} trouxeram RBT12. Nas outras a alíquota sai estimada até você informar a receita.`}
          </p>
        )}

        {!feito.receita_ativa && feito.receita_configurada && (
          <button
            onClick={testarReceita}
            disabled={testando}
            className="mt-2 text-[12.5px] font-semibold text-accentdeep underline underline-offset-2 disabled:opacity-40"
          >
            {testando ? "testando…" : "descobrir por quê"}
          </button>
        )}

        {feito.analisadas != null && feito.analisadas > 0 && (
          <p className="mt-1.5 text-[13.5px] text-slate2">
            <b>{feito.analisadas} já vieram com uma primeira recomendação</b>, calculada
            pelo perfil típico do CNAE. As premissas estão marcadas como{" "}
            <b>estimadas</b> — confirme antes de emitir qualquer laudo.
          </p>
        )}

        {feito.avisoAnalise && (
          <p className="mt-1.5 text-[13.5px] text-amarelo">{feito.avisoAnalise}</p>
        )}

        {feito.triagem_cega && (
          /* A SAÍDA PRIMEIRO, A CAUSA DEPOIS (08/08/2026).
             Eram três frases de diagnóstico e uma de saída — e a saída por
             último. Quem lê mensagem de erro lê a primeira linha e procura o
             botão; o resto é para quem quiser entender. */
          <p className="mt-3 rounded-sm bg-amarelowash px-3 py-2 text-[12.5px] leading-relaxed text-amarelo">
            <b>Suba o CSV com a coluna de CNAE</b> — ou repita a importação mais tarde. Sem CNAE e
            sem resposta da Receita, a triagem não teve com que separar: quase tudo caiu em
            &quot;baixo risco&quot;.
          </p>
        )}

        {/* a rede do regime: quase tudo FORA é mais provavelmente leitura
            errada do arquivo do que um escritório inteiro fora do Simples */}
        {feito.regime_suspeito && (
          <p className="mt-3 rounded-sm bg-amarelowash px-3 py-2 text-[12.5px] leading-relaxed text-amarelo">
            <b>Confira antes de seguir:</b> {feito.regime_suspeito.quantas} de{" "}
            {feito.regime_suspeito.total} empresas caíram em &quot;fora do Simples&quot; pelo
            valor da coluna de regime
            {feito.regime_suspeito.exemplo ? (
              <>
                {" "}
                (ex.: <b>&quot;{feito.regime_suspeito.exemplo}&quot;</b>)
              </>
            ) : null}
            . Se a sua carteira é majoritariamente do Simples, o arquivo está dizendo outra
            coisa — me mande esse valor pelo suporte que a leitura passa a entendê-lo.
          </p>
        )}

        {diag && (
          <div className="mt-3 rounded-sm border border-line bg-surface2 p-3">
            <div className="text-[13px] font-semibold">{diag.veredito}</div>
            {diag.sugestao && (
              <p className="mt-1 text-[12.5px] leading-relaxed text-slate2">{diag.sugestao}</p>
            )}
            <div className="mt-2 font-mono text-[11px] leading-relaxed text-muted">
              url: {diag.url ?? "—"}
              <br />
              token enviado: {diag.tem_token ? "sim" : "NÃO"} · resposta em {diag.tempo_ms}ms
              {diag.detalhe && (
                <>
                  <br />
                  detalhe: {diag.detalhe}
                </>
              )}
            </div>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <a
            href="/painel"
            className="rounded-sm bg-ink px-4 py-2 text-sm font-semibold text-white"
          >
            Ver a carteira triada
          </a>
          <button
            onClick={() => setFeito(null)}
            className="rounded-sm border border-line px-4 py-2 text-sm font-semibold text-slate2"
          >
            Adicionar mais empresas
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/*
        DUAS PORTAS ABERTAS — decisão de 07/08/2026, revertendo a de 06/08.
        A versão anterior escondia o CSV atrás de um <details> ("uma porta, não
        duas"). No primeiro uso real, quem chegou COM o arquivo na mão não viu
        onde subi-lo: a porta fechada não simplificou, sumiu. A lição que fica:
        esconder um caminho só simplifica para quem não precisa dele.
        Colar CNPJ continua primeiro (é o caminho de quem não tem nada na mão);
        o arquivo fica visível ao lado, sem clique de descoberta.
      */}
      <div className="rounded border border-line bg-surface p-6 shadow-card">
        <div className="text-[16px] font-bold">
          {jaTem > 0 ? "Cole os CNPJs das novas empresas" : "Cole o CNPJ de um cliente do Simples"}
        </div>
        <p className="mt-1 max-w-[68ch] text-[13px] leading-relaxed text-muted">
          {/* A MESMA FRASE VIVIA TRÊS VEZES NESTA TELA — aqui, no resumo do que
              vai acontecer e no aviso do caminho 1. Fica UMA, e é esta: é a que
              o contador lê antes de colar. */}
          {jaTem > 0
            ? "Um por linha, ou separados por vírgula."
            : "Só o número, um por linha. O resto vem da base da Receita — nem planilha, nem digitação."}
        </p>

        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={5}
          placeholder={"11.222.333/0001-81\n07.526.557/0001-00"}
          className="mt-3 w-full rounded-sm border border-line bg-white p-3 font-mono text-[16px] leading-relaxed focus:border-accent md:text-[14px]"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            onClick={lerColados}
            title="Cole ao menos um CNPJ acima para liberar"
            disabled={!texto.trim()}
            className="rounded-sm bg-ink px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            Ler CNPJs
          </button>
          {texto.trim() && (
            <button
              onClick={() => setTexto("")}
              className="rounded-sm border border-line px-3 py-2.5 text-[13px] font-semibold text-slate2"
            >
              limpar
            </button>
          )}
        </div>

        {/* O PRIMEIRO CASO — a saída para quem hesita em usar cliente real.
            Fica DENTRO do bloco primário, discreto: é uma alternativa ao que
            está logo acima, não um terceiro caminho. */}
        <div className="mt-4 border-t border-linesoft pt-3">
          <p className="text-[12.5px] leading-relaxed text-muted">
            Quer ver funcionando antes de usar dado de cliente?{" "}
            {/* ux-ok: o clique monta a prévia logo abaixo e a tela rola até ela
                (rolarAtePrevia), que é a regra desta página desde o primeiro dia. */}
            <button
              onClick={usarPrimeiroCaso}
              className="font-semibold text-accentdeep underline underline-offset-2"
            >
              Use um exemplo
            </button>{" "}
            — uma empresa fictícia, com os dados prontos, que vai até o laudo.
          </p>
        </div>
      </div>

      {/* aberto e visível — ver o comentário "DUAS PORTAS ABERTAS" acima */}
      <div className="mt-3 rounded border border-line bg-surface">
        <div className="px-5 pb-5 pt-4">
          <div className="mt-1 text-[15px] font-bold">
            Ou suba a carteira de uma vez{" "}
            <span className="font-normal text-muted">(CSV ou Excel)</span>
          </div>
          <p className="mt-1 max-w-[68ch] text-[12px] leading-relaxed text-muted">
            Do jeito que sair do seu sistema — <b className="text-slate2">.xlsx</b>,{" "}
            <b className="text-slate2">.xls</b> ou <b className="text-slate2">.csv</b>, sem
            converter nada.
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-3">
            <label className="cursor-pointer rounded-sm border border-line px-4 py-2.5 text-sm font-semibold text-slate2">
              Escolher arquivo
              <input type="file" accept=".csv,.txt,.xlsx,.xlsm,.xls,text/csv,text/plain" onChange={aoSelecionar} className="hidden" />
            </label>
            <button
              onClick={usarExemplo}
              className="rounded-sm border border-line px-4 py-2.5 text-sm font-semibold text-slate2"
            >
              Usar carteira de exemplo
            </button>
            <button
              onClick={baixarModelo}
              className="rounded-sm border border-line px-4 py-2.5 text-sm font-semibold text-accentdeep"
            >
              Baixar modelo CSV
            </button>
            {nomeArquivo && (
              <span className="font-mono text-[12px] text-muted">{nomeArquivo}</span>
            )}
          </div>

          {/* Dizer qual codificação foi detectada não é detalhe técnico gratuito:
              é a única pista que o contador tem se algum acento sair estranho. */}
          {codificacao && (
            <p className="mt-2 font-mono text-[11px] text-muted">
              codificação detectada: {codificacao}
            </p>
          )}
          {parse && parse.linhas.some((l) => pareceMojibake(l.razao_social ?? "")) && (
            <p className="mt-2 rounded-sm bg-amarelowash px-3 py-2 text-[12px] leading-relaxed text-slate2">
              <b>Alguns acentos vieram corrompidos no arquivo.</b> Isso acontece quando o
              arquivo já foi salvo assim antes de chegar aqui — não tem como consertar na
              leitura. Salve de novo escolhendo <b>CSV UTF-8</b> no Excel, ou cole os CNPJs
              pelo Caminho 1 (a razão social vem da Receita, sempre correta).
            </p>
          )}

          <p className="mt-3 max-w-[70ch] text-[12.5px] leading-relaxed text-muted">
            <b className="text-slate2">Só o CNPJ é obrigatório</b> — o resto vem da Receita.
            Com <b className="text-slate2">RBT12</b> a alíquota sai efetiva; com{" "}
            <b className="text-slate2">porte</b> ou <b className="text-slate2">regime</b> a
            triagem separa MEI e quem já saiu do Simples.
          </p>

        <details className="mt-3">
          <summary className="cursor-pointer text-[12.5px] font-semibold text-accentdeep">
            Quais colunas o Enquadria entende?
          </summary>
          <div className="mt-2.5 overflow-hidden rounded-sm border border-linesoft">
            <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
              <table className="w-full border-collapse text-[12px] min-w-[600px] md:min-w-0">
                <tbody>
                  {CAMPOS.map((c) => (
                    <tr key={c.chave}>
                      <td className="border-b border-linesoft bg-surface2 px-2.5 py-1.5 font-semibold">
                        {c.rotulo}
                        {c.essencial && <span className="ml-1 text-vermelho">*</span>}
                      </td>
                      <td className="border-b border-linesoft px-2.5 py-1.5 text-muted">{c.papel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="mt-2 text-[11.5px] text-muted">
            * obrigatórios. Nomes diferentes são aceitos: &quot;documento&quot;, &quot;nome
            empresarial&quot;, &quot;faturamento 12 meses&quot; e afins são reconhecidos
            automaticamente.
          </p>
        </details>
        </div>
      </div>

      {erro && (
        <p className="mt-4 rounded-sm bg-vermelhowash px-3 py-2 text-[13px] text-vermelho">{erro}</p>
      )}

      {parse && previaFaixas && (
        <div className="mt-6" ref={previaRef}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[15px] font-bold">
                {semCnae ? "Pronto para buscar na Receita" : "Prévia da triagem"}
              </div>
              <div className="mt-0.5 text-[13px] text-muted">
                {parse.linhas.length} empresas válidas · {parse.descartadas} descartadas ·{" "}
                {parse.duplicadas} duplicadas
              </div>
            </div>
            <button
              // ux-ok: ao terminar, `feito` substitui o componente inteiro pela
              // tela de sucesso — a mudança ocupa a tela toda, não passa despercebida
              onClick={gravar}
              disabled={enviando}
              className="rounded-sm bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {etapa === "gravando"
                ? semCnae
                  ? "Buscando na Receita..."
                  : "Gravando..."
                : etapa === "analisando"
                ? "Rodando a primeira análise..."
                : /* SEM CNAE, O BOTÃO É A ÚNICA COISA QUE EXPLICA O QUE FALTA.
                     "Gravar e analisar" prometia analisar dado que ainda não
                     existe; quem lê isso ao lado de uma tabela vazia conclui
                     que não há o que buscar. */
                  semCnae
                ? `Buscar na Receita e analisar ${parse.linhas.length} ${parse.linhas.length === 1 ? "empresa" : "empresas"}`
                : jaTem > 0
                ? `Adicionar e analisar ${parse.linhas.length} ${parse.linhas.length === 1 ? "empresa" : "empresas"}`
                : `Gravar e analisar ${parse.linhas.length} ${parse.linhas.length === 1 ? "empresa" : "empresas"}`}
            </button>
          </div>

          {/* LEITURA DO ARQUIVO — o que foi reconhecido, e de qual coluna */}
          <div className="mt-4 rounded border border-line bg-surface p-4">
            <div className="mb-2.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
              Como li o seu arquivo
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CAMPOS.map((c) => {
                const col = parse.colunas_reconhecidas[c.chave];
                const achou = !!col;
                return (
                  <span
                    key={c.chave}
                    title={c.papel}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] ${
                      achou
                        ? "border-verde bg-verdewash text-verde"
                        : c.essencial
                        ? "border-vermelho bg-vermelhowash text-vermelho"
                        : "border-line bg-surface2 text-muted"
                    }`}
                  >
                    <span className="font-mono text-[10px]">{achou ? "✓" : "—"}</span>
                    {c.rotulo}
                    {achou && (
                      <span className="font-mono text-[10px] opacity-70">← {col}</span>
                    )}
                    {/* O VALOR DA PRIMEIRA LINHA, no chip (07/08/2026). O mapeamento
                        sozinho parece certo mesmo quando captura a coluna errada —
                        "Regime ← Regime de Apuração" só se denuncia mostrando o
                        valor: "Caixa" não é um regime tributário, e o olho pega. */}
                    {achou && exemplo(c.chave) && (
                      <span className="max-w-[10rem] truncate font-mono text-[10px] font-semibold">
                        &quot;{exemplo(c.chave)}&quot;
                      </span>
                    )}
                  </span>
                );
              })}
            </div>

            {(() => {
              const faltando = CAMPOS.filter(
                (c) => !parse.colunas_reconhecidas[c.chave] && !c.essencial
              );
              if (faltando.length === 0) return null;
              return (
                <p className="mt-2.5 text-[11.5px] leading-relaxed text-muted">
                  Não encontrei {faltando.map((f) => f.rotulo).join(", ")}{" "}
                  <b className="font-semibold">neste arquivo</b>. Isso não apaga o que a empresa já
                  tem cadastrado, e não impede a importação — o que der, a Receita completa. Sem
                  RBT12, a alíquota do laudo sai estimada pelo topo da faixa.
                </p>
              );
            })()}

            {parse.colunas_ignoradas.length > 0 && (
              <p className="mt-2 text-[11px] text-muted">
                Colunas do arquivo que não usei: {parse.colunas_ignoradas.join(", ")}.
              </p>
            )}
          </div>

          {semCnae ? (
            /* O ESTADO HONESTO: nenhum número de faixa, porque nenhum deles
               significa alguma coisa ainda. O que entra no lugar é o que vai
               acontecer quando ele clicar. */
            <div className="mt-4 rounded border border-accent bg-accentwash p-4">
              <div className="text-[13.5px] font-semibold text-accentdeep">
                A triagem roda quando você confirmar.
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate2">
                Razão social, CNAE, porte e situação vêm da base da Receita — e é o CNAE que separa
                a carteira por prioridade. <b>Nada disso você precisa preencher.</b>
              </p>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded border border-linesoft bg-linesoft md:grid-cols-6">
              {ORDEM.map((f) => (
                <div key={f} className="bg-surface p-3.5">
                  <div className={`font-mono text-[24px] font-semibold leading-none ${COR[f]}`}>
                    {previaFaixas[f] ?? 0}
                  </div>
                  <div className="mt-1.5 text-[11.5px] leading-tight text-muted">
                    {ROTULO_FAIXA[f]}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 overflow-hidden rounded border border-line">
            <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
              <table className="w-full border-collapse text-[13px] min-w-[520px] md:min-w-0">
                <thead>
                  <tr>
                    {["Empresa", "CNPJ", "CNAE", "Origem"].map((h) => (
                      <th
                        key={h}
                        className="border-b border-line bg-surface2 px-3 py-2 text-left font-mono text-[9.5px] font-medium uppercase tracking-[0.12em] text-muted"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parse.linhas.slice(0, 8).map((l) => (
                    <tr key={l.cnpj}>
                      {/* "(sem razão social)" descrevia o ARQUIVO e era lido como
                          resultado da busca — a frase que mais enganou nesta tela. */}
                      <td className="border-b border-linesoft px-3 py-2 font-medium">
                        {l.razao_social === "(sem razão social)" ? (
                          <span className="italic text-muted">vem da Receita ao confirmar</span>
                        ) : (
                          l.razao_social
                        )}
                      </td>
                      <td className="border-b border-linesoft px-3 py-2 font-mono text-[11.5px] text-muted">
                        {l.cnpj}
                      </td>
                      <td className="border-b border-linesoft px-3 py-2 font-mono text-[11.5px]">
                        {l.cnae_principal ?? "—"}
                      </td>
                      <td className="border-b border-linesoft px-3 py-2 text-[12px] text-muted">
                        {l.cnae_principal ? "arquivo" : "via Receita"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parse.linhas.length > 8 && (
              <div className="bg-surface2 px-3 py-2 text-[12px] text-muted">
                + {parse.linhas.length - 8} empresas
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
