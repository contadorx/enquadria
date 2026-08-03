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
    const idade = e.criado_em ? dias(e.criado_em) : 999;
    const assinante = e.status === "ativa" && (!e.vencimento || new Date(e.vencimento) >= new Date());
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
        monta(
          "pos_janela_revisao",
          e,
          `pos_janela_revisao:${e.id}:${f.fase}`,
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

      monta("cobranca_gerada", e, `cobranca_gerada:${e.assinatura_id}`, "cobrança emitida", vars);

      if (e.vencimento) {
        const atraso = dias(e.vencimento);
        if (atraso < 0) {
          const faltam = -atraso;
          if (faltam <= (ctx.config.aviso_pre_vencimento_dias ?? 3)) {
            monta("cobranca_pre_vencimento", e, `cobranca_pre_vencimento:${e.assinatura_id}`, `vence em ${faltam} dia(s)`, {
              ...vars,
              dias: faltam,
            });
          }
        } else {
          // escada: só o degrau MAIS ALTO já atingido
          const escada: [string, number][] = [
            ["cobranca_d1", regras["cobranca_d1"]?.dias ?? 1],
            ["cobranca_d5", regras["cobranca_d5"]?.dias ?? 5],
          ];
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

  return out.slice(0, ctx.config.limite_por_execucao ?? 200);
}

// ---------------------------------------------------------------------------
// CONTEXTO
// ---------------------------------------------------------------------------
export async function carregarContexto(db: any): Promise<Contexto> {
  const [{ data: escRaw }, { data: regrasRaw }, { data: cfgRaw }, { data: enviados }, { data: planoGratis }] =
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
    ultima_analise: e.ultima_analise,
  })) as EscritorioRegua[];

  return {
    escritorios,
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
  const hoje = new Date().toISOString().slice(0, 10);
  const { data } = await db
    .from("assinaturas")
    .select("id, tenant_id, vencimento")
    .eq("status", "ativa")
    .lt("vencimento", hoje);

  const ids = ((data as any[]) || []).map((a) => a.id as string);
  if (!ids.length || !opts.marcar) return { ids, marcadas: 0 };

  const { error } = await db
    .from("assinaturas")
    .update({ status: "vencida" })
    .in("id", ids);
  return { ids, marcadas: error ? 0 : ids.length };
}
