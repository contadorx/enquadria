import { createClient } from "@/lib/supabase-server";
import { caixaDe, mrrDe, ativo, type Caixa, type Escritorio, type Plano, type Recurso, type Acao, type Negocio } from "./negocio-calc";

/**
 * O NEGÓCIO — o Enquadria visto por quem vive dele.
 *
 * Regra deste arquivo: nenhum número decorativo. Cada métrica existe porque
 * leva a uma ação. Se não leva, não entra.
 *
 * Fonte: RPC negocio_escritorios() (SECURITY DEFINER, checa superadmin no
 * servidor) + planos + faturas + plataforma_mrr. Funciona SEM a
 * SUPABASE_SERVICE_ROLE_KEY: o painel não pode morrer por falta de variável.
 *
 * As CONTAS moram em `lib/negocio-calc.ts`, que não importa banco nenhum e
 * por isso pode ser testado. Este arquivo reexporta tudo de lá.
 */

export * from "./negocio-calc";

const DIA = 86_400_000;
const dias = (de: string | Date, ate: string | Date = new Date()) =>
  Math.floor((new Date(ate).getTime() - new Date(de).getTime()) / DIA);

export async function carregarNegocio(): Promise<Negocio> {
  const vazio: Negocio = {
    mrr: 0, arr: 0, ticket: 0, mrrEmRisco: 0,
    assinantes: 0, gratuitos: 0, vencendo: 0, vencidos: 0, novosNoMes: 0,
    provaram: 0, conversao: 0,
    funil: [], porPlano: [],
    uso: { empresas: 0, analises: 0, laudos: 0, termos: 0, assinados: 0 },
    historico: [],
    avisos: [],
    caixa: { recebido_mes: 0, recebido_total: 0, aberto: 0, vencido: 0, vencidas: 0, pagas: 0 },
    janela: { abre: "2026-09-01", fecha: "2026-09-30", dias: 0, pct: 0 },
    acoes: [], meta: { assinantes: 0, mrr: 0 },
    escritorios: [], planos: [], recursos: [], config: {},
  };

  const supabase = createClient();

  const { data: raw, error } = await supabase.rpc("negocio_escritorios");
  if (error) {
    const faltaFuncao = /does not exist|não existe|schema cache/i.test(error.message);
    return {
      ...vazio,
      erro: faltaFuncao
        ? "A função negocio_escritorios() ainda não existe no banco. Rode a migration 0020_negocio.sql no Supabase."
        : error.message,
    };
  }

  const escritorios = (((raw as any[]) || []) as any[]).map((e) => ({
    ...e,
    valor_centavos: e.valor_centavos == null ? null : Number(e.valor_centavos),
    usuarios: Number(e.usuarios || 0),
    empresas: Number(e.empresas || 0),
    faixa_a: Number(e.faixa_a || 0),
    analises: Number(e.analises || 0),
    laudos: Number(e.laudos || 0),
    termos: Number(e.termos || 0),
    assinados: Number(e.assinados || 0),
    /* os campos novos da 0047 — numéricos do Postgres chegam como string em
       `numeric`, e um `numeric` não convertido vira "297" na conta do MRR */
    pago_valor_centavos: e.pago_valor_centavos == null ? null : Number(e.pago_valor_centavos),
    pagas: Number(e.pagas || 0),
    fatura_aberta_centavos: e.fatura_aberta_centavos == null ? null : Number(e.fatura_aberta_centavos),
    t_valor_mensal: e.t_valor_mensal == null ? null : Number(e.t_valor_mensal),
    t_ultimo_pagamento_valor: e.t_ultimo_pagamento_valor == null ? null : Number(e.t_ultimo_pagamento_valor),
  })) as Escritorio[];

  const [
    { data: planosRaw, error: ePlanos },
    { data: recursosRaw },
    { data: histRaw },
    { data: cfgRaw },
    { data: faturasRaw, error: eFaturas },
  ] =
    await Promise.all([
      supabase.from("planos").select("*").order("ordem", { ascending: true }),
      supabase.from("plataforma_recursos").select("*").order("ordem", { ascending: true }),
      supabase.from("plataforma_mrr").select("*").order("mes", { ascending: true }).limit(24),
      supabase.from("plataforma_config").select("chave, valor"),
      /* o extrato: o painel falava de MRR (promessa) e não tinha uma linha
         sobre dinheiro que entrou. Ver `caixaDe`. */
      supabase.from("faturas").select("status, valor_centavos, vencimento, pago_em"),
    ]);

  const planos = (((planosRaw as any[]) || []) as any[]).map((p) => ({
    ...p,
    preco_centavos: Number(p.preco_centavos || 0),
    recursos: Array.isArray(p.recursos) ? p.recursos : [],
  })) as Plano[];

  const recursos = ((recursosRaw as any[]) || []) as Recurso[];

  const config: Record<string, any> = {};
  for (const c of ((cfgRaw as any[]) || [])) config[c.chave] = c.valor;

  /**
   * O CAIXA PRECISA DIZER QUANDO NÃO SABE.
   *
   * O erro destas consultas era descartado. Se o SELECT em `faturas` falhasse,
   * o bloco "Caixa — o que entrou de verdade" mostrava R$ 0 recebido, R$ 0
   * total, 0 cobranças pagas — com o subtítulo "fonte: central de faturas" e
   * nenhum aviso. Zero por falha é indistinguível de zero por não ter entrado
   * dinheiro, e é a pior forma de errar num painel de receita.
   */
  const avisos: string[] = [];
  if (eFaturas) avisos.push(`o caixa não pôde ser lido: ${eFaturas.message}`);
  if (ePlanos) avisos.push(`a lista de planos não pôde ser lida: ${ePlanos.message}`);

  const caixa = caixaDe(
    ((faturasRaw as any[]) || []) as Parameters<typeof caixaDe>[0],
    new Date()
  );

  // ------------------------------------------------------------------ receita
  const ativos = escritorios.filter(ativo);
  const mrr = ativos.reduce((s, e) => s + mrrDe(e, planos), 0);
  const gratuitos = escritorios.filter((e) => !ativo(e));

  const hoje = new Date();
  const vencendo = ativos.filter(
    (e) => e.vencimento && dias(hoje, e.vencimento) <= 10 && dias(hoje, e.vencimento) >= 0
  );
  const vencidos = escritorios.filter(
    (e) => e.status === "ativa" && e.vencimento && new Date(e.vencimento) < hoje
  );

  // Parado = assinante ativo sem análise nova há 21 dias. É churn que ainda não
  // foi assinado — e no Enquadria o sinal é a ANÁLISE, não o login.
  const parados = ativos.filter((e) => {
    const d = e.ultima_analise ? dias(e.ultima_analise) : e.criado_em ? dias(e.criado_em) : 0;
    return d >= 21;
  });
  /**
   * SEM DUPLICAR — os dois conjuntos se sobrepõem, e no pior caso.
   *
   * Assinante que vence em 5 dias E está sem análise há 30 é o perfil de churn
   * mais típico que existe: ele entra nas duas listas, e a soma contava a
   * mesma assinatura duas vezes. O card mostrava R$ 94 para uma assinatura de
   * R$ 47 — e com poucos assinantes o "em risco" podia passar do MRR total,
   * que é um número impossível na cara de quem olha.
   */
  const emRisco = new Map<string, Escritorio>();
  for (const e of [...vencendo, ...parados]) emRisco.set(e.id, e);
  const mrrEmRisco = Array.from(emRisco.values()).reduce((s, e) => s + mrrDe(e, planos), 0);

  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);
  const novosNoMes = escritorios.filter(
    (e) => e.criado_em && new Date(e.criado_em) >= inicioMes
  ).length;

  // ------------------------------------------------------------------- funil
  // O caminho real do produto: importar → triar → analisar → emitir → assinar.
  const total = escritorios.length || 1;
  const comCarteira = escritorios.filter((e) => e.empresas > 0).length;
  const comAnalise = escritorios.filter((e) => e.analises > 0).length;
  const comLaudo = escritorios.filter((e) => e.laudos > 0).length;
  const funil = [
    { etapa: "Criaram conta", n: escritorios.length, pct: 100, nota: "escritórios cadastrados" },
    { etapa: "Importaram a carteira", n: comCarteira, pct: Math.round((comCarteira / total) * 100), nota: "o passo que trava a maioria" },
    { etapa: "Analisaram alguma empresa", n: comAnalise, pct: Math.round((comAnalise / total) * 100), nota: "aqui o produto começa a funcionar" },
    { etapa: "Emitiram laudo", n: comLaudo, pct: Math.round((comLaudo / total) * 100), nota: "provaram o entregável cobrável" },
    { etapa: "Assinaram", n: ativos.length, pct: Math.round((ativos.length / total) * 100), nota: "assinatura ativa" },
  ];

  // A conversão que importa não é cadastro→pago: é PROVOU→pago. Quem emitiu um
  // laudo viu o produto inteiro; se não assinou depois disso, o problema é
  // preço ou valor percebido, não onboarding.
  /**
   * PROVOU → PAGOU, e o numerador tem que ser subconjunto do denominador.
   *
   * Era `ativos / comLaudo`, e assinar não exige ter emitido laudo: com 5
   * assinantes e 3 escritórios que emitiram laudo, o funil imprimia "3 já
   * emitiram laudo · 167% desses assinam". Percentual acima de 100 num funil
   * não é arredondamento: é a conta olhando para conjuntos diferentes.
   *
   * Agora conta quem emitiu laudo E assinou.
   */
  const idsAtivos = new Set(ativos.map((e) => e.id));
  const provaramEPagaram = escritorios.filter((e) => e.laudos > 0 && idsAtivos.has(e.id)).length;
  const conversao = comLaudo ? Math.round((provaramEPagaram / comLaudo) * 100) : 0;

  // -------------------------------------------------------------- por plano
  const mapa: Record<string, { nome: string; assinantes: number; mrr: number }> = {};
  for (const e of ativos) {
    const nome = e.plano_nome || "Sem plano";
    mapa[nome] = mapa[nome] || { nome, assinantes: 0, mrr: 0 };
    mapa[nome].assinantes++;
    mapa[nome].mrr += mrrDe(e, planos);
  }
  const porPlano = Object.values(mapa)
    .sort((a, b) => b.mrr - a.mrr)
    .map((p) => ({ ...p, pct: mrr ? Math.round((p.mrr / mrr) * 100) : 0 }));

  // -------------------------------------------------------------------- uso
  const uso = escritorios.reduce(
    (s, e) => ({
      empresas: s.empresas + e.empresas,
      analises: s.analises + e.analises,
      laudos: s.laudos + e.laudos,
      termos: s.termos + e.termos,
      assinados: s.assinados + e.assinados,
    }),
    { empresas: 0, analises: 0, laudos: 0, termos: 0, assinados: 0 }
  );

  // -------------------------------------------------------------- histórico
  const snaps = ((histRaw as any[]) || []).map((s) => ({
    mes: s.mes as string,
    mrr: Number(s.mrr_centavos || 0),
    assinantes: Number(s.assinantes || 0),
  }));
  const historico = snaps.slice(-6).map((s) => ({
    mes: new Date(s.mes + "T12:00:00").toLocaleDateString("pt-BR", { month: "short" }),
    mrr: s.mrr,
    assinantes: s.assinantes,
  }));
  const rotulo = inicioMes.toLocaleDateString("pt-BR", { month: "short" });
  if (!historico.length || historico[historico.length - 1].mes !== rotulo) {
    historico.push({ mes: rotulo, mrr, assinantes: ativos.length });
  } else {
    historico[historico.length - 1] = { mes: rotulo, mrr, assinantes: ativos.length };
  }

  // ----------------------------------------------------------------- janela
  const abre = config.janela?.abre || "2026-09-01";
  const fecha = config.janela?.fecha || "2026-09-30";
  const ini = new Date(abre).getTime();
  const fim = new Date(fecha).getTime();
  const agora = Date.now();
  const janela = {
    abre,
    fecha,
    dias: Math.max(Math.ceil((fim - agora) / DIA), 0),
    pct: Math.round(Math.min(Math.max((agora - ini) / (fim - ini), 0), 1) * 100),
  };

  // ------------------------------------------------------------ fila de ação
  const acoes: Acao[] = [];
  const limiteGratis = Number(planos.find((p) => p.id === "gratis")?.limite_analises ?? 2);

  // 1) o lead mais quente que existe: bateu no teto do gratuito
  for (const e of gratuitos.filter((x) => x.laudos >= limiteGratis).slice(0, 15)) {
    acoes.push({
      tipo: "Bateu no limite gratuito",
      urgencia: "alta",
      escritorio: e.nome || "(sem nome)",
      tenant_id: e.id,
      detalhe: `${e.laudos} laudo(s) emitido(s) · ${e.faixa_a} empresa(s) na faixa A esperando`,
    });
  }

  // 2) carteira grande ainda no gratuito
  for (const e of gratuitos.filter((x) => x.faixa_a >= 10 && x.laudos < limiteGratis).slice(0, 10)) {
    acoes.push({
      tipo: "Carteira grande no gratuito",
      urgencia: "media",
      escritorio: e.nome || "(sem nome)",
      tenant_id: e.id,
      detalhe: `${e.faixa_a} empresas na faixa A · usou ${e.laudos} de ${limiteGratis} laudos`,
    });
  }

  // 3) assinatura vencendo — no mensal isso é todo mês
  for (const e of vencendo.slice(0, 15)) {
    const d = dias(hoje, e.vencimento!);
    acoes.push({
      tipo: "Assinatura vencendo",
      urgencia: d <= 3 ? "alta" : "media",
      escritorio: e.nome || "(sem nome)",
      tenant_id: e.id,
      detalhe: `${e.plano_nome} vence em ${d} dia(s) (${new Date(e.vencimento! + "T12:00:00").toLocaleDateString("pt-BR")})`,
      valor: mrrDe(e, planos),
    });
  }

  // 4) vencidas que ainda constam como ativas
  for (const e of vencidos.slice(0, 15)) {
    acoes.push({
      tipo: "Assinatura vencida",
      urgencia: "alta",
      escritorio: e.nome || "(sem nome)",
      tenant_id: e.id,
      detalhe: `venceu há ${dias(e.vencimento!)} dia(s) e o status ainda é ativa`,
      valor: mrrDe(e, planos),
    });
  }

  // 5) importou e não analisou — o produto não chegou a acontecer
  for (const e of escritorios.filter((x) => x.empresas > 0 && x.analises === 0).slice(0, 10)) {
    acoes.push({
      tipo: "Carteira parada na triagem",
      urgencia: "media",
      escritorio: e.nome || "(sem nome)",
      tenant_id: e.id,
      detalhe: `${e.empresas} empresa(s) importada(s), ${e.faixa_a} na faixa A, nenhuma análise`,
    });
  }

  // 6) assinante ativo que parou
  for (const e of parados.slice(0, 10)) {
    const d = e.ultima_analise ? dias(e.ultima_analise) : null;
    acoes.push({
      tipo: "Assinante parado",
      urgencia: (d ?? 99) >= 45 ? "alta" : "media",
      escritorio: e.nome || "(sem nome)",
      tenant_id: e.id,
      detalhe: d === null ? "nunca analisou nada" : `sem análise nova há ${d} dias`,
      valor: mrrDe(e, planos),
    });
  }

  // 7) validade maior do que o plano concede — o vazamento de receita
  for (const e of ativos) {
    const p = planos.find((x) => x.id === e.plano_id);
    if (!p?.dias_acesso || !e.vencimento || !e.criado_em) continue;
    const concedidos = dias(hoje, e.vencimento);
    if (concedidos > p.dias_acesso + 40) {
      acoes.push({
        tipo: "Validade esticada",
        urgencia: "baixa",
        escritorio: e.nome || "(sem nome)",
        tenant_id: e.id,
        detalhe: `${p.nome} dá ${p.dias_acesso} dias, mas o acesso vale por mais ${concedidos}`,
        valor: mrrDe(e, planos),
      });
    }
  }

  /**
   * 8) ESCRITÓRIO SEM NENHUM USUÁRIO — o entulho que trava a fila de e-mails.
   *
   * Cadastro que morreu no meio deixa o `tenant` sem nenhum `profile`. Ele não
   * incomoda ninguém na tela… mas as réguas de ativação planejam e-mail para
   * ele em TODA execução, e como não existe endereço, o envio nunca acontece e
   * a linha nunca sai de "próximos disparos". Eram 3 escritórios e 6 e-mails
   * eternos numa base de 9.
   *
   * Aparece aqui porque tem conserto: ou o cadastro se completa, ou o registro
   * some. Ficar é a única opção que não serve.
   */
  for (const e of escritorios.filter((x) => x.usuarios === 0)) {
    acoes.push({
      tipo: "Escritório sem usuário",
      urgencia: "media",
      escritorio: e.nome || "(sem nome)",
      tenant_id: e.id,
      detalhe:
        "cadastro incompleto: nenhuma conta de acesso. Nenhum e-mail automático consegue sair para ele — e a régua tenta de novo toda hora.",
    });
  }

  /**
   * 9) ASSINATURA ATIVA SEM VALOR GRAVADO.
   *
   * Era a causa do painel mostrar R$ 0 com dinheiro na conta. `mrrDe` agora cai
   * para o preço do plano, então o número volta a aparecer — mas a linha
   * continua torta no banco, e um desconto negociado ficaria invisível. Fica na
   * lista até alguém gravar o valor de verdade.
   */
  for (const e of ativos.filter((x) => !x.valor_centavos && x.plano_id && x.plano_id !== "gratis")) {
    acoes.push({
      tipo: "Assinatura sem valor gravado",
      urgencia: "baixa",
      escritorio: e.nome || "(sem nome)",
      tenant_id: e.id,
      detalhe: `${e.plano_nome ?? e.plano_id}: o valor está em branco na assinatura. O painel usa o preço de tabela — se houve desconto, ele não aparece em lugar nenhum.`,
      valor: mrrDe(e, planos),
    });
  }

  const ordem = { alta: 0, media: 1, baixa: 2 } as const;
  acoes.sort((a, b) => ordem[a.urgencia] - ordem[b.urgencia] || (b.valor || 0) - (a.valor || 0));

  return {
    mrr,
    arr: mrr * 12,
    ticket: ativos.length ? Math.round(mrr / ativos.length) : 0,
    mrrEmRisco,
    assinantes: ativos.length,
    gratuitos: gratuitos.length,
    vencendo: vencendo.length,
    vencidos: vencidos.length,
    novosNoMes,
    provaram: comLaudo,
    conversao,
    funil,
    porPlano,
    uso,
    historico,
    avisos,
    caixa,
    janela,
    acoes,
    meta: {
      assinantes: Number(config.negocio?.meta_assinantes || 0),
      mrr: Number(config.negocio?.meta_mrr_centavos || 0),
    },
    escritorios,
    planos,
    recursos,
    config,
  };
}
