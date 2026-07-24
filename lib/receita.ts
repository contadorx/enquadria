/**
 * ENRIQUECIMENTO CONTRA A BASE DA RECEITA
 *
 * A base (Estabelecimentos, Empresas, Sócios) vive no PostgreSQL do Contabo,
 * não no Supabase. Este app NÃO fala com o Contabo direto — chama um endpoint
 * HTTP que você expõe lá (o mesmo padrão da API de dados do Contatia).
 *
 * DESENHO: degrada com elegância. Se RECEITA_API_URL não estiver configurada,
 * ou a chamada falhar, o enriquecimento é pulado e a triagem roda com o que
 * veio no CSV. O produto funciona sem a base — só perde a mágica do primeiro
 * clique. Isso mantém a fatia 2 entregável sem depender de infra externa.
 *
 * CONTRATO ESPERADO do endpoint (POST):
 *   entrada:  { "cnpjs": ["11222333000181", ...] }   (só dígitos)
 *   saída:    { "11222333000181": {
 *                 cnae_principal, cnaes_secundarios, porte, situacao, anexo
 *              }, ... }
 */

export interface DadosReceita {
  cnae_principal?: string;
  cnaes_secundarios?: string[];
  porte?: string;
  situacao?: string;
  anexo?: number;
}

const CHUNK = 200;

export async function enriquecer(
  cnpjs: string[]
): Promise<{ dados: Record<string, DadosReceita>; ativo: boolean }> {
  const url = process.env.RECEITA_API_URL;
  const token = process.env.RECEITA_API_TOKEN;

  if (!url) return { dados: {}, ativo: false };

  const dados: Record<string, DadosReceita> = {};

  for (let i = 0; i < cnpjs.length; i += CHUNK) {
    const lote = cnpjs.slice(i, i + CHUNK);
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ cnpjs: lote }),
        cache: "no-store",
      });
      if (!resp.ok) continue;
      const json = (await resp.json()) as Record<string, DadosReceita>;
      Object.assign(dados, json);
    } catch {
      // rede fora ou endpoint indisponível — segue com o que já tem
      continue;
    }
  }

  return { dados, ativo: true };
}

/** funde o dado da Receita sobre o do CSV; a Receita é a fonte mais confiável */
export function fundir<T extends object>(csv: T, receita?: DadosReceita): T & DadosReceita {
  if (!receita) return csv as T & DadosReceita;
  const limpo: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(receita)) {
    if (v !== null && v !== undefined && v !== "") limpo[k] = v;
  }
  return { ...csv, ...(limpo as DadosReceita) };
}
