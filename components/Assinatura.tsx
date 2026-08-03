"use client";

import { useState } from "react";

interface Props {
  token: string;
  empresa: string;
  cnpj: string;
  decisao: "optar" | "permanecer";
  clausulas: string[];
  hash: string;
  /** link público do laudo que embasa esta decisão (null se não houver) */
  linkLaudo?: string | null;
  numeroLaudo?: number | null;
}

export function Assinatura({ token, empresa, cnpj, decisao, clausulas, hash, linkLaudo, numeroLaudo }: Props) {
  const [etapa, setEtapa] = useState<"form" | "confirmar" | "ok">("form");
  const [metodo, setMetodo] = useState<"simples" | "avancada">("simples");
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [aceite, setAceite] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [resultado, setResultado] = useState<{ metodo: string; assinado_em: string } | null>(null);

  const optou = decisao === "optar";

  async function continuar() {
    setErro(null);
    if (!nome.trim() || !email.trim()) {
      setErro("Preencha nome e e-mail.");
      return;
    }
    setCarregando(true);
    try {
      const resp = await fetch("/api/assinar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, acao: "solicitar-otp", nome, cpf, email }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.erro ?? "falha ao iniciar a assinatura");
      setMetodo(json.metodo ?? "simples");
      setEtapa("confirmar");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "erro inesperado");
    } finally {
      setCarregando(false);
    }
  }

  async function assinar() {
    setErro(null);
    if (!aceite) {
      setErro("Marque a declaração de ciência para assinar.");
      return;
    }
    if (metodo === "avancada" && codigo.trim().length < 6) {
      setErro("Informe o código de 6 dígitos enviado ao seu e-mail.");
      return;
    }
    setCarregando(true);
    try {
      const resp = await fetch("/api/assinar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, acao: "confirmar", nome, cpf, email, codigo }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.erro ?? "falha ao assinar");
      setResultado({ metodo: json.metodo, assinado_em: json.assinado_em });
      setEtapa("ok");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "erro inesperado");
    } finally {
      setCarregando(false);
    }
  }

  async function reenviar() {
    setCodigo("");
    await continuar();
  }

  if (etapa === "ok" && resultado) {
    return (
      <div className="rounded border border-verde bg-verdewash p-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-verde text-white">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <h2 className="text-[18px] font-bold text-ink">Termo assinado com sucesso</h2>
        <p className="mt-1 text-[13.5px] text-slate2">
          Assinatura eletrônica {resultado.metodo === "avancada" ? "avançada" : "simples"} registrada em{" "}
          {new Date(resultado.assinado_em).toLocaleString("pt-BR")}.
        </p>
        <p className="mt-3 break-all font-mono text-[10.5px] text-muted">
          hash do documento: {hash}
        </p>
        {/*
          "Você já pode fechar esta página" era o fim da conversa — e a pessoa
          saía sem a via dela. Agora a via sai daqui, na hora, e o mesmo link
          chega por e-mail.
        */}
        <a
          href={`/termo/${token}`}
          className="mt-4 inline-block rounded-sm bg-ink px-4 py-2.5 text-[13px] font-semibold text-white"
        >
          Baixar a sua via em PDF
        </a>
        <p className="mt-3 text-[12.5px] text-muted">
          O mesmo link vai para o seu e-mail, e uma cópia fica arquivada no dossiê do seu contador.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded border border-line bg-surface p-6 shadow-card">
      {/* documento */}
      <div className="mb-5 rounded-sm border border-line bg-surface2 p-4">
        <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-accentdeep">Termo de ciência e decisão · IBS/CBS</div>
        <div className="mt-1 text-[15px] font-bold text-ink">{empresa}</div>
        <div className="font-mono text-[11.5px] text-muted">{cnpj}</div>
        <div className="mt-3 rounded-sm bg-surface px-3 py-2 text-[13px]">
          Decisão: <b className="text-ink">{optou ? "Optar pelo regime híbrido (fora do DAS) a partir de 2027" : "Permanecer no regime tradicional"}</b>
        </div>
        <ul className="mt-3 list-disc pl-5 text-[12.5px] text-slate2">
          {clausulas.map((c, i) => (
            <li key={i} className="mb-1">{c}</li>
          ))}
        </ul>

        {/* Assinar ciência de uma decisão sem poder abrir a conta que a
            sustenta é assinatura no escuro. O laudo fica AQUI, dentro do
            termo — não em outro e-mail que pode ter caído no spam. */}
        {linkLaudo && (
          <a
            href={linkLaudo}
            target="_blank"
            rel="noreferrer"
            className="mt-4 flex items-center justify-between gap-3 rounded-sm border border-accent bg-accentwash px-3 py-2.5 text-[12.5px] font-semibold text-accentdeep"
          >
            <span>
              Ler o laudo que embasa esta decisão
              {numeroLaudo ? (
                <span className="font-mono font-normal"> · nº {String(numeroLaudo).padStart(4, "0")}</span>
              ) : null}
              <span className="mt-0.5 block text-[11.5px] font-normal text-slate2">
                Traz a memória de cálculo completa — os números, a fórmula e o resultado.
              </span>
            </span>
            <span aria-hidden>→</span>
          </a>
        )}
      </div>

      {erro && <p className="mb-3 rounded-sm bg-vermelhowash px-3 py-2 text-[13px] text-vermelho">{erro}</p>}

      {etapa === "form" && (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[12.5px] font-semibold text-slate2">Nome completo</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Quem está dando ciência"
              autoComplete="name"
              className="w-full rounded-sm border border-line px-3 py-2 text-[14px] outline-none focus:border-accent" />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <label className="mb-1 block text-[12.5px] font-semibold text-slate2">CPF <span className="font-normal text-muted">(opcional)</span></label>
              <input value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="000.000.000-00"
                inputMode="numeric" autoComplete="off"
                className="w-full rounded-sm border border-line px-3 py-2 text-[14px] outline-none focus:border-accent" />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-[12.5px] font-semibold text-slate2">E-mail</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="email@empresa.com"
                inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false}
                className="w-full rounded-sm border border-line px-3 py-2 text-[14px] outline-none focus:border-accent" />
            </div>
          </div>
          <button onClick={continuar} disabled={carregando}
            className="w-full rounded-sm bg-ink px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">
            {carregando ? "Aguarde..." : "Continuar para assinar"}
          </button>
          <p className="text-center text-[11px] text-muted">
            Ao continuar, você poderá receber um código de verificação por e-mail.
          </p>
        </div>
      )}

      {etapa === "confirmar" && (
        <div className="space-y-3">
          {metodo === "avancada" && (
            <div>
              <label className="mb-1 block text-[12.5px] font-semibold text-slate2">Código enviado ao seu e-mail</label>
              <input value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric" autoComplete="one-time-code" placeholder="000000"
                className="w-full rounded-sm border border-line px-3 py-2 text-center font-mono text-[20px] tracking-[6px] outline-none focus:border-accent" />
              <button onClick={reenviar} disabled={carregando} className="mt-1 py-2 text-[13px] font-semibold text-accentdeep">Reenviar código</button>
            </div>
          )}
          <label className="flex items-start gap-2.5 rounded-sm border border-line bg-surface2 px-3 py-3 text-[13px] text-slate2">
            <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} className="mt-0.5" />
            <span>Declaro que li o termo acima, compreendi os cenários e as premissas, e <b>dou ciência</b> da decisão, assinando este documento eletronicamente.</span>
          </label>
          {/* ux-ok: ao assinar, `resultado` troca o cartão inteiro pelo recibo com
              o código de verificação — a página muda de conteúdo, não um trecho */}
          <button onClick={assinar} disabled={carregando}
            className="w-full rounded-sm bg-accent px-4 py-3 text-sm font-bold text-[#04212B] disabled:opacity-40">
            {carregando ? "Assinando..." : "Assinar o termo"}
          </button>
          <button onClick={() => setEtapa("form")} className="w-full py-2.5 text-center text-[13px] text-muted">Voltar</button>
        </div>
      )}
    </div>
  );
}
