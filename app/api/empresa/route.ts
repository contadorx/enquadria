import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { emailValido } from "@/lib/csv";
import { triar } from "@/lib/triagem";
import { erroDeBanco } from "@/lib/erro-banco";

/**
 * Edição pontual da empresa: contato (para o termo em lote), RBT12 (que troca
 * a alíquota estimada pela efetiva) e — desde 07/08/2026 — o ENQUADRAMENTO.
 * Antes disso, corrigir um e-mail errado exigia reimportar a carteira inteira.
 *
 * O enquadramento entrou porque a primeira carteira real entrou com regime
 * errado e não havia NENHUM lugar para corrigir: a empresa ficava presa em
 * "fora do Simples" para sempre. E regime não se edita sozinho — a faixa da
 * triagem depende dele, então a correção RETRIA a empresa na mesma transação
 * de tela: mudou o enquadramento, a faixa e o motivo acompanham na hora.
 *
 * CNAE, porte e situação continuam fora — vêm da Receita e não se sobrescrevem
 * à mão.
 */

/** os únicos valores que o select da tela oferece — e os únicos aceitos aqui */
const REGIMES_VALIDOS = ["Simples Nacional", "MEI", "Lucro Presumido", "Lucro Real"] as const;
export async function PATCH(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });

  let corpo: {
    empresa_id: string;
    contato_nome?: string | null;
    contato_email?: string | null;
    contato_telefone?: string | null;
    rbt12?: number | string | null;
    regime?: string | null;
  };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }
  if (!corpo.empresa_id) {
    return NextResponse.json({ erro: "empresa_id obrigatório" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  if (corpo.contato_nome !== undefined) {
    patch.contato_nome = (corpo.contato_nome || "").trim() || null;
  }
  if (corpo.contato_telefone !== undefined) {
    patch.contato_telefone = (corpo.contato_telefone || "").trim() || null;
  }
  if (corpo.contato_email !== undefined) {
    const bruto = (corpo.contato_email || "").trim();
    if (bruto) {
      const ok = emailValido(bruto);
      if (!ok) return NextResponse.json({ erro: "e-mail inválido" }, { status: 400 });
      patch.contato_email = ok;
    } else {
      patch.contato_email = null;
    }
  }
  if (corpo.rbt12 !== undefined) {
    if (corpo.rbt12 === null || corpo.rbt12 === "") {
      patch.rbt12 = null;
    } else {
      const n = Number(String(corpo.rbt12).replace(/[^\d.-]/g, ""));
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ erro: "RBT12 inválida" }, { status: 400 });
      }
      patch.rbt12 = n;
    }
  }

  let retriada: { faixa: string; motivo: string } | null = null;
  if (corpo.regime !== undefined) {
    const r = (corpo.regime || "").trim();
    if (r && !REGIMES_VALIDOS.includes(r as (typeof REGIMES_VALIDOS)[number])) {
      return NextResponse.json({ erro: "enquadramento inválido" }, { status: 400 });
    }
    patch.regime = r || null;

    /* mudou o enquadramento → a triagem acompanha, com os demais dados que a
       empresa já tem. Sem isto, a ficha diria "Simples Nacional" e a fila
       continuaria mostrando "fora do Simples" — as duas telas discordando. */
    const { data: atual } = await supabase
      .from("empresas")
      .select("cnae_principal, cnaes_secundarios, porte, situacao, faturamento_faixa, razao_social, cnpj")
      .eq("id", corpo.empresa_id)
      .maybeSingle();
    if (!atual) return NextResponse.json({ erro: "empresa não encontrada" }, { status: 404 });
    const t = triar({
      cnpj: String(atual.cnpj ?? ""),
      razao_social: String(atual.razao_social ?? ""),
      cnae_principal: (atual.cnae_principal as string | null) ?? null,
      cnaes_secundarios: (atual.cnaes_secundarios as string[] | null) ?? null,
      porte: (atual.porte as string | null) ?? null,
      situacao: (atual.situacao as string | null) ?? null,
      regime: patch.regime as string | null,
      faturamento_faixa: (atual.faturamento_faixa as string | null) ?? null,
    });
    patch.faixa = t.faixa;
    patch.motivo_triagem = t.motivo;
    patch.prioridade_maxima = t.prioridade_maxima;
    retriada = { faixa: t.faixa, motivo: t.motivo };
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ erro: "nada para atualizar" }, { status: 400 });
  }

  // a RLS por tenant garante que ninguém edite empresa de outro workspace
  const { error } = await supabase.from("empresas").update(patch).eq("id", corpo.empresa_id);
  if (error) return NextResponse.json({ erro: erroDeBanco(error, "empresa") }, { status: 500 });

  return NextResponse.json({ ok: true, atualizado: patch, retriada });
}
