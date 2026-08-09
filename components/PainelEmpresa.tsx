"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MuroPlano } from "@/components/MuroPlano";
import { PropostaEmpresa, type PropostaResumo } from "@/components/PropostaEmpresa";
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
import { RoteiroEmpresa } from "@/components/RoteiroEmpresa";
import { ArquivarEmpresa } from "@/components/ArquivarEmpresa";
import { ApontamentosEmpresa } from "@/components/ApontamentosEmpresa";
import type { Derivadas } from "@/lib/coleta";
import type { DetalheQual } from "@/lib/motor";
import { crescimentoPorRBT12Anterior } from "@/lib/projecao";

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

/** o mesmo recado saía escrito duas vezes, nas duas funções de envio — e duas
    cópias de uma frase são duas frases que um dia divergem */
const SEM_CONTATO = "Cadastre o e-mail no bloco Contato, aqui embaixo, para enviar.";

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
    arquivada_em?: string | null;
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
  propostas?: PropostaResumo[];
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
  proxima,
  aoIrParaProxima,
}: {
  empresaId: string;
  modo?: "pagina" | "gaveta";
  abaInicial?: Aba;
  /** avisa o cockpit que algo mudou, para ele recarregar a fila */
  aoMudar?: () => void;
  /**
   * A PRÓXIMA EMPRESA COM TRABALHO — quem calcula é a fila, que é quem sabe a
   * ordem de prioridade e o filtro que está ligado. Aqui só se oferece o
   * caminho. Ausente na página inteira (/painel/empresa/[id]), onde não há
   * esteira: quem entrou por link direto veio ver UMA empresa.
   */
  proxima?: { id: string; nome: string; aba: "decisao" | "dossie" } | null;
  aoIrParaProxima?: (id: string, aba: "decisao" | "dossie") => void;
}) {
  const router = useRouter();
  const [d, setD] = useState<Dossie | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>(abaInicial);

  /**
   * A ABA SEGUE A AÇÃO — conserto de 07/08/2026, com um caso concreto.
   *
   * `useState(abaInicial)` lê a prop UMA VEZ, na montagem. A gaveta do cockpit
   * não desmonta entre um clique e outro: quem estava com a empresa aberta no
   * Dossiê e clicava em "Confirmar premissas" continuava no Dossiê, porque a
   * prop mudava e o estado não. O contador via a ficha da empresa, não o
   * formulário — e concluía que não havia nada para analisar.
   *
   * O efeito sincroniza sem remontar. Remontar (via `key`) também resolveria,
   * mas jogaria fora o que já foi carregado e o que estiver preenchido no
   * formulário — caro para consertar uma aba.
   */
  useEffect(() => {
    setAba(abaInicial);
  }, [abaInicial]);

  const [ocupado, setOcupado] = useState<string | null>(null);
  const [bloqueio, setBloqueio] = useState<string | null>(null);
  const [muro, setMuro] = useState<Muro | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  /**
   * O MURO NASCE FORA DA VISTA — e por isso o botão "não funcionava".
   *
   * O bloco do limite de plano fica ACIMA das abas, porque precisa aparecer
   * venha o clique de onde vier. Só que quem clica em "Emitir laudo" está lá
   * embaixo — no fim da aba Analisar ou dentro do dossiê — e a resposta explode
   * a duas telas de distância, fora do campo de visão. O relato que chega é
   * exatamente este: "o botão não funcionou, e não disse por quê".
   *
   * A ref leva o olho até lá. É a mesma correção dos dois botões que nasceram
   * "quebrados" e não estavam.
   */
  const avisoRef = useRef<HTMLDivElement>(null);

  /* levar o olho até a resposta: ver o comentário de `avisoRef` */
  useEffect(() => {
    if (muro || bloqueio) {
      requestAnimationFrame(() =>
        avisoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      );
    }
  }, [muro, bloqueio]);

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
  /**
   * O termo já carrega o token no painel — não precisa de ida ao servidor para
   * montar o endereço, ao contrário do laudo e do comparativo.
   */
  async function copiarLinkTermo(id: string, token: string) {
    setAvisoEnvio(null);
    try {
      await navigator.clipboard?.writeText(`${window.location.origin}/termo/${token}`);
      setLinkCopiado(id);
      setTimeout(() => setLinkCopiado(null), 2500);
    } catch {
      setAvisoEnvio({ ok: false, texto: "não consegui copiar o link" });
    }
  }

  /** o laudo que acabou de sair — some quando a gaveta é fechada */
  const [emitido, setEmitido] = useState<{ id: string; numero: number; abriu: boolean } | null>(null);

  const [nomeSig, setNomeSig] = useState("");
  const [emailSig, setEmailSig] = useState("");
  /**
   * A ANÁLISE FOI REFEITA NA EMISSÃO — e isto NÃO pode ser silencioso.
   *
   * Análise calculada por motor anterior pode mudar de saída na hora de emitir.
   * Refazer é a decisão certa (documento incoerente é pior), mas quem assina o
   * laudo é o contador: se a recomendação virou outra entre o clique e o papel,
   * ele tem de ler isso antes de mandar o link ao cliente.
   */
  const [recalculada, setRecalculada] = useState<
    { de: string | null; para: string | null; aviso: string } | null
  >(null);
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
    /**
     * SEM ANÁLISE SALVA NÃO HÁ O QUE EMITIR — e isto precisa ser DITO.
     *
     * O `return` mudo daqui era um dos "botões que não funcionam": o botão de
     * emitir no dossiê aparece sempre que ainda não existe laudo, inclusive
     * quando ainda não existe análise. Clicar não fazia nada, não avisava nada,
     * e a leitura razoável de quem clicou é que o produto quebrou justamente no
     * documento que sustenta o honorário.
     *
     * Agora ele diz o que falta e leva para onde se resolve.
     */
    if (!a) {
      setBloqueio(
        "Salve a análise primeiro — o laudo é emitido em cima dela. O botão de emitir aparece logo abaixo do formulário."
      );
      setAba("decisao");
      return;
    }
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
        /**
         * ABRIR EM ABA NOVA PODE NÃO ABRIR.
         *
         * `window.open` volta null quando o navegador bloqueia a janela — e
         * quando isso acontece o contador clica em "Emitir laudo", não vê nada
         * acontecer e conclui que o botão está quebrado. Justamente no
         * momento em que o produto entrega o documento que sustenta o
         * honorário.
         *
         * O aviso abaixo é a prova na tela: existe emitido ou não, com o
         * caminho para abrir na mão. E ele diz o que fazer em seguida, porque
         * "emitido" não é o fim — o PDF é.
         */
        const janela = window.open(`/doc/laudo/${json.laudo_id}`, "_blank");
        setEmitido({ id: json.laudo_id as string, numero: json.numero as number, abriu: !!janela });
        if (json.recalculada) setRecalculada(json.recalculada);
        mudou();
      } else if (json.bloqueado_por_plano) {
        if (json.muro) setMuro(json.muro as Muro);
        else setBloqueio(json.erro as string);
      } else {
        setBloqueio(json.erro ?? "não foi possível emitir o laudo");
      }
    } catch {
      /* SEM ESTE CATCH O CLIQUE SUMIA (08/08/2026). Era `try/finally`: com a
         rede caindo, a promessa rejeitava sem tratamento, o "…" voltava a
         "Emitir laudo" e nenhuma mensagem aparecia — exatamente o sintoma "o
         botão não funcionou" que este arquivo diz ter consertado nos irmãos. */
      setBloqueio(
        "não foi possível falar com o servidor — o laudo não foi emitido. Confira a conexão e tente de novo."
      );
    } finally {
      setOcupado(null);
    }
  }

  /**
   * ENCERRAR O ACESSO POR UM LINK — 08/08/2026.
   *
   * O documento fica; o endereço para de abrir. É o que faltava para o
   * reencaminhamento indevido ter conserto: até aqui, um link entregue era um
   * link para sempre.
   */
  async function revogarLink(tabela: string, id: string) {
    setOcupado("revogar");
    setAvisoEnvio(null);
    try {
      const resp = await fetch("/api/documento/revogar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tabela, id }),
      });
      const json = await resp.json().catch(() => ({}));
      setAvisoEnvio({
        ok: resp.ok,
        texto: (json.aviso as string) ?? (json.erro as string) ?? "não foi possível alterar o acesso",
      });
      if (resp.ok) mudou();
    } catch {
      setAvisoEnvio({
        ok: false,
        texto: "não foi possível falar com o servidor — o link continua como estava.",
      });
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
        setAvisoEnvio({ ok: false, texto: SEM_CONTATO });
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
        setAvisoEnvio({ ok: false, texto: SEM_CONTATO });
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
          nome: nomeSig,
          email: emailSig,
          empresa: e.razao_social,
        }),
      });
      const json = await resp.json();
      if (resp.ok && json.link_assinatura) {
        setLink(window.location.origin + json.link_assinatura);
        if (json.recalculada) setRecalculada(json.recalculada);
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
    } catch {
      /* mesmo defeito do emitirLaudo: `try/finally` sem `catch` fazia o clique
         desaparecer em silêncio quando a rede caía. Aqui o silêncio é pior,
         porque este botão manda e-mail — o contador precisa saber que NÃO saiu
         antes de decidir se manda de novo. */
      setBloqueio(
        "não foi possível falar com o servidor — o termo não foi gerado e nenhum e-mail saiu. Confira a conexão e tente de novo."
      );
    } finally {
      setOcupado(null);
    }
  }

  const ABAS: [Aba, string][] = [
    /**
     * "Análise" e não "Decisão".
     *
     * Decisão é o RESULTADO; análise é o que o contador faz. A aba nomeia a
     * ação dele, não o produto dela — e quem abre a empresa está indo analisar,
     * não decidir.
     *
     * O sufixo "· pendente" existe porque sair da aba sem salvar era
     * indistinguível de nunca ter entrado: a pessoa voltava, via o dossiê, e
     * não tinha como saber que havia trabalho começado e perdido.
     */
    ["decisao", a ? "Análise" : "Análise · pendente"],
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
          {e.regime && (
            <span className="rounded-full bg-surface2 px-2.5 py-1 font-mono text-[10.5px] text-slate2">
              {e.regime}
            </span>
          )}
          {/* 07/08/2026: "onde eu corrijo o enquadramento / excluo a empresa?"
              — existia, no fim do Dossiê, e ninguém achou. O caminho agora tem
              porta no cabeçalho, visível de qualquer aba. ux-ok: troca de aba */}
          <button
            onClick={() => setAba("dossie")}
            className="text-[11px] font-semibold text-accentdeep underline underline-offset-2"
          >
            corrigir dados · arquivar/excluir
          </button>
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
      <div ref={avisoRef} />
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
          {/* A ORDEM ESCRITA, antes do formulário. Ver lib/roteiro. */}
          <RoteiroEmpresa
            estado={{
              temColeta: d.coleta?.status === "respondida",
              temAnalise: !!a,
              premissasEstimadas: estimada,
              temLaudo: !!d.laudo,
              temTermo: !!d.termo,
              assinado,
            }}
          />

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
            /* o que esta tela leu ao abrir — o servidor usa para avisar quando
               um colega grava a mesma empresa no meio (08/08/2026) */
            calculadoEmInicial={a?.calculado_em ?? null}
            /* o formulário pergunta o CRESCIMENTO; a análise guarda a RBT12
               anterior. A volta é a mesma conta ao contrário, para reabrir
               mostrando o que foi respondido em vez de um campo vazio. */
            crescimentoInicial={crescimentoPorRBT12Anterior(
              e.rbt12 != null ? Number(e.rbt12) : null,
              a?.parametros?.rbt12_anterior ?? null
            )}
            estimada={estimada}
            aoSalvar={() => {
              setDaColeta(null);
              setAplicado(false);
              mudou();
            }}
          />
          </div>

          {a && (
            <Bloco titulo="Documentos da empresa">
              <div className="flex flex-wrap gap-2">
                {/* O botão acompanha a regra do servidor (08/08/2026): com
                    premissa estimada a emissão é recusada lá, e deixar o botão
                    ativo aqui só produz um erro depois do clique. A explicação
                    fica logo abaixo, sempre — botão apagado sem motivo escrito
                    é o defeito que a auditoria de UX persegue. */}
                <button
                  onClick={emitirLaudo}
                  disabled={ocupado === "laudo" || (estimada && !d.laudo)}
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
                {/* CORTAR O LINK — 08/08/2026. Os documentos por token eram
                    eternos e irrevogáveis: um endereço reencaminhado abria CNPJ
                    e receita do cliente anos depois, e o contador não tinha
                    saída nenhuma. Revogar não apaga o documento nem invalida
                    assinatura — fecha a porta daquele endereço, e /verificar
                    continua conferindo pelo número e pelo CNPJ. */}
                {d.laudo && (
                  <button
                    onClick={() => void revogarLink("laudos", d.laudo!.id)}
                    disabled={ocupado === "revogar"}
                    className="rounded-sm border border-line px-3.5 py-2 text-[13px] font-semibold text-slate2 disabled:opacity-40"
                  >
                    {ocupado === "revogar" ? "…" : "Encerrar o link público"}
                  </button>
                )}
              </div>
              {estimada && !d.laudo && (
                <p className="mt-2 text-[11.5px] text-amarelo">
                  Emitir está indisponível porque as premissas acima ainda são a estimativa do
                  CNAE. Confira os números e salve a análise — o laudo sai com a sua assinatura.
                </p>
              )}

              {/**
                * A RECOMENDAÇÃO MUDOU ENTRE O CLIQUE E O PAPEL.
                *
                * Fica ACIMA do "✓ laudo emitido" de propósito: o verde é a
                * notícia boa e é lido primeiro; esta é a que exige leitura. Um
                * recálculo automático que não aparece na tela seria trocar um
                * documento incoerente por um que mudou sozinho — pior, porque o
                * primeiro pelo menos se denuncia na leitura.
                */}
              {recalculada && (
                <div className="mt-3 rounded-sm border border-amarelo bg-amarelowash p-3">
                  <div className="text-[13px] font-semibold text-amarelo">
                    A análise foi refeita nesta emissão: {recalculada.de} → {recalculada.para}
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-slate2">{recalculada.aviso}</p>
                  <button
                    onClick={() => setRecalculada(null)}
                    className="mt-2 rounded-sm border border-line px-3 py-1.5 text-[12px] font-semibold text-slate2"
                  >
                    Li e confiro
                  </button>
                </div>
              )}

              {emitido && (
                <div className="mt-3 rounded-sm border border-verde bg-verdewash p-3">
                  <div className="text-[13px] font-semibold text-verde">
                    ✓ Laudo nº {String(emitido.numero).padStart(4, "0")} emitido
                    {emitido.abriu ? " — abriu em outra aba." : "."}
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-slate2">
                    {emitido.abriu
                      ? "Para o arquivo em PDF, use o botão Baixar PDF no topo da aba que abriu."
                      : "O navegador bloqueou a janela nova. Abra pelo botão abaixo — o laudo já está gravado."}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <a
                      href={`/doc/laudo/${emitido.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-sm bg-ink px-3 py-1.5 text-[12px] font-semibold text-white"
                    >
                      Abrir e baixar em PDF
                    </a>
                    {/**
                      * A ESTEIRA CONTINUA AQUI — e este é o único lugar em que
                      * ela pode continuar.
                      *
                      * O momento em que o laudo sai é o momento em que a empresa
                      * acabou. Antes, o caminho era "voltar à fila" e procurar a
                      * próxima com o olho, trinta vezes numa carteira de trinta.
                      * O botão troca a procura por um clique — e a próxima é a
                      * que a fila já elegeu, não a que sobrou mais perto.
                      */}
                    {proxima && aoIrParaProxima && (
                      <button
                        onClick={() => aoIrParaProxima(proxima.id, proxima.aba)}
                        className="rounded-sm border border-ink px-3 py-1.5 text-[12px] font-semibold text-ink"
                      >
                        Próxima: {proxima.nome} →
                      </button>
                    )}
                    <button
                      onClick={() => setEmitido(null)}
                      className="rounded-sm border border-line px-3 py-1.5 text-[12px] font-semibold text-slate2"
                    >
                      Fechar aviso
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-4 border-t border-linesoft pt-4">
                <div className="mb-2 text-[12.5px] font-semibold">Termo de ciência</div>

                {/**
                  * O SELETOR DOS TRÊS ESTADOS SAIU DAQUI em 05/08/2026.
                  *
                  * Ele estava nesta tela, e por isso o termo chegava ao cliente
                  * já dizendo "a empresa decide optar" — a empresa assinava
                  * embaixo de uma decisão que nunca declarou, e o papel voltava
                  * a não distinguir quem decidiu o quê. Agora quem escolhe é
                  * quem assina, e é isso que este aviso explica ao contador.
                  */}
                {a && (
                  <p className="mb-3 rounded-sm border border-line bg-surface2 p-3 text-[12px] leading-relaxed text-slate2">
                    O termo sai com a <b>recomendação</b> (
                    {ehOptar(a.saida) ? "optar pelo regime híbrido" : "permanecer no regime tradicional"}
                    ) e os pontos a observar. Quem escolhe entre seguir, decidir diferente ou não
                    decidir nesta janela é <b>quem assina</b>, na página de assinatura — e quem
                    diverge escreve ali o motivo, com as palavras dele. É o que faz o documento
                    provar de quem foi a decisão.
                  </p>
                )}

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

          {/**
            * O LUGAR DO LAUDO, ANTES DE ELE PODER EXISTIR.
            *
            * O bloco "Documentos da empresa" só nasce quando há análise salva —
            * e some inteiro quando não há. Quem chega para emitir o primeiro
            * laudo não vê botão desabilitado: não vê NADA, e procurar um botão
            * que não está na tela é a pior versão do problema, porque não deixa
            * nem o que perguntar.
            *
            * Esta linha ocupa o lugar dele e diz a condição. Custa três linhas
            * e responde a pergunta antes de ela virar chamado.
            */}
          {!a && (
            <div className="rounded-sm border border-dashed border-line bg-surface2 px-3.5 py-3">
              <div className="text-[12.5px] font-semibold text-slate2">
                O laudo aparece aqui depois que você salvar a análise.
              </div>
              <p className="mt-0.5 text-[11.5px] text-muted">
                Ele sai com a sua assinatura em cima das premissas que você salvar.
              </p>
            </div>
          )}

          {/* A PROPOSTA FICA FORA DO `a &&` de propósito: propor ANTES de
              analisar é o caminho mais comum de verdade — o contador fecha o
              serviço e só então levanta as premissas com o cliente. Exigir a
              análise para poder cobrar inverteria a ordem do trabalho. */}
          <PropostaEmpresa
            empresaId={e.id}
            razaoSocial={e.razao_social}
            cnpj={e.cnpj}
            faixa={e.faixa}
            rbt12={e.rbt12 != null ? Number(e.rbt12) : null}
            saida={(a?.saida as Saida | undefined) ?? null}
            propostas={d.propostas ?? []}
            aoMudar={() => mudou()}
          />
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
              regime={e.regime ?? null}
            />
          </Bloco>

          {/* O MONITOR DA REFORMA, NESTA EMPRESA.
              Fica no dossiê e não na aba de análise porque é HISTÓRICO, não
              trabalho da janela: é a lista que responde "o que aconteceu com
              este cliente desde que ele entrou" — e é ela que vira o relatório
              do fim do ano. */}
          <Bloco titulo="Apontamentos da Reforma">
            <ApontamentosEmpresa empresaId={e.id} />
            {/* O RELATÓRIO ANUAL SAI DAQUI (08/08/2026) — e é a peça de
                renovação. O acompanhamento bem feito não deixa rastro: a maior
                parte das normas termina em "analisado, não alcança esta
                empresa", e o cliente nunca fica sabendo que houve trabalho.
                Este link transforma o registro em papel com a marca do
                escritório, que é o que se leva para a reunião de honorário. */}
            <a
              href={`/doc/anuario/${e.id}`}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block rounded-sm border border-line px-3 py-2 text-[12.5px] font-semibold text-accentdeep"
            >
              Relatório do ano para o cliente →
            </a>
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
                    /* "não emitido" descreve o estado e esconde a causa. Quando
                       falta a análise, o que o contador precisa ler é o que
                       falta — não o que não existe. */
                    <p className="mt-0.5 font-mono text-[10.5px] text-muted">
                      {a ? "não emitido" : "falta a análise"}
                    </p>
                  )}
                </div>
                {/* O botão de emitir vivia só na aba Decisão. Quem chegava no
                    dossiê para conferir o que existe lia "não emitido" e tinha
                    de descobrir sozinho que a ação morava em outra aba. */}
                {!d.laudo && a && (
                  <button
                    onClick={emitirLaudo}
                    disabled={ocupado === "laudo"}
                    className="shrink-0 rounded-sm bg-ink px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
                  >
                    {ocupado === "laudo" ? "Emitindo…" : "Emitir laudo"}
                  </button>
                )}
                {/* SEM ANÁLISE, O BOTÃO CERTO É OUTRO. Oferecer "Emitir laudo"
                    aqui era prometer uma ação impossível: o clique caía no
                    `return` mudo. O passo que existe de verdade é a análise —
                    então é ele que o botão oferece. */}
                {!d.laudo && !a && (
                  <button
                    onClick={() => setAba("decisao")}
                    className="shrink-0 rounded-sm bg-ink px-3 py-1.5 text-[12px] font-semibold text-white"
                  >
                    Fazer a análise
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
                  <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
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
                    {/*
                      Assinado, o cliente tem direito à via dele. O link público
                      abre o mesmo documento — com hash e trilha — sem exigir
                      conta. Copiar aqui evita o pedido "me manda o termo" por
                      WhatsApp virar um print do painel.
                    */}
                    {assinado && d.termo.token && (
                      <button
                        onClick={() => void copiarLinkTermo(d.termo!.id, d.termo!.token!)}
                        title="Link da via do cliente — abre o termo assinado sem login"
                        className="rounded-sm border border-line px-3 py-1.5 text-[12px] font-semibold text-slate2"
                      >
                        {linkCopiado === d.termo.id ? "Copiado ✓" : "Copiar via do cliente"}
                      </button>
                    )}
                    <a
                      href={`/doc/termo/${d.termo.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-sm border border-line px-3 py-1.5 text-[12px] font-semibold text-slate2"
                    >
                      Abrir / PDF
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

          {/* ADMINISTRAÇÃO DA LINHA — no fim do dossiê, não no meio do trabalho.
              "Subi a carteira errada, e agora?" não tinha resposta nenhuma até
              aqui: a empresa errada ficava na fila para sempre, contando nos
              números. Ver components/ArquivarEmpresa. */}
          <div className="pt-1">
            <ArquivarEmpresa
              empresaId={e.id}
              razaoSocial={e.razao_social}
              arquivadaEm={e.arquivada_em ?? null}
              aoMudar={() => {
                mudou();
                router.refresh();
              }}
            />
          </div>
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
