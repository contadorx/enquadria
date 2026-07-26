import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { emailValido } from "@/lib/csv";

/**
 * Edição pontual da empresa: contato (para o termo em lote) e RBT12 (que troca
 * a alíquota estimada pela efetiva). Antes disso, corrigir um e-mail errado
 * exigia reimportar a carteira inteira.
 *
 * Só estes campos são editáveis — CNAE, porte e situação vêm da Receita e não
 * devem ser sobrescritos à mão.
 */
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

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ erro: "nada para atualizar" }, { status: 400 });
  }

  // a RLS por tenant garante que ninguém edite empresa de outro workspace
  const { error } = await supabase.from("empresas").update(patch).eq("id", corpo.empresa_id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, atualizado: patch });
}
