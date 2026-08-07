"use client";

import { useState } from "react";
import { honorarioSugerido, criticarProposta, dataBR } from "@/lib/proposta";
import { moeda, type Saida } from "@/lib/motor";

/**
 * A PROPOSTA NA TELA DA EMPRESA — o passo que faltava depois da decisão.
 *
 * O produto ia até o laudo e o termo e parava antes do único ato que faz o
 * contador ganhar dinheiro com isso: cobrar. Aqui ele vê o valor sugerido,
 * ajusta se quiser e sai com o documento pronto para mandar.
 *
 * TRÊS DECISÕES DE INTERFACE:
 *
 *  1. O VALOR JÁ VEM PREENCHIDO. Folha em branco é onde a proposta morre. A
 *     sugestão é calculada pela MESMA função que o servidor usa — se fossem
 *     duas contas, a tela mostraria um número e o papel sairia com outro.
 *
 *  2. A EXPLICAÇÃO DO NÚMERO FICA VISÍVEL. Ninguém manda para um cliente um
 *     preço que não sabe defender. "600 × 1,25 porque a saída exige
 *     renegociação" é uma frase que o contador repete na reunião.
 *
 *  3. EMPRESA SEM DECISÃO NÃO TEM BOTÃO. MEI, inativa e fora do Simples não
 *     têm o que decidir nesta janela — e o motivo aparece escrito, em vez de
 *     um botão cinza que não explica nada.
 */

export interface PropostaResumo {
  id: string;
  numero: number;
  emitido_em: string;
  projeto: number | null;
  validade: string | null;
}

export function PropostaEmpresa({
  empresaId,
  razaoSocial,
  cnpj,
  faixa,
  rbt12,
  saida,
  propostas,
  aoMudar,
}: {
  empresaId: string;
  razaoSocial: string;
  cnpj: string;
  faixa: string | null;
  rbt12: number | null;
  saida: Saida | null;
  propostas: PropostaResumo[];
  aoMudar?: () => void;
}) {
  const sug = honorarioSugerido(faixa, rbt12, saida);
  const critica = criticarProposta({
    empresa: { razao_social: razaoSocial, cnpj, faixa },
    saida,
    rbt12,
    hoje: new Date().toISOString().slice(0, 10),
  });

  const [projeto, setProjeto] = useState<string>(String(sug.projeto));
  const [revisao, setRevisao] = useState<string>(String(sug.revisao));
  const [dias, setDias] = useState<string>("15");
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string; id?: string; numero?: number } | null>(null);

  const impedido = critica.erros.length > 0;

  async function gerar() {
    setOcupado(true);
    setAviso(null);
    try {
      const resp = await fetch("/api/proposta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_id: empresaId,
          projeto: Number(projeto) || null,
          revisao: revisao === "" ? 0 : Number(revisao),
          validade_dias: Number(dias) || 15,
        }),
      });
      const json = await resp.json();
      if (!resp.ok || !json.proposta_id) {
        setAviso({ ok: false, texto: json.erro ?? "não consegui gerar a proposta" });
        return;
      }
      /* Abre em outra aba, como o laudo. E se o navegador bloquear, o aviso
         abaixo tem o link — a proposta já está gravada de qualquer jeito. */
      const janela = window.open(`/doc/proposta/${json.proposta_id}`, "_blank");
      setAviso({
        ok: true,
        texto: janela
          ? "abriu em outra aba."
          : "o navegador bloqueou a janela nova — abra pelo link abaixo.",
        id: json.proposta_id,
        numero: json.numero,
      });
      aoMudar?.();
    } catch (e) {
      setAviso({ ok: false, texto: e instanceof Error ? e.message : "falha de rede" });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="rounded border border-line bg-surface p-4">
      <div className="mb-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
        Proposta de honorários
      </div>
      <p className="mb-3 text-[12px] leading-relaxed text-muted">
        O documento que transforma a decisão em serviço cobrável. Sai com a marca do escritório,
        numerado, e com o mesmo desenho do laudo que o cliente vai receber depois.
      </p>

      {impedido ? (
        <p className="rounded-sm bg-surface2 px-3 py-2.5 text-[12.5px] leading-relaxed text-slate2">
          {critica.erros[0]}
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-[12px] font-semibold">Projeto (uma vez)</span>
              <input
                inputMode="numeric"
                value={projeto}
                onChange={(ev) => setProjeto(ev.target.value.replace(/[^\d]/g, ""))}
                className="w-full rounded-sm border border-line px-3 py-2 font-mono text-[13px]"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-semibold">Revisão por janela</span>
              <input
                inputMode="numeric"
                value={revisao}
                onChange={(ev) => setRevisao(ev.target.value.replace(/[^\d]/g, ""))}
                className="w-full rounded-sm border border-line px-3 py-2 font-mono text-[13px]"
              />
              <span className="mt-1 block text-[10.5px] leading-snug text-muted">
                Zero remove a linha do papel.
              </span>
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-semibold">Validade</span>
              <select
                value={dias}
                onChange={(ev) => setDias(ev.target.value)}
                className="w-full rounded-sm border border-line px-3 py-2 text-[13px]"
              >
                <option value="7">7 dias</option>
                <option value="15">15 dias</option>
                <option value="30">30 dias</option>
              </select>
            </label>
          </div>

          <ul className="mt-2.5 space-y-0.5 text-[11.5px] leading-relaxed text-muted">
            {sug.porque.map((p) => (
              <li key={p.slice(0, 30)}>· {p}</li>
            ))}
            <li>
              · Sugestão do sistema: {moeda(sug.projeto)} + {moeda(sug.revisao)} por revisão. O valor
              acima é seu — o cliente e a região são seus.
            </li>
          </ul>

          {critica.alertas.length > 0 && (
            <ul className="mt-2 space-y-1 text-[11.5px] leading-relaxed text-amarelo">
              {critica.alertas.map((a) => (
                <li key={a.slice(0, 30)}>{a}</li>
              ))}
            </ul>
          )}

          <button
            onClick={() => void gerar()}
            disabled={ocupado || !projeto}
            title={!projeto ? "Informe o valor do projeto" : undefined}
            className="mt-3 rounded-sm bg-ink px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
          >
            {ocupado ? "Gerando…" : "Gerar proposta"}
          </button>

          {/* o resultado nasce ao lado do clique — a lição dos botões que
              "não funcionavam" era efeito longe do botão */}
          {aviso && (
            <div
              className={`mt-3 rounded-sm border p-3 ${
                aviso.ok ? "border-verde bg-verdewash" : "border-vermelho bg-vermelhowash"
              }`}
            >
              <div className={`text-[13px] font-semibold ${aviso.ok ? "text-verde" : "text-vermelho"}`}>
                {aviso.ok
                  ? `✓ Proposta nº ${String(aviso.numero ?? 0).padStart(4, "0")} gerada — ${aviso.texto}`
                  : aviso.texto}
              </div>
              {aviso.ok && aviso.id && (
                <a
                  href={`/doc/proposta/${aviso.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block rounded-sm bg-ink px-3 py-1.5 text-[12px] font-semibold text-white"
                >
                  Abrir e baixar em PDF
                </a>
              )}
            </div>
          )}
        </>
      )}

      {propostas.length > 0 && (
        <div className="mt-4 border-t border-linesoft pt-3">
          <div className="mb-1.5 text-[12px] font-semibold">Propostas já geradas</div>
          <ul className="space-y-1">
            {propostas.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 text-[12.5px]">
                <a
                  href={`/doc/proposta/${p.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accentdeep"
                >
                  nº {String(p.numero).padStart(4, "0")}
                  {p.projeto != null ? ` — ${moeda(p.projeto)}` : ""}
                </a>
                <span className="font-mono text-[10.5px] text-muted">
                  {p.validade ? `vale até ${dataBR(p.validade)}` : dataBR(p.emitido_em)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
