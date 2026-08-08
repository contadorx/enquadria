"use client";

import { CascaPublica } from "@/components/CascaPublica";

import { useState } from "react";

/**
 * VERIFICAÇÃO PÚBLICA — a página que qualquer um pode abrir.
 *
 * Sem login, sem cadastro: quem tem o documento na mão confirma a origem dele.
 * É o que transforma "o contador diz que analisou" em "dá para conferir".
 */

interface Resultado {
  encontrado: boolean;
  mensagem?: string;
  tipo?: string;
  numero?: number;
  empresa?: string;
  cnpj?: string;
  escritorio?: string;
  crc?: string | null;
  emitido_em?: string;
  criado_em?: string;
  assinado?: boolean;
  assinado_em?: string | null;
  metodo?: string | null;
  hash?: string;
  carimbo?: string | null;
  janela?: string | null;
}

export default function Verificar() {
  const [modo, setModo] = useState<"laudo" | "hash">("laudo");
  const [numero, setNumero] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [hash, setHash] = useState("");
  const [r, setR] = useState<Resultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function consultar() {
    setOcupado(true);
    setErro(null);
    setR(null);
    try {
      const resp = await fetch("/api/verificar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          modo === "hash" ? { hash } : { tipo: "laudo", numero, cnpj }
        ),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.erro ?? "falha na consulta");
      setR(json);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "erro inesperado");
    } finally {
      setOcupado(false);
    }
  }

  const dataBR = (s?: string | null) => (s ? new Date(s).toLocaleString("pt-BR") : "—");

  return (
    <CascaPublica largura="max-w-[720px]">

      <div className="mx-auto max-w-[560px]">
        <div className="mb-5 flex items-center gap-2">
          <svg width="26" height="26" viewBox="0 0 64 64">
            <rect width="64" height="64" rx="14" fill="#0B1220" />
            <path d="M20 16h24M20 16v32M20 48h24M20 32h16" stroke="#06B6D4" strokeWidth="5" strokeLinecap="round" fill="none" />
            <circle cx="46" cy="32" r="4" fill="#06B6D4" />
          </svg>
          <span className="text-[17px] font-extrabold tracking-tight text-ink">Enquadria</span>
        </div>

        <div className="rounded border border-line bg-surface p-6 shadow-card">
          <h1 className="text-[19px] font-bold tracking-tight text-ink">
            Verificar documento
          </h1>
          <p className="mt-1 text-[13.5px] text-slate2">
            Confirme a autenticidade de um laudo de enquadramento ou de um termo de ciência
            emitido pelo Enquadria. Não é preciso ter conta.
          </p>

          <div className="mt-4 flex gap-1.5">
            {(["laudo", "hash"] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setModo(m);
                  setR(null);
                  setErro(null);
                }}
                className={`rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium ${
                  modo === m
                    ? "border-ink bg-ink text-white"
                    : "border-line bg-surface text-slate2"
                }`}
              >
                {m === "laudo" ? "Laudo (número + CNPJ)" : "Termo (código)"}
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-3">
            {modo === "laudo" ? (
              <>
                <div>
                  <label className="mb-1 block text-[12px] font-semibold text-slate2">
                    Número do laudo
                  </label>
                  <input
                    value={numero}
                    onChange={(e) => setNumero(e.target.value.replace(/\D/g, ""))}
                    placeholder="0042"
                    inputMode="numeric"
                    className="w-full rounded-sm border border-line px-3 py-2 font-mono text-[14px] outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[12px] font-semibold text-slate2">
                    CNPJ da empresa
                  </label>
                  <input
                    value={cnpj}
                    onChange={(e) => setCnpj(e.target.value)}
                    placeholder="00.000.000/0001-00"
                    className="w-full rounded-sm border border-line px-3 py-2 font-mono text-[14px] outline-none focus:border-accent"
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="mb-1 block text-[12px] font-semibold text-slate2">
                  Código de verificação
                </label>
                <input
                  value={hash}
                  onChange={(e) => setHash(e.target.value.trim())}
                  placeholder="cole aqui o código de 64 caracteres do rodapé do termo"
                  className="w-full rounded-sm border border-line px-3 py-2 font-mono text-[12px] outline-none focus:border-accent"
                />
                <p className="mt-1 text-[11.5px] text-muted">
                  É o hash SHA-256 impresso na trilha de auditoria do termo.
                </p>
              </div>
            )}

            <button
              onClick={consultar}
              disabled={ocupado}
              className="w-full rounded-sm bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {ocupado ? "Consultando…" : "Verificar"}
            </button>
          </div>

          {erro && (
            <p className="mt-3 rounded-sm bg-vermelhowash px-3 py-2 text-[13px] text-vermelho">
              {erro}
            </p>
          )}

          {r && !r.encontrado && (
            <div className="mt-4 rounded-sm border border-amarelo bg-amarelowash px-3.5 py-3">
              <div className="text-[13.5px] font-semibold text-ink">Documento não localizado</div>
              <p className="mt-1 text-[12.5px] text-slate2">{r.mensagem}</p>
            </div>
          )}

          {r?.encontrado && (
            <div className="mt-4 rounded-sm border border-verde bg-verdewash p-4">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-verde text-white">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
                    <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="text-[14.5px] font-bold text-ink">
                  Documento autêntico
                  {r.tipo === "laudo" && r.numero
                    ? ` — laudo nº ${String(r.numero).padStart(4, "0")}`
                    : " — termo de ciência"}
                </span>
              </div>

              <table className="mt-3 w-full border-collapse text-[13px]">
                <tbody>
                  {[
                    ["Empresa", r.empresa],
                    ["CNPJ", r.cnpj],
                    ["Emitido por", r.escritorio + (r.crc ? ` · ${r.crc}` : "")],
                    r.tipo === "laudo"
                      ? ["Emitido em", dataBR(r.emitido_em)]
                      : ["Gerado em", dataBR(r.criado_em)],
                    ...(r.janela ? [["Período", r.janela]] : []),
                    ...(r.tipo === "termo"
                      ? [
                          [
                            "Assinatura",
                            r.assinado
                              ? `assinado em ${dataBR(r.assinado_em)}${
                                  r.metodo === "avancada" ? " (com código por e-mail)" : ""
                                }`
                              : "ainda não assinado",
                          ],
                          ...(r.carimbo ? [["Carimbo do tempo", dataBR(r.carimbo)]] : []),
                        ]
                      : []),
                  ].map(([k, v]) => (
                    <tr key={String(k)}>
                      <td className="border-b border-white/60 py-1.5 pr-3 text-muted">{k}</td>
                      <td className="border-b border-white/60 py-1.5 text-right font-medium text-ink">
                        {v as string}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {r.hash && (
                <p className="mt-2.5 break-all font-mono text-[10px] text-muted">
                  hash: {r.hash}
                </p>
              )}
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-[11.5px] leading-relaxed text-muted">
          A verificação confirma a origem, a data e a assinatura do documento. O conteúdo técnico
          e as premissas da análise não são exibidos aqui, por proteção aos dados da empresa. A
          responsabilidade técnica do documento é do profissional que o assina.
        </p>
      </div>
    </CascaPublica>
  );
}
