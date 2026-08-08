"use client";

import { useState } from "react";
import {
  ROTULO_TIPO, fraseDaDecisao, resolverDecisao, validarDecisao,
  type Recomendacao, type TipoDecisao,
} from "@/lib/termo";

/**
 * O DETALHE QUE FICA A UM CLIQUE — e não some.
 *
 * Esta tela é lida por um EMPRESÁRIO, não por um contador. Ela abria com a
 * recomendação, os fundamentos, os pontos a observar e oito cláusulas — várias
 * delas longas, uma começando com "ATENÇÃO" — tudo antes do primeiro campo.
 * Quem chega para dar ciência de uma decisão que já foi conversada com a
 * contabilidade encontra uma parede de texto fiscal, e parede assusta: o
 * documento que existe para PROTEGER passa a parecer uma armadilha, e o cliente
 * fecha a aba em vez de assinar.
 *
 * A resposta NÃO é apagar. Cada linha ali está no hash do que ele assina, e o
 * termo continua saindo com tudo. A resposta é ORDEM: à vista fica o que ele
 * precisa para decidir; o fundamento fica a um clique, aberto por quem quiser,
 * com o rótulo dizendo o que tem dentro e quantos itens são.
 *
 * O limite que eu não passo: nada do que ele DECLARA some da tela sem aviso, e
 * o número de itens vai no rótulo — "esconder" um item é diferente de dizer
 * "há oito, clique para ler".
 */
function Recolhivel({
  titulo,
  quantos,
  children,
}: {
  titulo: string;
  quantos?: number;
  children: React.ReactNode;
}) {
  return (
    <details className="mt-3 rounded-sm border border-line bg-surface px-3 py-2.5">
      <summary className="cursor-pointer list-none text-[12.5px] font-semibold text-accentdeep">
        {titulo}
        {quantos != null && <span className="font-mono font-normal text-muted"> · {quantos}</span>}
        <span className="float-right font-normal text-muted" aria-hidden>
          ler
        </span>
      </summary>
      <div className="mt-2 text-[12.5px] text-slate2">{children}</div>
    </details>
  );
}

interface Props {
  token: string;
  empresa: string;
  cnpj: string;
  decisao: "optar" | "permanecer";
  clausulas: string[];
  hash: string;
  /**
   * A RECOMENDAÇÃO E O MOTIVO ENTRAM NO HASH — logo, aparecem aqui.
   *
   * Ausentes nos termos emitidos antes de 05/08/2026; nesses o cartão sai como
   * saía. Termo antigo é prova do que foi assinado, não rascunho para
   * completar com o que a gente sabe hoje.
   */
  recomendacao?: Recomendacao | null;
  tipoDecisao?: TipoDecisao | null;
  motivo?: string | null;
  pontos?: string[];
  /** link público do laudo que embasa esta decisão (null se não houver) */
  linkLaudo?: string | null;
  numeroLaudo?: number | null;
}

export function Assinatura({
  token, empresa, cnpj, decisao, clausulas, hash,
  recomendacao, tipoDecisao, motivo, pontos = [],
  linkLaudo, numeroLaudo,
}: Props) {
  const [etapa, setEtapa] = useState<"form" | "confirmar" | "ok">("form");
  const [metodo, setMetodo] = useState<"simples" | "avancada">("simples");
  const [notaOtp, setNotaOtp] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [aceite, setAceite] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [resultado, setResultado] = useState<{ metodo: string; assinado_em: string; hash?: string } | null>(null);
  /**
   * A DECISÃO É DAQUI PARA BAIXO — mudança de 05/08/2026.
   *
   * O termo chegava com a decisão já escrita pelo contador ("a empresa decide
   * optar") e o cliente só assinava embaixo. O papel voltava a não distinguir
   * quem decidiu o quê, que é o defeito inteiro que o termo existe para
   * resolver. Nada vem pré-selecionado: pré-selecionar "seguir" seria a mesma
   * decisão do contador, só que disfarçada de escolha.
   */
  const [tipo, setTipo] = useState<TipoDecisao | null>(tipoDecisao ?? null);
  const [motivoTexto, setMotivoTexto] = useState(motivo ?? "");

  const recomendada = recomendacao?.decisao ?? decisao;
  /* o que a escolha do cliente produz, em tempo real — ele vê o efeito antes
     de assinar, não depois */
  const valeu = tipo
    ? resolverDecisao(tipo, recomendacao ?? { decisao: recomendada, saida: "S1", titulo: "", baseado_em: [] })
    : null;
  const optou = (valeu ?? decisao) === "optar";

  async function continuar() {
    setErro(null);
    if (!tipo) {
      setErro("Escolha o que a empresa decidiu antes de continuar.");
      return;
    }
    /* a mesma regra do servidor, dita antes da ida: descobrir que faltava o
       motivo depois do código de e-mail seria fazer a pessoa recomeçar */
    const v = validarDecisao({ tipo, decisao: valeu ?? decisao, motivo: motivoTexto });
    if (!v.ok) {
      setErro(v.erro ?? "revise a decisão");
      return;
    }
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
      /* PARA ONDE O CÓDIGO FOI, e quando ele não foi (08/08/2026). O servidor
         manda o código para o e-mail que o contador cadastrou na emissão, não
         para o digitado aqui — sem esta linha, a pessoa fica olhando a caixa
         de entrada errada. E quando o envio falha, a assinatura cai para o
         método simples: isso muda o que o documento prova, e some se ninguém
         escrever na tela. */
      setNotaOtp(
        (json.aviso as string | undefined) ??
          (json.enviado_para ? `Código enviado para ${json.enviado_para}.` : null)
      );
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
        body: JSON.stringify({
          token, acao: "confirmar", nome, cpf, email, codigo,
          tipo_decisao: tipo,
          motivo_divergencia: motivoTexto.trim() || null,
        }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.erro ?? "falha ao assinar");
      /* o hash agora NASCE na assinatura: mostrar o da emissão no recibo daria à
         pessoa um código que não confere com o documento dela */
      setResultado({ metodo: json.metodo, assinado_em: json.assinado_em, hash: json.hash_documento });
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
          hash do documento: {resultado.hash ?? hash}
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
        {/* A PRIMEIRA LINHA DIZ O QUE É E QUANTO CUSTA. Quem abre um link de
            assinatura sem saber o tamanho da tarefa assume o pior. */}
        <p className="mt-2 text-[12.5px] text-slate2">
          A sua contabilidade analisou o regime da empresa. Aqui você registra a decisão — leva
          dois minutos.
        </p>
        {/* A RECOMENDAÇÃO VEM ANTES DA DECISÃO, e em corpo menor. O documento é
            o termo da decisão da EMPRESA; se a recomendação virar o destaque, o
            papel passa a parecer que quem decidiu foi o contador. */}
        {recomendacao && (
          <div className="mt-3 rounded-sm border border-line bg-surface px-3 py-2.5 text-[12.5px] text-slate2">
            <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-accentdeep">
              Recomendação técnica
            </div>
            <p className="mt-1">
              A análise recomenda{" "}
              <b className="text-ink">
                {recomendacao.decisao === "optar"
                  ? "OPTAR pelo regime híbrido"
                  : "PERMANECER no regime tradicional"}
              </b>{" "}
              — {recomendacao.titulo}.
            </p>
          </div>
        )}

        {!!recomendacao?.baseado_em.length && (
          <Recolhivel titulo="Em que essa conclusão se baseia" quantos={recomendacao.baseado_em.length}>
            <ul className="list-disc pl-4">
              {recomendacao.baseado_em.map((b, i) => (
                <li key={i} className="mb-0.5">{b}</li>
              ))}
            </ul>
          </Recolhivel>
        )}

        {!!pontos.length && (
          <Recolhivel titulo="Pontos a observar" quantos={pontos.length}>
            <p>A recomendação vale enquanto eles se mantiverem. Se algum mudar, a conta muda.</p>
            <ul className="mt-1.5 list-disc pl-4">
              {pontos.map((p, i) => (
                <li key={i} className="mb-0.5">{p}</li>
              ))}
            </ul>
          </Recolhivel>
        )}

        {/**
          * A DECISÃO — escolhida AQUI, por quem assina.
          *
          * Antes este bloco dizia "Decisão: Optar…" já preenchido pelo
          * contador, e o cliente só assinava embaixo. Agora ele escolhe, e vê o
          * efeito da escolha antes de assinar. Nada vem pré-selecionado:
          * pré-selecionar "seguir" seria a decisão do contador disfarçada de
          * escolha do cliente.
          */}
        <div className="mt-3 rounded-sm border border-accent bg-surface px-3 py-3">
          <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-accentdeep">
            A decisão da empresa
          </div>
          <p className="mt-1 text-[12.5px] text-slate2">
            A recomendação é técnica; a decisão é da empresa — e é ela que este documento registra.
          </p>
          <div className="mt-2.5 flex flex-col gap-2">
            {(Object.keys(ROTULO_TIPO) as TipoDecisao[]).map((t) => (
              <label
                key={t}
                className={`flex cursor-pointer items-start gap-2.5 rounded-sm border px-3 py-2.5 text-[13px] ${
                  tipo === t ? "border-accent bg-surface2 text-ink" : "border-line text-slate2"
                }`}
              >
                <input
                  type="radio"
                  name="tipo-decisao"
                  checked={tipo === t}
                  onChange={() => setTipo(t)}
                  className="mt-0.5"
                />
                <span>
                  <b>{ROTULO_TIPO[t]}</b>
                  <span className="mt-0.5 block text-[12px] text-muted">
                    {t === "seguir" &&
                      `A empresa faz o que a análise recomenda: ${
                        recomendada === "optar" ? "optar pelo regime híbrido" : "permanecer no regime tradicional"
                      }.`}
                    {t === "divergir" &&
                      `A empresa decide o contrário: ${
                        recomendada === "optar" ? "permanecer no regime tradicional" : "optar pelo regime híbrido"
                      }. O motivo é obrigatório.`}
                    {t === "adiar" &&
                      "Não exercer a opção nesta janela e reavaliar na seguinte. Sem manifestação no prazo, permanece no regime tradicional."}
                  </span>
                </span>
              </label>
            ))}
          </div>

          {tipo && tipo !== "seguir" && (
            <div className="mt-2.5">
              <label className="mb-1 block text-[12px] font-semibold text-slate2">
                {tipo === "divergir" ? "Por que a empresa decidiu diferente? (obrigatório)" : "Observação (opcional)"}
              </label>
              <textarea
                value={motivoTexto}
                onChange={(e) => setMotivoTexto(e.target.value)}
                rows={3}
                placeholder={
                  tipo === "divergir"
                    ? "Ex.: a empresa está em negociação de venda e não quer mudar o regime agora."
                    : "Ex.: vamos reavaliar em março, depois do fechamento do trimestre."
                }
                className="w-full rounded-sm border border-line px-3 py-2 text-[13px] outline-none focus:border-accent"
              />
              {/* com as PALAVRAS DE QUEM DECIDIU: se o contador escreve no lugar
                  dele, é o contador caracterizando a razão do cliente — e é essa
                  frase que se contesta depois */}
              <p className="mt-1 text-[11px] text-muted">
                Escreva com as suas palavras. O texto entra no documento que você assina.
              </p>
            </div>
          )}

          {tipo && (
            <p className="mt-2.5 rounded-sm bg-surface2 px-3 py-2 text-[12.5px] text-slate2">
              <b className="text-ink">
                {optou ? "Optar pelo regime híbrido (fora do DAS) a partir de 2027" : "Permanecer no regime tradicional"}
              </b>
              <span className="mt-0.5 block">
                {fraseDaDecisao(
                  { tipo, decisao: valeu ?? decisao, motivo: motivoTexto },
                  recomendacao ?? { decisao: recomendada, saida: "S1", titulo: "", baseado_em: [] }
                )}
              </span>
            </p>
          )}
        </div>

        {/**
          * AS CLÁUSULAS — recolhidas, contadas e anunciadas pelo que são.
          *
          * Eram oito parágrafos densos abertos na tela, um deles começando com
          * "ATENÇÃO", entre a decisão e o campo de nome. É a parte que assusta —
          * e é também a parte que o cliente declara ter lido, então recolher sem
          * dizer nada seria trocar susto por engano.
          *
          * O rótulo resolve o dilema: diz QUANTAS são e o que tratam. Quem quer
          * ler, lê; quem não abre, sabe que existem e quantas. Nenhuma palavra
          * saiu do documento, do hash ou do PDF.
          */}
        <Recolhivel
          titulo="O que você declara ciência ao assinar — prazos, e o que não tem volta"
          quantos={clausulas.length}
        >
          <ul className="list-disc pl-4">
            {clausulas.map((c, i) => (
              <li key={i} className="mb-1">{c}</li>
            ))}
          </ul>
        </Recolhivel>

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
          {notaOtp && (
            <p className="rounded-sm border border-line bg-surface2 px-3 py-2 text-[12.5px] text-slate2">
              {notaOtp}
            </p>
          )}
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
