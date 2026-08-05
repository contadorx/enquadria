import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase-admin";
import { TOTAL_AULAS, TOTAL_MINUTOS, CURSO, totalMinutos } from "@/lib/curso";

/**
 * EMISSÃO DO CERTIFICADO DO CURSO.
 *
 * Chamada pela página estática do curso quando o participante conclui as nove
 * aulas. Devolve um código público — o mesmo princípio do laudo: documento que
 * ninguém pode conferir não vale como documento.
 *
 * IDEMPOTENTE POR E-MAIL: pedir de novo devolve o MESMO código, em vez de dar
 * dois números para a mesma conclusão. Quem perdeu o link recupera pedindo
 * outra vez, com o mesmo e-mail.
 */

const ORIGENS = [
  "https://enquadria.com.br",
  "https://www.enquadria.com.br",
  "https://app.enquadria.com.br",
];

function cors(origem: string | null) {
  const ok = origem && ORIGENS.includes(origem);
  return {
    "Access-Control-Allow-Origin": ok ? origem : ORIGENS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: cors(req.headers.get("origin")) });
}

/**
 * Código legível em voz alta e difícil de errar: sem I, O, 0 e 1, que o olho
 * troca. 8 caracteres de um alfabeto de 32 dão 2^40 combinações — muito além
 * do que faz sentido tentar adivinhar num certificado de curso gratuito.
 */
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function novoCodigo(): string {
  const bytes = randomBytes(8);
  let s = "";
  for (let i = 0; i < 8; i++) s += ALFABETO[bytes[i] % ALFABETO.length];
  return `EQ-${s.slice(0, 4)}-${s.slice(4)}`;
}

export async function POST(req: Request) {
  const cab = cors(req.headers.get("origin"));

  let corpo: { nome?: string; email?: string; crc?: string };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400, headers: cab });
  }

  const nome = (corpo.nome ?? "").trim().replace(/\s+/g, " ");
  const email = (corpo.email ?? "").trim().toLowerCase();
  const crc = (corpo.crc ?? "").trim() || null;

  if (nome.length < 3 || !nome.includes(" ")) {
    return NextResponse.json({ erro: "Informe o nome completo, como deve sair no certificado." }, { status: 400, headers: cab });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return NextResponse.json({ erro: "Confira o e-mail — parece incompleto." }, { status: 400, headers: cab });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json(
      { erro: "A emissão de certificado ainda não está configurada. Escreva para contato@enquadria.com.br." },
      { status: 503, headers: cab }
    );
  }

  // já emitiu? devolve o mesmo — dois códigos para a mesma conclusão é bug.
  // Devolve TAMBÉM a data de emissão: quem recupera o certificado meses depois
  // precisa levar a data verdadeira para o perfil do LinkedIn, não a de hoje.
  const { data: existente } = await supabase
    .from("curso_certificados")
    .select("codigo, emitido_em")
    .eq("email", email)
    .eq("curso", CURSO.nome)
    .maybeSingle();

  if (existente?.codigo) {
    return NextResponse.json(
      { ok: true, codigo: existente.codigo, emitido_em: existente.emitido_em, ja_existia: true },
      { headers: cab }
    );
  }

  /**
   * A CARGA HORÁRIA DO CERTIFICADO É A MEDIDA, não a estimada.
   *
   * O certificado é um documento que o aluno põe no LinkedIn. Se ele disser
   * "3h20" e o curso tiver 5h de player, quem confere é o próprio aluno, e o
   * que fica em dúvida é o documento inteiro. `TOTAL_MINUTOS` fica como padrão
   * para o caso de a leitura falhar — errar pela estimativa antiga é melhor
   * que emitir certificado sem carga horária.
   */
  let minutosCurso = TOTAL_MINUTOS;
  try {
    const { data: durs } = await supabase.from("curso_videos").select("slug, minutos");
    minutosCurso = totalMinutos(
      Object.fromEntries(((durs ?? []) as { slug: string; minutos: number | null }[]).map((d) => [d.slug, d.minutos]))
    );
  } catch {
    /* leitura de duração não pode impedir a emissão do certificado */
  }

  const codigo = novoCodigo();
  const { data: criado, error } = await supabase
    .from("curso_certificados")
    .insert({
      codigo,
      nome,
      email,
      crc,
      curso: CURSO.nome,
      aulas: TOTAL_AULAS,
      minutos: minutosCurso,
    })
    .select("emitido_em")
    .single();

  if (error) {
    // corrida entre duas abas do mesmo participante: busca o que ficou
    const { data: agora } = await supabase
      .from("curso_certificados")
      .select("codigo, emitido_em")
      .eq("email", email)
      .eq("curso", CURSO.nome)
      .maybeSingle();
    if (agora?.codigo) {
      return NextResponse.json(
        { ok: true, codigo: agora.codigo, emitido_em: agora.emitido_em, ja_existia: true },
        { headers: cab }
      );
    }
    return NextResponse.json(
      { erro: "Não consegui emitir agora. Tente de novo em instantes." },
      { status: 500, headers: cab }
    );
  }

  return NextResponse.json(
    { ok: true, codigo, emitido_em: criado?.emitido_em ?? null, ja_existia: false },
    { headers: cab }
  );
}
