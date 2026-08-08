import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase-admin";
import { limparCnpj, cnpjValido } from "@/lib/cnpj";

/**
 * VERIFICAÇÃO PÚBLICA DE DOCUMENTOS.
 *
 * Até aqui a prova só existia dentro do app: quem recebia um laudo ou um termo
 * não tinha como confirmar que aquilo era autêntico. Isto resolve — o cliente,
 * um comprador da empresa, um auditor ou o próprio contador conferem a origem
 * do documento sem depender da palavra de ninguém.
 *
 * PRINCÍPIOS DE PRIVACIDADE E SEGURANÇA:
 *  • Devolve o MÍNIMO: existência, data, empresa (CNPJ mascarado), escritório e,
 *    no termo, o status da assinatura. NUNCA premissas, números ou contatos.
 *  • Exige DOIS dados que só quem tem o documento possui (número + CNPJ), ou o
 *    hash completo. Sem isso não há como varrer a base por tentativa.
 *  • Resposta idêntica para "não existe" e "dados não conferem" — não confirma
 *    a existência de um número quando o CNPJ está errado.
 *  • Roda com service role porque é público e sem sessão; por isso a seleção de
 *    campos é explícita e restrita.
 */

export const dynamic = "force-dynamic";

const mascararCnpjPublico = (cnpj?: string | null) => {
  // limparCnpj e nao replace(/\D/g): o alfanumerico perderia as letras e
  // mascararia a empresa errada na pagina publica de verificacao.
  const d = limparCnpj(cnpj || "");
  if (d.length !== 14) return "—";
  return `**.***.${d.slice(5, 8)}/${d.slice(8, 12)}-**`;
};

const NAO_ENCONTRADO = {
  encontrado: false,
  mensagem:
    "Nenhum documento corresponde aos dados informados. Confira o número e o CNPJ exatamente como aparecem no documento.",
};

/** teto de consultas por origem numa janela curta */
const LIMITE_TENTATIVAS = 20;
const JANELA_MINUTOS = 10;

/**
 * Identifica a origem sem guardar o IP.
 *
 * LGPD: endereço IP é dado pessoal. Guardamos apenas um hash com sal do
 * servidor — serve para agrupar tentativas da mesma origem e não permite
 * reconstruir o endereço. Sem sal configurado, cai no nome do host (o
 * limitador fica mais frouxo, mas nunca vaza IP).
 */
function origemHash(req: Request): string {
  const h = req.headers;
  const ip =
    (h.get("x-forwarded-for") || "").split(",")[0].trim() ||
    h.get("x-real-ip") ||
    h.get("cf-connecting-ip") ||
    "desconhecido";
  const sal = process.env.VERIFICACAO_SALT || process.env.CRON_SECRET || "enquadria";
  return createHash("sha256").update(`${sal}:${ip}`).digest("hex");
}

export async function POST(req: Request) {
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json(
      { erro: "verificação indisponível no momento" },
      { status: 503 }
    );
  }

  let corpo: { tipo?: "laudo" | "termo"; numero?: string; cnpj?: string; hash?: string };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  // rota aberta precisa de teto: sem isso, varrer a base é só questão de tempo
  const { data: tentativas, error: erroLimite } = await supabase.rpc(
    "registrar_tentativa_verificacao",
    { p_origem: origemHash(req), p_janela_minutos: JANELA_MINUTOS }
  );
  /* O LIMITADOR FALHAVA ABERTO E CALADO — 08/08/2026. O `error` da RPC não era
     lido: se ela sumisse, mudasse de assinatura ou desse erro, `data` vinha
     nulo, `typeof null !== "number"` e o teto desaparecia sem um único registro.
     Rota pública sem teto é rota que alguém varre. Não recuso a consulta por
     causa disso (derrubar a verificação do cliente por defeito nosso seria
     pior), mas o log tem de existir para alguém descobrir. */
  if (erroLimite) {
    console.error("[verificar] limitador indisponível:", erroLimite.message);
  }
  if (typeof tentativas === "number" && tentativas > LIMITE_TENTATIVAS) {
    return NextResponse.json(
      {
        erro: `Muitas consultas seguidas. Aguarde ${JANELA_MINUTOS} minutos e tente novamente.`,
      },
      { status: 429 }
    );
  }

  // ---------------------------------------------------------- por hash -----
  if (corpo.hash) {
    const hash = corpo.hash.trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(hash)) {
      return NextResponse.json(
        { erro: "o hash deve ter 64 caracteres hexadecimais" },
        { status: 400 }
      );
    }
    const { data: termo } = await supabase
      .from("termos")
      .select("assinatura_status, assinado_em, criado_em, metodo, hash_documento, snapshot, carimbo")
      .eq("hash_documento", hash)
      .maybeSingle();

    if (!termo) return NextResponse.json(NAO_ENCONTRADO);

    const snap = termo.snapshot as {
      empresa?: { razao_social?: string; cnpj?: string };
      escritorio?: { nome?: string; crc?: string };
      decisao?: string;
    } | null;

    return NextResponse.json({
      encontrado: true,
      tipo: "termo",
      empresa: snap?.empresa?.razao_social ?? "—",
      cnpj: mascararCnpjPublico(snap?.empresa?.cnpj),
      escritorio: snap?.escritorio?.nome ?? "—",
      crc: snap?.escritorio?.crc ?? null,
      criado_em: termo.criado_em,
      assinado: termo.assinatura_status === "assinado" || !!termo.assinado_em,
      assinado_em: termo.assinado_em,
      metodo: termo.metodo,
      hash: termo.hash_documento,
      carimbo: (termo.carimbo as { fonte?: string; carimbo_em?: string } | null)?.carimbo_em ?? null,
    });
  }

  // ------------------------------------------------- por número + CNPJ -----
  const numero = parseInt(String(corpo.numero ?? "").replace(/\D/g, ""), 10);
  // ATENÇÃO: normalizarCnpj() completa com zeros à esquerda — CNPJ vazio viraria
  // 14 caracteres e passaria por uma checagem de tamanho. Aqui se exige que os
  // 14 caracteres tenham sido REALMENTE digitados, e que o verificador confira.
  const cnpj = limparCnpj(String(corpo.cnpj ?? ""));
  if (!Number.isFinite(numero) || numero <= 0) {
    return NextResponse.json({ erro: "informe o número do documento" }, { status: 400 });
  }
  if (cnpj.length !== 14) {
    return NextResponse.json(
      { erro: "informe o CNPJ completo da empresa, com 14 caracteres" },
      { status: 400 }
    );
  }
  if (!cnpjValido(cnpj)) {
    return NextResponse.json(
      { erro: "esse CNPJ não é válido — confira os dígitos" },
      { status: 400 }
    );
  }

  if (corpo.tipo === "termo") {
    // termos não são numerados; a busca por termo é pelo hash
    return NextResponse.json({
      encontrado: false,
      mensagem:
        "Para verificar um termo de ciência, use o código de verificação (hash) impresso no rodapé do documento.",
    });
  }

  // laudo: número é por escritório, então pode repetir entre escritórios —
  // o CNPJ é o que identifica o documento certo
  /**
   * O NÚMERO É POR ESCRITÓRIO — E ERA POR ISSO QUE A VERIFICAÇÃO IA QUEBRAR.
   *
   * Conserto de 08/08/2026. A consulta era `.eq("numero", n).limit(50)`, SEM
   * ordenação. Como cada escritório numera a partir do 0001, o laudo nº 1
   * existe uma vez por tenant: passando de cinquenta escritórios, o documento
   * legítimo do cliente podia não estar entre os cinquenta que o banco
   * devolvesse — e sem `order by` o corte é arbitrário, então nem sempre o
   * mesmo. A resposta era "Nenhum documento corresponde aos dados informados".
   *
   * É o pior tipo de defeito que este produto pode ter: silencioso, do lado do
   * cliente do contador, no momento em que ele foi conferir se o papel é
   * verdadeiro — e piorando conforme a base cresce.
   *
   * O CNPJ não dá para filtrar no banco (mora dentro do snapshot, e a grafia
   * gravada varia), então a comparação continua em memória; o que muda é que a
   * varredura agora é paginada e ORDENADA, até achar ou acabar. Ordem estável
   * = resposta estável.
   */
  const POR_PAGINA = 200;
  const MAX_PAGINAS = 25; // 5.000 laudos com o mesmo número: aí o desenho muda, não o limite
  let achado: { numero: number; emitido_em: string; snapshot: unknown } | undefined;

  for (let pagina = 0; pagina < MAX_PAGINAS && !achado; pagina++) {
    const { data: candidatos } = await supabase
      .from("laudos")
      .select("numero, emitido_em, snapshot")
      .eq("numero", numero)
      .order("emitido_em", { ascending: true })
      .range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1);

    if (!candidatos?.length) break;

    achado = candidatos.find((l) => {
      const snap = l.snapshot as { empresa?: { cnpj?: string } } | null;
      return limparCnpj(snap?.empresa?.cnpj ?? "") === cnpj;
    });

    if (candidatos.length < POR_PAGINA) break;
  }

  if (!achado) return NextResponse.json(NAO_ENCONTRADO);

  const snap = achado.snapshot as {
    empresa?: { razao_social?: string; cnpj?: string };
    escritorio?: { nome?: string; crc?: string };
    janela?: string | null;
    congelado_em?: string;
  } | null;

  return NextResponse.json({
    encontrado: true,
    tipo: "laudo",
    numero: achado.numero,
    empresa: snap?.empresa?.razao_social ?? "—",
    cnpj: mascararCnpjPublico(snap?.empresa?.cnpj),
    escritorio: snap?.escritorio?.nome ?? "—",
    crc: snap?.escritorio?.crc ?? null,
    emitido_em: achado.emitido_em,
    janela: snap?.janela ?? null,
  });
}
