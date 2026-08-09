import {
  decidir,
  dDASefetivo,
  cenarios,
  emReais,
  sensibilidade,
  carimboAliquota,
  alertaFatorR,
  sharePCDe,
  PARAMETROS_2027,
  type Respostas,
} from "./motor";
import { triar, type EmpresaBruta } from "./triagem";
import type { AnaliseGravada } from "./laudo";

/**
 * A CARTEIRA E O LAUDO DE EXEMPLO — o que o contador vê antes de confiar.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * POR QUE ISTO EXISTE.
 *
 * A cadência fria pede que um contador entregue a lista de clientes dele a um
 * sistema que ele nunca viu. Descrever o entregável em texto não vence essa
 * hesitação: contador não compra adjetivo, compra documento. Ele precisa VER o
 * laudo — a memória de cálculo, o carimbo da alíquota, as condições de
 * validade — antes de decidir que vale o trabalho de subir a carteira.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * A DECISÃO QUE FAZ ISTO PRESTAR: o exemplo é GERADO pelo motor de verdade.
 *
 * Nada aqui é texto escrito à mão imitando um laudo. As respostas fictícias
 * entram em `decidir()`, `dDASefetivo()`, `cenarios()`, `emReais()` e
 * `sensibilidade()` — as mesmas funções que a rota de análise chama — e o
 * resultado é renderizado pelo MESMO componente `LaudoFolha` que imprime o
 * documento do cliente pagante.
 *
 * A alternativa (um PDF de exemplo, um print) apodrece: no dia em que o laudo
 * mudar, o exemplo continua mostrando a versão velha, e quem chegou por ele se
 * sente enganado ao ver o produto. Aqui não há como divergir — se o laudo
 * mudar, o exemplo muda junto, porque é o mesmo código.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DADOS FICTÍCIOS, e isto não é formalidade.
 *
 * Nenhum CNPJ real, nenhuma razão social real, nenhum número de cliente. Os
 * CNPJs abaixo têm dígito verificador válido (senão a triagem os descartaria e
 * o exemplo mostraria a coisa errada), mas as empresas não existem. Publicar
 * carteira de cliente numa página aberta seria vazamento de dado de terceiro —
 * e o produto inteiro se vende como o lugar onde isso não acontece.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * OS DÍGITOS ESTAVAM ERRADOS — conserto de 08/08/2026.
 *
 * A afirmação acima era falsa: de doze CNPJs, DOIS passavam no dígito
 * verificador. Os outros dez foram escritos com terminações plausíveis e
 * nunca conferidos. A página não quebrava porque `triar()` não valida DV — mas
 * a `/exemplo` é pública, o argumento dela é "confira com os seus olhos", e
 * qualquer contador que colasse um daqueles números no importador via a linha
 * ser descartada pelo próprio produto. Afirmação verificável e falsa, na
 * página que existe para provar que o produto não mente.
 *
 * Os dez dígitos foram recalculados pelo módulo 11 (o mesmo `lib/cnpj.ts`); as
 * doze primeiras posições não mudaram, então nenhuma faixa da triagem se
 * moveu — o exemplo continua mostrando exatamente a mesma carteira.
 */

export interface EmpresaExemplo extends EmpresaBruta {
  razao_social: string;
  cnpj: string;
}

/**
 * DOZE EMPRESAS, escolhidas para caber a carteira inteira num olhar.
 *
 * A distribuição não é aleatória: ela reproduz o que a triagem realmente
 * encontra numa carteira de escritório — a maioria fora da decisão, um punhado
 * que precisa decidir, e as exceções que o contador reconhece de imediato
 * (MEI, baixada, presumido). Uma carteira de exemplo só com casos bonitos
 * mentiria sobre o trabalho.
 */
export const CARTEIRA_EXEMPLO: EmpresaExemplo[] = [
  { razao_social: "Aurora Distribuidora de Peças Ltda", cnpj: "11222333000181", cnae_principal: "4530-7/03", porte: "EPP", situacao: "ATIVA", regime: "Simples Nacional", faturamento_faixa: "2.400.000" },
  { razao_social: "Metalúrgica Ponte Nova Ltda",        cnpj: "07526557000100", cnae_principal: "2599-3/99", porte: "EPP", situacao: "ATIVA", regime: "Simples Nacional", faturamento_faixa: "3.100.000" },
  { razao_social: "Softlar Sistemas Ltda",              cnpj: "22333444000181", cnae_principal: "6201-5/01", porte: "ME",  situacao: "ATIVA", regime: "Simples Nacional", faturamento_faixa: "980.000" },
  { razao_social: "Transportes Vale Claro Ltda",        cnpj: "33444555000181", cnae_principal: "4930-2/02", porte: "EPP", situacao: "ATIVA", regime: "Simples Nacional", faturamento_faixa: "1.750.000" },
  { razao_social: "Gráfica Bandeirante Ltda",           cnpj: "44555666000181", cnae_principal: "1813-0/01", porte: "ME",  situacao: "ATIVA", regime: "Simples Nacional", faturamento_faixa: "620.000" },
  { razao_social: "Consultoria Prumo Ltda",             cnpj: "55666777000181", cnae_principal: "7020-4/00", porte: "ME",  situacao: "ATIVA", regime: "Simples Nacional", faturamento_faixa: "410.000" },
  { razao_social: "Padaria Trigo de Ouro Ltda",         cnpj: "66777888000181", cnae_principal: "4721-1/02", porte: "ME",  situacao: "ATIVA", regime: "Simples Nacional", faturamento_faixa: "540.000" },
  { razao_social: "Salão Bem Estar Ltda",               cnpj: "77888999000181", cnae_principal: "9602-5/01", porte: "ME",  situacao: "ATIVA", regime: "Simples Nacional", faturamento_faixa: "180.000" },
  { razao_social: "Mercearia São Judas Ltda",           cnpj: "88999000000198", cnae_principal: "4712-1/00", porte: "ME",  situacao: "ATIVA", regime: "Simples Nacional", faturamento_faixa: "300.000" },
  { razao_social: "João da Silva Serviços MEI",         cnpj: "99000111000165", cnae_principal: "4321-5/00", porte: "MEI", situacao: "ATIVA", regime: "MEI",             faturamento_faixa: "70.000" },
  { razao_social: "Comercial Antiga Ltda",              cnpj: "10111222000135", cnae_principal: "4649-4/99", porte: "ME",  situacao: "BAIXADA", regime: "Simples Nacional", faturamento_faixa: "0" },
  { razao_social: "Indústria Sul Forte S/A",            cnpj: "12222333000144", cnae_principal: "2229-3/99", porte: "DEMAIS", situacao: "ATIVA", regime: "Lucro Presumido", faturamento_faixa: "9.400.000" },
];

export interface LinhaCarteira {
  razao_social: string;
  cnpj: string;
  faixa: string;
  motivo: string;
  prioridade: boolean;
}

/** a carteira já triada — pela `triar()` de produção, não por uma cópia */
export function carteiraTriada(): LinhaCarteira[] {
  return CARTEIRA_EXEMPLO.map((e) => {
    const t = triar(e);
    return {
      razao_social: e.razao_social,
      cnpj: e.cnpj,
      faixa: t.faixa,
      motivo: t.motivo,
      prioridade: t.prioridade_maxima,
    };
  });
}

export function contagemPorFaixa(linhas: LinhaCarteira[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const l of linhas) c[l.faixa] = (c[l.faixa] || 0) + 1;
  return c;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A EMPRESA DO LAUDO É DERIVADA DA TRIAGEM, não escolhida à mão.
 *
 * A primeira versão fixava a primeira empresa da lista e o texto dizia "a
 * primeira da faixa A". Só que a `triar()` classificou aquela como **C** — o
 * CNAE dela não tem perfil dominante. A página passou a mostrar uma tabela
 * dizendo C e um parágrafo dizendo A, com um laudo de decisão para uma empresa
 * que a própria triagem mandava manter.
 *
 * Num exemplo cujo argumento inteiro é "veja com os seus olhos", essa é a pior
 * contradição possível: quem lê com atenção — que é exatamente quem a gente
 * quer — descobre o erro em cinco segundos e conclui que o produto não bate.
 *
 * A correção não é trocar a empresa: é PERGUNTAR À TRIAGEM qual delas é da
 * faixa A. Assim, mexer na carteira de exemplo ou na regra de triagem não tem
 * como produzir a contradição de novo.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function empresaDoLaudo(): LinhaCarteira {
  const a = carteiraTriada().find((l) => l.faixa === "A");
  if (!a) throw new Error("a carteira de exemplo precisa ter ao menos uma empresa na faixa A");
  return a;
}

/**
 * As respostas da análise: metalúrgica EPP vendendo para indústria e
 * montadoras. Quase tudo para quem aproveita crédito — o caso em que a decisão
 * de setembro tem consequência real, que é o que o exemplo precisa mostrar.
 */
const RESPOSTAS_EXEMPLO: Respostas = {
  b2b: 0.85,   // vende para empresa
  qual: 0.9,   // que aproveita crédito
  cred: 0.55,  // com crédito na entrada
  folha: 0.14,
  preco: 2,
  conc: 1,
  exig: 1,
};

/* coerentes com a empresa que a triagem escolhe: EPP industrial, anexo II */
const RBT12_EXEMPLO = 3_100_000;
const ANEXO_EXEMPLO = 2;

/**
 * O laudo de exemplo, montado com o MESMO encadeamento da rota de análise.
 *
 * A data entra como argumento: o carimbo da alíquota imprime "consultado em",
 * e um exemplo que muda de conteúdo a cada visita não pode ser conferido por
 * quem o recebeu ontem.
 */
export function analiseExemplo(agora: string): AnaliseGravada {
  const ddas = dDASefetivo(ANEXO_EXEMPLO, RBT12_EXEMPLO);
  const base = { ...PARAMETROS_2027, das: ddas.das, rbt12: RBT12_EXEMPLO };
  const r = decidir(RESPOSTAS_EXEMPLO, base);

  const dinheiro = emReais(r, RBT12_EXEMPLO, 4_800);

  return {
    id: "exemplo",
    rq: r.rq,
    ch: r.ch,
    cl: r.cl,
    re: isFinite(r.re) ? r.re : null,
    fc: r.fc,
    saida: r.saida,
    prioridade: r.prioridade,
    respostas: RESPOSTAS_EXEMPLO as unknown as Record<string, number>,
    calculado_em: agora,
    parametros: {
      exercicio: 2027,
      aliquota: base.aliquota,
      das: ddas.das,
      sublimite: base.sublimite,
      bandaSublimite: base.bandaSublimite,
      rbt12: RBT12_EXEMPLO,
      anexo: ddas.anexo,
      segmentos: null,
      segregado: false,
      ddas,
      partilha: sharePCDe(ddas.anexo, ddas.faixa, 2027),
      motivo: r.motivo,
      banda_sublimite: !!r.banda_sublimite,
      carimbo: carimboAliquota(base.aliquota, agora),
      cenarios: cenarios(RESPOSTAS_EXEMPLO, base),
      dinheiro,
      sensibilidade: sensibilidade(RESPOSTAS_EXEMPLO, base, dinheiro),
      custo_apuracao_anual: 4_800,
      detalhes: null,
      origens: null,
      fator_r: alertaFatorR(ANEXO_EXEMPLO, RESPOSTAS_EXEMPLO.folha),
      anexo_confirmado: true,
    },
  } as AnaliseGravada;
}

/**
 * O ESCRITÓRIO DO EXEMPLO É FICTÍCIO TAMBÉM.
 *
 * Poderia ser o seu, e a tentação é grande — ficaria mais bonito. Mas o laudo
 * sai com a marca de QUEM ASSINA, e é isso que o exemplo precisa comunicar:
 * quem recebe tem que enxergar o próprio nome ali, não o meu.
 */
export const ESCRITORIO_EXEMPLO = {
  nome: "Contabilidade Modelo",
  crc: "CRC-SP 000.000/O-0",
  logo_url: null,
} as const;
