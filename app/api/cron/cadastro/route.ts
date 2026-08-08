import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { enriquecer } from "@/lib/receita";
import { compararCadastro, proximasAConferir } from "@/lib/cadastro";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * A VARREDURA DO CADASTRO — o aviso que o contador não consegue dar a si mesmo.
 *
 * Reconsulta uma fatia da carteira na base da Receita e registra o que mudou
 * desde a importação: situação, CNAE, porte, regime. Não altera nada — a
 * aplicação é do contador, com o antes e o depois na tela.
 *
 * ---------------------------------------------------------------------------
 * POR QUE UMA FATIA, E NÃO A CARTEIRA INTEIRA
 *
 * A base é o servidor do próprio Enquadria, não uma API de terceiro com cota —
 * então o limite aqui não é de cortesia, é de tempo de função. Varrer 20 mil
 * CNPJs num handler de 60 segundos não termina, e um cron que sempre estoura é
 * um cron que nunca roda até o fim.
 *
 * A fatia é ordenada por quem foi conferido HÁ MAIS TEMPO. Sem essa ordem, uma
 * carteira maior que a fatia diária teria as primeiras empresas conferidas todo
 * dia e as últimas nunca.
 *
 * ---------------------------------------------------------------------------
 * DE MANHÃ, E DEPOIS DOS APONTAMENTOS. `0 8 * * *` é a varredura das normas;
 * esta roda às 08h30 UTC (05h30 em São Paulo) para as duas não disputarem a
 * mesma janela de função.
 */
const FATIA = Number(process.env.CADASTRO_FATIA ?? 300);

export async function POST(req: Request) {
  return varrer(req);
}
export async function GET(req: Request) {
  return varrer(req);
}

async function varrer(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (segredo && req.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json(
      { erro: "não autorizado — configure CRON_SECRET e envie o segredo" },
      { status: 401 }
    );
  }

  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ erro: "sem credencial de serviço" }, { status: 500 });

  if (!process.env.RECEITA_API_URL) {
    /* sem base configurada não há o que conferir — e dizer isso é melhor do que
       devolver "0 mudanças", que se lê como "está tudo igual" */
    return NextResponse.json({ ok: true, pulado: "RECEITA_API_URL não configurada" });
  }

  // schema-ok: empresas.cadastro_conferido_em é criada pela migration 0064
  const { data: todas, error } = await supabase
    .from("empresas")
    .select("id, tenant_id, cnpj, situacao, cnae_principal, porte, regime, cadastro_conferido_em")
    .is("arquivada_em", null)
    .limit(20000);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  const fatia = proximasAConferir(todas ?? [], FATIA);
  if (fatia.length === 0) return NextResponse.json({ ok: true, conferidas: 0 });

  const resultado = await enriquecer(fatia.map((e) => e.cnpj));

  /**
   * A BASE NÃO RESPONDEU — E ISSO NÃO PODE VIRAR "NADA MUDOU".
   *
   * Se marcássemos as empresas como conferidas mesmo com a base fora do ar, a
   * fila da varredura andaria sem conferir nada: em um mês a carteira inteira
   * estaria com `cadastro_conferido_em` recente e nenhuma teria sido olhada.
   * O silêncio viraria certificado de que está tudo bem.
   */
  if (!resultado.ativo) {
    return NextResponse.json({
      ok: false,
      conferidas: 0,
      erro: "a base da Receita não respondeu — nada foi marcado como conferido",
      falhas: resultado.falhas,
      detalhe: resultado.detalhe ?? null,
    });
  }

  const novas: Record<string, unknown>[] = [];
  const conferidas: string[] = [];

  for (const e of fatia) {
    const dados = resultado.dados[e.cnpj];
    if (!dados) continue; // a base não conhece este CNPJ: não é mudança, é ausência
    conferidas.push(e.id);

    for (const m of compararCadastro(e, dados)) {
      novas.push({
        tenant_id: e.tenant_id,
        empresa_id: e.id,
        campo: m.campo,
        valor_antigo: m.de,
        valor_novo: m.para,
        muda_triagem: m.muda_triagem,
        texto: m.texto,
        status: "nova",
      });
    }
  }

  /**
   * A DEDUPLICAÇÃO É LIDA, NÃO DELEGADA AO `upsert`.
   *
   * O índice único desta tabela é PARCIAL (`where status = 'nova'`), de
   * propósito: uma mudança já aplicada não pode impedir a detecção de uma nova
   * para o mesmo campo. E `ON CONFLICT` não aceita índice parcial como árbitro
   * sem repetir a condição — o que o PostgREST não sabe expressar. Um `upsert`
   * aqui compilaria, passaria em todo teste de unidade e quebraria na primeira
   * varredura de produção. A auditoria de upsert do repositório pegou isto.
   *
   * Ler as pendentes e filtrar em código custa uma consulta e não tem
   * armadilha. O índice continua existindo como última trava, para o caso de
   * duas varreduras se cruzarem.
   */
  let gravadas = 0;
  if (novas.length) {
    // schema-ok: mudancas_cadastro é criada pela migration 0064
    const { data: pendentes } = await supabase
      .from("mudancas_cadastro")
      .select("empresa_id, campo, valor_novo")
      .eq("status", "nova")
      .in("empresa_id", conferidas);

    const jaTem = new Set(
      (pendentes ?? []).map((p) => `${p.empresa_id}|${p.campo}|${p.valor_novo}`)
    );
    const inéditas = novas.filter(
      (n) => !jaTem.has(`${n.empresa_id}|${n.campo}|${n.valor_novo}`)
    );

    if (inéditas.length) {
      const { error: erroIns } = await supabase.from("mudancas_cadastro").insert(inéditas);
      if (erroIns) {
        return NextResponse.json(
          { ok: false, erro: erroIns.message, conferidas: 0, detectadas: novas.length },
          { status: 500 }
        );
      }
      gravadas = inéditas.length;
    }
  }

  if (conferidas.length) {
    await supabase
      .from("empresas")
      .update({ cadastro_conferido_em: new Date().toISOString() })
      .in("id", conferidas);
  }

  return NextResponse.json({
    ok: true,
    na_fatia: fatia.length,
    conferidas: conferidas.length,
    detectadas: novas.length,
    gravadas,
    falhas: resultado.falhas,
  });
}
