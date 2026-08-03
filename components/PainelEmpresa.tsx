"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MuroPlano } from "@/components/MuroPlano";
import type { Muro } from "@/lib/plano";
import { useRouter } from "next/navigation";
import { formatarCnpj } from "@/lib/cnpj";
import { pct, moeda, SAIDAS, ehOptar, type Saida, type Respostas } from "@/lib/motor";
import { ROTULO_FAIXA, type Faixa } from "@/lib/triagem";
import { premissasEmTexto, baseDeCalculo, premissasEstimadas, type AnaliseGravada } from "@/lib/laudo";
import { EditarEmpresa } from "@/components/EditarEmpresa";
import { FormAnalise, RESPOSTAS_PADRAO } from "@/components/FormAnalise";
import { Comparativo } from "@/components/Comparativo";
import { PedirDados, type ColetaGravada } from "@/components/PedirDados";
import type { Derivadas } from "@/lib/coleta";
import type { DetalheQual } from "@/lib/motor";

/**
 * O DOSSIÊ DA EMPRESA — um componente, dois lugares.
 *
 * Abre como gaveta sobre a fila (o caso normal: o contador não sai da lista) e
 * como página inteira em /painel/empresa/[id] (o caso do link direto, que
 * precisa continuar funcionando). O conteúdo é o mesmo objeto vindo de
 * /api/dossie: duas montagens divergiriam na primeira alteração.
 */

const COR_FAIXA: Record<string, string> = {
  A: "bg-vermelhowash text-vermelho",
  B: "bg-amarelowash text-amarelo",
  C: "bg-verdewash text-verde",
  D: "bg-neutrowash text-muted",
  MEI: "bg-neutrowash text-neutro",
  FORA: "bg-neutrowash text-muted",
};

const COR_SAIDA: Record<string, string> = {
  vermelho: "bg-vermelho",
  amarelo: "bg-amarelo",
  neutro: "bg-neutro",
  verde: "bg-verde",
};

type Aba = "decisao" | "dossie" | "comparativo";

const ROTULO_ENVIO: Record<string, string> = {
  laudo: "Laudo",
  comparativo: "Comparativo",
  termo: "Termo de ciência",
};

interface Dossie {
  empresa: {
    id: string;
    cnpj: string;
    razao_social: string;
    cnae_principal: string | null;
    porte: string | null;
    situacao: string | null;
    regime: string | null;
    anexo: number | null;
    rbt12: number | string | null;
    faixa: Faixa | null;
    motivo_triagem: string | null;
    prioridade_maxima: boolean | null;
    fonte_dados: string | null;
    contato_nome: string | null;
    contato_email: string | null;
    contato_telefone: string | null;
  };
  rodadas: (AnaliseGravada & { janela_id: string | null })[];
  laudo: { id: string; numero: number; emitido_em: string } | null;
  termo: {
    id: string;
    token: string | null;
    assinatura_status: string | null;
    assinante_nome: string | null;
    assinado_em: string | null;
  } | null;
  coleta: ColetaGravada | null;
  comparativos: { id: string; numero: number; emitido_em: string }[];
  envios: {
    id: string;
    tipo: "laudo" | "comparativo" | "termo";
    documento_id: string | null;
    para: string;
    status: "enviado" | "erro";
    erro: string | null;
    caminho: string | null;
    criado_em: string;
  }[];
  janelas: Record<string, string>;
  trilha: string[];
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-line bg-surface p-4">
      <div className="mb-3 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">{titulo}</div>
      {children}
    </div>
  );
}

export function PainelEmpresa({
  empresaId,
  modo = "pagina",
  abaInicial = "decisao",
  aoMudar,
}: {
  empresaId: string;
  modo?: "pagina" | "gaveta";
  abaInicial?: Aba;
  /** avisa o cockpit que algo mudou, para ele recarregar a fila */
  aoMudar?: () => void;
}) {
  const router = useRouter();
  const [d, setD] = useState<Dossie | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>(abaInicial);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [bloqueio, setBloqueio] = useState<string | null>(null);
  const [muro, setMuro] = useState<Muro | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const [aplicado, setAplicado] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  /**
   * O RESULTADO DO ENVIO FICA NA TELA, ao lado do botão que o disparou.
   * A lição dos dois "botões que não funcionam": efeito que nasce longe do
   * clique é lido como clique perdido. Enviar e-mail é o caso extremo — não há
   * nada visível acontecendo, então o aviso É a única prova para o contador.
   */
  const [avisoEnvio, setAvisoEnvio] = useState<{ ok: boolean; texto: string } | null>(null);
  /**
   * QUAL LINK ACABOU DE SER COPIADO.
   *
   * Enviar pelo sistema não pode ser o único caminho. Boa parte da relação do
   * contador com o cliente acontece no WhatsApp, e há empresa que só lê o que
   * chega pelo endereço pessoal do sócio — que não é o `contato_email` da
   * carteira. Quem decide o canal é quem conhece o cliente.
   */
  const [linkCopiado, setLinkCopiado] = useState<string | null>(null);
  /**
   * A CONFIRMAÇÃO DO DESTINATÁRIO, aberta pelo botão de enviar.
   *
   * Mandar direto para o `contato_email` seria mais rápido e pior. Esse endereço
   * veio de um CSV exportado sabe-se lá quando, e com frequência é a caixa do
   * escritório e não a de quem decide — e o documento leva RBT12, alíquota e a
   * decisão da empresa. Um passo de conferência antes de um envio irreversível
   * é barato; o e-mail que foi para o endereço errado não volta.
   *
   * E resolve o caso que antes não tinha saída: empresa SEM contato cadastrado
   * só recebia uma reclamação do botão. Agora digita-se ali, envia, e o endereço
   * fica gravado na empresa.
   */
  const [confirmar, setConfirmar] = useState<
    { tipo: "laudo" | "comparativo"; id: string; numero: number; email: string; nome: string } | null
  >(null);

  async function copiarLinkPublico(tipo: "laudo" | "comparativo", id: string) {
    setAvisoEnvio(null);
    try {
      const resp = await fetch(`/api/documento/link?tipo=${tipo}&id=${id}`, { cache: "no-store" });
      const json = await resp.json();
      if (!resp.ok || !json.link) {
        setAvisoEnvio({ ok: false, texto: json.erro ?? "não consegui montar o link" });
        return;
      }
      await navigator.clipboard?.writeText(json.link);
      setLinkCopiado(id);
      setTimeout(() => setLinkCopiado(null), 2500);
    } catch {
      setAvisoEnvio({ ok: false, texto: "não consegui copiar o link" });
    }
  }
  const [nomeSig, setNomeSig] = useState("");
  const [emailSig, setEmailSig] = useState("");
  /**
   * O QUE VEIO DA EMPRESA, ainda não salvo. Fica separado da análise gravada de
   * propósito: a resposta do cliente ALIMENTA o formulário, não o substitui. O
   * contador vê os valores já preenchidos, ajusta o que a escrituração
   * contradisser e só então salva. Quem assina o laudo é ele.
   */
  const [daColeta, setDaColeta] = useState<{
    marca: number;
    respostas: Respostas;
    detalhes: { qual: DetalheQual };
  } | null>(null);

  const carregar = useCallback(async () => {
    try {
      const resp = await fetch(`/api/dossie?empresa=${empresaId}`, { cache: "no-store" });
      const json = await resp.json();
      if (!resp.ok) {
        setErro(json.erro ?? "não foi possível carregar o dossiê");
        return;
      }
      setD(json as Dossie);
      setNomeSig((v) => v || json.empresa?.contato_nome || "");
      setEmailSig((v) => v || json.empresa?.contato_email || "");
      if (json.termo?.token && !json.termo?.assinado_em) {
        setLink(`${window.location.origin}/assinar/${json.termo.token}`);
      }
    } catch {
      setErro("falha de rede ao carregar o dossiê");
    }
  }, [empresaId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function mudou() {
    void carregar();
    aoMudar?.();
    router.refresh();
  }

  /**
   * As seis respostas da empresa entram nas seis casas correspondentes. A folha
   * NÃO vem daqui — ela está na escrituração, é o contador que tem — então
   * preserva-se o que já havia. O detalhe de `qual` é remontado para que o
   * formulário mostre de onde o número saiu, em vez de exibir um percentual
   * sem origem.
   */
  function aplicarColeta(dv: Derivadas) {
    const atuais = (d?.rodadas?.[0]?.respostas as unknown as Respostas) ?? null;
    setDaColeta({
      marca: Date.now(),
      respostas: {
        ...(atuais ?? RESPOSTAS_PADRAO),
        b2b: dv.b2b,
        qual: dv.qual,
        cred: dv.cred,
        preco: dv.preco,
        conc: dv.conc,
        exig: dv.exig,
      },
      detalhes: { qual: { fora_simples: dv.qual, sem_aproveitamento: 0 } },
    });
    setAba("decisao");

    /**
     * LEVAR O OLHO ATÉ O FORMULÁRIO.
     *
     * "Usar estas respostas na análise" parecia não fazer nada, e a causa é a
     * mesma do botão de colar CNPJs: o efeito acontece FORA DA VISTA. O
     * formulário está logo abaixo deste bloco, na MESMA aba — então
     * `setAba("decisao")` não muda nada visualmente, o formulário remonta com
     * os valores da empresa, e quem está olhando o botão não vê movimento
     * nenhum. Conclusão razoável de quem clicou: o botão está quebrado.
     *
     * Agora ele rola até o formulário e deixa um aviso explícito de que os
     * valores entraram e ainda precisam ser conferidos e salvos.
     */
    setAplicado(true);
    requestAnimationFrame(() =>
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    );
  }

  if (erro) {
    return <p className="rounded-sm bg-vermelhowash px-3 py-2 text-[13px] text-vermelho">{erro}</p>;
  }
  if (!d) {
    return <p className="text-[13px] text-muted">Carregando o dossiê…</p>;
  }

  const e = d.empresa;
  const a = d.rodadas[0] ?? null;
  const faixa = (e.faixa ?? "C") as Faixa;
  const saida = a?.saida ? SAIDAS[a.saida as Saida] : null;
  const assinado = !!d.termo && (d.termo.assinatura_status === "assinado" || !!d.termo.assinado_em);
  const estimada = a ? premissasEstimadas(a) : false;

  /**
   * ESTE DOCUMENTO JÁ FOI AO CLIENTE?
   *
   * Muda o rótulo do botão de "Enviar ao cliente" para "Reenviar". Parece
   * detalhe e não é: sem isso o contador não distingue "nunca mandei" de
   * "mandei e não responderam", e o botão que promete a primeira entrega
   * dispara a segunda sem avisar.
   *
   * Só conta envio com status 'enviado'. Tentativa que falhou não é entrega —
   * chamar de reenvio o que nunca chegou esconderia justamente o caso em que
   * o contador precisa insistir.
   */
  function jaEnviado(tipo: "laudo" | "comparativo" | "termo", documentoId: string): boolean {
    return !!d?.envios?.some(
      (v) => v.tipo === tipo && v.documento_id === documentoId && v.status === "enviado"
    );
  }

  async function emitirLaudo() {
    if (!a) return;
    setOcupado("laudo");
    setBloqueio(null);
    setMuro(null);
    try {
      const resp = await fetch("/api/laudo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analise_id: a.id }),
      });
      const json = await resp.json();
      if (resp.ok && json.laudo_id) {
        window.open(`/doc/laudo/${json.laudo_id}`, "_blank");
        mudou();
      } else if (json.bloqueado_por_plano) {
        if (json.muro) setMuro(json.muro as Muro);
        else setBloqueio(json.erro as string);
      } else {
        setBloqueio(json.erro ?? "não foi possível emitir o laudo");
      }
    } finally {
      setOcupado(null);
    }
  }

  /**
   * ENVIAR O LAUDO AO CLIENTE. Não emite: se o laudo não existe, o botão nem
   * aparece. Emitir por tabela furaria o gate de plano que vive em /api/laudo.
   */
  async function enviarLaudo(para: string, nome: string) {
    if (!d?.laudo) return;
    setOcupado("enviar-laudo");
    setAvisoEnvio(null);
    try {
      const resp = await fetch("/api/laudo/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ laudo_ids: [d.laudo.id], para, nome }),
      });
      const json = await resp.json();
      if (resp.ok && json.enviados > 0) {
        setConfirmar(null);
        setAvisoEnvio({ ok: true, texto: `Laudo enviado para ${para}.` });
        mudou();
      } else if (json.sem_contato > 0) {
        setAvisoEnvio({ ok: false, texto: "Esta empresa não tem e-mail de contato cadastrado — preencha no bloco Contato, aqui embaixo." });
      } else {
        setAvisoEnvio({
          ok: false,
          texto: json.falhas?.[0]?.erro ?? json.erro ?? "não foi possível enviar o laudo",
        });
        mudou();
      }
    } catch {
      setAvisoEnvio({ ok: false, texto: "falha de rede ao enviar" });
    } finally {
      setOcupado(null);
    }
  }

  async function enviarComparativo(id: string, numero: number, para: string, nome: string) {
    setOcupado(`enviar-comp-${id}`);
    setAvisoEnvio(null);
    try {
      const resp = await fetch("/api/comparativo/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comparativo_ids: [id], para, nome }),
      });
      const json = await resp.json();
      if (resp.ok && json.enviados > 0) {
        setConfirmar(null);
        setAvisoEnvio({
          ok: true,
          texto: `Comparativo nº ${String(numero).padStart(4, "0")} enviado para ${para}.`,
        });
        mudou();
      } else if (json.sem_contato > 0) {
        setAvisoEnvio({ ok: false, texto: "Esta empresa não tem e-mail de contato cadastrado — preencha no bloco Contato, aqui embaixo." });
      } else {
        setAvisoEnvio({
          ok: false,
          texto: json.falhas?.[0]?.erro ?? json.erro ?? "não foi possível enviar o comparativo",
        });
        mudou();
      }
    } catch {
      setAvisoEnvio({ ok: false, texto: "falha de rede ao enviar" });
    } finally {
      setOcupado(null);
    }
  }

  async function gerarTermo() {
    if (!a || !nomeSig || !emailSig) return;
    setOcupado("termo");
    setBloqueio(null);
    try {
      const resp = await fetch("/api/termo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analise_id: a.id,
          decisao: ehOptar(a.saida) ? "optar" : "permanecer",
          nome: nomeSig,
          email: emailSig,
          empresa: e.razao_social,
        }),
      });
      const json = await resp.json();
      if (resp.ok && json.link_assinatura) {
        setLink(window.location.origin + json.link_assinatura);
        /**
         * O aviso diz se o CONVITE SAIU. Esta rota passou a enviar (antes só a
         * de lote enviava), e sem esta linha o contador não teria como
         * distinguir "gerou e mandou" de "gerou e o e-mail falhou" — ele copiaria
         * o link e mandaria de novo, ou não mandaria achando que já foi.
         */
        setAvisoEnvio(
          json.enviado
            ? { ok: true, texto: `Termo gerado e convite enviado para ${emailSig}.` }
            : {
                ok: false,
                texto: `Termo gerado, mas o convite não saiu${
                  json.motivo_envio ? ` (${json.motivo_envio})` : ""
                }. Copie o link abaixo e mande você mesmo.`,
              }
        );
        mudou();
      } else {
        setBloqueio(json.erro ?? "não foi possível gerar o termo");
      }
    } finally {
      setOcupado(null);
    }
  }

  const ABAS: [Aba, string][] = [
    ["decisao", a ? "Decisão" : "Analisar"],
    ["dossie", "Dossiê"],
    ["comparativo", "Comparativo"],
  ];

  return (
    <div className={modo === "gaveta" ? "" : "max-w-4xl"}>
      {/* IDENTIFICAÇÃO */}
      <div className="border-b border-line pb-3">
        <h2 className="text-[17px] font-bold leading-tight tracking-tight">{e.razao_social}</h2>
        <p className="mt-0.5 font-mono text-[11.5px] text-muted">
          {formatarCnpj(e.cnpj)}
          {e.cnae_principal ? ` · CNAE ${e.cnae_principal}` : ""}
          {e.anexo ? ` · Anexo ${e.anexo}` : ""}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${COR_FAIXA[faixa]}`}>
            {ROTULO_FAIXA[faixa]}
          </span>
          {e.prioridade_maxima && <span className="font-mono text-[10.5px] text-vermelho">· prioridade</span>}
          {estimada && (
            <span className="rounded-full bg-amarelowash px-2.5 py-1 font-mono text-[10.5px] text-amarelo">
              premissas estimadas
            </span>
          )}
        </div>
      </div>

      {/* ABAS */}
      <div className="sticky top-0 z-10 -mx-1 flex gap-1 overflow-x-auto bg-surface2 px-1 py-2">
        {ABAS.map(([chave, rotulo]) => (
          <button
            key={chave}
            onClick={() => setAba(chave)}
            className={`whitespace-nowrap rounded-sm px-3 py-2 text-[13px] font-semibold ${
              aba === chave ? "bg-ink text-white" : "border border-line bg-surface text-slate2"
            }`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {/* O muro vem do servidor com o preço REAL do banco. O bloco de baixo é
          o fallback para erro que não é de plano — e não cita cifra nenhuma,
          porque preço escrito à mão na tela é preço que um dia diverge da
          página de planos sem ninguém perceber. */}
      {muro ? (
        <div className="mb-3">
          <MuroPlano muro={muro} aoFechar={() => setMuro(null)} />
        </div>
      ) : (
        bloqueio && (
          <div className="mb-3 rounded-sm border border-accent bg-accentwash p-3.5">
            <p className="text-[12.5px] text-slate2">{bloqueio}</p>
            <a
              href="/painel/planos"
              className="mt-2 inline-block rounded-sm bg-accent px-3.5 py-2 text-[12.5px] font-bold text-[#04212B]"
            >
              Ver os planos
            </a>
          </div>
        )
      )}

      {/* ------------------------------------------------------------ DECISÃO */}
      {aba === "decisao" && (
        <div className="space-y-4 pb-4">
          <PedirDados
            empresaId={e.id}
            empresaNome={e.razao_social}
            coleta={d.coleta ?? null}
            aoMudar={() => mudou()}
            aoAplicar={aplicarColeta}
          />

          <div ref={formRef}>
          {aplicado && (
            <div className="mb-3 rounded-sm border border-verde bg-verdewash px-3.5 py-2.5">
              <div className="text-[13px] font-semibold text-verde">
                ✓ Respostas da empresa aplicadas no formulário abaixo.
              </div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-slate2">
                Elas entram marcadas como <b>informadas pelo cliente</b>. A folha continua sendo
                sua — está na escrituração, não no formulário dele. Confira tudo e clique em
                salvar: <b>nada é gravado até você salvar</b>.
              </p>
            </div>
          )}
          <FormAnalise
            /* o `key` força a remontagem quando as respostas da empresa chegam.
               Sem ele, o formulário continuaria exibindo o que já estava na
               tela: `respostasIniciais` só é lido na montagem, e o contador
               clicaria em "usar estas respostas" sem ver nada mudar. */
            key={daColeta ? `coleta-${daColeta.marca}` : "analise"}
            empresaId={e.id}
            anexo={e.anexo}
            cnae={e.cnae_principal}
            rbt12Inicial={e.rbt12 != null ? Number(e.rbt12) : null}
            respostasIniciais={daColeta?.respostas ?? (a?.respostas as unknown as Respostas) ?? null}
            chavesDaColeta={daColeta ? ["b2b", "qual", "cred", "preco", "conc", "exig"] : undefined}
            detalhesIniciais={daColeta?.detalhes ?? a?.parametros?.detalhes ?? null}
            segmentosIniciais={a?.parametros?.segmentos ?? null}
            custoInicial={a?.parametros?.custo_apuracao_anual ?? null}
            estimada={estimada}
            aoSalvar={() => {
              setDaColeta(null);
              setAplicado(false);
              mudou();
            }}
          />
          </div>

          {a && (
            <Bloco titulo="Entregáveis">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={emitirLaudo}
                  disabled={ocupado === "laudo"}
                  className="rounded-sm bg-ink px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
                >
                  {ocupado === "laudo" ? "…" : d.laudo ? "Reemitir laudo" : "Emitir laudo"}
                </button>
                {d.laudo && (
                  <a
                    href={`/doc/laudo/${d.laudo.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-sm border border-line px-3.5 py-2 text-[13px] font-semibold text-accentdeep"
                  >
                    Abrir laudo nº {String(d.laudo.numero).padStart(4, "0")}
                  </a>
                )}
              </div>
              {estimada && !d.laudo && (
                <p className="mt-2 text-[11.5px] text-amarelo">
                  Confirme as premissas acima antes de emitir: o laudo sai com a sua assinatura.
                </p>
              )}

              <div className="mt-4 border-t border-linesoft pt-4">
                <div className="mb-2 text-[12.5px] font-semibold">Termo de ciência</div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    value={nomeSig}
                    onChange={(ev) => setNomeSig(ev.target.value)}
                    placeholder="Nome do signatário"
                    className="flex-1 rounded-sm border border-line px-3 py-2 text-[13px] outline-none focus:border-accent"
                  />
                  <input
                    value={emailSig}
                    onChange={(ev) => setEmailSig(ev.target.value)}
                    placeholder="email@empresa.com"
                    className="flex-1 rounded-sm border border-line px-3 py-2 text-[13px] outline-none focus:border-accent"
                  />
                  <button
                    onClick={gerarTermo}
                    disabled={ocupado === "termo" || !nomeSig || !emailSig || !d.laudo}
                    className="whitespace-nowrap rounded-sm bg-ink px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
                  >
                    {ocupado === "termo" ? "…" : d.termo ? "Gerar novo" : "Gerar termo"}
                  </button>
                </div>
                {!d.laudo && (
                  <p className="mt-1.5 text-[11.5px] text-muted">
                    O termo acompanha o laudo — emita o documento primeiro.
                  </p>
                )}

                {/* O RESULTADO DO ENVIO FICA AQUI, na aba onde o botão "Gerar
                    termo" vive. O mesmo aviso existe no bloco de documentos, na
                    aba Dossiê — e é outra tela. Mostrar só lá repetiria o
                    defeito que os dois "botões que não funcionam" ensinaram:
                    efeito que nasce fora da vista é lido como clique perdido. */}
                {avisoEnvio && (
                  <div
                    className={`mt-3 rounded-sm border p-2.5 text-[12px] ${
                      avisoEnvio.ok
                        ? "border-verde bg-verdewash text-verde"
                        : "border-amarelo bg-amarelowash text-amarelo"
                    }`}
                  >
                    {avisoEnvio.texto}
                  </div>
                )}

                {link && !assinado && (
                  <div className="mt-3 rounded-sm border border-accent bg-accentwash p-3">
                    <div className="text-[12px] font-semibold text-accentdeep">
                      {avisoEnvio?.ok
                        ? "Link de assinatura — se precisar reenviar"
                        : "Link de assinatura — envie ao cliente"}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <input
                        readOnly
                        value={link}
                        className="min-w-0 flex-1 rounded-sm border border-line bg-surface px-2.5 py-1.5 font-mono text-[11.5px] text-slate2 outline-none"
                      />
                      <button
                        onClick={() => {
                          navigator.clipboard?.writeText(link);
                          setCopiado(true);
                          setTimeout(() => setCopiado(false), 2000);
                        }}
                        className="whitespace-nowrap rounded-sm bg-ink px-3 py-1.5 text-[12px] font-semibold text-white"
                      >
                        {copiado ? "Copiado ✓" : "Copiar"}
                      </button>
                    </div>
                  </div>
                )}
                {assinado && d.termo && (
                  <p className="mt-2 font-mono text-[11.5px] text-verde">
                    assinado por {d.termo.assinante_nome} em{" "}
                    {d.termo.assinado_em ? new Date(d.termo.assinado_em).toLocaleString("pt-BR") : "—"}
                  </p>
                )}
              </div>
            </Bloco>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- DOSSIÊ */}
      {aba === "dossie" && (
        <div className="space-y-4 pb-4">
          <Bloco titulo="Cadastro e triagem">
            <p className="text-[13px] text-slate2">{e.motivo_triagem}</p>
            <table className="mt-3 w-full border-collapse text-[13px]">
              <tbody>
                {[
                  ["Regime", e.regime ?? "—"],
                  ["Porte", e.porte ?? "—"],
                  ["Situação", e.situacao ?? "—"],
                  ["RBT12", e.rbt12 != null ? moeda(Number(e.rbt12)) : "não informada"],
                  ["Contato", e.contato_nome ?? "não informado"],
                  ["E-mail", e.contato_email ?? "não informado"],
                  ["Origem", e.fonte_dados === "receita" ? "base da Receita" : "arquivo"],
                ].map(([k, v]) => (
                  <tr key={k}>
                    <td className="border-b border-linesoft py-1.5 pr-2 text-muted">{k}</td>
                    <td className="border-b border-linesoft py-1.5 text-right font-mono text-[12px]">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <EditarEmpresa
              empresaId={e.id}
              contatoNome={e.contato_nome}
              contatoEmail={e.contato_email}
              contatoTelefone={e.contato_telefone}
              rbt12={e.rbt12 != null ? Number(e.rbt12) : null}
            />
          </Bloco>

          <Bloco titulo="Decisão registrada">
            {!a || !saida ? (
              <p className="text-[12.5px] text-muted">
                Nenhuma análise registrada. Use a aba Analisar.
              </p>
            ) : (
              <>
                <div className="overflow-hidden rounded border border-line">
                  <div className={`flex items-center justify-between gap-3 px-3.5 py-2.5 text-white ${COR_SAIDA[saida.cor]}`}>
                    <span className="font-mono text-[11px] tracking-[0.14em]">{a.saida}</span>
                    <span className="text-[14px] font-bold">{saida.titulo}</span>
                  </div>
                  <div className="bg-surface px-3.5 py-3 text-[13px] text-slate2">{saida.descricao}</div>
                </div>
                <table className="mt-3 w-full border-collapse text-[13px]">
                  <tbody>
                    {[
                      ["Repasse necessário", a.re != null ? pct(Number(a.re)) : "—"],
                      ["Ganho do comprador", a.fc != null ? pct(Number(a.fc)) : "—"],
                      ["Receita qualificada", a.rq != null ? pct(Number(a.rq)) : "—"],
                      [
                        "Calculada em",
                        a.calculado_em ? new Date(a.calculado_em).toLocaleDateString("pt-BR") : "—",
                      ],
                    ].map(([k, v]) => (
                      <tr key={k}>
                        <td className="border-b border-linesoft py-1.5 pr-2 text-muted">{k}</td>
                        <td className="border-b border-linesoft py-1.5 text-right font-mono text-[12px]">{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <ul className="mt-3 list-disc pl-5 text-[12.5px] text-slate2">
                  {premissasEmTexto(a.respostas).map((p, i) => (
                    <li key={`p${i}`} className="mb-1">{p}</li>
                  ))}
                  {baseDeCalculo(a).map((b, i) => (
                    <li key={`b${i}`} className="mb-1" style={{ wordBreak: "break-all" }}>{b}</li>
                  ))}
                </ul>
              </>
            )}
          </Bloco>

          <Bloco titulo="Documentos e prova">
            <div className="space-y-2.5">
              {/* O aviso fica ANTES dos botões e dentro do mesmo bloco: enviar
                  e-mail não produz nada visível, então esta linha é a única
                  prova que o contador tem de que o clique fez alguma coisa. */}
              {avisoEnvio && (
                <div
                  className={`rounded-sm border p-2.5 text-[12px] ${
                    avisoEnvio.ok
                      ? "border-verde bg-verdewash text-verde"
                      : "border-amarelo bg-amarelowash text-amarelo"
                  }`}
                >
                  {avisoEnvio.texto}
                </div>
              )}

              {confirmar && (
                <div className="rounded-sm border border-accent bg-accentwash p-3">
                  <div className="text-[12px] font-semibold text-accentdeep">
                    Enviar {confirmar.tipo === "laudo" ? "o laudo" : "o comparativo"} nº{" "}
                    {String(confirmar.numero).padStart(4, "0")} para:
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <input
                      type="email"
                      value={confirmar.email}
                      onChange={(ev) => setConfirmar({ ...confirmar, email: ev.target.value })}
                      placeholder="email@empresa.com.br"
                      autoFocus
                      className="min-w-0 flex-1 rounded-sm border border-line bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-accentdeep"
                    />
                    <button
                      onClick={() =>
                        confirmar.tipo === "laudo"
                          ? void enviarLaudo(confirmar.email.trim(), confirmar.nome)
                          : void enviarComparativo(
                              confirmar.id,
                              confirmar.numero,
                              confirmar.email.trim(),
                              confirmar.nome
                            )
                      }
                      disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(confirmar.email.trim())}
                      className="rounded-sm bg-accentdeep px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
                    >
                      Enviar
                    </button>
                    <button
                      onClick={() => setConfirmar(null)}
                      className="rounded-sm border border-line px-3 py-1.5 text-[12px] font-semibold text-slate2"
                    >
                      Cancelar
                    </button>
                  </div>
                  {/* O botão nasce desabilitado quando o e-mail ainda não é
                      válido — e botão cinza sem explicação é o mesmo defeito de
                      percepção dos dois "botões que não funcionam". A linha
                      abaixo diz o que destrava, e só depois disso passa a
                      explicar o efeito do envio. */}
                  <p className="mt-1.5 text-[11px] text-muted">
                    {!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(confirmar.email.trim())
                      ? confirmar.email.trim()
                        ? "Endereço incompleto — o botão libera quando o e-mail estiver válido."
                        : "Digite o e-mail de quem vai receber para liberar o envio."
                      : e.contato_email
                      ? "Se corrigir aqui, o endereço passa a valer para os próximos envios desta empresa."
                      : "Esta empresa ainda não tem contato — o endereço que você digitar fica salvo nela."}
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 rounded-sm border border-line p-3">
                <div>
                  <div className="text-[13px] font-semibold">Laudo de enquadramento</div>
                  {d.laudo ? (
                    <p className="mt-0.5 font-mono text-[10.5px] text-muted">
                      nº {String(d.laudo.numero).padStart(4, "0")} ·{" "}
                      {new Date(d.laudo.emitido_em).toLocaleDateString("pt-BR")}
                    </p>
                  ) : (
                    <p className="mt-0.5 font-mono text-[10.5px] text-muted">não emitido</p>
                  )}
                </div>
                {/* O botão de emitir vivia só na aba Decisão. Quem chegava no
                    dossiê para conferir o que existe lia "não emitido" e tinha
                    de descobrir sozinho que a ação morava em outra aba. */}
                {!d.laudo && (
                  <button
                    onClick={emitirLaudo}
                    disabled={ocupado === "laudo"}
                    className="shrink-0 rounded-sm bg-ink px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
                  >
                    {ocupado === "laudo" ? "Emitindo…" : "Emitir laudo"}
                  </button>
                )}
                {d.laudo && (
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      onClick={() => void copiarLinkPublico("laudo", d.laudo!.id)}
                      title="Copiar o link para mandar por WhatsApp ou pelo seu e-mail"
                      className="rounded-sm border border-line px-3 py-1.5 text-[12px] font-semibold text-slate2"
                    >
                      {linkCopiado === d.laudo.id ? "Copiado ✓" : "Copiar link"}
                    </button>
                    <button
                      onClick={() =>
                        setConfirmar({
                          tipo: "laudo",
                          id: d.laudo!.id,
                          numero: d.laudo!.numero,
                          email: e.contato_email ?? "",
                          nome: e.contato_nome ?? "",
                        })
                      }
                      disabled={ocupado === "enviar-laudo"}
                      className="rounded-sm bg-accentdeep px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
                    >
                      {ocupado === "enviar-laudo"
                        ? "Enviando…"
                        : jaEnviado("laudo", d.laudo.id)
                          ? "Reenviar"
                          : "Enviar ao cliente"}
                    </button>
                    <a
                      href={`/doc/laudo/${d.laudo.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-sm border border-line px-3 py-1.5 text-[12px] font-semibold text-accentdeep"
                    >
                      Abrir
                    </a>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-2 rounded-sm border border-line p-3">
                <div>
                  <div className="text-[13px] font-semibold">Termo de ciência</div>
                  <p className={`mt-0.5 font-mono text-[10.5px] ${assinado ? "text-verde" : "text-amarelo"}`}>
                    {!d.termo
                      ? "não gerado"
                      : assinado
                      ? `assinado por ${d.termo.assinante_nome}`
                      : "aguardando assinatura"}
                  </p>
                </div>
                {d.termo && (
                  <div className="flex shrink-0 gap-1.5">
                    {!assinado && d.termo.token && (
                      <a
                        href={`/assinar/${d.termo.token}`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-sm border border-line px-3 py-1.5 text-[12px] font-semibold text-accentdeep"
                      >
                        Link
                      </a>
                    )}
                    <a
                      href={`/doc/termo/${d.termo.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-sm border border-line px-3 py-1.5 text-[12px] font-semibold text-slate2"
                    >
                      Abrir
                    </a>
                  </div>
                )}
              </div>

              {d.comparativos.length > 0 && (
                <div className="rounded-sm border border-line p-3">
                  <div className="mb-1.5 text-[13px] font-semibold">Comparativos de regime</div>
                  <div className="space-y-1.5">
                    {d.comparativos.map((c) => (
                      <div key={c.id} className="flex flex-wrap items-center justify-between gap-1.5">
                        <a
                          href={`/doc/comparativo/${c.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-sm border border-line px-2.5 py-1 text-[11.5px] font-semibold text-accentdeep"
                        >
                          nº {String(c.numero).padStart(4, "0")} ·{" "}
                          {new Date(c.emitido_em).toLocaleDateString("pt-BR")}
                        </a>
                        <button
                          onClick={() => void copiarLinkPublico("comparativo", c.id)}
                          title="Copiar o link para mandar você mesmo"
                          className="shrink-0 rounded-sm border border-line px-2.5 py-1 text-[11.5px] font-semibold text-slate2"
                        >
                          {linkCopiado === c.id ? "Copiado ✓" : "Copiar link"}
                        </button>
                        <button
                          onClick={() =>
                            setConfirmar({
                              tipo: "comparativo",
                              id: c.id,
                              numero: c.numero,
                              email: e.contato_email ?? "",
                              nome: e.contato_nome ?? "",
                            })
                          }
                          disabled={ocupado === `enviar-comp-${c.id}`}
                          className="shrink-0 rounded-sm bg-accentdeep px-2.5 py-1 text-[11.5px] font-semibold text-white disabled:opacity-50"
                        >
                          {ocupado === `enviar-comp-${c.id}`
                            ? "Enviando…"
                            : jaEnviado("comparativo", c.id)
                              ? "Reenviar"
                              : "Enviar ao cliente"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* O QUE JÁ SAIU. Antes disto, o contador mandava o convite de
                  assinatura e nunca mais sabia se tinha saído — nenhum envio ao
                  cliente era registrado em lugar nenhum. Os erros aparecem
                  junto de propósito: falha escondida vira cliente que não
                  recebeu e ninguém soube. */}
              {d.envios?.length > 0 && (
                <div className="rounded-sm bg-surface2 p-3">
                  <div className="mb-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
                    Enviado ao cliente
                  </div>
                  <ul className="space-y-1 text-[11.5px]">
                    {d.envios.map((v) => (
                      <li key={v.id} className="flex items-baseline justify-between gap-2">
                        <span className={v.status === "erro" ? "text-amarelo" : "text-slate2"}>
                          {ROTULO_ENVIO[v.tipo] ?? v.tipo} → {v.para}
                          {v.status === "erro" && (
                            <span className="ml-1 font-mono text-[10.5px]">
                              · não saiu{v.erro ? `: ${v.erro}` : ""}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 font-mono text-[10.5px] text-muted">
                          {new Date(v.criado_em).toLocaleDateString("pt-BR")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {d.trilha.length > 0 && (
                <div className="rounded-sm bg-surface2 p-3">
                  <div className="mb-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
                    Trilha de auditoria
                  </div>
                  <ul className="list-disc pl-4 text-[11.5px] text-slate2">
                    {d.trilha.map((l, i) => (
                      <li key={i} className="mb-1" style={{ wordBreak: "break-all" }}>{l}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Bloco>

          {d.rodadas.length > 1 && (
            <Bloco titulo="Histórico de decisões">
              <p className="mb-3 text-[12.5px] text-muted">
                A opção vale por semestre: cada janela tem a sua decisão, e as anteriores ficam
                preservadas.
              </p>
              <div className="space-y-2">
                {d.rodadas.map((r, i) => {
                  const s = r.saida ? SAIDAS[r.saida as Saida] : null;
                  return (
                    <div
                      key={r.id}
                      className={`flex flex-wrap items-center justify-between gap-2 rounded-sm border px-3 py-2 ${
                        i === 0 ? "border-accent bg-accentwash" : "border-linesoft bg-surface2"
                      }`}
                    >
                      <div>
                        <div className="text-[12.5px] font-semibold">
                          {(r.janela_id && d.janelas[r.janela_id]) || "Janela atual"}
                          {i === 0 && <span className="ml-2 font-mono text-[10px] text-accentdeep">atual</span>}
                        </div>
                        <div className="font-mono text-[10.5px] text-muted">
                          {r.calculado_em ? new Date(r.calculado_em).toLocaleDateString("pt-BR") : "—"}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-[12px] font-semibold">
                          {r.saida ?? "—"}{" "}
                          <span className="font-normal text-muted">{s?.titulo.split(" —")[0]}</span>
                        </div>
                        <div className="font-mono text-[10.5px] text-muted">
                          repasse {r.re != null ? pct(Number(r.re)) : "—"}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Bloco>
          )}
        </div>
      )}

      {/* -------------------------------------------------------- COMPARATIVO */}
      {aba === "comparativo" && (
        <div className="pb-4">
          <Comparativo
            empresaId={e.id}
            nome={e.razao_social}
            anexoInicial={e.anexo}
            receitaInicial={e.rbt12 != null ? Number(e.rbt12) : null}
          />
        </div>
      )}
    </div>
  );
}
