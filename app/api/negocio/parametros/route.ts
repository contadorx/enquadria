import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { PARAMETROS_2027 } from "@/lib/motor";

export const maxDuration = 60;

/**
 * PUBLICAR A ALÍQUOTA DE REFERÊNCIA — 08/08/2026.
 *
 * A tabela `parametros_exercicio` era lida em quatro lugares e não tinha por
 * onde ser escrita: nem migration, nem rota, nem tela. Trocar a alíquota exigia
 * SQL em produção. Como o produto vende por e-mail a revisão de outubro — "a
 * Resolução do Senado sai até 31/10 e cada laudo vira revisão cobrável" —, o
 * trabalho estava vendido e o instrumento não existia.
 *
 * TRÊS DECISÕES, e cada uma resolve um jeito de isto dar errado:
 *
 * 1. A TRAVA É DO BANCO. A política de RLS (migration 0065) só deixa o
 *    superadmin escrever. A checagem abaixo existe para a mensagem ser
 *    entendível, não para ser a segurança — segurança que mora na rota some na
 *    segunda rota.
 *
 * 2. GRAVAR NÃO RECALCULA NADA. Nenhuma análise é tocada, nenhum laudo muda.
 *    Um laudo emitido é prova, e prova que se reescreve quando um parâmetro
 *    muda não é prova. A carteira só se move quando o contador pedir uma
 *    rodada nova, que cria análises novas e preserva as anteriores.
 *
 * 3. O NÚMERO VEM COM PROCEDÊNCIA. `fonte` e `fixada` viajam para o carimbo
 *    impresso no laudo. Sem eles, publicar a Resolução faria o documento
 *    continuar dizendo "estimativa de trabalho, prazo até 31/10/2026" embaixo
 *    de um número que já é norma — o contador declararia como estimativa
 *    aquilo que virou lei.
 */

/** limites de sanidade: não é validação de norma, é rede contra dedo errado */
const TETO_ALIQUOTA = 0.5;

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });

  const { data: perfil } = await supabase
    .from("profiles")
    .select("is_superadmin")
    .eq("id", user.id)
    .maybeSingle();
  if (!perfil?.is_superadmin) {
    return NextResponse.json(
      { erro: "só o dono da plataforma publica a alíquota de referência" },
      { status: 403 }
    );
  }

  let corpo: {
    exercicio?: number;
    aliquota_cbs?: number;
    aliquota_ibs?: number;
    fronteira_min?: number;
    fronteira_max?: number;
    fixada?: boolean;
    fonte?: string;
  };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  const exercicio = Number(corpo.exercicio ?? 2027);
  const cbs = Number(corpo.aliquota_cbs);
  const ibs = Number(corpo.aliquota_ibs);
  const fmin = Number(corpo.fronteira_min ?? PARAMETROS_2027.fronteiraMin);
  const fmax = Number(corpo.fronteira_max ?? PARAMETROS_2027.fronteiraMax);

  if (!Number.isInteger(exercicio) || exercicio < 2026 || exercicio > 2033) {
    return NextResponse.json({ erro: "exercício fora do período da transição" }, { status: 400 });
  }
  if (!Number.isFinite(cbs) || !Number.isFinite(ibs) || cbs < 0 || ibs < 0) {
    return NextResponse.json({ erro: "informe CBS e IBS como número" }, { status: 400 });
  }
  if (cbs + ibs <= 0 || cbs + ibs > TETO_ALIQUOTA) {
    return NextResponse.json(
      { erro: "a soma CBS + IBS precisa ficar entre 0 e 50% — confira se digitou em fração (0,088) e não em por cento (8,8)" },
      { status: 400 }
    );
  }
  if (!(fmin > 0) || !(fmax > fmin)) {
    return NextResponse.json(
      { erro: "a banda de fronteira é multiplicador do ganho do comprador: min > 0 e max > min (padrão 0,8 e 1,2)" },
      { status: 400 }
    );
  }

  /**
   * DIZER QUE É NORMA EXIGE DIZER QUAL. `fixada` sem `fonte` produziria um
   * laudo afirmando que a alíquota decorre de norma publicada, sem citar
   * nenhuma — é a pior combinação possível num documento que o cliente
   * verifica.
   */
  const fonte = (corpo.fonte ?? "").trim();
  if (corpo.fixada && fonte.length < 15) {
    return NextResponse.json(
      { erro: "para marcar como fixada, escreva a fonte — o laudo cita a norma, não o campo em branco" },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("parametros_exercicio").upsert(
    {
      exercicio,
      aliquota_cbs: cbs,
      aliquota_ibs: ibs,
      /* inerte desde que a banda passou a capturar o intervalo; fica em zero
         para não fingir um efeito que não tem */
      corte_s1: 0,
      fronteira_min: fmin,
      fronteira_max: fmax,
      fixada: !!corpo.fixada,
      fonte: fonte || null,
      atualizado_em: new Date().toISOString(),
      atualizado_por: user.id,
    },
    { onConflict: "exercicio" }
  );
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  /* quantas análises foram calculadas com o número ANTIGO. Não é enfeite: é a
     medida do trabalho de revisão que acabou de nascer, e é ela que o dono usa
     para decidir se avisa os escritórios hoje ou na segunda-feira. */
  const { count } = await supabase
    .from("analises")
    .select("id", { count: "exact", head: true });

  return NextResponse.json({
    ok: true,
    exercicio,
    aliquota: cbs + ibs,
    analises_com_numero_anterior: count ?? 0,
  });
}
