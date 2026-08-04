"use client";

import { useMemo, useState } from "react";
import { moeda, pct } from "@/lib/motor";
import { ROTULO_SETOR, type Setor } from "@/lib/comparativo";
import {
  ENTRADA_PADRAO,
  conclusaoDaAbertura,
  estudarAbertura,
  FATOR_R_LIMITE,
  type EntradaAbertura,
} from "@/lib/abertura";

/**
 * A TELA DO ESTUDO DE ABERTURA.
 *
 * Ela é feita para ser usada COM O PROSPECTO DO OUTRO LADO DA MESA — por isso
 * o resultado recalcula a cada tecla e cabe numa tela só. A conversa é
 * "e se você faturar menos?", e a resposta precisa aparecer enquanto a
 * pergunta ainda está no ar.
 *
 * OS CAMPOS SÃO MENSAIS porque é assim que quem abre empresa pensa. O motor
 * trabalha em valores anuais; a conversão é problema nosso, não dele.
 *
 * O DOCUMENTO É O PRODUTO PAGO. A simulação é livre — inclusive para o plano
 * gratuito, de propósito: é ela que faz o contador querer emitir.
 */
export function EstudoDeAbertura() {
  const [e, setE] = useState<EntradaAbertura>(ENTRADA_PADRAO);
  const [responsavel, setResponsavel] = useState("");
  const [email, setEmail] = useState("");
  const [emitindo, setEmitindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [bloqueado, setBloqueado] = useState(false);
  const [emitido, setEmitido] = useState<{ id: string; numero: number } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [avisoEnvio, setAvisoEnvio] = useState<{ ok: boolean; texto: string } | null>(null);
  const [linkCopiado, setLinkCopiado] = useState(false);

  const estudo = useMemo(() => estudarAbertura(e), [e]);
  const base = estudo.cenarios.find((c) => c.chave === "base");
  const fr = estudo.fator_r;

  const num = (v: string) => Number(v.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "")) || 0;

  async function emitir() {
    setEmitindo(true);
    setErro(null);
    setBloqueado(false);
    try {
      const r = await fetch("/api/abertura", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entrada: e, responsavel, email }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        erro?: string;
        bloqueado_por_plano?: boolean;
        abertura_id?: string;
        numero?: number;
      };
      if (!r.ok || !j.abertura_id) {
        setErro(j.erro ?? "não consegui emitir o estudo");
        setBloqueado(!!j.bloqueado_por_plano);
        return;
      }
      setEmitido({ id: j.abertura_id, numero: j.numero ?? 0 });
    } finally {
      setEmitindo(false);
    }
  }

  async function enviar() {
    if (!emitido) return;
    setEnviando(true);
    setAvisoEnvio(null);
    try {
      const r = await fetch("/api/abertura/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ abertura_id: emitido.id, para: email, nome: responsavel }),
      });
      const j = (await r.json().catch(() => ({}))) as { erro?: string; para?: string };
      setAvisoEnvio(
        r.ok && !j.erro
          ? { ok: true, texto: `Estudo enviado para ${j.para}. A resposta cai no seu e-mail.` }
          : { ok: false, texto: j.erro ?? "não consegui enviar" }
      );
    } finally {
      setEnviando(false);
    }
  }

  const campo = "w-full rounded-sm border border-line px-3 py-2 text-[16px] outline-none focus:border-accent sm:text-[13.5px]";

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      {/* ------------------------------------------------------------ ENTRADA */}
      <div className="space-y-3 rounded border border-line bg-surface p-4">
        <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
          O negócio que vai abrir
        </div>

        <label className="block">
          <span className="mb-1 block text-[12.5px] font-semibold">Nome do negócio</span>
          <input
            value={e.nome_negocio}
            onChange={(ev) => setE({ ...e, nome_negocio: ev.target.value })}
            placeholder="Como ele vai aparecer na capa do estudo"
            className={campo}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[12.5px] font-semibold">Atividade</span>
          <select
            value={e.setor}
            onChange={(ev) => setE({ ...e, setor: ev.target.value as Setor })}
            className={campo}
          >
            {(Object.keys(ROTULO_SETOR) as Setor[]).map((s) => (
              <option key={s} value={s}>
                {ROTULO_SETOR[s]}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-semibold">Faturamento/mês</span>
            <input
              inputMode="numeric"
              value={e.receita_mensal ? String(e.receita_mensal) : ""}
              onChange={(ev) => setE({ ...e, receita_mensal: num(ev.target.value) })}
              className={campo}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-semibold">Pró-labore/mês</span>
            <input
              inputMode="numeric"
              value={e.prolabore_mensal ? String(e.prolabore_mensal) : ""}
              onChange={(ev) => setE({ ...e, prolabore_mensal: num(ev.target.value) })}
              className={campo}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-semibold">Salários/mês</span>
            <input
              inputMode="numeric"
              value={e.folha_mensal ? String(e.folha_mensal) : ""}
              onChange={(ev) => setE({ ...e, folha_mensal: num(ev.target.value) })}
              className={campo}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-semibold">Lucro esperado (%)</span>
            <input
              inputMode="numeric"
              value={String(Math.round(e.margem_lucro * 100))}
              onChange={(ev) => setE({ ...e, margem_lucro: num(ev.target.value) / 100 })}
              className={campo}
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-[12.5px] font-semibold">
            Compras com crédito de IBS/CBS (% da receita)
          </span>
          <input
            inputMode="numeric"
            value={String(Math.round(e.compras_credito * 100))}
            onChange={(ev) => setE({ ...e, compras_credito: num(ev.target.value) / 100 })}
            className={campo}
          />
        </label>

        {/* a pergunta que nenhuma calculadora de regime faz — e que decide a
            competitividade da empresa a partir de 2027 */}
        <div>
          <span className="mb-1 block text-[12.5px] font-semibold">Quem vai comprar dele?</span>
          <div className="flex gap-1.5">
            {[
              { v: true, r: "Outras empresas" },
              { v: false, r: "Consumidor final" },
            ].map((o) => (
              <button
                key={String(o.v)}
                onClick={() => setE({ ...e, vende_para_pj: o.v })}
                className={`flex-1 rounded-sm border px-2 py-2 text-[12.5px] font-semibold ${
                  e.vende_para_pj === o.v
                    ? "border-ink bg-ink text-white"
                    : "border-line bg-surface text-slate2"
                }`}
              >
                {o.r}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-linesoft pt-3">
          <div className="mb-2 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
            Para quem é o estudo (opcional)
          </div>
          <input
            value={responsavel}
            onChange={(ev) => setResponsavel(ev.target.value)}
            placeholder="Nome de quem vai abrir"
            className={`${campo} mb-2`}
          />
          <input
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            placeholder="email@dele.com"
            inputMode="email"
            className={campo}
          />
        </div>
      </div>

      {/* ---------------------------------------------------------- RESULTADO */}
      <div className="space-y-4">
        <div className="rounded border border-accentdeep bg-accentwash p-4">
          <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-accentdeep">
            A resposta
          </div>
          <p className="mt-1 text-[14px] font-semibold leading-relaxed text-ink">
            {conclusaoDaAbertura(estudo)}
          </p>
        </div>

        <div className="overflow-hidden rounded border border-line bg-surface">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {["Cenário", "Faturamento/ano", "Menor carga", "Anual", "%"].map((h) => (
                  <th
                    key={h}
                    className="border-b border-line px-2.5 pb-2 pt-2.5 text-left font-mono text-[9px] font-medium uppercase tracking-[0.1em] text-muted"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {estudo.cenarios.map((c) => (
                <tr key={c.chave} className={c.chave === "base" ? "bg-verdewash" : undefined}>
                  <td className="border-b border-linesoft px-2.5 py-2 font-semibold">{c.rotulo}</td>
                  <td className="border-b border-linesoft px-2.5 py-2 font-mono text-[12px]">
                    {moeda(c.receita_anual)}
                  </td>
                  <td className="border-b border-linesoft px-2.5 py-2">{c.menor?.nome ?? "—"}</td>
                  <td className="border-b border-linesoft px-2.5 py-2 text-right font-mono text-[12px]">
                    {c.menor ? moeda(c.menor.total) : "—"}
                  </td>
                  <td className="border-b border-linesoft px-2.5 py-2 text-right font-mono text-[12px]">
                    {c.menor ? pct(c.menor.sobre_receita) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {base && (
          <div className="rounded border border-line bg-surface p-4">
            <div className="mb-2 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
              No faturamento projetado · Anexo {base.anexo}
            </div>
            <table className="w-full border-collapse text-[13px]">
              <tbody>
                {base.comparativo.regimes.map((r) => (
                  <tr key={r.regime}>
                    <td className="border-b border-linesoft py-1.5 pr-2">
                      {r.nome}
                      {r.impedimento && (
                        <div className="text-[11px] text-vermelho">{r.impedimento}</div>
                      )}
                    </td>
                    <td className="border-b border-linesoft py-1.5 text-right font-mono text-[12px]">
                      {moeda(r.total)}
                    </td>
                    <td className="border-b border-linesoft py-1.5 pl-2 text-right font-mono text-[12px] text-muted">
                      {pct(r.sobre_receita)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {fr.aplicavel && (
          <div className="rounded border border-line bg-surface p-4">
            <div className="mb-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
              Fator R · folha em {pct(fr.atual)} da receita (limite {pct(FATOR_R_LIMITE)})
            </div>
            <p className="text-[13px] leading-relaxed text-slate2">{fr.frase}</p>
          </div>
        )}

        {estudo.alertas.length > 0 && (
          <ul className="space-y-1.5">
            {estudo.alertas.map((a, i) => (
              <li
                key={i}
                className="rounded-sm border border-linesoft bg-surface px-3 py-2 text-[12.5px] leading-relaxed text-slate2"
              >
                {a}
              </li>
            ))}
          </ul>
        )}

        {/* ------------------------------------------------------- EMISSÃO */}
        <div className="rounded border border-line bg-surface p-4">
          {emitido ? (
            <>
              <div className="text-[13.5px] font-semibold text-verde">
                ✓ Estudo nº {String(emitido.numero).padStart(4, "0")} emitido
              </div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-slate2">
                Documento numerado, com a sua marca e verificação pública. Abra para salvar em PDF
                ou copie o link para mandar a quem pediu.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <a
                  href={`/doc/abertura/${emitido.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-sm bg-ink px-3.5 py-2 text-[13px] font-semibold text-white"
                >
                  Abrir e baixar em PDF
                </a>
                <button
                  // ux-ok: o aviso do envio aparece logo abaixo destes botões
                  onClick={() => void enviar()}
                  disabled={enviando || !email.trim()}
                  title={!email.trim() ? "Informe o e-mail de quem vai receber" : undefined}
                  className="rounded-sm border border-accentdeep px-3.5 py-2 text-[13px] font-semibold text-accentdeep disabled:opacity-40"
                >
                  {enviando ? "Enviando…" : "Enviar por e-mail"}
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(`${window.location.origin}/doc/abertura/${emitido.id}`);
                    setLinkCopiado(true);
                    setTimeout(() => setLinkCopiado(false), 2500);
                  }}
                  className="rounded-sm border border-line px-3.5 py-2 text-[13px] font-semibold text-slate2"
                >
                  {linkCopiado ? "Copiado ✓" : "Copiar link"}
                </button>
                <button
                  onClick={() => {
                    setEmitido(null);
                    setAvisoEnvio(null);
                  }}
                  className="rounded-sm border border-line px-3.5 py-2 text-[13px] font-semibold text-slate2"
                >
                  Fazer outro estudo
                </button>
              </div>

              {avisoEnvio && (
                <p
                  className={`mt-2 rounded-sm px-3 py-2 text-[12.5px] ${
                    avisoEnvio.ok ? "bg-verdewash text-verde" : "bg-amarelowash text-amarelo"
                  }`}
                >
                  {avisoEnvio.texto}
                </p>
              )}
            </>
          ) : (
            <>
              <button
                // ux-ok: o resultado (documento ou erro) aparece nesta caixa
                onClick={() => void emitir()}
                disabled={emitindo || !e.nome_negocio.trim() || !(e.receita_mensal > 0)}
                title={
                  !e.nome_negocio.trim()
                    ? "Dê um nome ao negócio — ele vai na capa"
                    : !(e.receita_mensal > 0)
                      ? "Informe o faturamento mensal esperado"
                      : undefined
                }
                className="rounded-sm bg-ink px-4 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-40"
              >
                {emitindo ? "Emitindo…" : "Emitir o estudo com a minha marca"}
              </button>
              <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
                A simulação acima é livre. O documento numerado, com o seu logo, o seu CRC e
                verificação pública é o que você entrega — e cobra.
              </p>
            </>
          )}

          {erro && (
            <div className="mt-3 rounded-sm border border-amarelo bg-amarelowash p-2.5">
              <p className="text-[12.5px] leading-relaxed text-slate2">{erro}</p>
              {bloqueado && (
                <a
                  href="/painel/planos"
                  className="mt-2 inline-block rounded-sm bg-accent px-3 py-1.5 text-[12.5px] font-bold text-[#04212B]"
                >
                  Ver os planos
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
