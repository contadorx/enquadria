/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OS FILTROS DO EXTRATO — a diferença entre 30 linhas e o extrato inteiro.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A tela mostrava as 30 faturas mais recentes, sem filtro. Isso responde "o que
 * aconteceu esta semana?" e não responde nenhuma das perguntas que aparecem
 * quando alguém liga: "quanto esse escritório já pagou?", "o que venceu em
 * julho?", "quem está com boleto aberto acima de R$ 300?".
 *
 * A regra de desenho aqui é uma só e vale a pena escrever: TODO filtro
 * aplicado tem de estar visível, e o total tem de dizer sobre o que ele é.
 * Um extrato filtrado que mostra "R$ 4.700" sem dizer "de 12 faturas pagas em
 * julho do escritório X" é a forma mais rápida de alguém tomar uma decisão com
 * o número errado — e nem saber.
 *
 * Tudo aqui é função pura sobre a lista já carregada. Filtrar no cliente tem um
 * teto de tamanho, e ele está declarado em `LIMITE_SEGURO`: passando disso, o
 * filtro precisa ir para o banco, e a tela avisa em vez de mentir por
 * truncamento silencioso.
 */
import { statusEfetivo, type Fatura, type StatusFatura } from "./faturas";

/** acima disto, filtrar no cliente deixa de ser honesto — ver `avisoDeTamanho` */
export const LIMITE_SEGURO = 2000;

export interface FiltroFaturas {
  /** tenant_id do contratante; vazio = todos */
  contratante?: string;
  /** nome do plano, como gravado na fatura; vazio = todos */
  plano?: string;
  status?: StatusFatura | "";
  /** intervalo sobre a data escolhida em `campoData` */
  de?: string;
  ate?: string;
  /** qual data o intervalo filtra: vencimento (padrão) ou pagamento */
  campoData?: "vencimento" | "pago_em";
  /** faixa de valor, em REAIS (a tela fala em reais; o banco guarda centavos) */
  valorMin?: number | null;
  valorMax?: number | null;
  /** busca livre por descrição ou nome do plano */
  busca?: string;
}

const semAcento = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * O FILTRO. Campo vazio não filtra — e essa é a decisão que evita o bug
 * clássico: `valorMin = 0` é um filtro de verdade ("acima de zero"), enquanto
 * `valorMin = null` é "não filtrei". Tratar os dois igual faria o campo em
 * branco esconder as faturas de valor zero, que são justamente as de cortesia.
 */
export function filtrar(lista: Fatura[], f: FiltroFaturas, hoje: Date): Fatura[] {
  const campo = f.campoData ?? "vencimento";
  const busca = f.busca ? semAcento(f.busca.trim()) : "";

  return lista.filter((x) => {
    if (f.contratante && x.tenant_id !== f.contratante) return false;
    if (f.plano && (x.plano_nome ?? "") !== f.plano) return false;
    if (f.status && statusEfetivo(x, hoje) !== f.status) return false;

    /* a data pode ser nula (fatura sem vencimento, fatura não paga). Uma linha
       sem a data filtrada sai do resultado — ela não é "antes" nem "depois". */
    if (f.de || f.ate) {
      const d = (campo === "pago_em" ? x.pago_em : x.vencimento) ?? "";
      if (!d) return false;
      const dia = d.slice(0, 10);
      if (f.de && dia < f.de) return false;
      if (f.ate && dia > f.ate) return false;
    }

    const reais = Number(x.valor_centavos ?? 0) / 100;
    if (f.valorMin != null && reais < f.valorMin) return false;
    if (f.valorMax != null && reais > f.valorMax) return false;

    if (busca) {
      const alvo = semAcento(`${x.descricao ?? ""} ${x.plano_nome ?? ""}`);
      if (!alvo.includes(busca)) return false;
    }
    return true;
  });
}

export interface TotaisFiltrados {
  linhas: number;
  total_centavos: number;
  pago_centavos: number;
  aberto_centavos: number;
  vencido_centavos: number;
}

/**
 * OS TOTAIS DO QUE ESTÁ NA TELA — não do banco inteiro.
 *
 * Somar tudo enquanto se mostra um recorte é como o número errado entra numa
 * decisão. Aqui a soma é exatamente sobre as linhas filtradas, e a tela é
 * obrigada a dizer isso ao lado (ver `descreverFiltro`).
 */
export function totalizar(lista: Fatura[], hoje: Date): TotaisFiltrados {
  const t: TotaisFiltrados = {
    linhas: lista.length,
    total_centavos: 0,
    pago_centavos: 0,
    aberto_centavos: 0,
    vencido_centavos: 0,
  };
  for (const f of lista) {
    const v = Number(f.valor_centavos ?? 0);
    t.total_centavos += v;
    const s = statusEfetivo(f, hoje);
    if (s === "pago") t.pago_centavos += v;
    else if (s === "vencido") t.vencido_centavos += v;
    else if (s === "pendente") t.aberto_centavos += v;
  }
  return t;
}

/**
 * O FILTRO EM PORTUGUÊS. Existe para o total nunca aparecer sozinho.
 *
 * Quem lê "R$ 4.700,00" precisa ler junto de que recorte esse número é. Sem
 * isso, um filtro esquecido de uma sessão anterior vira um relatório errado com
 * cara de certo.
 */
export function descreverFiltro(
  f: FiltroFaturas,
  nomeContratante?: (id: string) => string | undefined
): string {
  const p: string[] = [];
  if (f.contratante) p.push(nomeContratante?.(f.contratante) ?? "um contratante");
  if (f.plano) p.push(`plano ${f.plano}`);
  if (f.status) p.push(`status ${f.status}`);
  if (f.de || f.ate) {
    const campo = (f.campoData ?? "vencimento") === "pago_em" ? "pagamento" : "vencimento";
    const br = (d: string) => d.split("-").reverse().join("/");
    if (f.de && f.ate) p.push(`${campo} de ${br(f.de)} a ${br(f.ate)}`);
    else if (f.de) p.push(`${campo} a partir de ${br(f.de)}`);
    else if (f.ate) p.push(`${campo} até ${br(f.ate as string)}`);
  }
  if (f.valorMin != null && f.valorMax != null) p.push(`valor de R$ ${f.valorMin} a R$ ${f.valorMax}`);
  else if (f.valorMin != null) p.push(`valor a partir de R$ ${f.valorMin}`);
  else if (f.valorMax != null) p.push(`valor até R$ ${f.valorMax}`);
  if (f.busca) p.push(`contendo “${f.busca}”`);

  return p.length ? p.join(" · ") : "sem filtro — o extrato inteiro";
}

/** true quando algum filtro está ativo; a tela usa para oferecer "limpar" */
export function temFiltro(f: FiltroFaturas): boolean {
  return descreverFiltro(f) !== "sem filtro — o extrato inteiro";
}

/**
 * O AVISO DE TAMANHO. Filtrar no cliente funciona até certo ponto; passando
 * dele, a tela precisa dizer que está olhando um pedaço — e não deixar o
 * usuário concluir, do silêncio, que aquele é o extrato inteiro.
 */
export function avisoDeTamanho(carregadas: number, limite = LIMITE_SEGURO): string | null {
  if (carregadas < limite) return null;
  return (
    `Carregadas as ${limite} faturas mais recentes. Os filtros e os totais desta tela valem sobre ` +
    "essas linhas, não sobre o histórico inteiro — a partir daqui o filtro precisa ir para o banco."
  );
}

/** os valores distintos para montar as listas dos seletores */
export function opcoesDe(lista: Fatura[]): { planos: string[]; contratantes: string[] } {
  const planos = new Set<string>();
  const contratantes = new Set<string>();
  for (const f of lista) {
    if (f.plano_nome) planos.add(f.plano_nome);
    if (f.tenant_id) contratantes.add(f.tenant_id);
  }
  return {
    planos: Array.from(planos).sort((a, b) => a.localeCompare(b, "pt-BR")),
    contratantes: Array.from(contratantes),
  };
}
