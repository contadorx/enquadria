/**
 * RÉGUAS DE E-MAIL PROATIVO — o que o Enquadria manda para o CONTADOR.
 *
 * Distinto do DIGEST (lib/digest.ts), que é o pulso mensal da carteira dele.
 * Aqui o alvo é o relacionamento comercial: ativar, converter, cobrar, reter.
 *
 * Três decisões que definem o arquivo:
 *
 *  1. O TEXTO VIVE NO BANCO (plataforma_reguas). Assunto e corpo são editáveis
 *     pela tela, sem deploy. O HTML é montado aqui, para a marca ficar igual.
 *
 *  2. TUDO É DEDUPLICADO por chave, com índice único em plataforma_envios.
 *     Rodar o cron duas vezes no mesmo dia não manda nada em dobro — a
 *     garantia é do banco, não da lógica.
 *
 *  3. O PLANEJAMENTO É PURO. `planejar()` não toca em rede nem em banco: recebe
 *     o estado e devolve o que sairia. É o que permite a tela mostrar os
 *     próximos disparos com exatidão em vez de prometer.
 *
 * Herdado do digest, a regra que define a casa: só se manda e-mail quando há
 * algo CONCRETO da carteira dele. Ruído queima o canal para o dia em que
 * houver algo importante a dizer.
 */

import { faseDaJanela } from "./janela";

const DIA = 86_400_000;

export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://app.enquadria.com.br");

export interface Regra {
  chave: string;
  nome: string;
  categoria: string;
  descricao: string | null;
  ativa: boolean;
  dias: number;
  assunto: string;
  corpo: string;
  ordem: number;
}

export interface EscritorioRegua {
  id: string;
  nome: string | null;
  email: string | null;
  criado_em: string | null;
  status: string;
  plano_id: string | null;
  plano_nome: string | null;
  plano_ciclo: string | null;
  valor_centavos: number | null;
  vencimento: string | null;
  assinatura_id: string | null;
  checkout_url: string | null;
  empresas: number;
  faixa_a: number;
  analises: number;
  laudos: number;
  /** termos gerados e assinados — a RPC já devolvia os dois, faltava declarar */
  termos?: number;
  assinados?: number;
  ultima_analise: string | null;
  /** marcado como conta de teste no painel (0044) */
  is_teste?: boolean;
  /** pediu para não receber e-mail comercial (0044) */
  emails_optout?: boolean;
  /** status do ESCRITÓRIO (cancelada/suspensa), não o da assinatura (0044) */
  status_conta?: string | null;
}

export interface Envio {
  regra: string;
  nome_regra: string;
  categoria: string;
  tenant_id: string;
  escritorio: string;
  para: string | null;
  assunto: string;
  corpo: string;
  chave_unica: string;
  motivo: string;
}

export interface Contexto {
  escritorios: EscritorioRegua[];
  /**
   * A FONTE FALHOU — e isso não pode virar "nada a fazer".
   *
   * Sem este campo, um erro ao ler a base de escritórios produzia lista vazia,
   * `planejar()` devolvia zero e o cron respondia
   * `{"planejados":0,"erros":[]}`. Zero e zero: exatamente o que um dia
   * tranquilo também devolve. Foi assim que o motor ficou dias sem mandar nada
   * enquanto a tela mostrava 16 na fila.
   */
  erro?: string;
  regras: Regra[];
  jaEnviados: Set<string>;
  limiteGratis: number;
  config: {
    ativas: boolean;
    limite_por_execucao: number;
    janela_dias: number;
    aviso_pre_vencimento_dias: number;
    dias_renovacao: number;
    janela: { abre: string; fecha: string };
  };
}

const dias = (de: string | Date, ate: string | Date = new Date()) =>
  Math.floor((new Date(ate).getTime() - new Date(de).getTime()) / DIA);

const brl = (centavos: number) =>
  ((Number(centavos) || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });

const dataBR = (d?: string | null) =>
  d ? new Date(d.length > 10 ? d : d + "T12:00:00").toLocaleDateString("pt-BR") : "—";

const primeiraPalavra = (n?: string | null) => (n || "").trim().split(/\s+/)[0] || "";

/** Substitui as variáveis do template. Variável desconhecida vira vazio. */
export function aplicar(texto: string, vars: Record<string, string | number | undefined>): string {
  return texto.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, k) => {
    const v = vars[String(k).toLowerCase()];
    return v === undefined || v === null ? "" : String(v);
  });
}

export const VARIAVEIS = [
  { k: "nome", d: "primeira palavra do nome do escritório" },
  { k: "escritorio", d: "nome completo do escritório" },
  { k: "plano", d: "nome do plano atual" },
  { k: "valor", d: "valor da cobrança, em R$" },
  { k: "vencimento", d: "data de vencimento, em dd/mm/aaaa" },
  { k: "dias", d: "o número de dias da regra (restantes, de atraso, parado)" },
  { k: "empresas", d: "empresas na carteira" },
  { k: "faixa_a", d: "empresas na faixa A (as que precisam decidir)" },
  { k: "laudos", d: "laudos emitidos" },
  { k: "restantes", d: "laudos gratuitos restantes" },
  { k: "link_pagamento", d: "link da cobrança no Asaas" },
  { k: "link_app", d: "endereço do app" },
  { k: "link_planos", d: "atalho para a tela de planos" },
  { k: "link_carteira", d: "atalho para a carteira" },
];

/**
 * O envelope da casa. O corpo é texto puro (o que você edita na tela) e vira
 * HTML aqui — parágrafos, links clicáveis e o rodapé de responsabilidade que
 * precisa estar em toda comunicação do produto.
 */
export function htmlRegua(corpo: string): string {
  const linkificar = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(
        /(https?:\/\/[^\s<]+)/g,
        '<a href="$1" style="color:#0E7490;text-decoration:underline">$1</a>'
      );

  const paragrafos = corpo
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${linkificar(p).replace(/\n/g, "<br>")}</p>`)
    .join("");

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:540px;margin:0 auto;color:#334155;font-size:15px;line-height:1.6">
    <div style="border-bottom:2px solid #0B1220;padding-bottom:12px;margin-bottom:22px">
      <strong style="font-size:18px;color:#0B1220;letter-spacing:-0.3px">ENQUADRIA<span style="color:#22D3EE">.</span></strong>
    </div>
    ${paragrafos}
    <p style="font-size:11px;color:#94A3B8;margin-top:26px;border-top:1px solid #E2E8F0;padding-top:14px">
      Os números do Enquadria são estimativa de cenário e não substituem a análise do caso concreto.
      A decisão e a responsabilidade técnica são do profissional que assina.
    </p>
  </div>`;
}

// ---------------------------------------------------------------------------
// PLANEJAMENTO — puro
// ---------------------------------------------------------------------------
const MARCOS_PROXIMA = "2027-03";

/**
 * Separa o que VAI SAIR do que está travado.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * O PROBLEMA QUE ISTO RESOLVE, nas palavras da denúncia: "e-mails proativos
 * que nunca saem de próximos disparos".
 *
 * `planejar` devolve tudo o que a regra manda enviar, com ou sem destinatário.
 * O executor topa com `!e.para`, conta em `semEmail` e segue — de propósito,
 * para tentar de novo quando o endereço aparecer. Só que quando o escritório
 * NÃO TEM NENHUM USUÁRIO, o endereço nunca aparece: ele volta para a fila em
 * toda execução, para sempre.
 *
 * Na base de hoje eram 6 de 16 — três escritórios órfãos de cadastros que
 * morreram no meio, cada um planejando dois e-mails eternos. A tela mostrava
 * 16 "próximos disparos" e o motor mandava 10. A diferença não tinha nome, e
 * por isso parecia que o motor estava quebrado.
 *
 * Com os dois baldes separados, a tela diz a verdade: "10 vão sair; 6 estão
 * travados porque o escritório não tem usuário nenhum" — que é problema de
 * dado, não de e-mail, e tem conserto próprio (ver a ação "Escritório sem
 * usuário" em lib/negocio.ts).
 * ───────────────────────────────────────────────────────────────────────────
 */
export function separarFila(plano: Envio[]): { sairao: Envio[]; travados: Envio[] } {
  return {
    sairao: plano.filter((e) => !!e.para),
    travados: plano.filter((e) => !e.para),
  };
}

export function planejar(ctx: Contexto): Envio[] {
  const regras: Record<string, Regra> = {};
  for (const r of ctx.regras) if (r.ativa) regras[r.chave] = r;

  const out: Envio[] = [];
  const limite = ctx.limiteGratis || 2;

  /**
   * A JANELA — a trava mais importante deste arquivo.
   *
   * Sem ela, na PRIMEIRA execução depois do deploy toda a base receberia
   * "Bem-vindo ao Enquadria" — inclusive quem se cadastrou há seis meses.
   * E-mail de ativação só vale para quem chegou há pouco.
   */
  /* a data de HOJE no calendário brasileiro: o app roda em UTC na Vercel e o
     contador está em São Paulo — depois das 21h o UTC já é amanhã */
  const hojeISO = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());

  const janelaAtivacao = ctx.config.janela_dias ?? 30;
  const fechaJanela = ctx.config.janela?.fecha || "2026-09-30";
  const diasParaFechar = -dias(fechaJanela);

  const monta = (
    chave: string,
    e: EscritorioRegua,
    dedupe: string,
    motivo: string,
    extra: Record<string, string | number | undefined> = {}
  ) => {
    const r = regras[chave];
    if (!r) return;                          // regra desligada ou inexistente
    if (ctx.jaEnviados.has(dedupe)) return;

    const vars = {
      nome: primeiraPalavra(e.nome) || e.nome || "",
      escritorio: e.nome || "",
      plano: e.plano_nome || "",
      empresas: e.empresas,
      faixa_a: e.faixa_a,
      laudos: e.laudos,
      restantes: Math.max(limite - e.laudos, 0),
      link_app: APP_URL,
      link_planos: `${APP_URL}/painel/planos`,
      link_carteira: `${APP_URL}/painel`,
      ...extra,
    };

    out.push({
      regra: chave,
      nome_regra: r.nome,
      categoria: r.categoria,
      tenant_id: e.id,
      escritorio: e.nome || "(sem nome)",
      para: e.email,
      assunto: aplicar(r.assunto, vars),
      corpo: aplicar(r.corpo, vars),
      chave_unica: dedupe,
      motivo,
    });
  };

  for (const e of ctx.escritorios) {
    /**
     * ═══════════════════════════════════════════════════════════════════════
     * QUEM NÃO RECEBE NADA, e por que cada um.
     *
     * Estas três portas não existiam. `tenants.is_teste` tem botão na tela de
     * Contas desde a 0030 e era respeitado no MRR — mas não aqui: marcar
     * "teste" não mudava nada, e as contas criadas testando o cadastro
     * recebiam boas-vindas e pitch de conversão como clientes de verdade.
     * Endereço de teste inexistente vira bounce, e bounce queima o domínio
     * para o dia em que houver algo importante a dizer.
     *
     * `emails_optout` era pior: a coluna existe desde a 0031 e ninguém lia.
     * Oferecer a saída e continuar mandando é pior do que nunca ter oferecido.
     * ═══════════════════════════════════════════════════════════════════════
     */
    if (e.is_teste) continue;
    if (e.emails_optout) continue;
    if (e.status_conta === "cancelada" || e.status_conta === "suspensa") continue;

    const idade = e.criado_em ? dias(e.criado_em) : 999;
    /**
     * `new Date("2026-08-10")` é meia-noite UTC — 09/08 às 21h em São Paulo.
     * Com a comparação antiga, o assinante em dia virava "gratuito" às 21h da
     * véspera do vencimento e, no dia da renovação, recebia o pitch de
     * degustação ("seus 2 laudos gratuitos acabaram") em vez do lembrete de
     * renovar. Comparar data com data resolve, sem fuso no meio.
     */
    const assinante = e.status === "ativa" && (!e.vencimento || e.vencimento >= hojeISO);
    const gratuito = !assinante;

    // ---------------------------------------------------------- ativação
    if (idade <= janelaAtivacao) {
      monta("ativacao_boas_vindas", e, `ativacao_boas_vindas:${e.id}`, "escritório criado");

      if (idade >= (regras["ativacao_sem_carteira"]?.dias ?? 1) && e.empresas === 0) {
        monta("ativacao_sem_carteira", e, `ativacao_sem_carteira:${e.id}`, `D+${idade} sem carteira importada`);
      }

      if (
        idade >= (regras["ativacao_triagem_parada"]?.dias ?? 2) &&
        e.faixa_a > 0 &&
        e.analises === 0
      ) {
        monta("ativacao_triagem_parada", e, `ativacao_triagem_parada:${e.id}`, `${e.faixa_a} na faixa A, nenhuma análise`);
      }

      if (idade >= (regras["ativacao_sem_laudo"]?.dias ?? 4) && e.analises > 0 && e.laudos === 0) {
        monta("ativacao_sem_laudo", e, `ativacao_sem_laudo:${e.id}`, `${e.analises} análise(s), nenhum laudo`);
      }
    }

    /**
     * LAUDO SEM TERMO — fora da janela de idade, de propósito.
     *
     * Este não é gatilho de calendário, é de FATO DE USO: quem emitiu laudo e
     * não gerou termo está no mesmo ponto tenha a conta uma semana ou um ano.
     *
     * Por que ele importa mais do que parece: laudo é o trabalho do contador e
     * fica no computador dele; termo é o que chega ao cliente final. Sem termo,
     * o cliente não vê nada do que foi feito — e é a percepção do cliente que
     * sustenta o honorário, que por sua vez sustenta a renovação aqui.
     *
     * A chave de dedupe leva o número de laudos: se ele emitir mais laudos
     * depois e continuar sem termo, é uma situação nova e vale um toque novo.
     * Sem isso, o e-mail sairia uma vez na vida e a lacuna cresceria calada.
     */
    const termos = e.termos ?? 0;
    if (e.laudos > 0 && termos === 0) {
      monta(
        "uso_laudo_sem_termo",
        e,
        `uso_laudo_sem_termo:${e.id}:${e.laudos}`,
        `${e.laudos} laudo(s), nenhum termo`
      );
    }

    // --------------------------------------------------------- conversão
    // Estas NÃO têm janela de idade: são disparadas por um fato do uso, não
    // pelo calendário. Quem bate no limite hoje é lead quente, tenha a conta
    // um dia ou um ano.
    //
    // Exceção: quem já tem cobrança em aberto JÁ DECIDIU. Mandar "assine o
    // PRO" para alguém que está com o boleto na mão é ruído — e ruído que faz
    // parecer que o sistema não viu o que a pessoa fez.
    const comprando = e.status === "pendente" && !!e.assinatura_id;

    if (gratuito && !comprando && e.laudos > 0) {
      if (e.laudos >= limite) {
        monta("conversao_limite", e, `conversao_limite:${e.id}`, `usou ${e.laudos} de ${limite} laudos`);
      } else {
        monta("conversao_um_laudo", e, `conversao_um_laudo:${e.id}`, `usou ${e.laudos} de ${limite} laudos`);
      }
    }

    if (gratuito && !comprando && e.laudos < limite && e.faixa_a >= (regras["conversao_carteira_grande"]?.dias ?? 10)) {
      monta("conversao_carteira_grande", e, `conversao_carteira_grande:${e.id}`, `${e.faixa_a} empresas na faixa A`);
    }

    // ------------------------------------------------------------- janela
    // Só faz sentido para quem tem carteira: avisar do prazo quem nunca
    // importou nada é ruído.
    if (e.empresas > 0) {
      if (diasParaFechar > 0) {
        const alvo30 = regras["janela_30"]?.dias ?? 30;
        const alvo7 = regras["janela_7"]?.dias ?? 7;
        if (diasParaFechar <= alvo7) {
          monta("janela_7", e, `janela_7:${e.id}:${fechaJanela}`, `faltam ${diasParaFechar} dias`, {
            dias: diasParaFechar,
          });
        } else if (diasParaFechar <= alvo30) {
          monta("janela_30", e, `janela_30:${e.id}:${fechaJanela}`, `faltam ${diasParaFechar} dias`, {
            dias: diasParaFechar,
          });
        }
      } else if (-diasParaFechar >= (regras["janela_fechou"]?.dias ?? 1)) {
        monta("janela_fechou", e, `janela_fechou:${e.id}:${fechaJanela}`, "janela encerrada");
      }

      /**
       * O PÓS-JANELA — a parte que quase ninguém trabalha.
       *
       * Depois de 30/09 o produto parava de falar. Só que a alíquota é fixada
       * até 31/10 e o cancelamento vai até 30/11: quem emitiu laudo em setembro
       * fez com ESTIMATIVA, e cada um desses laudos vira uma revisão cobrável
       * quando o número real sair. É a segunda onda de honorário da mesma
       * carteira — e o motivo de o plano anual valer a pena.
       *
       * Condição: ter emitido laudo. Sem laudo não há o que revisar, e o e-mail
       * viraria propaganda de uma coisa que a pessoa não fez.
       */
      const f = faseDaJanela();
      if (e.laudos > 0 && (f.fase === "aliquota" || f.fase === "cancelamento")) {
        /**
         * UM TOQUE, NÃO DOIS.
         *
         * A chave incluía a FASE, e a regra cobre duas fases do calendário com
         * o mesmo texto: saía em outubro (`aliquota`) e de novo em novembro
         * (`cancelamento`), com assunto e corpo idênticos. A descrição da
         * própria regra diz "de 01/10 a 30/11" — um período, uma mensagem.
         */
        monta(
          "pos_janela_revisao",
          e,
          `pos_janela_revisao:${e.id}`,
          `fase ${f.fase} com ${e.laudos} laudo(s) emitido(s)`,
          { dias: f.dias ?? 0 }
        );
      }

      // a janela seguinte: a mesma carteira volta à mesa, agora com histórico
      if (f.fase === "efeito" && e.empresas > 0) {
        monta(
          "proxima_janela",
          e,
          `proxima_janela:${e.id}:${MARCOS_PROXIMA}`,
          "regime em vigor, próxima janela à frente",
          { dias: f.dias ?? 0 }
        );
      }
    }

    // ----------------------------------------------------------- cobrança
    if (e.assinatura_id && e.checkout_url && e.status === "pendente") {
      const vars = {
        valor: brl(Number(e.valor_centavos || 0)),
        vencimento: dataBR(e.vencimento),
        link_pagamento: e.checkout_url,
      };

      /**
       * ═════════════════════════════════════════════════════════════════════
       * `cobranca_gerada` SÓ PARA COBRANÇA QUE NÃO FOI AVISADA.
       *
       * A tela de Planos já manda o link na hora da contratação
       * (`htmlCobrancaGerada`, em app/api/checkout/route.ts), e esse envio NÃO
       * passa por `plataforma_envios` — a trava não o enxerga. Resultado: quem
       * assinava às 10h recebia o link às 10h e, na execução seguinte,
       * recebia de novo com outro assunto. Dois e-mails de cobrança para uma
       * cobrança só.
       *
       * O checkout agora reserva a chave `cobranca_gerada:<assinatura>` ao
       * enviar, então esta linha vira redundante quando o e-mail já saiu por
       * lá — e continua valendo para a cobrança criada pelo painel, que é o
       * caso em que nada foi avisado.
       * ═════════════════════════════════════════════════════════════════════
       */
      const antesDaGerada = out.length;
      monta("cobranca_gerada", e, `cobranca_gerada:${e.assinatura_id}`, "cobrança emitida", vars);
      /* o e-mail da cobrança está saindo AGORA, nesta mesma rodada? */
      const geradaSaiAgora = out.length > antesDaGerada;

      /**
       * ═════════════════════════════════════════════════════════════════════
       * A ESCADA DE COBRANÇA NUNCA RODAVA PARA QUEM ASSINA SOZINHO.
       *
       * O bloco inteiro estava atrás de `if (e.vencimento)`, e
       * `assinaturas.vencimento` só era gravado JUNTO com `status: "ativa"` —
       * ou seja, na confirmação do pagamento. Enquanto a assinatura estava
       * `pendente` (exatamente quem precisa ser cobrado), o vencimento era
       * nulo e nada saía; quando o vencimento existia, o status já não era
       * pendente e a condição de fora barrava.
       *
       * Nenhum aviso pré-vencimento, nenhum D+1, D+5, D+10. A escada só
       * funcionava para cobrança criada no painel, que grava o vencimento à
       * mão. Verificado no banco: toda assinatura pendente tem vencimento
       * nulo.
       *
       * A correção é o checkout gravar o vencimento da cobrança (é dado que o
       * Asaas devolve na hora); esta linha passa a ser o que sempre deveria
       * ter sido: "se eu sei quando vence, eu cobro".
       * ═════════════════════════════════════════════════════════════════════
       */
      if (e.vencimento) {
        const atraso = dias(e.vencimento);
        if (atraso < 0) {
          const faltam = -atraso;
          /**
           * NÃO NA MESMA RODADA EM QUE A COBRANÇA NASCEU.
           *
           * A cobrança é criada com vencimento em 3 dias e o aviso
           * pré-vencimento também vale 3 — então `faltam <= 3` era verdade já
           * na primeira execução, e chegavam em sequência "Sua cobrança
           * Enquadria — R$ 47,00" e "Sua cobrança vence em 3 dias", sobre a
           * mesma fatura recém-criada. Aviso de vencimento pressupõe que já
           * houve tempo de pagar.
           */
          if (!geradaSaiAgora && faltam <= (ctx.config.aviso_pre_vencimento_dias ?? 3)) {
            monta("cobranca_pre_vencimento", e, `cobranca_pre_vencimento:${e.assinatura_id}`, `vence em ${faltam} dia(s)`, {
              ...vars,
              dias: faltam,
            });
          }
        } else {
          /**
           * Escada: só o degrau MAIS ALTO já atingido.
           *
           * `cobranca_no_dia` (degrau 0) e `cobranca_d10` entraram em 03/08.
           * O primeiro fechava um buraco real: com a escada começando em D+1,
           * quem vencia HOJE não recebia nada — o dia do vencimento era
           * justamente o único silencioso.
           *
           * O d10 é o aviso de suspensão. Ele fecha a régua: sem um último
           * degrau que diga o que vai acontecer, o corte de acesso chega sem
           * ter sido anunciado.
           */
          /**
           * SÓ DEGRAU LIGADO ENTRA NA ESCADA.
           *
           * A lista usava o valor PADRÃO (`?? 10`) mesmo para regra desativada
           * no banco, e depois `monta` saía calado porque `regras[chave]` não
           * existia. Efeito: desligar "Aviso de suspensão" para não ameaçar
           * suspensão fazia o inadimplente parar de receber QUALQUER cobrança
           * a partir do D+10 — o degrau desligado virava o alvo e bloqueava os
           * de baixo, que já tinham sido enviados.
           *
           * Filtrando pelas regras ativas, desligar um degrau faz o anterior
           * voltar a ser o mais alto, que é o comportamento que alguém espera
           * ao desligar um degrau.
           */
          const escada = ([
            ["cobranca_no_dia", 0],
            ["cobranca_d1", 1],
            ["cobranca_d5", 5],
            ["cobranca_d10", 10],
          ] as [string, number][])
            .filter(([chave]) => !!regras[chave])
            .map(([chave, padrao]) => [chave, regras[chave]?.dias ?? padrao] as [string, number])
            .sort((x, y) => x[1] - y[1]);
          const atingidos = escada.filter(([, d]) => atraso >= d);
          const alvo = atingidos.length ? atingidos[atingidos.length - 1] : null;
          if (alvo) {
            monta(alvo[0], e, `${alvo[0]}:${e.assinatura_id}`, `${atraso} dia(s) de atraso`, {
              ...vars,
              dias: atraso,
            });
          }
        }
      }
    }

    // --------------------------------------------------------- renovação
    if (assinante && e.vencimento && e.assinatura_id) {
      const faltam = -dias(e.vencimento);
      const alvo = regras["cobranca_renovacao"]?.dias ?? ctx.config.dias_renovacao ?? 10;
      if (faltam >= 0 && faltam <= alvo) {
        monta(
          "cobranca_renovacao",
          e,
          `cobranca_renovacao:${e.assinatura_id}:${e.vencimento}`,
          `vence em ${faltam} dia(s)`,
          { dias: faltam, vencimento: dataBR(e.vencimento), valor: brl(Number(e.valor_centavos || 0)) }
        );
      }
    }

    // ---------------------------------------------------------- retenção
    if (assinante) {
      const parado = e.ultima_analise ? dias(e.ultima_analise) : idade;
      const alvo = regras["retencao_parado"]?.dias ?? 21;
      if (parado >= alvo && e.faixa_a > 0) {
        // no máximo uma vez por mês por escritório
        const mes = new Date().toISOString().slice(0, 7);
        monta("retencao_parado", e, `retencao_parado:${e.id}:${mes}`, `sem análise há ${parado} dias`, {
          dias: parado,
        });
      }
    }

    // Venceu e não renovou. Aceita tanto o status ainda "ativa" (ninguém marcou)
    // quanto "vencida"/"cancelada" — o motor não pode depender de alguém ter
    // rodado a marcação antes.
    const naoRenovou =
      !assinante &&
      !!e.vencimento &&
      new Date(e.vencimento) < new Date() &&
      ["ativa", "vencida", "cancelada"].includes(e.status);
    if (naoRenovou) {
      const desde = dias(e.vencimento!);
      if (desde >= (regras["retencao_cancelou"]?.dias ?? 2) && desde <= janelaAtivacao) {
        monta("retencao_cancelou", e, `retencao_cancelou:${e.id}:${e.vencimento}`, `venceu há ${desde} dia(s)`);
      }
    }
  }

  /**
   * O LIMITE CORTA QUEM VAI SAIR, não quem está travado.
   *
   * O `slice` vinha antes de separar os sem destinatário: escritório órfão
   * (que nunca grava trava e volta em toda execução) ocupava cota para sempre,
   * e como a lista vem ordenada por criação, o corte caía sempre nos mesmos —
   * os mais antigos nunca recebiam. Com limite 1 e dois escritórios,
   * reproduzia-se o absurdo: a única vaga ia para um envio sem endereço.
   *
   * Os travados continuam na lista (a tela os mostra e explica), só não gastam
   * a cota de quem pode receber.
   */
  const teto = ctx.config.limite_por_execucao ?? 200;
  const podem = out.filter((x) => !!x.para).slice(0, teto);
  return [...podem, ...out.filter((x) => !x.para)];
}

// ---------------------------------------------------------------------------
// CONTEXTO
// ---------------------------------------------------------------------------
export async function carregarContexto(db: any): Promise<Contexto> {
  const [{ data: escRaw, error: escErro }, { data: regrasRaw }, { data: cfgRaw, error: cfgErro }, { data: enviados }, { data: planoGratis }] =
    await Promise.all([
      db.rpc("negocio_escritorios"),
      db.from("plataforma_reguas").select("*").order("ordem", { ascending: true }),
      db.from("plataforma_config").select("chave, valor"),
      db.from("plataforma_envios").select("chave_unica").limit(20000),
      // schema-ok: planos.limite_analises é editado em components/NegocioUI.tsx (painel de planos)
      db.from("planos").select("limite_analises").eq("id", "gratis").maybeSingle(),
    ]);

  const cfg: Record<string, any> = {};
  for (const c of ((cfgRaw as any[]) || [])) cfg[c.chave] = c.valor;

  /**
   * O ERRO DA RPC, que era descartado — a causa raiz do motor mudo.
   *
   * `negocio_escritorios()` é SECURITY DEFINER e barrava a service role: para
   * ela `auth.uid()` é NULL, `e_superadmin()` devolve false, e a função levanta
   * "acesso restrito ao dono da plataforma". O painel funcionava (chama pela
   * sessão do superadmin); o CRON não — a mesma função, dois resultados.
   *
   * O `error` vinha e ninguém lia, porque a linha desestruturava só o `data`.
   * A migration 0042 conserta a permissão; esta linha garante que, se algum dia
   * a leitura falhar de novo, isso apareça em vez de virar fila vazia.
   */
  const erro = escErro
    ? `não consegui ler os escritórios: ${escErro.message ?? escErro}`
    : cfgErro
      ? /**
         * A CHAVE-MESTRA NÃO PODE FALHAR ABERTA.
         *
         * `ativas` vinha de `cfg.reguas?.ativas !== false`. Com a leitura da
         * config falhando, `cfg` fica vazio e a expressão devolve TRUE: o
         * interruptor que o dono usou para desligar os e-mails depois de um
         * envio errado voltaria a ligar sozinho, junto com todos os outros
         * defaults do código. Erro na configuração tem que PARAR o motor.
         */
        `não consegui ler a configuração das réguas: ${cfgErro.message ?? cfgErro}`
      : undefined;

  const escritorios = (((escRaw as any[]) || []) as any[]).map((e) => ({
    id: e.id,
    nome: e.nome,
    email: e.email,
    criado_em: e.criado_em,
    status: e.status,
    plano_id: e.plano_id,
    plano_nome: e.plano_nome,
    plano_ciclo: e.plano_ciclo,
    valor_centavos: e.valor_centavos == null ? null : Number(e.valor_centavos),
    vencimento: e.vencimento,
    assinatura_id: e.assinatura_id,
    checkout_url: e.checkout_url,
    empresas: Number(e.empresas || 0),
    faixa_a: Number(e.faixa_a || 0),
    analises: Number(e.analises || 0),
    laudos: Number(e.laudos || 0),
    /**
     * `termos` ERA ESQUECIDO AQUI — e este esquecimento tinha nome e vítima.
     *
     * A RPC devolvia a contagem; este map montava o objeto campo a campo e não
     * copiava. `e.termos` ficava `undefined`, a régua "laudo emitido sem termo"
     * lia 0 e disparava para quem tinha TODOS os termos assinados. Como a
     * chave de dedupe inclui a contagem de laudos, ele recebia de novo a cada
     * laudo novo: o cliente mais engajado da base levando, repetidamente, uma
     * cobrança para fazer o que já fazia.
     *
     * O teste da suíte passava porque monta o contexto na mão e nunca exercita
     * este map — a lição é que copiar campo a campo é uma lista que envelhece.
     */
    termos: Number(e.termos || 0),
    assinados: Number(e.assinados || 0),
    is_teste: e.is_teste === true,
    emails_optout: e.emails_optout === true,
    status_conta: e.status_conta ?? null,
    ultima_analise: e.ultima_analise,
  })) as EscritorioRegua[];

  return {
    escritorios,
    erro,
    regras: ((regrasRaw as any[]) || []) as Regra[],
    jaEnviados: new Set(((enviados as any[]) || []).map((x) => x.chave_unica)),
    limiteGratis: Number((planoGratis as any)?.limite_analises ?? 2),
    config: {
      ativas: cfg.reguas?.ativas !== false,
      limite_por_execucao: Number(cfg.reguas?.limite_por_execucao ?? 200),
      janela_dias: Number(cfg.reguas?.janela_dias ?? 30),
      aviso_pre_vencimento_dias: Number(cfg.cobranca?.aviso_pre_vencimento_dias ?? 3),
      dias_renovacao: Number(cfg.cobranca?.dias_renovacao ?? 10),
      janela: { abre: cfg.janela?.abre || "2026-09-01", fecha: cfg.janela?.fecha || "2026-09-30" },
    },
  };
}

// ---------------------------------------------------------------------------
// EXECUÇÃO
// ---------------------------------------------------------------------------
export interface ResultadoRegua {
  planejados: number;
  enviados: number;
  semEmail: number;
  erros: string[];
  lista: Envio[];
}

export async function executarReguas(
  db: any,
  opts: { simular?: boolean } = {}
): Promise<ResultadoRegua> {
  const ctx = await carregarContexto(db);

  /* fonte quebrada NÃO é "nada a enviar": parar aqui, com o motivo, evita o
     relatório tranquilizador de 0 planejados / 0 erros */
  if (ctx.erro) {
    return { planejados: 0, enviados: 0, semEmail: 0, erros: [ctx.erro], lista: [] };
  }

  if (!ctx.config.ativas) {
    return { planejados: 0, enviados: 0, semEmail: 0, erros: ["réguas desligadas em Negócio → E-mails"], lista: [] };
  }

  const plano = planejar(ctx);
  if (opts.simular) {
    return {
      planejados: plano.length,
      enviados: 0,
      semEmail: plano.filter((p) => !p.para).length,
      erros: [],
      lista: plano,
    };
  }

  const { enviarEmail } = await import("@/lib/email");
  const erros: string[] = [];
  let enviados = 0;
  let semEmail = 0;

  for (const e of plano) {
    if (!e.para) {
      semEmail++;
      continue; // sem destinatário: NÃO grava a trava, para tentar quando houver e-mail
    }

    // Reserva a chave ANTES de enviar. Se duas execuções correrem juntas, o
    // índice único derruba a segunda — e ninguém recebe duas vezes.
    const { error: trava } = await db.from("plataforma_envios").insert({
      tenant_id: e.tenant_id,
      regra: e.regra,
      chave_unica: e.chave_unica,
      para: e.para,
      assunto: e.assunto,
      status: "enviado",
    });
    if (trava) continue; // já existe = já foi

    const r = await enviarEmail({
      para: e.para,
      nome: e.escritorio,
      assunto: e.assunto,
      html: htmlRegua(e.corpo),
    });

    if (!r.enviado) {
      erros.push(`${e.regra}/${e.escritorio}: ${r.motivo || "falha"}`);
      // marca como erro MAS mantém a trava: endereço quebrado martelado todo
      // dia queima domínio. Reenviar é decisão manual, pela tela.
      await db
        .from("plataforma_envios")
        .update({ status: "erro", erro: r.motivo || "falha" })
        .eq("chave_unica", e.chave_unica);
      continue;
    }
    enviados++;
  }

  return { planejados: plano.length, enviados, semEmail, erros, lista: plano };
}

/**
 * Assinaturas que venceram e ninguém marcou.
 *
 * Por padrão isto é SÓ LEITURA: devolve a lista e não muda nada. Trocar o
 * status de `ativa` para `vencida` tira o acesso do escritório, e essa é uma
 * decisão de negócio — não de cron. Ligue `bloquear_automatico` em
 * plataforma_config → cobranca se quiser que aconteça sozinho.
 */
export async function vencidasPendentes(
  db: any,
  opts: { marcar?: boolean } = {}
): Promise<{ ids: string[]; marcadas: number }> {
  /**
   * O DIA É O DO BRASIL. `toISOString()` é UTC: das 21h às 23h59 de Brasília o
   * UTC já virou, e a assinatura que vence HOJE entrava na lista de vencidas.
   * Com `bloquear_automatico` ligado, o cron das 21h cortava o acesso três
   * horas antes do fim do dia pelo qual o cliente pagou.
   */
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());

  const { data, error: eLer } = await db
    .from("assinaturas")
    .select("id, tenant_id, vencimento")
    .eq("status", "ativa")
    .lt("vencimento", hoje);

  /* leitura falhando devolvia lista vazia, e o cron respondia
     `vencidas_encontradas: 0` — igualzinho a um dia sem nenhuma vencida */
  if (eLer) throw new Error(`não consegui ler as assinaturas vencidas: ${eLer.message}`);

  const ids = ((data as any[]) || []).map((a) => a.id as string);
  if (!ids.length || !opts.marcar) return { ids, marcadas: 0 };

  const { error } = await db
    .from("assinaturas")
    .update({ status: "vencida" })
    .in("id", ids);
  return { ids, marcadas: error ? 0 : ids.length };
}

/**
 * ESTAMOS EM HORÁRIO DE ENVIO?
 *
 * O cron passa a rodar de hora em hora para diluir os disparos — um lote
 * concentrado prejudica reputação de domínio e chega todo de uma vez na caixa
 * de quem já não estava esperando.
 *
 * Diluir só faz sentido dentro do horário em que a pessoa lê. E-mail de
 * cobrança que chega 3h da manhã é lido às 9h junto com todos os outros: o
 * efeito da diluição some, e sobra o incômodo.
 *
 * A hora entra como argumento (não `new Date()` por dentro) para poder ser
 * testada sem esperar a hora chegar — mesma regra do resto do projeto.
 *
 * FUSO: o Vercel roda o cron em UTC. O Brasil está em UTC-3, então 9h-18h no
 * horário de Brasília é 12h-21h UTC. Fazer essa conta aqui, num lugar só, é
 * melhor que espalhá-la pelo cron e pela expectativa de quem lê o log.
 */
export function emHorarioDeEnvio(agoraUTC: Date, inicioBR = 9, fimBR = 18): boolean {
  const horaBR = (agoraUTC.getUTCHours() + 24 - 3) % 24;
  const diaBR = new Date(agoraUTC.getTime() - 3 * 3600_000).getUTCDay();
  // 0 = domingo, 6 = sábado. E-mail de cobrança no fim de semana é ruído: a
  // pessoa não vai resolver boleto no sábado, e a mensagem perde o efeito.
  if (diaBR === 0 || diaBR === 6) return false;
  return horaBR >= inicioBR && horaBR < fimBR;
}
