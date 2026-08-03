"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  parsearCarteira,
  extrairCnpjs,
  csvDeCnpjs,
  CSV_EXEMPLO,
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
  { chave: "situacao", rotulo: "Situação", papel: "descarta empresas inativas" },
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

export function Importador({ jaTem = 0 }: { jaTem?: number }) {
  const router = useRouter();
  const [codificacao, setCodificacao] = useState<string | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState<string>("");
  const [parse, setParse] = useState<ResultadoParse | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [colando, setColando] = useState(false);
  const [texto, setTexto] = useState("");
  const [etapa, setEtapa] = useState<"gravando" | "analisando" | null>(null);
  const previaRef = useRef<HTMLDivElement>(null);

  /** leva o olho até a prévia — todo caminho que monta carteira passa por aqui */
  function rolarAtePrevia() {
    requestAnimationFrame(() =>
      previaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    );
  }
  const [feito, setFeito] = useState<{
    gravadas: number;
    enriquecidas: number;
    receita_ativa: boolean;
    receita_configurada?: boolean;
    receita_falhas?: number;
    triagem_cega?: boolean;
    analisadas?: number;
  } | null>(null);
  const [diag, setDiag] = useState<{
    veredito: string; sugestao: string | null; url: string | null;
    tem_token: boolean; tempo_ms: number; detalhe: string | null;
  } | null>(null);
  const [testando, setTestando] = useState(false);

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
        setErro(
          "Não consegui abrir esta planilha. Se ela tiver senha ou for muito antiga, salve como CSV UTF-8 e tente de novo."
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
        `Reconheci o cabeçalho, mas nenhuma linha tinha CNPJ válido — ${resultado.descartadas} descartadas. Confira se os documentos estão completos (14 dígitos).`
      );
      setParse(null);
      return;
    }
    setParse(resultado);
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
        "Não achei nenhum CNPJ completo aí. Cole os documentos com os 14 dígitos — um por linha, ou separados por vírgula."
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
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.erro ?? "falha ao gravar");

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
       * o contador roda o lote pelo cockpit quando quiser. Por isso o catch é
       * silencioso — um erro na cereja não pode parecer erro no bolo.
       */
      let analisadas: number | undefined;
      const ids: string[] = json.empresas_para_analisar ?? [];
      if (ids.length > 0) {
        setEtapa("analisando");
        try {
          const rl = await fetch("/api/analise/lote", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ empresa_ids: ids }),
          });
          if (rl.ok) analisadas = (await rl.json()).gravadas ?? 0;
        } catch {
          /* a carteira está salva; o lote pode ser refeito no cockpit */
        }
      }

      setFeito({ ...json, analisadas });
      setParse(null);
      setTexto("");
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "erro inesperado");
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
            ? "A base da Receita não respondeu agora — a triagem usou os dados do arquivo. Os dados que faltarem entram na próxima importação."
            : "Enriquecimento da Receita não configurado — a triagem usou os dados do arquivo."}
        </p>

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

        {feito.triagem_cega && (
          <p className="mt-3 rounded-sm bg-amarelowash px-3 py-2 text-[12.5px] leading-relaxed text-amarelo">
            <b>Atenção:</b> o arquivo não trouxe CNAE e a base da Receita não respondeu, então
            a triagem não teve com que separar a carteira — quase tudo caiu em &quot;baixo
            risco&quot;. Isso não é diagnóstico, é falta de dado. Suba o CSV com a coluna de
            CNAE, ou repita a importação quando a base voltar.
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
        COLAR CNPJ É O CAMINHO PRIMÁRIO, e o upload é o segundo.
        Não é preferência estética: o export do sistema é o maior ponto de
        abandono do produto. Quem tem o CSV na mão continua a um clique de
        distância; quem não tem agora consegue começar mesmo assim.
      */}
      <div className="rounded border border-dashed border-line bg-surface p-6">
        <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-accentdeep">
          Caminho 1 · sem exportar nada
        </div>
        <div className="mt-1 text-[15px] font-bold">
          {jaTem > 0 ? "Cole os CNPJs das novas empresas" : "Comece pelos CNPJs"}
        </div>
        <p className="mt-1 max-w-[68ch] text-[12.5px] leading-relaxed text-muted">
          Não precisa exportar nada. Cole a lista de CNPJs dos seus clientes — um por linha,
          ou separados por vírgula — e o resto (razão social, CNAE, porte, situação) vem da
          base da Receita.
        </p>

        {!colando ? (
          <button
            onClick={() => {
              setColando(true);
              setErro(null);
              setFeito(null);
            }}
            className="mt-3 rounded-sm bg-ink px-4 py-2.5 text-sm font-semibold text-white"
          >
            Colar lista de CNPJs
          </button>
        ) : (
          <div className="mt-3">
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={6}
              placeholder={"11.222.333/0001-81\n07.526.557/0001-00\n22.333.444/0001-81"}
              className="w-full rounded-sm border border-line bg-white p-3 font-mono text-[16px] leading-relaxed md:text-[13px]"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={lerColados}
                title="Cole ao menos um CNPJ acima para liberar"
                disabled={!texto.trim()}
                className="rounded-sm bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                Ler CNPJs
              </button>
              <button
                onClick={() => {
                  setColando(false);
                  setTexto("");
                }}
                className="rounded-sm border border-line px-4 py-2.5 text-sm font-semibold text-slate2"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

      </div>

      {/* Os dois caminhos levam ao mesmo lugar e a pessoa escolhe UM. Enquanto
          o CSV era um rodapé do bloco de cima, parecia passo seguinte — e quem
          já tinha o arquivo na mão ficava colando CNPJ à toa. */}
      <div className="my-3 flex items-center gap-3">
        <div className="h-px flex-1 bg-line" />
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">ou</span>
        <div className="h-px flex-1 bg-line" />
      </div>

      <div className="rounded border border-dashed border-line bg-surface p-6">
        <div>
          <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-accentdeep">
            Caminho 2 · você já tem o arquivo
          </div>
          <div className="mt-1 text-[15px] font-bold">Importe a carteira de um CSV</div>
          <p className="mt-1 max-w-[68ch] text-[12px] leading-relaxed text-muted">
            Aceita <b className="text-slate2">.xlsx</b>, <b className="text-slate2">.xls</b> e{" "}
            <b className="text-slate2">.csv</b> — do jeito que sair do seu sistema. Planilha do
            Excel entra direto, sem converter nada.
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
              Ver com carteira de exemplo
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
            Suba do jeito que veio: as colunas são reconhecidas por sinônimo, sem formato
            rígido. <b className="text-slate2">Só o CNPJ é obrigatório</b> — o resto, quando
            falta, vem do enriquecimento contra a Receita. Com a coluna de{" "}
            <b className="text-slate2">RBT12</b> a alíquota do laudo sai efetiva em vez de
            estimada, e com <b className="text-slate2">porte</b> ou{" "}
            <b className="text-slate2">regime</b> a triagem separa MEI e quem já saiu do
            Simples — dois dados que a base pública não tem. CNPJs inválidos e repetidos são
            descartados antes de gravar.
          </p>
        </div>

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

      {erro && (
        <p className="mt-4 rounded-sm bg-vermelhowash px-3 py-2 text-[13px] text-vermelho">{erro}</p>
      )}

      {parse && previaFaixas && (
        <div className="mt-6" ref={previaRef}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[15px] font-bold">Prévia da triagem</div>
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
                ? "Gravando..."
                : etapa === "analisando"
                ? "Rodando a primeira análise..."
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
                  Não encontrei {faltando.map((f) => f.rotulo).join(", ")}. Isso não impede a
                  importação — o que der, o enriquecimento pela Receita completa. Sem RBT12, a
                  alíquota do laudo sai estimada pelo topo da faixa.
                </p>
              );
            })()}

            {parse.colunas_ignoradas.length > 0 && (
              <p className="mt-2 text-[11px] text-muted">
                Colunas do arquivo que não usei: {parse.colunas_ignoradas.join(", ")}.
              </p>
            )}
          </div>

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
                      <td className="border-b border-linesoft px-3 py-2 font-medium">
                        {l.razao_social}
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
