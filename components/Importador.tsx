"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parsearCarteira, CSV_EXEMPLO, type ResultadoParse, type LinhaCarteira } from "@/lib/csv";
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
22.333.444/0001-55,Transportes Exemplo Ltda,4930-2/02,EPP,Simples Nacional,3,1200000,Jorge Valle,jorge@exemplo.com.br,(11) 90000-0002`;

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

export function Importador() {
  const router = useRouter();
  const [nomeArquivo, setNomeArquivo] = useState<string>("");
  const [parse, setParse] = useState<ResultadoParse | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<{
    gravadas: number;
    enriquecidas: number;
    receita_ativa: boolean;
  } | null>(null);

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
    const texto = await arquivo.text();
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
  }

  function usarExemplo() {
    setErro(null);
    setFeito(null);
    setNomeArquivo("exemplo.csv");
    setParse(parsearCarteira(CSV_EXEMPLO));
  }

  async function gravar() {
    if (!parse) return;
    setEnviando(true);
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
      setFeito(json);
      setParse(null);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "erro inesperado");
    } finally {
      setEnviando(false);
    }
  }

  if (feito) {
    return (
      <div className="rounded border border-verde bg-verdewash p-6">
        <div className="flex items-center gap-2 text-verde">
          <span className="font-mono text-sm">✓</span>
          <span className="text-[15px] font-semibold">
            {feito.gravadas} empresas na carteira
          </span>
        </div>
        <p className="mt-2 text-[13.5px] text-slate2">
          {feito.receita_ativa
            ? `${feito.enriquecidas} enriquecidas contra a base da Receita.`
            : "Enriquecimento da Receita não configurado — a triagem usou os dados do arquivo."}
        </p>
        <div className="mt-4 flex gap-2">
          <a
            href="/painel"
            className="rounded-sm bg-ink px-4 py-2 text-sm font-semibold text-white"
          >
            Ver o mapa de risco
          </a>
          <button
            onClick={() => setFeito(null)}
            className="rounded-sm border border-line px-4 py-2 text-sm font-semibold text-slate2"
          >
            Importar outro
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="rounded border border-dashed border-line bg-surface p-6">
        <div className="flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-sm bg-ink px-4 py-2.5 text-sm font-semibold text-white">
            Escolher arquivo CSV
            <input type="file" accept=".csv,text/csv" onChange={aoSelecionar} className="hidden" />
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

        <p className="mt-4 max-w-[70ch] text-[12.5px] leading-relaxed text-muted">
          Exporte a carteira do seu sistema como CSV e suba do jeito que veio: as colunas são
          reconhecidas por sinônimo, sem formato rígido. <b className="text-slate2">Só CNPJ e razão
          social são obrigatórios</b> — o resto, quando falta, vem do enriquecimento contra a
          Receita. CNPJs inválidos e repetidos são descartados antes de gravar.
        </p>

        <details className="mt-3">
          <summary className="cursor-pointer text-[12.5px] font-semibold text-accentdeep">
            Quais colunas o Enquadria entende?
          </summary>
          <div className="mt-2.5 overflow-hidden rounded-sm border border-linesoft">
            <table className="w-full border-collapse text-[12px]">
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
        <div className="mt-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[15px] font-bold">Prévia da triagem</div>
              <div className="mt-0.5 text-[13px] text-muted">
                {parse.linhas.length} empresas válidas · {parse.descartadas} descartadas ·{" "}
                {parse.duplicadas} duplicadas
              </div>
            </div>
            <button
              onClick={gravar}
              disabled={enviando}
              className="rounded-sm bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {enviando ? "Gravando..." : `Gravar ${parse.linhas.length} empresas`}
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
            <table className="w-full border-collapse text-[13px]">
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
