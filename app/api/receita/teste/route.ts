import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { enriquecer, fundir } from "@/lib/receita";
import { normalizarCnpj, cnpjValido, limparCnpj } from "@/lib/cnpj";
import { extrairCnpjs, csvDeCnpjs, parsearCarteira } from "@/lib/csv";
import { triar, anexoPorCnae } from "@/lib/triagem";

/**
 * DIAGNÓSTICO DO ENRIQUECIMENTO — o instrumento, não o palpite.
 *
 * Quando a Receita não responde, quem está na tela vê "não respondeu" e quem
 * pode olhar o servidor está em outro lugar. Sem um instrumento, a depuração
 * vira troca de mensagens adivinhando entre token, rota, DNS e timeout — que
 * são quatro consertos diferentes.
 *
 * Esta rota faz UMA chamada com um CNPJ conhecido e devolve o que aconteceu:
 * a URL efetivamente usada, se havia token, quanto tempo levou, e o erro exato.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * O MODO `?cnpj=` — acrescentado em 07/08/2026, e o motivo importa.
 *
 * A sonda fixa provou que `enriquecer()` funciona (Petrobras volta em 339 ms) e
 * mesmo assim a importação de CNPJ real voltava vazia. Duas afirmações
 * contraditórias, as duas de pé, e nenhuma forma de decidir entre elas: a sonda
 * testa a FUNÇÃO, e o que falhava era o CAMINHO — extração do texto colado,
 * normalização, validação de DV, e só então a consulta.
 *
 * Diagnóstico que testa um pedaço diferente daquele que quebrou não é
 * diagnóstico: é conforto. Este modo refaz o caminho INTEIRO da importação
 * sobre o texto que a pessoa realmente colou, e mostra em que etapa o CNPJ se
 * perde — sem gravar nada.
 *
 * Uso: /api/receita/teste?cnpj=33.000.167/0001-01
 *      /api/receita/teste?cnpj=<cole aqui a lista inteira, como você colou lá>
 *
 * SEGURANÇA: exige sessão (é rota de painel, não pública) e NUNCA devolve o
 * token — só se ele está presente. Um diagnóstico que vaza credencial é um
 * problema maior do que o que ele resolve.
 */

export const dynamic = "force-dynamic";

/** Petrobras — existe em qualquer carga da base e não é dado de cliente */
const CNPJ_SONDA = "33000167000101";

/** teto do modo manual: é diagnóstico, não importação por atalho */
const MAX_MANUAL = 10;

export async function GET(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });

  const bruto = new URL(req.url).searchParams.get("cnpj");
  if (bruto && bruto.trim()) {
    return NextResponse.json(await rastrear(bruto));
  }

  const t0 = Date.now();
  const r = await enriquecer([CNPJ_SONDA]);
  const ms = Date.now() - t0;

  const achou = r.dados[CNPJ_SONDA];

  let veredito: string;
  let sugestao: string | null = null;

  if (!r.configurado) {
    veredito = "RECEITA_API_URL não está configurada na Vercel";
    sugestao = "Defina RECEITA_API_URL (e RECEITA_API_TOKEN) e faça um novo deploy.";
  } else if (r.ativo && achou) {
    veredito = "funcionando";
    sugestao =
      "A função está de pé. Se a IMPORTAÇÃO de um CNPJ real ainda vem vazia, o problema " +
      "está no caminho, não na conexão: repita com ?cnpj=<o que você colou> para ver em " +
      "que etapa ele se perde.";
  } else if (r.ativo && !achou) {
    veredito = "a base respondeu, mas não tem este CNPJ";
    sugestao =
      "A integração está de pé. Se a sua carteira também volta vazia, a carga da base " +
      "pode estar incompleta — confira o total de estabelecimentos no VPS.";
  } else {
    veredito = `a base não respondeu — ${r.detalhe ?? "motivo desconhecido"}`;
    if (/401/.test(r.detalhe ?? "")) {
      sugestao =
        "O token da Vercel não bate com o do servidor. Compare RECEITA_API_TOKEN na Vercel " +
        "com a variável de token no .env do receita-api.";
    } else if (/404/.test(r.detalhe ?? "")) {
      sugestao =
        "A rota /lote não existe no servidor. Rode o instalar-lote.sh no VPS, ou confira se " +
        "RECEITA_API_URL aponta para o caminho certo.";
    } else if (/sem resposta/.test(r.detalhe ?? "")) {
      sugestao =
        "O servidor não respondeu a tempo. Verifique se o serviço receita-api está ativo e se " +
        "o Postgres da Receita está de pé.";
    } else {
      sugestao =
        "Parece problema de rede ou DNS. Teste do próprio VPS: " +
        "curl -sS -X POST <url>/lote -H 'Authorization: Bearer <token>' " +
        "-H 'Content-Type: application/json' -d '{\"cnpjs\":[\"33000167000101\"]}'";
    }
  }

  return NextResponse.json({
    modo: "sonda",
    veredito,
    sugestao,
    url: r.url ?? null,
    tem_token: !!process.env.RECEITA_API_TOKEN,
    tempo_ms: ms,
    configurado: r.configurado,
    respondeu: r.ativo,
    falhas: r.falhas,
    detalhe: r.detalhe ?? null,
    amostra: achou ?? null,
  });
}

/**
 * REFAZ O CAMINHO DA IMPORTAÇÃO, etapa por etapa, sem gravar nada.
 *
 * A ordem aqui é a MESMA de `Importador.lerColados()` seguida de
 * `/api/importar` — de propósito. Um diagnóstico que usa um caminho parecido
 * responde sobre o caminho parecido.
 */
async function rastrear(bruto: string) {
  /* 1 — extração: é aqui que o texto colado vira lista */
  const extraidos = extrairCnpjs(bruto);

  /* 2 — parse: a mesma função que monta as linhas da prévia */
  const parse = parsearCarteira(csvDeCnpjs(extraidos));
  const linhas = parse.linhas.slice(0, MAX_MANUAL);

  /* 3 — consulta: exatamente as chaves que a importação mandaria */
  const t0 = Date.now();
  const r = linhas.length
    ? await enriquecer(linhas.map((l) => l.cnpj))
    : { dados: {}, ativo: false, configurado: !!process.env.RECEITA_API_URL, falhas: 0, url: undefined };
  const ms = Date.now() - t0;

  const etapas = extraidos.slice(0, MAX_MANUAL).map((e) => {
    const normalizado = normalizarCnpj(e);
    const valido = cnpjValido(e);
    const linha = linhas.find((l) => l.cnpj === normalizado);
    const achado = r.dados[normalizado];
    const fundido = linha ? fundir(linha, achado) : null;
    const t = fundido
      ? triar({
          cnpj: fundido.cnpj,
          razao_social: fundido.razao_social,
          cnae_principal: fundido.cnae_principal ?? null,
          cnaes_secundarios: fundido.cnaes_secundarios ?? null,
          porte: fundido.porte ?? null,
          situacao: fundido.situacao ?? null,
          regime: fundido.regime ?? null,
        })
      : null;

    /* ONDE ELE SE PERDEU — uma etapa só, a primeira que falhou */
    let parou: string | null = null;
    if (!valido) parou = "dígito verificador inválido — a importação descarta antes de consultar";
    else if (!linha) parou = "o parser não montou a linha (não deveria acontecer se o DV é válido)";
    else if (!r.ativo) parou = "a base não respondeu nesta chamada";
    else if (!achado) parou = "a base respondeu e NÃO tem este CNPJ na carga";

    return {
      colado: e,
      limpo: limparCnpj(e),
      normalizado,
      dv_valido: valido,
      chave_consultada: linha ? linha.cnpj : null,
      achado_na_base: !!achado,
      parou_em: parou,
      resultado: fundido
        ? {
            razao_social: fundido.razao_social,
            cnae_principal: fundido.cnae_principal ?? null,
            anexo: fundido.anexo ?? anexoPorCnae(fundido.cnae_principal) ?? null,
            porte: fundido.porte ?? null,
            situacao: fundido.situacao ?? null,
            faixa: t?.faixa ?? null,
          }
        : null,
    };
  });

  const achados = etapas.filter((e) => e.achado_na_base).length;

  let veredito: string;
  if (extraidos.length === 0) {
    veredito =
      "nenhum CNPJ foi extraído do texto — a importação nem chegaria a consultar a base";
  } else if (etapas.every((e) => !e.dv_valido)) {
    veredito = "os CNPJs foram extraídos mas TODOS reprovaram no dígito verificador";
  } else if (!r.ativo) {
    veredito = `a base não respondeu — ${r.detalhe ?? "motivo desconhecido"}`;
  } else if (achados === 0) {
    veredito = "a base respondeu e não tem NENHUM destes CNPJs — carga incompleta";
  } else if (achados < etapas.length) {
    veredito = `a base achou ${achados} de ${etapas.length} — veja parou_em em cada linha`;
  } else {
    veredito = "caminho inteiro OK — a importação destes CNPJs traz os dados da Receita";
  }

  return {
    modo: "rastreio",
    veredito,
    extraidos: extraidos.length,
    consultados: linhas.length,
    achados,
    respondeu: r.ativo,
    falhas: r.falhas,
    detalhe: r.detalhe ?? null,
    url: r.url ?? null,
    tempo_ms: ms,
    truncado: extraidos.length > MAX_MANUAL ? `mostrando ${MAX_MANUAL} de ${extraidos.length}` : null,
    etapas,
  };
}
