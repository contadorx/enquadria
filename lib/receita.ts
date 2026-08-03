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
 *   entrada:  { "cnpjs": ["11222333000181", ...] }   (só dígitos)
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

/**
 * Funde o dado da Receita sobre o do CSV. A Receita é a fonte mais confiável
 * para CNAE, porte e situação — MAS NÃO para razão social.
 *
 * O contador costuma ter o cliente cadastrado pelo nome que usa no dia a dia
 * ("Padaria do Zé") e a Receita devolve o nome de registro ("JOSE DA SILVA
 * COMERCIO DE ALIMENTOS LTDA"). Trocar por baixo dos panos faria o contador
 * não reconhecer a própria carteira depois de importar. Então a razão social
 * da Receita só entra quando o CSV não trouxe nenhuma — que é exatamente o
 * caso da importação só com CNPJ.
 */
export function fundir<T extends { razao_social?: string }>(
  csv: T,
  receita?: DadosReceita
): T & DadosReceita {
  if (!receita) return csv as T & DadosReceita;

  const limpo: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(receita)) {
    if (v !== null && v !== undefined && v !== "") limpo[k] = v;
  }

  const doCsv = (csv.razao_social || "").trim();
  const temNomeProprio = doCsv.length > 0 && doCsv !== "(sem razão social)";
  if (temNomeProprio) delete limpo.razao_social;

  return { ...csv, ...(limpo as DadosReceita) };
}
