import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { enviarEmail } from "@/lib/email";
import {
  assuntoNovidade, chaveEnvio, criticar, htmlNovidade, selecionarPublico,
  type Destinatario, type Novidade,
} from "@/lib/novidade";

/**
 * O DISPARO DE NOVIDADES — a rota mais perigosa do painel.
 *
 * Ela manda e-mail para a base inteira de contadores. Não tem CTRL+Z, e um
 * erro aqui não custa um assinante: custa a reputação do domínio, que derruba
 * junto o laudo, o termo e a cobrança. Por isso o desenho é o mais paranoico
 * do app:
 *
 *   1. `publico`  — quem receberia, sem mandar nada;
 *   2. `teste`    — manda SÓ para mim, com o HTML final;
 *   3. `enviar`   — manda de verdade, EM LOTES, e é reentrante.
 *
 * REENTRÂNCIA, e por que ela não é luxo. A Vercel corta a função em 60s. Uma
 * base de 300 contadores não cabe numa chamada. Em vez de fila e worker — que
 * é infraestrutura nova para um botão usado uma vez por mês —, cada chamada
 * manda um LOTE e devolve quantos faltam. O cliente chama de novo até zerar.
 *
 * O que torna isso seguro é a chave única em `plataforma_envios`: quem já
 * recebeu não entra no lote seguinte. Recarregar a página no meio, clicar duas
 * vezes ou perder a conexão não duplica e-mail para ninguém.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** quantos e-mails por chamada — cabe folgado nos 60s, com paralelismo de 5 */
const LOTE = 40;
const EM_PARALELO = 5;

async function guard() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, ok: false as const };
  const { data: perfil } = await supabase
    .from("profiles").select("is_superadmin, email").eq("id", user.id).maybeSingle();
  const p = perfil as { is_superadmin?: boolean; email?: string } | null;
  return { supabase, user, email: p?.email ?? user.email ?? null, ok: !!p?.is_superadmin };
}

/**
 * O TOKEN DO DESCADASTRO — assinado, e sem variável de ambiente nova.
 *
 * Sem assinatura, `/descadastro?e=alguem@x.com` deixaria qualquer pessoa
 * descadastrar qualquer endereço. Com ela, só quem recebeu o e-mail consegue.
 *
 * A chave é a SERVICE_ROLE, que já é obrigatória para esta rota funcionar e
 * nunca sai do servidor. Girar essa chave invalida links antigos — o que é
 * aceitável: a página de descadastro tem caminho manual, e o transacional não
 * depende disso.
 */
function assinar(email: string): string {
  const segredo = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return crypto.createHmac("sha256", segredo).update(email.trim().toLowerCase())
    .digest("base64url").slice(0, 20);
}

export async function POST(req: Request) {
  const { supabase, email: meuEmail, ok } = await guard();
  if (!ok) return NextResponse.json({ erro: "acesso restrito ao dono da plataforma" }, { status: 403 });

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { erro: "SUPABASE_SERVICE_ROLE_KEY ausente — sem ela não dá para ler a base de contadores" },
      { status: 503 }
    );
  }

  let corpo: Record<string, unknown>;
  try { corpo = await req.json(); } catch { return NextResponse.json({ erro: "corpo inválido" }, { status: 400 }); }

  const acao = String(corpo.acao || "");
  const base = new URL(req.url).origin;

  const novidade: Novidade = {
    id: corpo.novidade_id ? String(corpo.novidade_id) : undefined,
    assunto: String(corpo.assunto ?? ""),
    titulo: String(corpo.titulo ?? ""),
    corpo: String(corpo.corpo ?? ""),
    imagem_url: corpo.imagem_url ? String(corpo.imagem_url) : null,
    imagem_alt: corpo.imagem_alt ? String(corpo.imagem_alt) : null,
    link_url: corpo.link_url ? String(corpo.link_url) : null,
    link_texto: corpo.link_texto ? String(corpo.link_texto) : null,
  };

  /* ── quem receberia ───────────────────────────────────────────────────── */
  async function publico(novidadeId?: string) {
    const { data: perfis } = await admin!
      .from("profiles").select("email, nome, tenant_id").not("email", "is", null);

    const { data: descs } = await admin!.from("plataforma_descadastros").select("email");
    const { data: queimados } = await admin!
      .from("email_eventos").select("para").in("evento", ["bounce", "spam", "recusado"]);

    /* quem JÁ recebeu ESTA novidade — é o que faz o lote seguinte pular quem
       já foi, e o que torna o botão seguro de apertar duas vezes */
    let jaReceberam: string[] = [];
    if (novidadeId) {
      const { data: envios } = await admin!
        .from("plataforma_envios").select("para").eq("regra", "novidade")
        .like("chave_unica", `novidade:${novidadeId}:%`);
      jaReceberam = (envios ?? []).map((e) => String(e.para));
    }

    return selecionarPublico(
      (perfis ?? []).map((p) => ({
        email: String(p.email), nome: (p as { nome?: string }).nome ?? null,
        tenant_id: (p.tenant_id as string) ?? null,
      })) as Destinatario[],
      {
        descadastrados: (descs ?? []).map((d) => String(d.email)),
        queimados: (queimados ?? []).map((q) => String(q.para)),
        jaReceberam,
      }
    );
  }

  switch (acao) {
    /* ── 1 · quem receberia, sem mandar nada ────────────────────────────── */
    case "publico": {
      const p = await publico(novidade.id);
      const motivos: Record<string, number> = {};
      for (const d of p.descartados) motivos[d.motivo] = (motivos[d.motivo] ?? 0) + 1;
      return NextResponse.json({ ok: true, total: p.alvos.length, motivos, critica: criticar(novidade) });
    }

    /* ── 2 · o teste, só para mim ───────────────────────────────────────── */
    case "teste": {
      const para = String(corpo.para || meuEmail || "");
      if (!para) return NextResponse.json({ erro: "não achei seu e-mail para mandar o teste" }, { status: 400 });
      const c = criticar(novidade);
      if (c.erros.length) return NextResponse.json({ erro: c.erros[0], critica: c }, { status: 400 });

      const envio = await enviarEmail({
        para,
        assunto: `[teste] ${assuntoNovidade(novidade)}`,
        html: htmlNovidade(novidade, {
          nome: "Leandro",
          base,
          linkDescadastro: `${base}/descadastro?e=${encodeURIComponent(para)}&t=${assinar(para)}`,
        }),
        tag: "novidade-teste",
      });
      return NextResponse.json({ ok: envio.enviado, para, motivo: envio.motivo, caminho: envio.caminho });
    }

    /* ── 3 · o disparo, em lote e reentrante ────────────────────────────── */
    case "enviar": {
      const c = criticar(novidade);
      if (c.erros.length) return NextResponse.json({ erro: c.erros[0], critica: c }, { status: 400 });

      /* a novidade é gravada ANTES do primeiro e-mail: sem id não existe chave
         única, e sem chave única o lote seguinte reenviaria para todo mundo */
      let id = novidade.id;
      if (!id) {
        const { data, error } = await admin
          .from("plataforma_novidades")
          .insert({
            assunto: novidade.assunto.trim(), titulo: novidade.titulo.trim(), corpo: novidade.corpo,
            imagem_url: novidade.imagem_url, imagem_alt: novidade.imagem_alt,
            link_url: novidade.link_url, link_texto: novidade.link_texto,
          })
          .select("id").maybeSingle();
        if (error || !data) {
          return NextResponse.json({ erro: error?.message ?? "não consegui gravar a novidade" }, { status: 500 });
        }
        id = String(data.id);
      }

      const p = await publico(id);
      const lote = p.alvos.slice(0, LOTE);

      let enviados = 0;
      const falhas: { para: string; motivo?: string }[] = [];

      for (let i = 0; i < lote.length; i += EM_PARALELO) {
        const fatia = lote.slice(i, i + EM_PARALELO);
        await Promise.all(
          fatia.map(async (alvo) => {
            const assunto = assuntoNovidade(novidade);
            const envio = await enviarEmail({
              para: alvo.email,
              nome: alvo.nome ?? undefined,
              assunto,
              html: htmlNovidade(novidade, {
                nome: alvo.nome,
                base,
                linkDescadastro: `${base}/descadastro?e=${encodeURIComponent(alvo.email)}&t=${assinar(alvo.email)}`,
              }),
              tag: "novidade",
            });

            /* o registro só entra DEPOIS do envio confirmado — gravar antes
               criaria o pior dos mundos: e-mail que não saiu, marcado como
               enviado, e o contador nunca recebe */
            if (!envio.enviado) { falhas.push({ para: alvo.email, motivo: envio.motivo }); return; }
            enviados++;
            await admin.from("plataforma_envios").insert({
              tenant_id: alvo.tenant_id,
              regra: "novidade",
              chave_unica: chaveEnvio(id!, alvo.email),
              para: alvo.email,
              assunto,
              status: "enviado",
              erro: envio.caminho ? `saiu por ${envio.caminho}` : null,
            });
          })
        );
      }

      const restantes = Math.max(0, p.alvos.length - lote.length);

      const { data: atual } = await admin
        .from("plataforma_novidades").select("destinatarios, falhas, enviado_em").eq("id", id).maybeSingle();
      await admin.from("plataforma_novidades").update({
        enviado_em: (atual as { enviado_em?: string } | null)?.enviado_em ?? new Date().toISOString(),
        destinatarios: Number((atual as { destinatarios?: number } | null)?.destinatarios ?? 0) + enviados,
        falhas: Number((atual as { falhas?: number } | null)?.falhas ?? 0) + falhas.length,
      }).eq("id", id);

      return NextResponse.json({ ok: true, novidade_id: id, enviados, falhas, restantes });
    }

    default:
      return NextResponse.json({ erro: `ação desconhecida: ${acao}` }, { status: 400 });
  }
}
