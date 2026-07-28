"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Os controles da aba Negócio. Tudo conversa com /api/negocio pelo mesmo
 * helper — uma porta só, um guard só no servidor.
 */
async function acao(corpo: Record<string, unknown>): Promise<Record<string, unknown>> {
  const resp = await fetch("/api/negocio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const json = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
  if (!resp.ok) return { erro: json.erro || `erro ${resp.status}` };
  return json;
}

const brl = (c: number) =>
  ((Number(c) || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
const dataBR = (d?: string | null) =>
  d ? new Date(d.length > 10 ? d : d + "T12:00:00").toLocaleDateString("pt-BR") : "—";

const btn = "rounded-sm px-3 py-1.5 text-[12.5px] font-semibold transition disabled:opacity-40";
const btnEscuro = `${btn} bg-ink text-white hover:bg-slate1`;
const btnClaro = `${btn} border border-line bg-surface text-slate2 hover:border-accent hover:text-accentdeep`;
const campo = "w-full rounded-sm border border-line bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-accent";
const rotulo = "text-[11px] font-semibold uppercase tracking-wide text-muted";

// ═══════════════════════════════════════════════════════════ foto do mês
export function BotaoFoto() {
  const [pend, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div className="text-right">
      <button
        className={btnClaro}
        disabled={pend}
        onClick={() =>
          start(async () => {
            const r = await acao({ acao: "snapshot" });
            setMsg(r.erro ? String(r.erro) : "Foto do mês atualizada.");
            if (!r.erro) router.refresh();
          })
        }
      >
        {pend ? "Gravando…" : "Gravar foto do mês"}
      </button>
      {msg && <p className="mt-1 text-[11px] text-muted">{msg}</p>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════ configuração
export function ConfigNumero({
  chave, campo: campoNome, titulo, valor, sufixo, ajuda, base,
}: {
  chave: string; campo: string; titulo: string; valor: number;
  sufixo?: string; ajuda?: string; base: Record<string, unknown>;
}) {
  const [v, setV] = useState(String(valor));
  const [pend, start] = useTransition();
  const [ok, setOk] = useState(false);
  return (
    <label className="block">
      <span className={rotulo}>{titulo}</span>
      <span className="mt-1 flex items-center gap-2">
        <input
          className={campo}
          type="number"
          value={v}
          onChange={(e) => { setV(e.target.value); setOk(false); }}
          onBlur={() =>
            start(async () => {
              const r = await acao({ acao: "config", chave, valor: { ...base, [campoNome]: Number(v) } });
              setOk(!r.erro);
            })
          }
        />
        {sufixo && <span className="shrink-0 text-[11px] text-muted">{sufixo}</span>}
        {pend && <span className="text-[11px] text-muted">…</span>}
        {ok && <span className="text-[11px] text-verde">✓</span>}
      </span>
      {ajuda && <span className="mt-1 block text-[11px] leading-snug text-muted">{ajuda}</span>}
    </label>
  );
}

export function ConfigChave({
  chave, campo: campoNome, titulo, ativo, ajuda, base,
}: {
  chave: string; campo: string; titulo: string; ativo: boolean;
  ajuda?: string; base: Record<string, unknown>;
}) {
  const [v, setV] = useState(ativo);
  const [pend, start] = useTransition();
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        className="mt-0.5"
        checked={v}
        disabled={pend}
        onChange={(e) => {
          const novo = e.target.checked;
          setV(novo);
          start(async () => {
            const r = await acao({ acao: "config", chave, valor: { ...base, [campoNome]: novo } });
            if (r.erro) setV(!novo);
          });
        }}
      />
      <span>
        <span className="text-[13px] font-semibold">{titulo}</span>
        {ajuda && <span className="block text-[11px] leading-snug text-muted">{ajuda}</span>}
      </span>
    </label>
  );
}

// ═══════════════════════════════════════════════════════════════ réguas
export interface RegraUI {
  chave: string; nome: string; categoria: string; descricao: string | null;
  ativa: boolean; dias: number; assunto: string; corpo: string;
}

export function ReguaCartao({ r, variaveis }: { r: RegraUI; variaveis: { k: string; d: string }[] }) {
  const [aberto, setAberto] = useState(false);
  const [ativa, setAtiva] = useState(r.ativa);
  const [f, setF] = useState({ assunto: r.assunto, corpo: r.corpo, dias: String(r.dias) });
  const [msg, setMsg] = useState<string | null>(null);
  const [teste, setTeste] = useState("");
  const [pend, start] = useTransition();
  const router = useRouter();

  const sujo = f.assunto !== r.assunto || f.corpo !== r.corpo || Number(f.dias) !== r.dias;

  return (
    <div className={`rounded border bg-surface p-4 ${ativa ? "border-line" : "border-linesoft opacity-70"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13.5px] font-bold">{r.nome}</span>
            {!ativa && (
              <span className="rounded-sm bg-neutrowash px-1.5 py-0.5 text-[10px] font-bold text-neutro">DESLIGADA</span>
            )}
          </div>
          <p className="mt-0.5 text-[12px] text-muted">{r.descricao}</p>
          <p className="mt-1 truncate text-[12.5px]">
            <span className="text-muted">Assunto:</span> {f.assunto}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-[12px]">
            <input
              type="checkbox"
              checked={ativa}
              disabled={pend}
              onChange={(e) => {
                const novo = e.target.checked;
                setAtiva(novo);
                start(async () => {
                  const res = await acao({ acao: "salvar_regua", chave: r.chave, ativa: novo });
                  if (res.erro) { setAtiva(!novo); setMsg(String(res.erro)); }
                  else router.refresh();
                });
              }}
            />
            ativa
          </label>
          <button className="text-[12px] font-semibold text-accentdeep hover:underline" onClick={() => setAberto((v) => !v)}>
            {aberto ? "fechar" : "editar"}
          </button>
        </div>
      </div>

      {aberto && (
        <div className="mt-4 border-t border-linesoft pt-4">
          {msg && (
            <p className={`mb-3 rounded-sm p-2 text-[12px] ${msg === "Salvo." ? "bg-verdewash text-verde" : "bg-vermelhowash text-vermelho"}`}>
              {msg}
            </p>
          )}

          <div className="grid gap-3 md:grid-cols-[1fr_130px]">
            <label>
              <span className={rotulo}>Assunto</span>
              <input className={`${campo} mt-1`} value={f.assunto} onChange={(e) => setF({ ...f, assunto: e.target.value })} />
            </label>
            <label>
              <span className={rotulo}>Parâmetro (dias)</span>
              <input className={`${campo} mt-1`} type="number" value={f.dias} onChange={(e) => setF({ ...f, dias: e.target.value })} />
            </label>
          </div>

          <label className="mt-3 block">
            <span className={rotulo}>Corpo</span>
            <textarea
              className={`${campo} mt-1 font-mono text-[12px] leading-relaxed`}
              rows={13}
              value={f.corpo}
              onChange={(e) => setF({ ...f, corpo: e.target.value })}
            />
          </label>

          <details className="mt-2">
            <summary className="cursor-pointer text-[11.5px] text-muted">variáveis disponíveis</summary>
            <div className="mt-2 grid gap-1 sm:grid-cols-2">
              {variaveis.map((v) => (
                <p key={v.k} className="text-[11px] text-muted">
                  <code className="rounded-sm bg-surface2 px-1 font-mono">{`{{${v.k}}}`}</code> {v.d}
                </p>
              ))}
            </div>
          </details>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <input
                className={`${campo} w-52`}
                placeholder="seu@email.com"
                value={teste}
                onChange={(e) => setTeste(e.target.value)}
              />
              <button
                className={btnClaro}
                disabled={pend || !teste.includes("@")}
                onClick={() =>
                  start(async () => {
                    const res = await acao({ acao: "testar_regua", chave: r.chave, para: teste });
                    setMsg(res.erro ? String(res.erro) : `Teste enviado para ${teste}.`);
                  })
                }
              >
                Enviar teste
              </button>
            </div>
            <button
              className={btnEscuro}
              disabled={pend || !sujo}
              onClick={() =>
                start(async () => {
                  const res = await acao({
                    acao: "salvar_regua", chave: r.chave,
                    assunto: f.assunto, corpo: f.corpo, dias: Number(f.dias),
                  });
                  setMsg(res.erro ? String(res.erro) : "Salvo.");
                  if (!res.erro) router.refresh();
                })
              }
            >
              {pend ? "Salvando…" : sujo ? "Salvar alterações" : "Sem alterações"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function RodarReguas() {
  const [pend, start] = useTransition();
  const [r, setR] = useState<Record<string, unknown> | null>(null);
  const router = useRouter();

  const executar = (simular: boolean) =>
    start(async () => {
      const res = await acao({ acao: "rodar_reguas", simular });
      setR(res);
      if (!simular && !res.erro) router.refresh();
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className={btnClaro} disabled={pend} onClick={() => executar(true)}>Só prever</button>
      <button className={btnEscuro} disabled={pend} onClick={() => executar(false)}>
        {pend ? "Rodando…" : "Enviar agora"}
      </button>
      {r && (
        <span className="text-[11.5px] text-muted">
          {r.erro
            ? String(r.erro)
            : `${r.planejados} planejado(s) · ${r.enviados} enviado(s)` +
              (Number(r.semEmail) ? ` · ${r.semEmail} sem e-mail` : "") +
              (Array.isArray(r.erros) && r.erros.length ? ` · ${r.erros[0]}` : "")}
        </span>
      )}
    </div>
  );
}

export function LiberarReenvio({ chaveUnica }: { chaveUnica: string }) {
  const [pend, start] = useTransition();
  const [feito, setFeito] = useState(false);
  const router = useRouter();
  if (feito) return <span className="text-[11px] text-verde">liberado</span>;
  return (
    <button
      className="text-[11px] text-muted hover:underline disabled:opacity-40"
      disabled={pend}
      title="Apaga a trava de deduplicação para que esta regra possa ir de novo a este escritório"
      onClick={() =>
        start(async () => {
          const r = await acao({ acao: "liberar_reenvio", chave_unica: chaveUnica });
          if (!r.erro) { setFeito(true); router.refresh(); }
        })
      }
    >
      liberar reenvio
    </button>
  );
}

// ═══════════════════════════════════════════════════════════ assinaturas
export interface EscritorioUI {
  id: string; nome: string | null; email: string | null;
  status: string; plano_id: string | null; plano_nome: string | null; plano_ciclo: string | null;
  valor_centavos: number | null; vencimento: string | null; assinatura_id: string | null;
  checkout_url: string | null; asaas_id: string | null;
  empresas: number; faixa_a: number; analises: number; laudos: number;
}
export interface PlanoMini { id: string; nome: string; preco_centavos: number; ciclo: string | null }

const CORES: Record<string, string> = {
  ativa: "bg-verdewash text-verde",
  pendente: "bg-amarelowash text-amarelo",
  vencida: "bg-vermelhowash text-vermelho",
  cancelada: "bg-neutrowash text-neutro",
  gratis: "bg-accentwash text-accentdeep",
};
const NOMES: Record<string, string> = {
  ativa: "Ativa", pendente: "Aguardando pagamento", vencida: "Vencida",
  cancelada: "Cancelada", gratis: "Gratuito",
};

export function LinhaEscritorio({ e, planos, temAsaas }: { e: EscritorioUI; planos: PlanoMini[]; temAsaas: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [pend, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  const [f, setF] = useState({
    plano_id: e.plano_id || "",
    status: e.status === "gratis" ? "ativa" : e.status,
    valor: e.valor_centavos == null ? "" : String(e.valor_centavos / 100),
    vencimento: e.vencimento || "",
  });
  const [novoPlano, setNovoPlano] = useState(planos.find((p) => p.id === "assinatura")?.id || planos[0]?.id || "");

  const cor = CORES[e.status] || CORES.gratis;
  const vencido = !!e.vencimento && new Date(e.vencimento) < new Date();

  return (
    <>
      <tr className="border-b border-linesoft align-top">
        <td className="px-3 py-2.5">
          <div className="font-semibold">{e.nome || "(sem nome)"}</div>
          <div className="text-[11.5px] text-muted">{e.email || "sem e-mail"}</div>
        </td>
        <td className="px-3 py-2.5 text-muted">{e.plano_nome || "—"}</td>
        <td className="px-3 py-2.5">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${cor}`}>
            {NOMES[e.status] || e.status}
          </span>
        </td>
        <td className="px-3 py-2.5 font-mono">{e.valor_centavos ? brl(e.valor_centavos) : "—"}</td>
        <td className={`px-3 py-2.5 text-[12px] ${vencido ? "font-semibold text-vermelho" : "text-muted"}`}>
          {dataBR(e.vencimento)}
        </td>
        <td className="px-3 py-2.5 text-[12px] text-muted">
          {e.empresas} emp · {e.faixa_a} faixa A · {e.laudos} laudo(s)
        </td>
        <td className="px-3 py-2.5">
          <div className="flex flex-wrap gap-2">
            <button className="text-[12px] font-semibold text-accentdeep hover:underline" onClick={() => setAberto((v) => !v)}>
              {aberto ? "fechar" : "gerir"}
            </button>
            {e.checkout_url && (
              <a href={e.checkout_url} target="_blank" rel="noreferrer" className="text-[12px] text-muted hover:underline">
                link
              </a>
            )}
            {temAsaas && e.asaas_id && e.assinatura_id && (
              <button
                className="text-[12px] text-muted hover:underline disabled:opacity-40"
                disabled={pend}
                onClick={() =>
                  start(async () => {
                    const r = await acao({ acao: "reconciliar", assinatura_id: e.assinatura_id });
                    setMsg(r.erro ? String(r.erro) : r.pago ? `Pago. Acesso até ${dataBR(String(r.valido_ate))}.` : `No Asaas: ${r.status}.`);
                    if (!r.erro) router.refresh();
                  })
                }
              >
                sincronizar
              </button>
            )}
          </div>
        </td>
      </tr>

      {aberto && (
        <tr className="border-b border-linesoft bg-surface2">
          <td colSpan={7} className="px-3 py-4">
            {msg && <p className="mb-3 rounded-sm bg-accentwash p-2 text-[12px] text-accentdeep">{msg}</p>}

            <div className="grid gap-3 md:grid-cols-4">
              <label>
                <span className={rotulo}>Plano</span>
                <select
                  className={`${campo} mt-1`}
                  value={f.plano_id}
                  onChange={(ev) => {
                    const p = planos.find((x) => x.id === ev.target.value);
                    setF({ ...f, plano_id: ev.target.value, valor: p ? String(p.preco_centavos / 100) : f.valor });
                  }}
                >
                  <option value="">— sem plano —</option>
                  {planos.map((p) => (
                    <option key={p.id} value={p.id}>{p.nome} · {brl(p.preco_centavos)}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className={rotulo}>Status</span>
                <select className={`${campo} mt-1`} value={f.status} onChange={(ev) => setF({ ...f, status: ev.target.value })}>
                  <option value="ativa">Ativa</option>
                  <option value="pendente">Aguardando pagamento</option>
                  <option value="vencida">Vencida</option>
                  <option value="cancelada">Cancelada</option>
                </select>
              </label>
              <label>
                <span className={rotulo}>Valor (R$)</span>
                <input className={`${campo} mt-1`} type="number" step="0.01" value={f.valor} onChange={(ev) => setF({ ...f, valor: ev.target.value })} />
              </label>
              <label>
                <span className={rotulo}>Acesso até</span>
                <input className={`${campo} mt-1`} type="date" value={f.vencimento} onChange={(ev) => setF({ ...f, vencimento: ev.target.value })} />
              </label>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <select className={`${campo} w-44`} value={novoPlano} onChange={(ev) => setNovoPlano(ev.target.value)}>
                  {planos.filter((p) => p.preco_centavos > 0).map((p) => (
                    <option key={p.id} value={p.id}>{p.nome} · {brl(p.preco_centavos)}</option>
                  ))}
                </select>
                <button
                  className={btnClaro}
                  disabled={pend || !novoPlano}
                  onClick={() =>
                    start(async () => {
                      const r = await acao({ acao: "gerar_cobranca", tenant_id: e.id, plano_id: novoPlano });
                      setMsg(
                        r.erro ? String(r.erro)
                          : r.checkout_url ? `Cobrança de ${r.valor} criada. Link gerado.`
                          : "Cobrança registrada, mas o Asaas não devolveu link (chave configurada?)."
                      );
                      if (!r.erro) router.refresh();
                    })
                  }
                >
                  Gerar cobrança
                </button>
              </div>

              <div className="flex gap-2">
                <button className={btnClaro} onClick={() => setAberto(false)}>Cancelar</button>
                <button
                  className={btnEscuro}
                  disabled={pend}
                  onClick={() =>
                    start(async () => {
                      const r = await acao({
                        acao: "salvar_assinatura",
                        tenant_id: e.id,
                        assinatura_id: e.assinatura_id,
                        plano_id: f.plano_id || null,
                        status: f.status,
                        valor_centavos: f.valor === "" ? null : Math.round(Number(f.valor) * 100),
                        vencimento: f.vencimento || null,
                      });
                      setMsg(r.erro ? String(r.erro) : "Assinatura salva.");
                      if (!r.erro) { setAberto(false); router.refresh(); }
                    })
                  }
                >
                  {pend ? "Salvando…" : "Salvar"}
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════ planos
export interface RecursoUI { chave: string; nome: string; descricao: string | null; categoria: string }
export interface PlanoUI {
  id: string; nome: string; descricao: string | null; chamada: string | null;
  preco_centavos: number; ciclo: string | null; dias_acesso: number | null;
  ativo: boolean; publico: boolean; destaque: boolean; ordem: number;
  limite_analises: number | null; limite_empresas: number | null; limite_usuarios: number | null;
  recursos: string[];
}

export function PlanoCartao({ p, recursos, emUso }: { p: PlanoUI; recursos: RecursoUI[]; emUso?: { n: number; mrr: number } }) {
  const [aberto, setAberto] = useState(false);
  const [pend, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  const [f, setF] = useState({
    nome: p.nome,
    chamada: p.chamada || "",
    descricao: p.descricao || "",
    preco: String(p.preco_centavos / 100),
    ciclo: p.ciclo || "avulso",
    dias_acesso: p.dias_acesso == null ? "" : String(p.dias_acesso),
    ordem: String(p.ordem),
    ativo: p.ativo,
    publico: p.publico,
    destaque: p.destaque,
    limite_analises: p.limite_analises == null ? "" : String(p.limite_analises),
    limite_empresas: p.limite_empresas == null ? "" : String(p.limite_empresas),
    limite_usuarios: p.limite_usuarios == null ? "" : String(p.limite_usuarios),
    recursos: new Set(p.recursos || []),
  });

  const porCategoria = useMemo(() => {
    const m: Record<string, RecursoUI[]> = {};
    for (const r of recursos) (m[r.categoria] = m[r.categoria] || []).push(r);
    return m;
  }, [recursos]);

  const mensalEquivalente = f.ciclo === "anual" && Number(f.preco) > 0 ? Number(f.preco) / 12 : null;

  return (
    <div className={`rounded-lg border bg-surface p-5 ${p.destaque ? "border-accent shadow-card" : "border-line"} ${p.ativo ? "" : "opacity-70"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-bold">{p.nome}</span>
            {p.destaque && <span className="rounded-full bg-accentwash px-2 py-0.5 text-[10px] font-bold text-accentdeep">DESTAQUE</span>}
            {!p.ativo && <span className="rounded-sm bg-neutrowash px-1.5 py-0.5 text-[10px] font-bold text-neutro">INATIVO</span>}
            {p.ativo && !p.publico && <span className="rounded-sm bg-amarelowash px-1.5 py-0.5 text-[10px] font-bold text-amarelo">OCULTO</span>}
          </div>
          <p className="mt-0.5 text-[12px] text-muted">{p.chamada || "—"}</p>
        </div>
        <button className="shrink-0 text-[12px] font-semibold text-accentdeep hover:underline" onClick={() => setAberto((v) => !v)}>
          {aberto ? "fechar" : "editar"}
        </button>
      </div>

      <div className="mt-3 font-mono text-[24px] font-semibold">
        {p.preco_centavos === 0 ? "R$ 0" : brl(p.preco_centavos)}
        <span className="ml-1 text-[12px] font-sans text-muted">
          {p.ciclo === "mensal" ? "/mês" : p.ciclo === "anual" ? "/ano" : ""}
        </span>
      </div>
      <p className="mt-1 text-[11.5px] text-muted">
        {p.ciclo === "avulso" ? "sem recorrência" : `${p.dias_acesso ?? "?"} dias de acesso por pagamento`}
        {" · "}
        {p.limite_analises == null ? "laudos ilimitados" : `${p.limite_analises} laudo(s)`}
        {" · "}
        {(p.recursos || []).length} recurso(s)
      </p>

      {emUso && (
        <p className="mt-2 rounded-sm bg-surface2 px-2 py-1.5 text-[11px] text-muted">
          {emUso.n} assinante(s) ativo(s) · {brl(emUso.mrr)} de MRR. Mudar o preço aqui <b>não</b> altera quem já assinou.
        </p>
      )}

      {msg && !aberto && <p className="mt-2 text-[11.5px] text-verde">{msg}</p>}

      {aberto && (
        <div className="mt-4 border-t border-linesoft pt-4">
          {msg && (
            <p className={`mb-3 rounded-sm p-2 text-[12px] ${msg === "Salvo." ? "bg-verdewash text-verde" : "bg-vermelhowash text-vermelho"}`}>
              {msg}
            </p>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <label>
              <span className={rotulo}>Nome</span>
              <input className={`${campo} mt-1`} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
            </label>
            <label>
              <span className={rotulo}>Ordem</span>
              <input className={`${campo} mt-1`} type="number" value={f.ordem} onChange={(e) => setF({ ...f, ordem: e.target.value })} />
            </label>
            <label className="md:col-span-2">
              <span className={rotulo}>Chamada (uma linha)</span>
              <input className={`${campo} mt-1`} value={f.chamada} onChange={(e) => setF({ ...f, chamada: e.target.value })} />
            </label>
            <label className="md:col-span-2">
              <span className={rotulo}>Descrição</span>
              <textarea className={`${campo} mt-1`} rows={2} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} />
            </label>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <label>
              <span className={rotulo}>Preço (R$)</span>
              <input className={`${campo} mt-1`} type="number" step="0.01" value={f.preco} onChange={(e) => setF({ ...f, preco: e.target.value })} />
              {mensalEquivalente && (
                <span className="mt-1 block text-[11px] text-verde">equivale a {brl(mensalEquivalente * 100)}/mês</span>
              )}
            </label>
            <label>
              <span className={rotulo}>Ciclo</span>
              <select
                className={`${campo} mt-1`}
                value={f.ciclo}
                onChange={(e) => {
                  const c = e.target.value;
                  setF({ ...f, ciclo: c, dias_acesso: c === "mensal" ? "31" : c === "anual" ? "365" : "" });
                }}
              >
                <option value="avulso">Avulso (sem recorrência)</option>
                <option value="mensal">Mensal</option>
                <option value="anual">Anual</option>
              </select>
            </label>
            <label>
              <span className={rotulo}>Dias de acesso por pagamento</span>
              <input className={`${campo} mt-1`} type="number" value={f.dias_acesso} onChange={(e) => setF({ ...f, dias_acesso: e.target.value })} placeholder="vazio = sem prazo" />
              <span className="mt-1 block text-[11px] leading-snug text-muted">
                É este número que o webhook do Asaas usa. Foi por não existir que um pagamento mensal liberava um ano.
              </span>
            </label>
          </div>

          <p className={`${rotulo} mt-4`}>Limites</p>
          <div className="mt-1 grid gap-3 md:grid-cols-3">
            <label>
              <span className="text-[12px] text-muted">Laudos</span>
              <input className={`${campo} mt-1`} type="number" value={f.limite_analises} onChange={(e) => setF({ ...f, limite_analises: e.target.value })} placeholder="vazio = ilimitado" />
            </label>
            <label>
              <span className="text-[12px] text-muted">Empresas na carteira</span>
              <input className={`${campo} mt-1`} type="number" value={f.limite_empresas} onChange={(e) => setF({ ...f, limite_empresas: e.target.value })} placeholder="vazio = ilimitado" />
            </label>
            <label>
              <span className="text-[12px] text-muted">Usuários</span>
              <input className={`${campo} mt-1`} type="number" value={f.limite_usuarios} onChange={(e) => setF({ ...f, limite_usuarios: e.target.value })} placeholder="vazio = ilimitado" />
            </label>
          </div>

          <p className={`${rotulo} mt-4`}>Recursos incluídos</p>
          <div className="mt-1 space-y-3">
            {Object.entries(porCategoria).map(([cat, itens]) => (
              <div key={cat}>
                <p className="text-[10.5px] font-bold uppercase tracking-wide text-muted">{cat}</p>
                <div className="mt-1 grid gap-1 md:grid-cols-2">
                  {itens.map((x) => (
                    <label key={x.chave} className="flex cursor-pointer items-start gap-2 text-[12.5px]">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={f.recursos.has(x.chave)}
                        onChange={() =>
                          setF((s) => {
                            const n = new Set(s.recursos);
                            if (n.has(x.chave)) n.delete(x.chave); else n.add(x.chave);
                            return { ...s, recursos: n };
                          })
                        }
                      />
                      <span>{x.nome}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-linesoft pt-4">
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-[12.5px]">
                <input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} /> Ativo
              </label>
              <label className="flex items-center gap-2 text-[12.5px]">
                <input type="checkbox" checked={f.publico} onChange={(e) => setF({ ...f, publico: e.target.checked })} /> Visível ao contador
              </label>
              <label className="flex items-center gap-2 text-[12.5px]">
                <input type="checkbox" checked={f.destaque} onChange={(e) => setF({ ...f, destaque: e.target.checked })} /> Destaque
              </label>
            </div>
            <div className="flex gap-2">
              <button className={btnClaro} onClick={() => setAberto(false)}>Cancelar</button>
              <button
                className={btnEscuro}
                disabled={pend}
                onClick={() =>
                  start(async () => {
                    const r = await acao({
                      acao: "salvar_plano",
                      id: p.id,
                      nome: f.nome,
                      chamada: f.chamada,
                      descricao: f.descricao,
                      preco_centavos: Math.round(Number(f.preco) * 100),
                      ciclo: f.ciclo,
                      recorrente: f.ciclo !== "avulso",
                      dias_acesso: f.dias_acesso === "" ? null : Number(f.dias_acesso),
                      ordem: Number(f.ordem),
                      ativo: f.ativo,
                      publico: f.publico,
                      destaque: f.destaque,
                      limite_analises: f.limite_analises === "" ? null : Number(f.limite_analises),
                      limite_empresas: f.limite_empresas === "" ? null : Number(f.limite_empresas),
                      limite_usuarios: f.limite_usuarios === "" ? null : Number(f.limite_usuarios),
                      recursos: Array.from(f.recursos),
                    });
                    setMsg(r.erro ? String(r.erro) : "Salvo.");
                    if (!r.erro) { setAberto(false); router.refresh(); }
                  })
                }
              >
                {pend ? "Salvando…" : "Salvar plano"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function NovoPlano() {
  const [nome, setNome] = useState("");
  const [pend, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input className={`${campo} w-48`} placeholder="Nome do novo plano" value={nome} onChange={(e) => setNome(e.target.value)} />
      <button
        className={btnClaro}
        disabled={pend || !nome.trim()}
        onClick={() =>
          start(async () => {
            const r = await acao({ acao: "criar_plano", nome });
            setMsg(r.erro ? String(r.erro) : "Criado — inativo e oculto. Desenhe antes de expor.");
            if (!r.erro) { setNome(""); router.refresh(); }
          })
        }
      >
        {pend ? "Criando…" : "Criar plano"}
      </button>
      {msg && <span className="text-[11px] text-muted">{msg}</span>}
    </div>
  );
}

export function TestarAsaas({ inicial }: { inicial: Record<string, unknown> }) {
  const [s, setS] = useState(inicial);
  const [pend, start] = useTransition();
  const conta = s.conta as { nome?: string; email?: string; cpfCnpj?: string } | undefined;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          className={btnClaro}
          disabled={pend}
          onClick={() =>
            start(async () => {
              const r = await acao({ acao: "testar_asaas" });
              if (r.status) setS(r.status as Record<string, unknown>);
            })
          }
        >
          {pend ? "Consultando o Asaas…" : "Testar conexão agora"}
        </button>
        {s.conectado === true ? (
          <span className="text-[12px] font-bold text-verde">✓ conectado</span>
        ) : (
          <span className="text-[12px] font-bold text-vermelho">✕ não conectado</span>
        )}
      </div>

      {typeof s.erro === "string" && (
        <p className="mt-2 rounded-sm bg-vermelhowash p-2 text-[12px] text-vermelho">{s.erro}</p>
      )}

      {s.conectado === true && (
        <div className="mt-3 grid gap-1.5 text-[12px] sm:grid-cols-2">
          <p><span className="text-muted">Conta:</span> <b>{conta?.nome || "—"}</b></p>
          <p><span className="text-muted">E-mail:</span> {conta?.email || "—"}</p>
          <p><span className="text-muted">CPF/CNPJ:</span> {conta?.cpfCnpj || "—"}</p>
          {s.saldo_centavos != null && (
            <p><span className="text-muted">Saldo:</span> <b className="font-mono">{brl(Number(s.saldo_centavos))}</b></p>
          )}
        </div>
      )}
    </div>
  );
}
