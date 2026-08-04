import { cancelarCobranca } from "./asaas";

/**
 * ENCERRAR ASSINATURAS SUPERADAS — o lado sujo da regra "uma conta, um plano".
 *
 * A decisão de QUAIS encerrar é pura e mora em `lib/assinatura.ts`, onde dá
 * para testar. Aqui fica o que precisa de banco e de rede: marcar as linhas,
 * cancelar o boleto lá no Asaas e acertar a fatura.
 *
 * A ORDEM IMPORTA. Primeiro o Asaas, depois a nossa fatura. Se a chamada ao
 * Asaas falhar, a fatura continua "em aberto" aqui — que é a verdade: a
 * cobrança segue viva lá. O contrário (marcar cancelada aqui e falhar lá)
 * esconderia um boleto pagável do dono da conta, e é assim que se recebe um
 * pagamento que o sistema não sabe explicar.
 *
 * FATURA PAGA NUNCA É TOCADA. Se a pessoa pagou o mensal enquanto trocava para
 * o anual, aquele dinheiro entrou: o que acontece com ele é crédito de dias
 * (ver `decidirSucessao`), nunca uma linha de histórico reescrita.
 */
export async function encerrarAssinaturas(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: { from: (t: string) => any },
  ids: string[]
): Promise<{ encerradas: number; cobrancas_canceladas: number; avisos: string[] }> {
  const avisos: string[] = [];
  if (!ids.length) return { encerradas: 0, cobrancas_canceladas: 0, avisos };

  /* as faturas ABERTAS destas assinaturas, antes de mexer em qualquer coisa */
  const { data: faturas, error: eSel } = await db
    .from("faturas")
    .select("id, asaas_id, status")
    .in("assinatura_id", ids)
    .in("status", ["pendente", "vencido"]);

  if (eSel) avisos.push(`não consegui ler as faturas em aberto: ${eSel.message}`);

  let canceladas = 0;
  for (const f of (faturas ?? []) as { id: string; asaas_id?: string | null }[]) {
    if (f.asaas_id) {
      const r = await cancelarCobranca(f.asaas_id);
      if (!r.cancelada) {
        // segue viva no Asaas: a fatura tem que continuar em aberto aqui
        avisos.push(`cobrança ${f.asaas_id} não foi cancelada no Asaas (${r.erro ?? "motivo não informado"})`);
        continue;
      }
    }
    const { error } = await db
      .from("faturas")
      .update({ status: "cancelado", atualizado_em: new Date().toISOString() })
      .eq("id", f.id);
    if (error) avisos.push(`fatura ${f.id} não marcada como cancelada: ${error.message}`);
    else canceladas++;
  }

  const { error: eUp } = await db.from("assinaturas").update({ status: "cancelada" }).in("id", ids);
  if (eUp) avisos.push(`assinaturas não encerradas: ${eUp.message}`);

  return { encerradas: eUp ? 0 : ids.length, cobrancas_canceladas: canceladas, avisos };
}
