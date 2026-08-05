import { COLUNAS_ESCRITORIO, type Escritorio } from "@/lib/escritorio";
import { blocoDoTermo } from "@/lib/termo";
import type { AnaliseGravada } from "@/lib/laudo";
import { responsavelDoTenant } from "@/lib/escritorio-server";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { conteudoCanonico, sha256, novoToken, CLAUSULAS_CIENCIA } from "@/lib/esign";
import { enviarEmail, htmlConviteAssinatura } from "@/lib/email";

/**
 * TERMOS EM LOTE — o último gargalo da esteira.
 *
 * Gera o termo de ciência de todas as análises que já têm laudo e cujo cliente
 * tem contato cadastrado, e (se o Brevo estiver configurado) envia o link de
 * assinatura direto para cada um. Sem a chave de e-mail, os termos são criados
 * do mesmo jeito e o contador copia os links na tela de entrega.
 *
 * A DECISÃO REGISTRADA SEGUE A RECOMENDAÇÃO — e no lote não pode ser outra
 * coisa. Divergir exige o motivo escrito pelo empresário, e não existe motivo
 * do empresário num lote de duzentos termos gerados de uma vez. Quem decide
 * diferente muda o termo na tela da empresa, um a um, que é onde a conversa
 * aconteceu.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });

  let corpo: { analise_ids?: string[]; enviar_email?: boolean; origem?: string };
  try {
    corpo = await req.json();
  } catch {
    corpo = {};
  }
  const enviarConvite = corpo.enviar_email !== false;

  // nome do escritório para assinar o e-mail
  const { data: perfil } = await supabase
    .from("profiles")
    .select("tenant_id, tenants(nome)")
    .eq("id", user.id)
    .maybeSingle();
  const t = perfil?.tenants as { nome?: string } | { nome?: string }[] | null;
  const escritorio = (Array.isArray(t) ? t[0]?.nome : t?.nome) || "Seu contador";

  // só faz sentido enviar termo do que já tem laudo emitido
  const { data: perfilT } = await supabase
    .from("profiles")
    .select(`nome, tenants(${COLUNAS_ESCRITORIO})`)
    .eq("id", user.id)
    .maybeSingle();
  const tt = perfilT?.tenants as Escritorio | null;
  /* o termo é congelado na emissão — inclusive quem assina por ele */
  const responsavel = await responsavelDoTenant(supabase);

  /* a análise inteira: a recomendação e os pontos saem dos números congelados */
  let q = supabase
    .from("analises")
    .select(
      "id, empresa_id, saida, rq, ch, cl, re, fc, prioridade, respostas, calculado_em, parametros"
    );
  if (corpo.analise_ids?.length) q = q.in("id", corpo.analise_ids);
  const { data: analises, error: errA } = await q.limit(1000);
  if (errA) return NextResponse.json({ erro: errA.message }, { status: 500 });
  if (!analises?.length) {
    return NextResponse.json({ ok: true, criados: 0, enviados: 0, sem_contato: 0, ja_tinham: 0 });
  }

  const ids = analises.map((a) => a.id);
  // schema-ok: laudos.token é criado pela migration 0028 (alter dinâmico)
  const { data: laudos } = await supabase
    .from("laudos")
    .select("analise_id, token, numero")
    .in("analise_id", ids);
  const comLaudo = new Set((laudos ?? []).map((l) => l.analise_id));
  /* o termo cita o laudo pelo número e linka a memória de cálculo */
  const mapaLaudo = new Map((laudos ?? []).map((l) => [l.analise_id, l]));

  const { data: termosExistentes } = await supabase
    .from("termos")
    .select("analise_id")
    .in("analise_id", ids);
  const jaTem = new Set((termosExistentes ?? []).map((x) => x.analise_id));

  const { data: empresas } = await supabase
    .from("empresas")
    .select("id, razao_social, cnpj, contato_nome, contato_email")
    .in(
      "id",
      analises.map((a) => a.empresa_id)
    );
  const mapaEmpresa = new Map((empresas ?? []).map((e) => [e.id, e]));

  const base = new URL(req.url).origin;
  let criados = 0;
  let enviados = 0;
  let semContato = 0;
  let semLaudo = 0;
  const falhas: { empresa: string; erro: string }[] = [];

  for (const a of analises) {
    if (jaTem.has(a.id)) continue;
    if (!comLaudo.has(a.id)) {
      semLaudo++;
      continue;
    }
    const e = mapaEmpresa.get(a.empresa_id);
    if (!e?.contato_email || !e?.contato_nome) {
      semContato++;
      continue;
    }

    /* mesma função da rota individual — uma fonte só para o mesmo papel */
    const bloco = blocoDoTermo(a as unknown as AnaliseGravada, "seguir");
    const decisao = bloco.decisao;
    const laudoDela = mapaLaudo.get(a.id);
    const hash = sha256(
      conteudoCanonico({
        empresa: e.razao_social,
        cnpj: e.cnpj,
        decisao,
        clausulas: CLAUSULAS_CIENCIA,
        recomendacao: bloco.recomendacao.decisao,
        tipo_decisao: bloco.tipo_decisao,
      })
    );
    const token = novoToken();

    const { data: termoId, error } = await supabase.rpc("registrar_termo", {
      p_analise: a.id,
      p_decisao: decisao,
      p_nome: e.contato_nome,
      p_email: e.contato_email,
      p_assinatura_url: null,
      p_assinatura_ref: null,
    });
    if (error) {
      falhas.push({ empresa: e.razao_social, erro: error.message });
      continue;
    }

    const { error: upErr } = await supabase
      .from("termos")
      .update({
        token,
        hash_documento: hash,
        assinatura_status: "pendente",
        assinante_email: e.contato_email,
        tipo_decisao: bloco.tipo_decisao,
        recomendacao: bloco.recomendacao.decisao,
        recomendacao_saida: bloco.recomendacao.saida,
        snapshot: {
          congelado_em: new Date().toISOString(),
          decisao,
          clausulas: CLAUSULAS_CIENCIA,
          recomendacao: bloco.recomendacao,
          pontos: bloco.pontos,
          tipo_decisao: bloco.tipo_decisao,
          motivo_divergencia: null,
          laudo: laudoDela?.token
            ? { token: laudoDela.token, numero: laudoDela.numero }
            : null,
          empresa: { razao_social: e.razao_social, cnpj: e.cnpj },
          escritorio: { ...(tt ?? {}), responsavel },
          analise: { saida: a.saida, re: a.re, fc: a.fc },
        },
      })
      .eq("id", termoId);
    if (upErr) {
      falhas.push({ empresa: e.razao_social, erro: upErr.message });
      continue;
    }
    criados++;

    if (enviarConvite) {
      const envio = await enviarEmail({
        para: e.contato_email,
        nome: e.contato_nome,
        assunto: `${e.razao_social} — decisão de IBS/CBS até 30 de setembro`,
        html: htmlConviteAssinatura({
          empresa: e.razao_social,
          escritorio,
          link: `${base}/assinar/${token}`,
          decisao,
        }),
        tag: "termo-convite",
        // "se preferir conversar antes de assinar, é só responder" — e a
        // resposta precisa chegar a quem pode conversar
        responderPara: user.email ? { email: user.email, nome: escritorio } : undefined,
      });
      if (envio.enviado) enviados++;
    }
  }

  return NextResponse.json({
    ok: true,
    criados,
    enviados,
    sem_contato: semContato,
    sem_laudo: semLaudo,
    ja_tinham: jaTem.size,
    email_ativo: enviados > 0,
    falhas,
  });
}
