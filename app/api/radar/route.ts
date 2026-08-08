import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { validar, bloqueado, limparCriterio, type Rascunho } from "@/lib/radar-form";
import { paraSlug, slugUnico } from "@/lib/slug";

/**
 * PUBLICAR NO RADAR.
 *
 * A rota usa o cliente da SESSÃO de propósito: a política `radar_escrita` da
 * migration 0054 exige `e_superadmin()`, e essa é a trava. Usar o service role
 * aqui funcionaria e moveria a regra para dentro deste arquivo — onde a segunda
 * rota que escrever na tabela não a herdaria.
 *
 * A validação de conteúdo é a MESMA função da tela (`lib/radar-form`). Item mal
 * escrito não dá erro de banco: ele sai, ocupa o topo da tela do contador e não
 * diz nada. Duas validações diferentes divergiriam na primeira correção.
 */
export const dynamic = "force-dynamic";

function corpoValido(c: Partial<Rascunho>): Rascunho {
  return {
    titulo: String(c.titulo ?? ""),
    slug: String(c.slug ?? ""),
    resumo: String(c.resumo ?? ""),
    o_que_fazer: String(c.o_que_fazer ?? ""),
    fonte: String(c.fonte ?? ""),
    publicado_em: String(c.publicado_em ?? ""),
    vigencia_em: String(c.vigencia_em ?? ""),
    severidade: String(c.severidade ?? "media"),
    criterio: c.criterio ?? {},
    ativo: c.ativo !== false,
    /* default TRUE: quem publicava antes de existir a coluna publicava alerta,
       e o corpo antigo (sem o campo) tem de continuar significando a mesma
       coisa. Silencioso vira notícia seria mudança de comportamento por
       omissão — o pior tipo. */
    no_cockpit: c.no_cockpit !== false,
  };
}

/**
 * O ENDEREÇO NÃO ENTRA NO `paraBanco`, e isso é a regra inteira.
 *
 * `paraBanco` é usado pelo POST e pelo PATCH. Se o slug estivesse aqui, toda
 * edição de título reescreveria o endereço da matéria — e endereço publicado
 * que muda é 404 para quem vinha do Google, sem erro em lugar nenhum. Ele é
 * DECIDIDO uma vez, na criação, e só muda se alguém digitar outro de propósito.
 */
async function enderecoLivre(
  supabase: ReturnType<typeof createClient>,
  desejado: string,
  titulo: string,
  exceto?: string
): Promise<string> {
  // schema-ok: radar_itens.slug vem da 0064
  const { data } = await supabase.from("radar_itens").select("id, slug").limit(1000);
  const usados = (data ?? [])
    .filter((l: { id: string; slug: string | null }) => l.id !== exceto)
    .map((l: { slug: string | null }) => (l.slug ?? "").trim())
    .filter(Boolean);
  return slugUnico(paraSlug(desejado) || paraSlug(titulo), usados);
}

function paraBanco(r: Rascunho) {
  return {
    titulo: r.titulo.trim(),
    resumo: r.resumo.trim(),
    o_que_fazer: r.o_que_fazer.trim() || null,
    fonte: r.fonte.trim() || null,
    publicado_em: r.publicado_em,
    vigencia_em: r.vigencia_em || null,
    severidade: r.severidade,
    criterio: limparCriterio(r.criterio),
    ativo: r.ativo,
    no_cockpit: r.no_cockpit,
  };
}

export async function POST(req: Request) {
  const supabase = createClient();
  let corpo: Partial<Rascunho>;
  try { corpo = await req.json(); } catch { return NextResponse.json({ erro: "corpo inválido" }, { status: 400 }); }

  const r = corpoValido(corpo);
  const problemas = validar(r);
  if (bloqueado(problemas)) {
    return NextResponse.json({ erro: problemas.find((p) => p.bloqueia)!.texto, problemas }, { status: 400 });
  }

  const slug = await enderecoLivre(supabase, r.slug, r.titulo);
  const { data, error } = await supabase
    .from("radar_itens")
    .insert({ ...paraBanco(r), slug })
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data?.id });
}

export async function PATCH(req: Request) {
  const supabase = createClient();
  let corpo: Partial<Rascunho> & { id?: string };
  try { corpo = await req.json(); } catch { return NextResponse.json({ erro: "corpo inválido" }, { status: 400 }); }
  if (!corpo.id) return NextResponse.json({ erro: "id obrigatório" }, { status: 400 });

  /* tirar do ar é uma edição de UM campo — não passa pela validação de conteúdo,
     senão um item antigo mal escrito não poderia mais ser despublicado */
  if (Object.keys(corpo).length === 2 && "ativo" in corpo) {
    const { error } = await supabase.from("radar_itens").update({ ativo: corpo.ativo }).eq("id", corpo.id);
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const r = corpoValido(corpo);
  const problemas = validar(r);
  if (bloqueado(problemas)) {
    return NextResponse.json({ erro: problemas.find((p) => p.bloqueia)!.texto, problemas }, { status: 400 });
  }
  /* endereço em branco na edição = "deixa como está". Só troca quem digitar
     outro — e aí ainda passa pelo desempate, porque o índice é único. */
  const desejado = r.slug.trim();
  const campos = desejado
    ? { ...paraBanco(r), slug: await enderecoLivre(supabase, desejado, r.titulo, corpo.id) }
    : paraBanco(r);

  const { error } = await supabase.from("radar_itens").update(campos).eq("id", corpo.id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
