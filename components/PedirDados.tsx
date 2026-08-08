"use client";

import { useEffect, useState } from "react";
import {
  PERGUNTAS,
  rotuloDaResposta,
  type RespostasColeta,
  type Derivadas,
} from "@/lib/coleta";

/**
 * PEDIR OS DADOS À EMPRESA — o lado do contador.
 *
 * Três estados, e só três:
 *   1. não pedi ainda      → botão que gera o link e a mensagem pronta
 *   2. pedi, não voltou    → o link, o texto do WhatsApp, e a data do pedido
 *   3. voltou              → o que a empresa respondeu, em texto, e o botão de
 *                            usar essas respostas na análise
 *
 * A MENSAGEM VAI PRONTA de propósito. O contador não vai parar para redigir
 * "oi fulano, preciso que você responda umas perguntas" quinze vezes; se
 * precisar escrever, ele não manda. Um clique copia o texto inteiro, com o
 * link dentro e o motivo explicado na linguagem do cliente.
 */

export interface ColetaGravada {
  id: string;
  token: string;
  status: "aberta" | "respondida" | "cancelada";
  criado_em: string;
  respondido_em: string | null;
  respondente_nome: string | null;
  respondente_cargo: string | null;
  respostas: RespostasColeta | null;
  derivadas: Derivadas | null;
  observacao: string | null;
  aplicada_em: string | null;
}

function dataCurta(s: string | null): string {
  return s ? new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "";
}

export function PedirDados({
  empresaId,
  empresaNome,
  coleta,
  aoMudar,
  aoAplicar,
}: {
  empresaId: string;
  empresaNome: string;
  coleta: ColetaGravada | null;
  aoMudar: () => void;
  aoAplicar: (d: Derivadas) => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [bloqueio, setBloqueio] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState<string | null>(null);

  /**
   * O CLIENTE RESPONDE ENQUANTO O CONTADOR OLHA A TELA.
   *
   * Cenário real e comum: o contador manda o link pelo WhatsApp com o cliente
   * ao telefone. O cliente responde em três minutos. Sem isto, a tela continua
   * dizendo "aguardando" até alguém pensar em recarregar — e a impressão é que
   * o formulário não funcionou.
   *
   * Sondagem, não tempo real. Realtime exigiria configurar replicação na
   * tabela e abrir websocket para todo mundo; aqui basta perguntar de vez em
   * quando enquanto ALGUÉM ESTÁ OLHANDO. Só roda com a aba visível: contador
   * com quinze abas abertas não precisa de quinze sondagens.
   */
  useEffect(() => {
    // só faz sentido esperar enquanto o link está aberto: respondida e
    // cancelada são estados finais e sondá-los seria consulta pura perda
    if (coleta?.status !== "aberta") return;
    let vivo = true;

    async function espiar() {
      if (document.visibilityState !== "visible") return;
      try {
        const resp = await fetch(`/api/coleta/${coleta!.token}/status`, { cache: "no-store" });
        if (!resp.ok || !vivo) return;
        const j = (await resp.json()) as { status?: string };
        // só mexe na tela quando o estado REALMENTE mudou: recarregar à toa
        // faria o formulário piscar debaixo da mão de quem está usando
        if (j.status && j.status !== coleta!.status) aoMudar();
      } catch {
        // rede instável não é motivo para alarme numa sondagem de fundo
      }
    }

    const t = setInterval(espiar, 15000);
    document.addEventListener("visibilitychange", espiar);
    return () => {
      vivo = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", espiar);
    };
  }, [coleta?.status, coleta?.token, aoMudar]);

  const base = typeof window !== "undefined" ? window.location.origin : "";
  const link = coleta?.token ? `${base}/coleta/${coleta.token}` : "";

  const mensagem =
    `Oi! Aqui é do escritório de contabilidade que cuida da ${empresaNome}.\n\n` +
    `Tem uma decisão de imposto com prazo que a empresa precisa tomar, e para eu calcular ` +
    `certo preciso de seis respostas que só você sabe dar — coisas do dia a dia do negócio, ` +
    `não tem nada de contabilidade. Leva uns três minutos, é pelo celular mesmo:\n\n${link}\n\n` +
    `Qualquer dúvida em alguma pergunta, me chama.`;

  /**
   * ENVIAR POR E-MAIL — o caminho para quem não tem WhatsApp do sócio.
   *
   * Sai do Enquadria com o cabeçalho do escritório e reply-to no contador. O
   * aviso de spam fica ao lado do botão, não depois do clique: quem precisa
   * saber que a mensagem pode não chegar é quem está decidindo como mandar.
   */
  async function enviarPorEmail() {
    setEnviando(true);
    setErro(null);
    setEnviado(null);
    try {
      const resp = await fetch("/api/coleta/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa_id: empresaId }),
      });
      const j = (await resp.json().catch(() => ({}))) as { erro?: string; enviado_para?: string };
      if (!resp.ok || j.erro) {
        setErro(j.erro ?? "Não consegui enviar o e-mail.");
        return;
      }
      setEnviado(j.enviado_para ?? "");
    } catch {
      setErro("Não consegui falar com o servidor. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  async function copiar(texto: string, marca: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(marca);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      setErro("O navegador bloqueou a cópia. Selecione o texto e copie na mão.");
    }
  }

  async function abrir() {
    setOcupado(true);
    setErro(null);
    try {
      const resp = await fetch("/api/coleta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa_id: empresaId }),
      });
      const json = await resp.json();
      if (resp.ok) aoMudar();
      else if (json.bloqueado_por_plano) setBloqueio(json.erro as string);
      else setErro(json.erro ?? "Não consegui abrir o pedido.");
    } finally {
      setOcupado(false);
    }
  }

  async function encerrar() {
    setOcupado(true);
    try {
      await fetch(`/api/coleta?empresa=${empresaId}`, { method: "DELETE" });
      aoMudar();
    } finally {
      setOcupado(false);
    }
  }

  // ------------------------------------------------------------ 3. respondeu
  if (coleta?.status === "respondida" && coleta.respostas) {
    return (
      <div className="rounded border border-verde bg-verdewash p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-verde">
            A empresa respondeu
          </div>
          <div className="font-mono text-[11px] text-slate2">
            {coleta.respondente_nome}
            {coleta.respondente_cargo ? ` · ${coleta.respondente_cargo}` : ""} ·{" "}
            {dataCurta(coleta.respondido_em)}
          </div>
        </div>

        <div className="mt-3 space-y-1.5">
          {PERGUNTAS.map((p) => (
            <div key={p.chave} className="flex flex-wrap items-baseline gap-x-2 border-b border-white/60 pb-1.5 last:border-b-0">
              <span className="min-w-0 flex-1 text-[12.5px] text-slate2">{p.titulo}</span>
              <span className="text-[12.5px] font-semibold text-ink">
                {rotuloDaResposta(p.chave, coleta.respostas?.[p.chave]) ?? "—"}
              </span>
            </div>
          ))}
        </div>

        {coleta.observacao && (
          <div className="mt-3 rounded-sm bg-white/70 px-3 py-2 text-[12.5px] leading-relaxed text-slate2">
            <span className="font-semibold text-ink">O que a empresa acrescentou: </span>
            {coleta.observacao}
          </div>
        )}

        <div className="mt-3.5 flex flex-wrap gap-2">
          <button
            onClick={() => coleta.derivadas && aoAplicar(coleta.derivadas)}
            disabled={!coleta.derivadas}
            className="rounded-sm bg-ink px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
          >
            Usar estas respostas na análise
          </button>
          <button
            // ux-ok: `bloqueio` esconde o bloco inteiro que contém este botão
            // ({!bloqueio && ...}) e põe a mensagem no lugar — o botão some junto
            onClick={abrir}
            disabled={ocupado}
            className="rounded-sm border border-line bg-surface px-3.5 py-2 text-[13px] font-semibold text-slate2"
          >
            Pedir de novo
          </button>
        </div>

        {/* BOTÃO CINZA PRECISA SE EXPLICAR.
            Desabilitado sem motivo visível é indistinguível de quebrado — a
            pessoa clica, nada acontece, e a conclusão é que o sistema falhou.
            Se as derivadas não vieram, a resposta está gravada mas incompleta,
            e o caminho é pedir de novo. */}
        {!coleta.derivadas && (
          <p className="mt-2.5 rounded-sm bg-amarelowash px-3 py-2 text-[12px] leading-relaxed text-amarelo">
            <b>Clique em &quot;Pedir de novo&quot; e reenvie o link.</b> Vieram respostas
            incompletas — sem as seis não há o que preencher no cálculo.
          </p>
        )}

        <p className="mt-2.5 text-[11px] leading-relaxed text-slate2">
          As respostas entram como <b>informadas pelo cliente</b> — o formulário da análise fica
          aberto para você ajustar o que a escrituração contradisser. Quem assina é você.
        </p>
      </div>
    );
  }

  // -------------------------------------------------------- 2. pedi, aguardo
  if (coleta?.status === "aberta") {
    return (
      <div className="rounded border border-accent bg-accentwash p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-accentdeep">
            Aguardando a empresa
          </div>
          <div className="font-mono text-[11px] text-muted">pedido em {dataCurta(coleta.criado_em)}</div>
        </div>

        <div className="mt-2.5 break-all rounded-sm border border-line bg-surface px-3 py-2 font-mono text-[11.5px] text-slate2">
          {link}
        </div>

        <div className="mt-2.5 flex flex-wrap gap-2">
          <button
            onClick={() => copiar(mensagem, "msg")}
            className="rounded-sm bg-ink px-3.5 py-2 text-[13px] font-semibold text-white"
          >
            {copiado === "msg" ? "Mensagem copiada ✓" : "Copiar a mensagem pronta"}
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(mensagem)}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-sm border border-line bg-surface px-3.5 py-2 text-[13px] font-semibold text-slate2"
          >
            Abrir no WhatsApp
          </a>
          <button
            onClick={enviarPorEmail}
            disabled={enviando}
            className="rounded-sm border border-line bg-surface px-3.5 py-2 text-[13px] font-semibold text-slate2 disabled:opacity-50"
          >
            {enviando ? "Enviando…" : enviado !== null ? "E-mail enviado ✓" : "Enviar por e-mail"}
          </button>
          <button
            onClick={() => copiar(link, "link")}
            className="rounded-sm border border-line bg-surface px-3.5 py-2 text-[13px] font-semibold text-slate2"
          >
            {copiado === "link" ? "Link copiado ✓" : "Copiar só o link"}
          </button>
          <button
            onClick={encerrar}
            disabled={ocupado}
            className="rounded-sm px-2 py-2 text-[12.5px] text-muted underline underline-offset-2"
          >
            encerrar o link
          </button>
        </div>

        {enviado !== null && (
          <p className="mt-2.5 rounded-sm border border-line bg-surface2 px-3 py-2 text-[12px] leading-relaxed">
            Enviado{enviado ? <> para <strong>{enviado}</strong></> : null}. Vale avisar o cliente
            pelo WhatsApp: <strong>a mensagem pode cair na caixa de spam</strong> dele, ainda mais
            se for a primeira mensagem enviada por aqui.
          </p>
        )}

        {/* O aviso vem ANTES do clique, não só depois: quem precisa saber que
            o e-mail pode não chegar é quem está escolhendo como mandar. */}
        <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
          O e-mail sai com o nome do seu escritório e a resposta volta para você. Como toda
          primeira mensagem enviada por uma ferramenta nova, ele{" "}
          <b className="text-slate2">pode cair no spam do cliente</b> —
          se a empresa for importante, mande também pelo WhatsApp.
        </p>

        {erro && <p className="mt-2 text-[12px] text-vermelho">{erro}</p>}
        <p className="mt-2.5 text-[11px] leading-relaxed text-muted">
          O link não pede cadastro nem login. Você encerra quando quiser.
        </p>
      </div>
    );
  }

  // ----------------------------------------------------------- 1. não pedi
  return (
    <div className="rounded border border-line bg-surface p-4">
      <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
        O que só a empresa sabe
      </div>
      {/* A LISTA DAS CINCO PERGUNTAS SAIU DAQUI (08/08/2026).
          O parágrafo enumerava as cinco perguntas logo acima do botão que manda
          exatamente essas cinco — o leitor lia a mesma lista duas vezes. Elas
          não sumiram: são o conteúdo do formulário que o botão envia. */}
      <p className="mt-1.5 max-w-[68ch] text-[12.5px] leading-relaxed text-slate2">
        Cinco das seis perguntas não estão na escrituração — só o cliente sabe. Sem elas, o laudo
        carrega estimativa com cara de apuração.
      </p>
      {erro && <p className="mt-2 text-[12px] text-vermelho">{erro}</p>}
      {bloqueio && (
        <div className="mt-3 rounded-sm border border-accent bg-accentwash p-3.5">
          <p className="text-[12.5px] text-slate2">{bloqueio}</p>
          <a
            href="/painel/planos"
            className="mt-2 inline-block rounded-sm bg-accent px-3.5 py-2 text-[12.5px] font-bold text-[#04212B]"
          >
            Ver o PRO — R$ 47/mês
          </a>
        </div>
      )}
      {!bloqueio && (
        <button
          onClick={abrir}
          disabled={ocupado}
          className="mt-3 rounded-sm bg-ink px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
        >
          {ocupado ? "Abrindo…" : "Gerar o link para a empresa"}
        </button>
      )}
    </div>
  );
}
