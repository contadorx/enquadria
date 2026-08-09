/**
 * O COCKPIT, em funções puras.
 *
 * O produto tinha sete telas que eram a mesma carteira vista de sete ângulos.
 * A unificação só é honesta se a REGRA de "em que pé está esta empresa e qual é
 * a próxima ação" viver num lugar só — senão a fila, a linha de produção e os
 * avisos voltam a divergir, que foi exatamente o que criou as sete telas.
 *
 * Nada aqui faz I/O: a mesma função roda no servidor, no cliente e no teste.
 */

import type { Faixa } from "./triagem";
import { ORIGEM_LOTE } from "./premissas-padrao";
/* o honorário do laudo curto vem do mesmo lugar que o mapa de risco usa: dois
   valores de partida para a mesma conta é como as duas telas divergem */
import { HONORARIO_CURTO_PADRAO } from "./potencial";
import type { Saida } from "./motor";

/** Onde a empresa está na esteira. Cada etapa contém a anterior. */
export type Etapa = "importada" | "decide" | "analisada" | "laudo" | "assinado";

/**
 * A PRÓXIMA AÇÃO daquela linha. É o coração do cockpit: a fila não pergunta ao
 * contador o que ele quer fazer, ela diz o que falta e executa ali.
 */
export type Acao =
  | "analisar"
  | "confirmar"
  | "emitir"
  | "contato"
  | "termo"
  | "cobrar"
  | "pronto"
  | "fora";

export interface EmpresaCru {
  id: string;
  cnpj: string;
  razao_social: string;
  cnae_principal: string | null;
  faixa: Faixa | null;
  motivo_triagem: string | null;
  prioridade_maxima: boolean | null;
  rbt12: number | string | null;
  regime?: string | null;
  anexo: number | null;
  contato_nome: string | null;
  contato_email: string | null;
}

export interface AnaliseCru {
  id: string;
  empresa_id: string;
  saida: string | null;
  re: number | string | null;
  prioridade: boolean | null;
  parametros: { origem_premissas?: string; confianca_premissas?: string } | null;
  calculado_em: string | null;
}

export interface LaudoCru {
  id: string;
  analise_id: string;
  numero: number;
}

export interface TermoCru {
  id: string;
  analise_id: string;
  token: string | null;
  assinatura_status: string | null;
  assinado_em: string | null;
}

export interface ColetaCru {
  empresa_id: string;
  status: string | null;
  respondido_em: string | null;
  aplicada_em: string | null;
}

/**
 * O ESTADO DO PEDIDO DE DADOS, na fila.
 *
 * O contador manda o formulário para 20 clientes e volta no dia seguinte sem
 * saber quem respondeu — a informação existia só dentro de cada empresa, uma
 * por uma. "nao" (nunca pedi), "aguardando" (mandei e estou esperando),
 * "respondida" (chegou e ainda não usei), "usada" (já entrou na análise).
 *
 * "usada" é separado de "respondida" de propósito: o que precisa da atenção
 * do contador é a resposta que chegou e ainda não virou análise.
 */
export type EstadoColeta = "nao" | "aguardando" | "respondida" | "usada";

export interface Linha {
  id: string;
  razao_social: string;
  cnpj: string;
  cnae: string | null;
  /** enquadramento como veio do arquivo/edição — a coluna nova da fila */
  regime: string | null;
  faixa: Faixa;
  motivo: string | null;
  prioridade: boolean;
  analise_id: string | null;
  saida: Saida | null;
  re: number | null;
  /** premissas vieram do lote por CNAE e ainda não foram confirmadas */
  estimada: boolean;
  laudo_id: string | null;
  laudo_numero: number | null;
  termo_id: string | null;
  termo_token: string | null;
  assinado: boolean;
  tem_contato: boolean;
  coleta: EstadoColeta;
  rbt12: number | null;
  etapa: Etapa;
  acao: Acao;
  /**
   * Apontamentos da Reforma em aberto para esta empresa — o selo da linha.
   *
   * Entrou em 08/08/2026. `abertosPorEmpresa()` existia em lib/apontamentos.ts,
   * com o comentário "para o selo da linha da fila", e era chamada só pelos
   * testes. O monitor cruzava norma com carteira todo dia às 5h, gravava o
   * resultado, e o contador não tinha como saber que aquilo existia sem
   * navegar até uma sub-aba dentro de "Aprender" — trabalho cobrável produzido
   * por um cron que ninguém via. Opcional para não quebrar chamadas antigas
   * (e para o painel seguir de pé se a migration 0063 ainda não rodou).
   */
  apontamentos?: number;
}

const num = (x: number | string | null | undefined): number | null =>
  x == null || x === "" || !isFinite(Number(x)) ? null : Number(x);

/** faixas que exigem decisão nesta janela — o trabalho de verdade */
export const FAIXAS_TRABALHO: Faixa[] = ["A", "B"];
export const FAIXAS_CURTAS: Faixa[] = ["C", "D"];
export const FAIXAS_FORA: Faixa[] = ["MEI", "FORA"];

/**
 * A próxima ação. A ordem dos testes É a esteira; ler de cima para baixo.
 *
 * "confirmar" existe porque emitir laudo em cima de premissa que o sistema
 * chutou pelo CNAE é o erro que não tem conserto: o papel sai assinado pelo
 * contador. Análise de lote não vira documento sem passar pela conferência.
 */
export function proximaAcao(l: Omit<Linha, "acao" | "etapa">): Acao {
  if (FAIXAS_FORA.includes(l.faixa)) return "fora";
  if (!l.analise_id) return "analisar";
  if (l.estimada && !l.laudo_id) return "confirmar";
  if (!l.laudo_id) return "emitir";
  if (!l.termo_id) return l.tem_contato ? "termo" : "contato";
  if (!l.assinado) return "cobrar";
  return "pronto";
}

/**
 * OS CINCO PASSOS DA ESTEIRA, para desenhar na linha.
 *
 * Função pura e separada de `proximaAcao` de propósito: aquela responde "o que
 * falta AGORA" e devolve uma coisa só; esta responde "onde esta empresa está no
 * caminho" e devolve as cinco. São perguntas diferentes e a interface precisa
 * das duas — o botão vem de lá, o gráfico vem daqui.
 *
 * A ordem é a mesma de `lib/roteiro.ts` porque é a mesma esteira; se um dia
 * divergirem, a tela da empresa e a linha da fila passam a contar histórias
 * diferentes sobre o mesmo cliente.
 *
 * `null` para quem está fora da janela: MEI e empresa baixada não têm esteira, e
 * cinco marcas vazias sugeririam trabalho que não existe.
 */
export interface EstadoEsteira {
  faixa: Faixa;
  coleta: EstadoColeta;
  analise_id: string | null;
  estimada: boolean;
  laudo_id: string | null;
  termo_id: string | null;
  assinado: boolean;
}

export interface PassoEsteira {
  chave: "dados" | "analise" | "laudo" | "termo" | "assinatura";
  rotulo: string;
  feito: boolean;
  /** é o passo da vez — o primeiro não concluído */
  atual: boolean;
}

export function passosDaEsteira(e: EstadoEsteira): PassoEsteira[] | null {
  if (FAIXAS_FORA.includes(e.faixa)) return null;

  /* "dados" fecha por coleta respondida OU por análise salva: quem preencheu na
     mão não deve a ninguém o formulário do cliente. E análise ESTIMADA não
     fecha o passo da análise — é rascunho do CNAE, não decisão do contador. */
  const feitos: Record<PassoEsteira["chave"], boolean> = {
    dados: e.coleta === "respondida" || e.coleta === "usada" || (!!e.analise_id && !e.estimada),
    analise: !!e.analise_id && !e.estimada,
    laudo: !!e.laudo_id,
    termo: !!e.termo_id,
    assinatura: e.assinado,
  };

  const ROTULOS: Record<PassoEsteira["chave"], string> = {
    dados: "Premissas reunidas",
    analise: "Análise salva",
    laudo: "Laudo emitido",
    termo: "Termo gerado",
    assinatura: "Assinado pelo cliente",
  };

  let achouAtual = false;
  return (Object.keys(ROTULOS) as PassoEsteira["chave"][]).map((chave) => {
    const feito = feitos[chave];
    const atual = !feito && !achouAtual;
    if (atual) achouAtual = true;
    return { chave, rotulo: ROTULOS[chave], feito, atual };
  });
}

export function etapaDe(l: Omit<Linha, "acao" | "etapa">): Etapa {
  if (l.assinado) return "assinado";
  if (l.laudo_id) return "laudo";
  if (l.analise_id) return "analisada";
  /* 08/08/2026: faixa C ou D sem análise caía em "importada" — o mesmo degrau
     de quem acabou de entrar no sistema. Elas TÊM trabalho (laudo curto e
     termo), e ficavam fora de qualquer etapa do funil: invisíveis na única
     tela que o contador olha todo dia. */
  if (FAIXAS_CURTAS.includes(l.faixa)) return "decide";
  if (FAIXAS_TRABALHO.includes(l.faixa)) return "decide";
  return "importada";
}

export function montarFila(
  empresas: EmpresaCru[],
  analises: AnaliseCru[],
  laudos: LaudoCru[],
  termos: TermoCru[],
  coletas: ColetaCru[] = [],
  /* apontamentos ABERTOS por empresa, de `abertosPorEmpresa()`. Opcional: a
     fila continua montando sem eles se a migration 0063 não tiver rodado */
  apontamentosAbertos: Record<string, number> = {}
): Linha[] {
  // uma análise por empresa na visão da fila: a mais recente manda
  const porEmpresa = new Map<string, AnaliseCru>();
  for (const a of analises) {
    const atual = porEmpresa.get(a.empresa_id);
    if (!atual) {
      porEmpresa.set(a.empresa_id, a);
      continue;
    }
    const novaData = a.calculado_em ?? "";
    const atualData = atual.calculado_em ?? "";
    if (novaData > atualData) porEmpresa.set(a.empresa_id, a);
  }

  // a coleta mais avançada de cada empresa manda: pedir de novo não pode
  // apagar da tela a resposta que já chegou
  const PESO_COLETA: Record<string, number> = { cancelada: 0, aberta: 1, respondida: 2 };
  const coletaPorEmpresa = new Map<string, ColetaCru>();
  for (const c of coletas) {
    const atual = coletaPorEmpresa.get(c.empresa_id);
    if (!atual || (PESO_COLETA[c.status ?? ""] ?? 0) > (PESO_COLETA[atual.status ?? ""] ?? 0)) {
      coletaPorEmpresa.set(c.empresa_id, c);
    }
  }

  const laudoPorAnalise = new Map(laudos.map((l) => [l.analise_id, l]));
  const termoPorAnalise = new Map(termos.map((t) => [t.analise_id, t]));

  return empresas.map((e) => {
    const a = porEmpresa.get(e.id) ?? null;
    const laudo = a ? laudoPorAnalise.get(a.id) ?? null : null;
    const termo = a ? termoPorAnalise.get(a.id) ?? null : null;

    const parcial: Omit<Linha, "acao" | "etapa"> = {
      id: e.id,
      razao_social: e.razao_social,
      cnpj: e.cnpj,
      cnae: e.cnae_principal,
      regime: (e.regime as string | null) ?? null,
      faixa: (e.faixa ?? "C") as Faixa,
      motivo: e.motivo_triagem,
      prioridade: !!e.prioridade_maxima || !!a?.prioridade,
      analise_id: a?.id ?? null,
      saida: (a?.saida as Saida | null) ?? null,
      re: num(a?.re ?? null),
      estimada: a?.parametros?.origem_premissas === ORIGEM_LOTE,
      laudo_id: laudo?.id ?? null,
      laudo_numero: laudo?.numero ?? null,
      termo_id: termo?.id ?? null,
      termo_token: termo?.token ?? null,
      assinado: !!termo && (termo.assinatura_status === "assinado" || !!termo.assinado_em),
      tem_contato: !!e.contato_email && !!e.contato_nome,
      coleta: estadoDaColeta(coletaPorEmpresa.get(e.id) ?? null),
      rbt12: num(e.rbt12),
      apontamentos: apontamentosAbertos[e.id] ?? 0,
    };

    return { ...parcial, etapa: etapaDe(parcial), acao: proximaAcao(parcial) };
  });
}

export function estadoDaColeta(c: ColetaCru | null | undefined): EstadoColeta {
  if (!c || c.status === "cancelada") return "nao";
  if (c.status !== "respondida" && !c.respondido_em) return "aguardando";
  return c.aplicada_em ? "usada" : "respondida";
}

const PESO_FAIXA: Record<Faixa, number> = { A: 0, B: 1, C: 2, D: 3, MEI: 4, FORA: 5 };
/** o que ainda dá trabalho vem antes do que já está pronto */
const PESO_ACAO: Record<Acao, number> = {
  confirmar: 0,
  analisar: 1,
  emitir: 2,
  contato: 3,
  termo: 4,
  cobrar: 5,
  pronto: 6,
  fora: 7,
};

/** Prioridade máxima no topo, faixa A antes de B, pendência antes de pronto. */
export function ordenarFila(linhas: Linha[]): Linha[] {
  return [...linhas].sort((x, y) => {
    if (x.prioridade !== y.prioridade) return x.prioridade ? -1 : 1;
    if (PESO_FAIXA[x.faixa] !== PESO_FAIXA[y.faixa]) return PESO_FAIXA[x.faixa] - PESO_FAIXA[y.faixa];
    if (PESO_ACAO[x.acao] !== PESO_ACAO[y.acao]) return PESO_ACAO[x.acao] - PESO_ACAO[y.acao];
    return x.razao_social.localeCompare(y.razao_social, "pt-BR");
  });
}

export interface Esteira {
  importadas: number;
  decidem: number;
  /**
   * DAS QUE PRECISAM DECIDIR, quantas ainda não têm laudo.
   *
   * O número de "precisam decidir" é o universo — faixas A e B — e não muda
   * conforme o trabalho anda. Isso confundia: clicar nele trazia empresas já
   * analisadas e com laudo emitido, sem nenhuma indicação de que estavam
   * prontas. O funil continua sendo funil; o que faltava era dizer quantas
   * ainda estão de pé.
   */
  decidem_pendentes: number;
  /**
   * A METADE DA CARTEIRA QUE A ESTEIRA IGNORAVA — 08/08/2026.
   *
   * As faixas C e D não têm decisão a tomar: elas recebem um laudo CURTO, que
   * documenta a permanência. Isso é trabalho cobrável, é o maior volume de
   * qualquer carteira real (entre 45% e 62% dela, conforme o mix de CNAE) e é o
   * único entregável em que o produto faz quase tudo sozinho — não depende de
   * conversa com o empresário sobre venda para PJ, crédito ou poder de preço.
   *
   * O mapa de risco prometia `(C + D) × honorário curto` na PRIMEIRA tela, e a
   * partir do segundo dia essas empresas sumiam: a esteira contava só A e B, o
   * "na mesa" era só a faixa A, e `etapaDe` devolvia "importada" para C/D sem
   * análise — ou seja, elas não estavam em degrau nenhum do funil. A receita
   * era prometida uma vez e depois ficava invisível para o trabalho diário.
   */
  permanencia: number;
  /** dessas, as que ainda não viraram papel */
  permanencia_pendentes: number;
  analisadas: number;
  laudos: number;
  assinados: number;
}

/** A linha de produção: cada número contém o seguinte. É um funil, não um menu. */
export function contarEsteira(linhas: Linha[]): Esteira {
  const decidem = linhas.filter((l) => FAIXAS_TRABALHO.includes(l.faixa));
  const permanencia = linhas.filter((l) => FAIXAS_CURTAS.includes(l.faixa));
  return {
    importadas: linhas.length,
    decidem: decidem.length,
    decidem_pendentes: decidem.filter((l) => !l.laudo_id).length,
    permanencia: permanencia.length,
    permanencia_pendentes: permanencia.filter((l) => !l.laudo_id).length,
    analisadas: linhas.filter((l) => l.analise_id).length,
    laudos: linhas.filter((l) => l.laudo_id).length,
    assinados: linhas.filter((l) => l.assinado).length,
  };
}

/**
 * O que a fila sabe filtrar: as etapas do funil MAIS os recortes que só existem
 * para responder a um aviso. Separado de `keyof Esteira` porque etapa é degrau
 * contado na linha de produção, e recorte não é.
 */
export type FiltroDeFila = keyof Esteira | "aguardando_assinatura";

export const ETAPAS: { chave: keyof Esteira; rotulo: string; ajuda: string }[] = [
  { chave: "importadas", rotulo: "importadas", ajuda: "toda a carteira que entrou no sistema" },
  { chave: "decidem", rotulo: "precisam decidir", ajuda: "faixas A e B — quem tem decisão real a tomar nesta janela, incluindo o que já virou laudo" },
  /* a coluna que faltava: o maior volume da carteira, e o entregável que cabe
     nas horas que a janela tem (ver a nota de `permanencia` em `Esteira`) */
  { chave: "permanencia", rotulo: "permanência a documentar", ajuda: "faixas C e D — sem decisão a tomar, mas com laudo curto e termo a emitir" },
  { chave: "analisadas", rotulo: "analisadas", ajuda: "com análise gravada, estimada ou confirmada" },
  { chave: "laudos", rotulo: "laudo emitido", ajuda: "documento numerado com a sua marca, curto ou completo" },
  { chave: "assinados", rotulo: "termo assinado", ajuda: "prova de ciência do cliente, com verificação pública" },
];

/**
 * O QUE AINDA ESTÁ NA MESA — o serviço que falta emitir × honorário de partida.
 *
 * ATÉ 08/08/2026 ERA SÓ A FAIXA A. A intenção era ser conservador, e o efeito
 * foi outro: o mapa de risco da primeira tela promete `(A+B) × honorário` MAIS
 * `(C+D) × honorário curto`, e a partir do segundo dia o cockpit mostrava um
 * número que ignorava a faixa B inteira e a metade da carteira que gera laudo
 * curto. O contador via a receita uma vez, no dia da importação, e nunca mais.
 * Prometer numa tela e esconder na seguinte é pior do que não prometer.
 *
 * Continua conservador onde importa: só conta o que AINDA NÃO virou papel, e os
 * dois honorários são premissa do contador, não promessa do sistema.
 */
export function naMesa(
  linhas: Linha[],
  honorario: number,
  honorarioCurto = HONORARIO_CURTO_PADRAO
): { empresas: number; valor: number; completos: number; curtos: number } {
  const completos = linhas.filter((l) => FAIXAS_TRABALHO.includes(l.faixa) && !l.laudo_id).length;
  const curtos = linhas.filter((l) => FAIXAS_CURTAS.includes(l.faixa) && !l.laudo_id).length;
  return {
    empresas: completos + curtos,
    valor: completos * honorario + curtos * honorarioCurto,
    completos,
    curtos,
  };
}

/** Filtro por etapa da linha de produção — o clique no número filtra a fila. */
export function filtrarPorEtapa(linhas: Linha[], etapa: FiltroDeFila | null): Linha[] {
  if (!etapa || etapa === "importadas") return linhas;
  if (etapa === "decidem") return linhas.filter((l) => FAIXAS_TRABALHO.includes(l.faixa));
  // o recorte do que ainda está de pé — usado pelo atalho "ver só as pendentes"
  if (etapa === "decidem_pendentes")
    return linhas.filter((l) => FAIXAS_TRABALHO.includes(l.faixa) && !l.laudo_id);
  if (etapa === "permanencia") return linhas.filter((l) => FAIXAS_CURTAS.includes(l.faixa));
  if (etapa === "permanencia_pendentes")
    return linhas.filter((l) => FAIXAS_CURTAS.includes(l.faixa) && !l.laudo_id);
  if (etapa === "analisadas") return linhas.filter((l) => l.analise_id);
  if (etapa === "laudos") return linhas.filter((l) => l.laudo_id);
  if (etapa === "assinados") return linhas.filter((l) => l.assinado);
  /**
   * "VER QUEM FALTA" MOSTRAVA OUTRA COISA — conserto de 08/08/2026.
   *
   * O empurrão "N termos aguardam assinatura" conta `termo_id && !assinado` na
   * carteira INTEIRA, e o clique abria a etapa `laudos` — que é "faixa A/B com
   * laudo". Os dois conjuntos não são o mesmo: a etapa inclui os já assinados
   * (que não faltam) e exclui as faixas C e D com termo pendente (que faltam e
   * foram contadas no aviso). O número dizia uma coisa e a lista mostrava outra,
   * e quem confere uma vez para de confiar nas duas.
   *
   * Este recorte não é etapa da esteira — é filtro de fila. Por isso o tipo do
   * parâmetro cresceu em vez de `Esteira` ganhar um campo: contar isto como
   * etapa somaria uma coluna ao funil que não é degrau de nada.
   */
  if (etapa === "aguardando_assinatura")
    return linhas.filter((l) => l.termo_id && !l.assinado);
  return linhas;
}

const semAcento = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * Busca por nome, CNPJ ou CNAE — o que o contador digita quando procura.
 *
 * A busca por CNPJ usa a chave ALFANUMÉRICA, não só os dígitos: com
 * `replace(/\D/g, "")` procurar "PC3D315K" viraria procurar "3", e o pedaço
 * que o contador reconhece na tela é justamente a raiz, com as letras.
 * O CNAE continua numérico porque ele é numérico.
 */
export function buscar(linhas: Linha[], termo: string): Linha[] {
  const t = termo.trim();
  if (!t) return linhas;
  const alvo = semAcento(t);
  const chave = t.toUpperCase().replace(/[^0-9A-Z]/g, "");
  const digitos = t.replace(/\D/g, "");
  const chaveDe = (v: string) => v.toUpperCase().replace(/[^0-9A-Z]/g, "");
  return linhas.filter((l) => {
    if (semAcento(l.razao_social).includes(alvo)) return true;
    if (chave.length >= 2 && chaveDe(l.cnpj).includes(chave)) return true;
    if (digitos.length >= 2 && (l.cnae ?? "").replace(/\D/g, "").includes(digitos)) return true;
    return false;
  });
}

/**
 * O CÓDIGO DA SAÍDA, EM UMA FRASE — 08/08/2026.
 *
 * A fila imprime `S1`..`S5` cru, em fonte mono, e o significado só aparecia
 * dentro do formulário de análise — a tela seguinte. Quem abre o cockpit pela
 * primeira vez lê um código que não significa nada. Aqui está o texto do
 * `title`, curto porque tooltip longo não é lido: a versão completa continua
 * em `SAIDAS`, no laudo e no formulário.
 *
 * Não importa `SAIDAS` de propósito: aquele texto é a redação do DOCUMENTO, e
 * documento e tooltip têm tamanhos e leitores diferentes. Duas frases com o
 * mesmo dono e propósitos distintos não são duplicação.
 */
export const EXPLICA_SAIDA: Record<string, string> = {
  S1: "S1 — não optar: o perfil de vendas não dá contrapartida que justifique o custo.",
  S2: "S2 — não optar nesta janela: a conta fecha, mas depende de um reajuste que não se negocia a tempo.",
  S3: "S3 — zona de fronteira: os dois caminhos se defendem, e a escolha é do empresário.",
  S4: "S4 — optar, desde que o preço seja renegociado antes do fim da janela.",
  S5: "S5 — optar por vantagem direta: a empresa paga menos pelos créditos das próprias compras.",
};

export const ROTULO_ACAO: Record<Acao, string> = {
  analisar: "Analisar",
  confirmar: "Confirmar premissas",
  emitir: "Emitir laudo",
  contato: "Cadastrar contato",
  termo: "Enviar termo",
  cobrar: "Cobrar assinatura",
  pronto: "Decidida",
  fora: "Fora da janela",
};

/**
 * O QUE O CLIQUE FAZ, E ONDE ELE CAI — reescrito em 08/08/2026.
 *
 * Isto era um `Record<Acao, boolean>` chamado `ACAO_ABRE_GAVETA`, sem UM
 * importador em todo o projeto, e que declarava o oposto do que a tela faz:
 * dizia que `pronto` e `fora` "abrem a gaveta" quando o Cockpit desabilita o
 * botão nos dois casos. Duas fontes de verdade sobre o mesmo gesto, uma delas
 * sem consumidor — e a sem consumidor é sempre a que fica errada, porque nada
 * a corrige.
 *
 * Agora ela diz as três coisas que a tela precisa saber e é ela que a tela lê:
 * se a ação executa no lugar, se abre a gaveta, e em QUAL aba. A aba importa:
 * `contato` pede nome e e-mail do responsável, que moram no Dossiê — mandar
 * para a aba de Análise foi um defeito real da Trilha.
 */
export type DestinoDaAcao =
  | { tipo: "executa" }
  | { tipo: "gaveta"; aba: "decisao" | "dossie" }
  | { tipo: "nenhum" };

export const DESTINO_DA_ACAO: Record<Acao, DestinoDaAcao> = {
  analisar: { tipo: "gaveta", aba: "decisao" },
  confirmar: { tipo: "gaveta", aba: "decisao" },
  emitir: { tipo: "executa" },
  contato: { tipo: "gaveta", aba: "dossie" },
  termo: { tipo: "executa" },
  cobrar: { tipo: "executa" },
  /* sem trabalho pendente: o botão fica apagado, e o nome da empresa continua
     abrindo a ficha — quem quer ver o histórico clica no nome */
  pronto: { tipo: "nenhum" },
  fora: { tipo: "nenhum" },
};

/**
 * Ações que fazem sentido em lote, com o rótulo do botão.
 *
 * A ORDEM É A DA ESTEIRA: analisar → emitir → ENTREGAR → formalizar. "Enviar
 * laudos" entrou entre emitir e o termo porque era exatamente o degrau que
 * faltava: o laudo era emitido e ficava no painel, e a entrega ao cliente
 * dependia de imprimir em PDF e anexar, uma empresa por vez. Com 143 clientes e
 * a janela fechando em 30 de setembro, entrega manual é entrega que não
 * acontece — e laudo que o cliente nunca vê não renova contrato nenhum.
 */
export const ACOES_LOTE: { chave: "analisar" | "emitir" | "enviar" | "termo"; rotulo: string; ajuda: string }[] = [
  {
    chave: "analisar",
    rotulo: "Analisar",
    ajuda: "aplica as premissas típicas do CNAE e grava a análise — marcada como estimada",
  },
  { chave: "emitir", rotulo: "Emitir laudos", ajuda: "gera o documento numerado de quem já tem análise" },
  {
    chave: "enviar",
    rotulo: "Enviar laudos",
    ajuda: "manda o laudo já emitido para o e-mail do cliente, com link próprio",
  },
  { chave: "termo", rotulo: "Enviar termos", ajuda: "gera o termo e envia o link de assinatura a quem tem contato" },
];

/* ══════════════════════════════════════════════════════════════════════
   O EMPURRÃO — a UMA coisa a fazer agora, com a empresa pelo nome.

   Por que uma só. O cockpit já mostra a fila inteira, e fila inteira é
   exatamente o que trava: a tela devolve ao contador a decisão de por onde
   começar, que é justamente o trabalho que ele veio terceirizar. Três avisos
   simultâneos não são três ajudas, são três formas de não começar.

   A ordem abaixo é o funil medido, de trás para frente — cada teste é um
   ponto onde a esteira vaza:

     1. analisou e NUNCA emitiu   → 40% param aqui. Falta empurrão, não
                                     permissão: os 2 laudos são grátis e quase
                                     ninguém percebe que são.
     2. emitiu e não mandou termo → não aparece na conta de receita, mas é o
                                     que decide a RENOVAÇÃO. Laudo que fica no
                                     computador do contador o cliente nunca vê;
                                     termo assinado é o que faz o cliente
                                     perceber que pagou por alguma coisa.
     3. termo enviado sem assinar → cobrar é barato e o documento só vale
                                     assinado.

   Retorna null quando não há nada a empurrar — silêncio é resposta válida, e
   banner permanente vira paisagem.
   ══════════════════════════════════════════════════════════════════════ */

export interface Empurrao {
  tipo: "emitir_primeiro" | "termo_pendente" | "cobrar_assinatura";
  titulo: string;
  corpo: string;
  rotulo_acao: string;
  /** a empresa por onde começar, quando o empurrão aponta para uma só */
  alvo: { id: string; razao_social: string; analise_id: string | null } | null;
  quantidade: number;
}

/**
 * POR ONDE COMEÇAR o primeiro laudo.
 *
 * Escolher também é atrito: mandar "emita o primeiro" sem dizer em quem só
 * empurra o problema uma tela para frente. A escolha é a de decisão mais
 * CLARA, não a de maior valor — o objetivo aqui é o contador ver um laudo
 * pronto, não maximizar honorário na primeira tentativa.
 *
 * Critério, em ordem: recomendação de optar (S4/S5, onde a conversa com o
 * cliente é mais fácil) · prioridade máxima · menor repasse exigido, que é a
 * que tem mais folga na negociação.
 */
export function porOndeComecar(linhas: Linha[]): Linha | null {
  const candidatas = linhas.filter(
    (l) => l.analise_id && !l.laudo_id && !l.estimada && FAIXAS_TRABALHO.includes(l.faixa)
  );
  if (candidatas.length === 0) return null;

  const optar = candidatas.filter((l) => l.saida === "S4" || l.saida === "S5");
  const pool = optar.length > 0 ? optar : candidatas;

  return [...pool].sort((a, b) => {
    if (a.prioridade !== b.prioridade) return a.prioridade ? -1 : 1;
    const ra = a.re ?? Number.POSITIVE_INFINITY;
    const rb = b.re ?? Number.POSITIVE_INFINITY;
    return ra - rb;
  })[0];
}

export function proximoEmpurrao(linhas: Linha[]): Empurrao | null {
  const comLaudo = linhas.filter((l) => l.laudo_id);

  // 1 · nunca emitiu — o degrau mais alto do funil
  if (comLaudo.length === 0) {
    const alvo = porOndeComecar(linhas);
    if (!alvo) return null;
    return {
      tipo: "emitir_primeiro",
      titulo: "Você tem 2 laudos inclusos. Emita o primeiro.",
      corpo:
        `Comece por ${alvo.razao_social} — é a de decisão mais clara da sua carteira. ` +
        "O laudo sai com a marca do seu escritório e código de verificação pública.",
      rotulo_acao: "Emitir este laudo",
      alvo: { id: alvo.id, razao_social: alvo.razao_social, analise_id: alvo.analise_id },
      quantidade: 1,
    };
  }

  // 2 · laudo emitido e termo nunca gerado
  const semTermo = comLaudo.filter((l) => !l.termo_id && l.tem_contato);
  if (semTermo.length > 0) {
    const n = semTermo.length;
    return {
      tipo: "termo_pendente",
      titulo: `${n} ${n === 1 ? "laudo emitido" : "laudos emitidos"} sem termo enviado.`,
      corpo:
        "Laudo sem termo é meio serviço: o cliente não assinou nada, e é a assinatura dele " +
        "que registra que você avaliou e comunicou. É o documento que responde a pergunta de 2027.",
      rotulo_acao: n === 1 ? "Enviar o termo" : `Enviar os ${n} termos`,
      alvo:
        n === 1
          ? { id: semTermo[0].id, razao_social: semTermo[0].razao_social, analise_id: semTermo[0].analise_id }
          : null,
      quantidade: n,
    };
  }

  // 3 · termo no ar, esperando assinatura
  const naoAssinados = comLaudo.filter((l) => l.termo_id && !l.assinado);
  if (naoAssinados.length > 0) {
    const n = naoAssinados.length;
    return {
      tipo: "cobrar_assinatura",
      titulo: `${n} ${n === 1 ? "termo aguarda" : "termos aguardam"} assinatura.`,
      corpo:
        "O termo só vale assinado. Reenviar o link custa um clique e é o que fecha a esteira " +
        "de cada empresa.",
      rotulo_acao: "Ver quem falta",
      alvo: null,
      quantidade: n,
    };
  }

  return null;
}
