/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE FAZ UM ITEM DE RADAR VALER A PENA — validação e leitura do critério.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O RADAR FICOU 104 DIAS PARADO porque publicar exigia abrir o banco de
 * produção. Com a tela, ele passa a receber item toda semana — e aí aparece o
 * segundo problema, que é de conteúdo e não de porta:
 *
 * um item mal escrito não dá erro. Ele sai, ocupa o topo da tela do contador,
 * e não diz nada. O contador abre, não entende o que fazer, e na semana
 * seguinte não abre mais. Feature morre assim, não por bug.
 *
 * Por isso a validação daqui é mais dura que a do banco. O banco garante que
 * existe texto; estas funções garantem que o texto SERVE.
 */
import type { CriterioRadar } from "./radar";

export interface Rascunho {
  titulo: string;
  resumo: string;
  o_que_fazer: string;
  fonte: string;
  publicado_em: string;
  vigencia_em: string;
  severidade: string;
  criterio: CriterioRadar;
  ativo: boolean;
}

export const SEVERIDADES = [
  { valor: "alta", rotulo: "Alta", quando: "muda o que o contador tem de fazer, e tem prazo" },
  { valor: "media", rotulo: "Média", quando: "muda um número ou um procedimento, sem prazo curto" },
  { valor: "baixa", rotulo: "Informativo", quando: "contexto — bom saber, nada a fazer hoje" },
] as const;

export interface Problema {
  campo: keyof Rascunho | "geral";
  texto: string;
  /** `true` impede publicar; `false` é conselho */
  bloqueia: boolean;
}

const SEM_ACAO = /^(fique atento|acompanhe|aguarde|nada a fazer|em breve)\.?$/i;

/**
 * A REGRA MAIS IMPORTANTE: item de severidade ALTA sem "o que fazer" não é
 * item de radar — é manchete.
 *
 * Alta severidade quer dizer "isto muda o seu trabalho". Se muda o trabalho,
 * existe uma ação. Se não existe ação, ou a severidade está errada ou o item
 * não foi pensado até o fim. Nos dois casos ele não deve sair assim.
 */
export function validar(r: Rascunho): Problema[] {
  const p: Problema[] = [];
  const t = r.titulo.trim();
  const res = r.resumo.trim();
  const acao = r.o_que_fazer.trim();

  if (t.length < 8) p.push({ campo: "titulo", texto: "O título precisa de pelo menos 8 caracteres.", bloqueia: true });
  if (t.length > 90) {
    p.push({ campo: "titulo", texto: `Título com ${t.length} caracteres — acima de 90 ele quebra em três linhas no celular.`, bloqueia: false });
  }
  if (res.length < 20) {
    p.push({ campo: "resumo", texto: "O resumo precisa de pelo menos 20 caracteres. É ele que o contador lê — o título só o faz parar.", bloqueia: true });
  }

  if (r.severidade === "alta" && !acao) {
    p.push({
      campo: "o_que_fazer",
      texto: "Severidade ALTA sem 'o que fazer' é manchete, não item de radar. Se muda o trabalho dele, existe uma ação — escreva qual.",
      bloqueia: true,
    });
  }
  if (acao && SEM_ACAO.test(acao)) {
    p.push({
      campo: "o_que_fazer",
      texto: `"${acao}" não é uma ação. O contador precisa saber o que ABRIR, o que CONFERIR ou para quem LIGAR.`,
      bloqueia: true,
    });
  }
  if (!r.fonte.trim()) {
    p.push({ campo: "fonte", texto: "Sem link da fonte o contador não consegue conferir — e o item vira boato com sua marca.", bloqueia: false });
  }
  if (!r.publicado_em) p.push({ campo: "publicado_em", texto: "Informe a data de publicação.", bloqueia: true });

  if (r.vigencia_em && r.publicado_em && r.vigencia_em < r.publicado_em) {
    p.push({ campo: "vigencia_em", texto: "A vigência é anterior à publicação. Confira as duas datas.", bloqueia: false });
  }
  if (r.severidade === "alta" && !r.vigencia_em) {
    p.push({
      campo: "vigencia_em",
      texto: "Alta severidade sem data de vigência não entra na contagem regressiva do painel — o item perde a urgência que justifica a severidade.",
      bloqueia: false,
    });
  }
  return p;
}

export const bloqueado = (p: Problema[]) => p.some((x) => x.bloqueia);

/**
 * A LEITURA DO CRITÉRIO, em português.
 *
 * O critério é um JSON de quatro chaves e um booleano. Quem escreve o item não
 * deve precisar traduzir isso de cabeça — e o erro mais comum não é sintático,
 * é de escopo: publicar para "todo mundo" um item que só vale para o Anexo IV.
 * A frase abaixo é o que impede isso, porque ela é lida antes de salvar.
 */
export function descreverCriterio(c: CriterioRadar | null | undefined): string {
  const k = c ?? {};
  const partes: string[] = [];
  if (k.anexos?.length) partes.push(`Anexo ${k.anexos.join(", ")}`);
  if (k.faixas?.length) partes.push(`faixa ${k.faixas.join(", ")}`);
  if (k.saidas?.length) partes.push(`saída ${k.saidas.join(", ")}`);
  if (k.divisoes_cnae?.length) partes.push(`CNAE ${k.divisoes_cnae.join(", ")}`);
  if (k.somente_com_analise) partes.push("só quem já tem análise");
  if (!partes.length) return "Alcança TODAS as empresas de todos os escritórios.";
  return "Alcança só: " + partes.join(" · ");
}

/** o critério limpo — chave vazia é chave ausente, senão ela restringe a nada */
export function limparCriterio(c: CriterioRadar): CriterioRadar {
  const fora: CriterioRadar = {};
  if (c.anexos?.length) fora.anexos = c.anexos;
  if (c.faixas?.length) fora.faixas = c.faixas;
  if (c.saidas?.length) fora.saidas = c.saidas;
  if (c.divisoes_cnae?.length) fora.divisoes_cnae = c.divisoes_cnae;
  if (c.somente_com_analise) fora.somente_com_analise = true;
  return fora;
}

/**
 * DIVISÕES DE CNAE a partir do que a pessoa digitou.
 *
 * Aceita "47, 62" e também "4711-3/02" — porque quem está redigindo tem o CNAE
 * completo na frente, não a divisão. Exigir que ele corte os dois primeiros
 * dígitos de cabeça é a fricção que faz o campo ficar vazio.
 */
export function divisoesDe(texto: string): string[] {
  return Array.from(
    new Set(
      texto
        .split(/[,;\s]+/)
        .map((x) => x.replace(/\D/g, "").slice(0, 2))
        .filter((x) => x.length === 2)
    )
  ).sort();
}
