import { NextResponse } from "next/server";
import { decidirContratacao, type AssinaturaResumo } from "@/lib/assinatura";
import { encerrarAssinaturas } from "@/lib/assinatura-server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * O endpoint único da aba Negócio.
 *
 * Um POST com `{ acao, ... }` em vez de sete rotas — o app inteiro conversa
 * assim (ver /api/analise, /api/laudo), e concentrar aqui deixa o guard num
 * lugar só: quem decide se você é dono da plataforma é o SERVIDOR, sempre.
 */

async function guard() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, ok: false as const };
  const { data: perfil } = await supabase
    .from("profiles")
    .select("is_superadmin")
    .eq("id", user.id)
    .maybeSingle();
  return { supabase, ok: !!(perfil as { is_superadmin?: boolean } | null)?.is_superadmin };
}

/** Para escrever em tabelas com RLS por escritório (assinaturas, tenants). */
function dbEscrita(supabase: ReturnType<typeof createClient>) {
  return createAdminClient() ?? supabase;
}

const brl = (c: number) =>
  ((Number(c) || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

export async function POST(req: Request) {
  const { supabase, ok } = await guard();
  if (!ok) return NextResponse.json({ erro: "acesso restrito ao dono da plataforma" }, { status: 403 });

  let corpo: Record<string, unknown>;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  const acao = String(corpo.acao || "");

  switch (acao) {
    // ─────────────────────────────────────────────────────── configuração
    case "config": {
      const chave = String(corpo.chave || "");
      const valor = corpo.valor;
      if (!chave || valor === undefined) return NextResponse.json({ erro: "chave e valor" }, { status: 400 });
      /**
       * MERGE, NÃO SUBSTITUIÇÃO — e isto religava e-mail sozinho.
       *
       * A tela manda `{...base, campo}`, com `base` congelado no render. Quem
       * desligava "Réguas ligadas" e em seguida ajustava "Limite por execução"
       * mandava o `base` ANTIGO junto — com `ativas: true` — e o upsert
       * gravava o objeto inteiro. As réguas voltavam a ligar, o checkbox na
       * tela continuava desmarcado (estado local), aparecia o ✓ verde, e o
       * cron voltava a disparar para a base. Bastava dar foco e sair de um
       * campo para reverter a decisão anterior.
       *
       * Mesclando com o que está no banco, cada campo só muda quando é ele que
       * está sendo salvo.
       */
      const { data: atual } = await supabase
        .from("plataforma_config").select("valor").eq("chave", chave).maybeSingle();
      const anterior = ((atual as { valor?: Record<string, unknown> } | null)?.valor ?? {}) as Record<string, unknown>;
      const mesclado =
        valor && typeof valor === "object" && !Array.isArray(valor)
          ? { ...anterior, ...(valor as Record<string, unknown>) }
          : valor;

      const { error } = await supabase
        .from("plataforma_config")
        .upsert({ chave, valor: mesclado, atualizado_em: new Date().toISOString() }, { onConflict: "chave" });
      if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    // ──────────────────────────────────────────────────────────── planos
    case "salvar_plano": {
      const id = String(corpo.id || "");
      if (!id) return NextResponse.json({ erro: "plano inválido" }, { status: 400 });

      const campos = [
        "nome", "descricao", "chamada", "preco_centavos", "ciclo", "dias_acesso",
        "ativo", "publico", "destaque", "ordem", "limite_analises",
        "limite_empresas", "limite_usuarios", "recursos", "recorrente",
      ];
      const patch: Record<string, unknown> = { atualizado_em: new Date().toISOString() };
      for (const c of campos) if (corpo[c] !== undefined) patch[c] = corpo[c];

      if (patch.nome !== undefined && !String(patch.nome).trim())
        return NextResponse.json({ erro: "o plano precisa de um nome" }, { status: 400 });
      if (patch.preco_centavos !== undefined && Number(patch.preco_centavos) < 0)
        return NextResponse.json({ erro: "preço não pode ser negativo" }, { status: 400 });

      // destaque é exclusivo: só um plano pode ser "o mais escolhido"
      if (patch.destaque === true) {
        await supabase.from("planos").update({ destaque: false }).neq("id", id);
      }

      const { error } = await supabase.from("planos").update(patch).eq("id", id);
      if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    case "criar_plano": {
      const nome = String(corpo.nome || "").trim();
      if (!nome) return NextResponse.json({ erro: "dê um nome ao plano" }, { status: 400 });
      const id = nome
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");

      const { data: ultimo } = await supabase
        .from("planos").select("ordem").order("ordem", { ascending: false }).limit(1).maybeSingle();

      const { error } = await supabase.from("planos").insert({
        id,
        nome,
        preco_centavos: 0,
        recorrente: false,
        ativo: false,     // nasce desligado: você desenha antes de expor
        publico: false,
        ordem: Number((ultimo as { ordem?: number } | null)?.ordem || 0) + 1,
        ciclo: "avulso",
        recursos: [],
      });
      if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, id });
    }

    // ──────────────────────────────────────────────────────────── réguas
    case "salvar_regua": {
      const chave = String(corpo.chave || "");
      if (!chave) return NextResponse.json({ erro: "regra inválida" }, { status: 400 });
      const patch: Record<string, unknown> = { atualizado_em: new Date().toISOString() };
      for (const c of ["ativa", "dias", "assunto", "corpo"]) if (corpo[c] !== undefined) patch[c] = corpo[c];
      if (patch.assunto !== undefined && !String(patch.assunto).trim())
        return NextResponse.json({ erro: "o assunto não pode ficar vazio" }, { status: 400 });
      if (patch.corpo !== undefined && !String(patch.corpo).trim())
        return NextResponse.json({ erro: "o corpo não pode ficar vazio" }, { status: 400 });

      const { error } = await supabase.from("plataforma_reguas").update(patch).eq("chave", chave);
      if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    case "testar_regua": {
      const chave = String(corpo.chave || "");
      const para = String(corpo.para || "");
      if (!para.includes("@")) return NextResponse.json({ erro: "informe um e-mail válido" }, { status: 400 });

      const { data: r } = await supabase
        .from("plataforma_reguas").select("chave, nome, assunto, corpo").eq("chave", chave).maybeSingle();
      if (!r) return NextResponse.json({ erro: "regra não encontrada" }, { status: 404 });

      const { aplicar, htmlRegua, APP_URL } = await import("@/lib/reguas");
      const exemplo = {
        nome: "Oliveira",
        escritorio: "Oliveira Contabilidade",
        plano: "PRO",
        valor: "R$ 47,00",
        vencimento: new Date(Date.now() + 3 * 86_400_000).toLocaleDateString("pt-BR"),
        dias: 3,
        empresas: 143,
        faixa_a: 19,
        laudos: 2,
        restantes: 0,
        link_pagamento: "https://exemplo.asaas.com/i/000000000000",
        link_app: APP_URL,
        link_planos: `${APP_URL}/painel/planos`,
        link_carteira: `${APP_URL}/painel`,
      };

      const rr = r as { nome: string; assunto: string; corpo: string };
      const assunto = `[TESTE] ${aplicar(rr.assunto, exemplo)}`;
      const corpoTexto =
        aplicar(rr.corpo, exemplo) +
        `\n\n—\nTeste da régua "${rr.nome}". Os dados acima são fictícios.`;

      const { enviarEmail } = await import("@/lib/email");
      const envio = await enviarEmail({ para, assunto, html: htmlRegua(corpoTexto) });
      if (!envio.enviado) return NextResponse.json({ erro: envio.motivo || "falha no envio" }, { status: 502 });

      await supabase.from("plataforma_envios").insert({
        tenant_id: null, regra: chave, chave_unica: `teste:${chave}:${Date.now()}`,
        para, assunto, status: "teste",
      });
      return NextResponse.json({ ok: true });
    }

    case "liberar_reenvio": {
      const chave = String(corpo.chave_unica || "");
      if (!chave) return NextResponse.json({ erro: "chave" }, { status: 400 });
      const { error } = await supabase.from("plataforma_envios").delete().eq("chave_unica", chave);
      if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    case "rodar_reguas": {
      const simular = corpo.simular === true;
      const { executarReguas } = await import("@/lib/reguas");
      const db = dbEscrita(supabase);
      const r = await executarReguas(db, { simular });

      /* o MESMO batimento que o cron grava: rodar à mão pela tela também é
         execução, e o painel precisa refletir isso na hora */
      await db.from("plataforma_config").upsert(
        {
          chave: "reguas_execucao",
          valor: {
            em: new Date().toISOString(),
            modo: simular ? "teste pela tela (nada foi enviado)" : "envio manual pela tela",
            planejados: r.planejados,
            enviados: r.enviados,
            travados: r.semEmail,
            erros: r.erros.slice(0, 3),
          },
          descricao: "Última execução do motor de réguas — diagnóstico do painel de e-mails.",
        },
        { onConflict: "chave" }
      );

      return NextResponse.json({
        ok: true,
        planejados: r.planejados,
        enviados: r.enviados,
        semEmail: r.semEmail,
        erros: r.erros.slice(0, 5),
        lista: simular ? r.lista.slice(0, 60).map((e) => ({
          escritorio: e.escritorio, regra: e.nome_regra, motivo: e.motivo, para: e.para, assunto: e.assunto,
        })) : undefined,
      });
    }

    // ────────────────────────────────────────────────────────── assinatura
    case "salvar_assinatura": {
      const tenantId = String(corpo.tenant_id || "");
      if (!tenantId) return NextResponse.json({ erro: "escritório" }, { status: 400 });
      const db = dbEscrita(supabase);

      const patch: Record<string, unknown> = {};
      for (const c of ["plano_id", "status", "valor_centavos", "vencimento", "origem"])
        if (corpo[c] !== undefined) patch[c] = corpo[c] === "" ? null : corpo[c];
      if (patch.vencimento) patch.valido_ate = patch.vencimento; // mantém a coluna antiga em dia

      const assinaturaId = corpo.assinatura_id ? String(corpo.assinatura_id) : null;
      if (assinaturaId) {
        const { error } = await db.from("assinaturas").update(patch).eq("id", assinaturaId);
        if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
      } else {
        const { error } = await db.from("assinaturas").insert({
          tenant_id: tenantId,
          origem: "manual",
          status: "ativa",
          ...patch,
        });
        if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    case "gerar_cobranca": {
      const tenantId = String(corpo.tenant_id || "");
      const planoId = String(corpo.plano_id || "");
      if (!tenantId || !planoId) return NextResponse.json({ erro: "escritório e plano" }, { status: 400 });

      const db = dbEscrita(supabase);
      const { data: plano } = await supabase
        .from("planos").select("id, nome, preco_centavos, ciclo, dias_acesso").eq("id", planoId).maybeSingle();
      if (!plano) return NextResponse.json({ erro: "plano inválido" }, { status: 400 });

      const { data: lista } = await supabase.rpc("negocio_escritorios");
      const esc = ((lista as { id: string; nome: string; email: string }[]) || []).find((x) => x.id === tenantId);
      if (!esc) return NextResponse.json({ erro: "escritório não encontrado" }, { status: 404 });

      const p = plano as { id: string; nome: string; preco_centavos: number };

      /**
       * VALIDA ANTES DE GRAVAR — a ordem estava invertida e deixava lixo.
       *
       * A assinatura era inserida ANTES da checagem do CPF/CNPJ, e o `return`
       * de erro não desfazia nada. Cada clique em "Gerar cobrança" num
       * escritório sem documento (o caso normal de quem nunca contratou pela
       * tela de Planos) deixava uma assinatura `pendente` fantasma.
       *
       * E o estrago não parava na tabela: `negocio_escritorios()` passava a
       * devolver aquele escritório como "pendente", e isso liga o `comprando`
       * em lib/reguas.ts, que SILENCIA as réguas de conversão — justamente
       * para o escritório gratuito que elas existem para converter.
       */
      const { data: tenantDoc } = await supabase
        .from("tenants").select("cpf_cnpj").eq("id", tenantId).maybeSingle();
      const doc = (tenantDoc as { cpf_cnpj?: string } | null)?.cpf_cnpj ?? "";
      if (!doc) {
        return NextResponse.json(
          { erro: "Este escritório ainda não tem CPF/CNPJ cadastrado, e o Asaas exige o documento do pagador. Peça a ele para contratar pela tela de Planos uma vez, ou cadastre o documento antes." },
          { status: 400 }
        );
      }

      /**
       * A REGRA "UMA CONTA, UM PLANO" TAMBÉM VALE AQUI.
       *
       * A rota do cliente cancela as pendentes superadas e derruba o boleto
       * antigo no Asaas; esta inseria e saía. Resultado: o contador que gerou
       * um boleto pela tela de Planos e não pagou ficava com DOIS boletos
       * pagáveis quando eu gerava outro pelo painel — e se ele pagasse o
       * antigo, o webhook ativaria o plano abandonado por cima do novo.
       */
      const { data: minhas } = await db
        .from("assinaturas")
        .select("id, plano_id, status, valido_ate, asaas_id, checkout_url")
        .eq("tenant_id", tenantId);
      const acao = decidirContratacao(p.id, (minhas ?? []) as AssinaturaResumo[], new Date());
      if (acao.cancelar.length) {
        const r = await encerrarAssinaturas(db, acao.cancelar);
        if (r.avisos.length) console.error("[negocio] gerar_cobranca:", r.avisos.join(" · "));
      }
      if (acao.acao === "reaproveitar" && acao.reaproveitar?.checkout_url) {
        return NextResponse.json({
          ok: true,
          asaas_ativo: true,
          checkout_url: acao.reaproveitar.checkout_url,
          reaproveitada: true,
          valor: brl(p.preco_centavos),
        });
      }

      const { data: nova, error: erroIns } = await db
        .from("assinaturas")
        .insert({
          tenant_id: tenantId,
          plano_id: p.id,
          status: "pendente",
          valor_centavos: p.preco_centavos,
          origem: "painel",
        })
        .select("id")
        .single();
      if (erroIns) return NextResponse.json({ erro: erroIns.message }, { status: 500 });

      const { criarCobranca } = await import("@/lib/asaas");
      const cob = await criarCobranca({
        nome: esc.nome || "Escritório",
        email: esc.email || "",
        cpf_cnpj: doc,
        valor_centavos: p.preco_centavos,
        descricao: `Enquadria — ${p.nome}`,
        externo: (nova as { id: string }).id,
      });

      /* o vencimento REAL da cobrança, não um palpite de hoje+3: quando o
         Asaas devolve a data, é ela que a escada de cobrança tem que usar */
      const vencimento = cob.vencimento ?? new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
      const { error: eUpd } = await db
        .from("assinaturas")
        .update({
          asaas_id: cob.asaas_id ?? null,
          checkout_url: cob.checkout_url ?? null,
          vencimento,
        })
        .eq("id", (nova as { id: string }).id);
      if (eUpd) console.error(`[negocio] assinatura ${(nova as { id: string }).id} sem link gravado: ${eUpd.message}`);

      /**
       * O MOTIVO DO ASAAS SOBE — antes a resposta era `ok: true` mesmo quando
       * ele tinha RECUSADO a cobrança.
       *
       * `criarCobranca` devolve `{ ativo: true, erro }` sem link quando a chave
       * está errada, o documento é inválido ou a cobrança é rejeitada. A rota
       * lia só `asaas_id`/`checkout_url`/`ativo` e descartava o `erro`, então a
       * tela dizia "o Asaas não devolveu link (chave configurada?)" — apontando
       * para a chave quando o problema era o CPF do pagador. A rota do cliente
       * já faz o certo; esta ficou para trás.
       */
      if (cob.ativo && !cob.checkout_url) {
        return NextResponse.json(
          {
            erro: cob.erro ?? "A cobrança não foi gerada pelo Asaas e a assinatura ficou pendente.",
            assinatura_id: (nova as { id: string }).id,
            asaas_ativo: true,
          },
          { status: 502 }
        );
      }

      return NextResponse.json({
        ok: true,
        asaas_ativo: cob.ativo,
        checkout_url: cob.checkout_url ?? null,
        valor: brl(p.preco_centavos),
      });
    }

    case "reconciliar": {
      const assinaturaId = String(corpo.assinatura_id || "");
      if (!assinaturaId) return NextResponse.json({ erro: "assinatura" }, { status: 400 });
      const db = dbEscrita(supabase);
      const { reconciliarAssinatura } = await import("@/lib/asaas");
      const r = await reconciliarAssinatura(db, assinaturaId);
      return r.erro ? NextResponse.json({ erro: r.erro }, { status: 502 }) : NextResponse.json({ ok: true, ...r });
    }

    // ─────────────────────────────────────────────────────────────── Asaas
    case "testar_asaas": {
      const { statusAsaas } = await import("@/lib/asaas");
      return NextResponse.json({ ok: true, status: await statusAsaas() });
    }

    /**
     * RECONSTRÓI AS FATURAS a partir do que existe no Asaas.
     *
     * Existe porque o webhook pode ter ficado horas (ou dias) apontando para o
     * endereço errado — foi o que aconteceu em 04/08/2026, com 404 em cada
     * evento até o Asaas suspender a fila. Reativar o webhook conserta o
     * futuro; o passado só volta perguntando.
     */
    case "importar_faturas": {
      const { importarFaturas } = await import("@/lib/asaas");
      const r = await importarFaturas(dbEscrita(supabase));
      return NextResponse.json(r.erro ? { erro: r.erro } : { ok: true, ...r });
    }

    case "snapshot": {
      const { data, error } = await supabase.rpc("negocio_snapshot");
      if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
      const r = Array.isArray(data) ? data[0] : data;
      return NextResponse.json({ ok: true, ...(r as object) });
    }

    default:
      return NextResponse.json({ erro: `ação desconhecida: ${acao}` }, { status: 400 });
  }
}
