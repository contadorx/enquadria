/**
 * ENRIQUECIMENTO CONTRA A BASE DA RECEITA
 *
 * A base (Estabelecimentos, Empresas, Sócios) vive no PostgreSQL do Contabo,
 * não no Supabase. Este app NÃO fala com o Contabo direto — chama um endpoint
 * HTTP exposto lá (a mesma API de dados do Contatia).
 *
 * DESENHO: degrada com elegância. Se RECEITA_API_URL não estiver configurada,
 * ou a chamada falhar, o enriquecimento é pulado e a triagem roda com o que
 * veio no CSV. O produto funciona sem a base — só perde a mágica do primeiro
 * clique.
 *
 * CONTRATO ESPERADO do endpoint (POST):
 *   entrada:  { "cnpjs": ["11222333000181", "PC3D315K000193", ...] }
 *   saída:    { "11222333000181": {
 *                 razao_social, nome_fantasia, cnae_principal,
 *                 cnaes_secundarios, porte, situacao, anexo, ...
 *              }, ... }
 *
 * A ROTA. A API do Contatia expõe `/health`, `/atividades`, `/buscar` e
 * `/empresa/:cnpj` — nenhuma delas resolve "me dê 143 CNPJs de uma vez". A
 * rota `/lote` foi escrita para isso (ver `receita-api-lote.js`). Se
 * RECEITA_API_URL vier só com a origem (https://receita.contatia.com.br), o
 * `/lote` é acrescentado aqui, para não depender de mexer na env. Se vier com
 * caminho, o caminho é respeitado — nada de mágica por cima de escolha
 * explícita.
 */

export interface DadosReceita {
  /** razão social oficial — só sobrescreve a do CSV quando lá não veio nada */
  razao_social?: string;
  nome_fantasia?: string;
  cnae_principal?: string;
  cnaes_secundarios?: string[];
  porte?: string;
  situacao?: string;
  /** regime tributário; hoje só chega se a base carregar o Simples.zip */
  regime?: string;
  anexo?: number;
  uf?: string;
  municipio?: string;
  email?: string;
  telefone?: string;
}

export interface ResultadoEnriquecimento {
  dados: Record<string, DadosReceita>;
  /**
   * true quando o enriquecimento REALMENTE respondeu ao menos uma vez.
   *
   * Antes isto era `true` sempre que a env existia, mesmo com todos os lotes
   * falhando — e a tela dizia "0 enriquecidas contra a base da Receita" como
   * se a base tivesse respondido "não achei nenhuma". São diagnósticos
   * opostos: um é carteira desconhecida, o outro é integração quebrada.
   */
  ativo: boolean;
  /** a env está setada — separa "não configurado" de "configurado e falhou" */
  configurado: boolean;
  /** quantos lotes não responderam 200, para a tela poder dizer a verdade */
  falhas: number;
  /**
   * O QUE EXATAMENTE DEU ERRADO, em uma linha.
   *
   * "A base não respondeu" é diagnóstico de nada: 401 (token), 404 (rota),
   * ENOTFOUND (DNS) e timeout exigem quatro ações diferentes. Sem isto, quem
   * for depurar precisa adivinhar — e a única pessoa que pode olhar o servidor
   * não é quem está lendo a tela.
   */
  detalhe?: string;
  /** a URL efetivamente chamada, sem o token */
  url?: string;
}

const CHUNK = 200;
const TIMEOUT_MS = 12_000;

/** origem sem caminho → acrescenta /lote; com caminho → respeita o que veio */
function urlDoLote(bruta: string): string {
  try {
    const u = new URL(bruta);
    if (u.pathname === "" || u.pathname === "/") {
      u.pathname = "/lote";
      return u.toString();
    }
    return bruta;
  } catch {
    return bruta;
  }
}

export async function enriquecer(cnpjs: string[]): Promise<ResultadoEnriquecimento> {
  const base = process.env.RECEITA_API_URL;
  const token = process.env.RECEITA_API_TOKEN;

  if (!base) return { dados: {}, ativo: false, configurado: false, falhas: 0 };

  const url = urlDoLote(base);
  const dados: Record<string, DadosReceita> = {};
  let respondeu = false;
  let falhas = 0;
  let detalhe: string | undefined;

  for (let i = 0; i < cnpjs.length; i += CHUNK) {
    const lote = cnpjs.slice(i, i + CHUNK);
    try {
      // timeout explícito: sem ele, um Contabo lento segura o handler da
      // Vercel até o limite da função e a importação inteira morre por causa
      // do extra, não do essencial.
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ cnpjs: lote }),
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!resp.ok) {
        falhas += 1;
        if (!detalhe) {
          const corpo = await resp.text().catch(() => "");
          detalhe =
            `HTTP ${resp.status}` +
            (resp.status === 401 ? " — token recusado (RECEITA_API_TOKEN)" : "") +
            (resp.status === 404 ? " — rota /lote não existe no servidor" : "") +
            (corpo ? ` · ${corpo.slice(0, 120)}` : "");
        }
        continue;
      }
      const json = (await resp.json()) as Record<string, DadosReceita>;
      Object.assign(dados, json);
      respondeu = true;
    } catch (e) {
      // rede fora, timeout ou endpoint indisponível — segue com o que já tem
      falhas += 1;
      if (!detalhe) {
        const m = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
        detalhe = /timeout|abort/i.test(m) ? `sem resposta em ${TIMEOUT_MS / 1000}s` : m;
      }
      continue;
    }
  }

  return { dados, ativo: respondeu, configurado: true, falhas, detalhe, url };
}

/** um campo em que o arquivo do escritório e a Receita discordam */
export interface Divergencia {
  cnpj: string;
  razao_social: string;
  campo: "cnae_principal" | "porte" | "situacao" | "regime" | "anexo";
  do_arquivo: string;
  da_receita: string;
}

/** o rótulo que a tela usa — o nome do campo não é para os olhos do contador */
export const ROTULO_CAMPO: Record<Divergencia["campo"], string> = {
  cnae_principal: "CNAE",
  porte: "porte",
  situacao: "situação cadastral",
  regime: "regime",
  anexo: "anexo",
};

/** os campos que mudam a FAIXA — divergir neles muda a fila, não a estética */
const CAMPOS_DA_TRIAGEM: Divergencia["campo"][] = [
  "cnae_principal",
  "porte",
  "situacao",
  "regime",
  "anexo",
];

const mesmoValor = (a: unknown, b: unknown) =>
  String(a ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "") ===
  String(b ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * O CAMPO ESTÁ VAZIO PARA EFEITO DE FUSÃO?
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * A REGRESSÃO QUE ISTO CONSERTA — 10/08/2026, mesmo dia da mudança
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Quando `fundir` passou a completar lacuna em vez de sobrescrever, quem colava
 * um CNPJ solto parou de receber a razão social. O motivo é sutil e é meu: o
 * parser NUNCA devolve razão social vazia — ele grava o literal
 * `"(sem razão social)"` (lib/csv.ts), que descreve o ARQUIVO e não a empresa.
 * Para um teste de string vazia, isso é um valor preenchido. Resultado: a
 * Receita tinha o nome, o `completar` recusava, e a empresa entrava na carteira
 * chamada "(sem razão social)".
 *
 * A regra da razão social não mudou desde sempre — a do arquivo vence, a da
 * Receita só entra quando não veio nenhuma. O que faltava era ENTENDER que o
 * marcador é ausência escrita por extenso.
 *
 * Fica aqui, e não numa comparação solta, porque o próximo marcador desse tipo
 * (um "—" numa coluna de CNAE, um "N/A" no porte) vai querer o mesmo
 * tratamento, e vai ser neste lugar que alguém procura.
 */
const MARCADORES_DE_AUSENCIA = ["(sem razão social)", "-", "—", "n/a", "na", "null", "undefined"];

function vazioParaFusao(valor: unknown): boolean {
  if (valor === null || valor === undefined) return true;
  if (typeof valor !== "string") return false;
  const t = valor.trim();
  if (t === "") return true;
  return MARCADORES_DE_AUSENCIA.includes(t.toLowerCase());
}

/**
 * Funde o dado da Receita com o do CSV — COMPLETANDO LACUNA, não substituindo.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE ESTAVA ERRADO — 10/08/2026, achado numa gravação que não aconteceu
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A regra era `{...csv, ...receita}`: tudo que a Receita devolvesse substituía
 * o que veio no arquivo, sem dizer. Numa carteira de teste de 14 empresas, a
 * faixa de OITO delas na tela não tinha relação nenhuma com o arquivo
 * importado — CNAE, porte, situação e regime tinham sido trocados no caminho.
 *
 * O comentário antigo defendia a troca dizendo que a Receita "é a fonte mais
 * confiável". Ela é — para quem importou só o CNPJ. Para quem exportou a
 * carteira do próprio sistema, com regime que o escritório mantém, a troca
 * silenciosa faz três coisas ruins de uma vez:
 *
 *   1. muda a FAIXA da empresa, ou seja, muda a fila de trabalho;
 *   2. contradiz a coluna que a própria tela mostra ("Simples Nacional" ao
 *      lado de "Já fora do Simples" — a tela discordando de si mesma);
 *   3. tira do contador uma decisão que é dele. O produto inteiro se sustenta
 *      em "quem decide e assina é o contador"; não dá para pregar isso na
 *      página de vendas e sobrescrever o cadastro dele no importador.
 *
 * A REGRA NOVA. O que veio no arquivo FICA. O que faltava, a Receita completa.
 * Onde os dois divergem, a divergência é REGISTRADA e devolvida para a tela
 * dizer quantas são e quais — e o contador corrige na ficha se quiser.
 *
 * A razão social continua com a regra antiga, que já era esta: só entra a da
 * Receita quando o arquivo não trouxe nenhuma.
 */
export function fundir<T extends { razao_social?: string; cnpj?: string }>(
  csv: T,
  receita?: DadosReceita,
  /* saco onde as divergências são acumuladas; opcional para não obrigar quem
     só quer o objeto fundido a carregar um array */
  divergencias?: Divergencia[]
): T & DadosReceita {
  if (!receita) return csv as T & DadosReceita;

  const doArquivo = csv as unknown as Record<string, unknown>;
  const completar: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(receita)) {
    if (v === null || v === undefined || v === "") continue;

    const atual = doArquivo[k];
    if (vazioParaFusao(atual)) {
      completar[k] = v;
      continue;
    }

    /* o arquivo tem valor e a Receita discorda: o arquivo fica, e a
       divergência vira aviso — mas só nos campos que mexem na triagem, porque
       divergir em município ou telefone não muda fila de ninguém */
    if (
      divergencias &&
      (CAMPOS_DA_TRIAGEM as string[]).includes(k) &&
      !mesmoValor(atual, v)
    ) {
      divergencias.push({
        cnpj: String(csv.cnpj ?? ""),
        razao_social: String(csv.razao_social ?? ""),
        campo: k as Divergencia["campo"],
        do_arquivo: String(atual),
        da_receita: String(v),
      });
    }
  }

  const doCsv = (csv.razao_social || "").trim();
  const temNomeProprio = doCsv.length > 0 && doCsv !== "(sem razão social)";
  if (temNomeProprio) delete completar.razao_social;

  return { ...csv, ...(completar as DadosReceita) };
}
