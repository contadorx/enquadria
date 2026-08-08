/**
 * ═══════════════════════════════════════════════════════════════════════════
 * APAGAR AQUI NÃO APAGA LÁ — e o "lá" cobra cartão de crédito.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `excluir_conta()` apaga o tenant e cascateia tudo. Não toca no Asaas. Foi
 * conferido em 05/08/2026 que a cobrança viva da base era AVULSA (`pay_…`), e
 * por isso apagar era inofensivo — mas isso foi sorte de desenho, não garantia.
 *
 * O modo de falha, escrito por extenso porque ele não dá sinal nenhum: alguém
 * apaga uma conta de teste; a cobrança continua aberta no gateway; o boleto
 * vence, a régua do Asaas manda cobrança, e a partir daí não existe uma linha
 * no nosso banco que explique de onde aquilo veio — porque o tenant não existe
 * mais. O prejuízo aparece como reclamação, não como erro.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * A ORDEM É O DESENHO INTEIRO: cancela no gateway PRIMEIRO, apaga depois.
 *
 * Se apagar primeiro e cancelar depois, uma falha de rede no meio deixa
 * exatamente o estado que se quer evitar — e sem os `asaas_id`, que foram
 * embora com as linhas. Cancelar primeiro tem o modo de falha oposto e barato:
 * cobrança cancelada e conta ainda de pé, que é só tentar de novo.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * E O QUE NÃO DER PARA CANCELAR, IMPEDE. Uma cobrança PAGA não se cancela —
 * estornar é decisão de gente. Este módulo separa as três situações e devolve
 * a lista, para a tela dizer o que vai acontecer antes de acontecer.
 */
import { cancelarCobranca } from "./asaas";

export interface CobrancaDoGateway {
  assinatura_id: string;
  asaas_id: string | null;
  status: string | null;
  valor_centavos: number | null;
  vencimento: string | null;
}

export type Destino = "cancelar" | "ja_encerrada" | "impede";

export interface PlanoDeLimpeza {
  cobranca: CobrancaDoGateway;
  destino: Destino;
  motivo: string;
}

/** status em que a cobrança já não gera nada no gateway */
const ENCERRADAS = new Set(["cancelada", "estornada", "expirada"]);
/** status em que dinheiro trocou de mãos — cancelar não é a ação certa */
const COM_DINHEIRO = new Set(["paga", "pago", "recebida", "recebido", "confirmada", "confirmado"]);

/**
 * O QUE FAZER COM CADA COBRANÇA, decidido antes de qualquer chamada de rede.
 * Função pura: é ela que a prévia mostra e é ela que a exclusão obedece — os
 * dois caminhos leem a mesma decisão, e por isso a tela não pode prometer uma
 * coisa e o servidor fazer outra.
 */
export function planejarLimpeza(cobrancas: CobrancaDoGateway[]): PlanoDeLimpeza[] {
  return cobrancas.map((c) => {
    const s = (c.status ?? "").toLowerCase();
    if (!c.asaas_id) {
      return { cobranca: c, destino: "ja_encerrada", motivo: "não chegou a existir no gateway" };
    }
    if (COM_DINHEIRO.has(s)) {
      return {
        cobranca: c,
        destino: "impede",
        motivo:
          "cobrança PAGA no gateway. Cancelar não desfaz pagamento, e estornar é decisão de gente — " +
          "resolva no Asaas antes de apagar a conta.",
      };
    }
    if (ENCERRADAS.has(s)) {
      return { cobranca: c, destino: "ja_encerrada", motivo: `já está ${s} no gateway` };
    }
    /**
     * ASSINATURA RECORRENTE É O CASO CARO. `sub_…` cobra o cartão todo mês por
     * conta própria; um `pay_…` esquecido gera um boleto, uma assinatura
     * esquecida gera doze. Cancelamos os dois pelo mesmo caminho, mas a
     * recorrente ganha um aviso próprio para quem lê a prévia entender o
     * tamanho do que está sendo desfeito.
     */
    const recorrente = c.asaas_id.startsWith("sub_");
    return {
      cobranca: c,
      destino: "cancelar",
      motivo: recorrente
        ? "ASSINATURA RECORRENTE no gateway — se não for cancelada, continua cobrando o cartão todo mês"
        : "cobrança em aberto no gateway",
    };
  });
}

export interface ResultadoLimpeza {
  canceladas: number;
  ja_encerradas: number;
  impedimentos: { asaas_id: string | null; motivo: string }[];
  falhas: { asaas_id: string | null; erro: string }[];
}

/**
 * EXECUTA o plano. Devolve o que conseguiu e o que não — nunca lança, porque
 * quem chama precisa decidir se apaga ou não com a lista na mão.
 *
 * `cancelador` entra por parâmetro para o teste poder rodar sem rede. O padrão
 * é o Asaas de verdade.
 */
export async function limparNoGateway(
  plano: PlanoDeLimpeza[],
  cancelador: (id: string) => Promise<{ cancelada: boolean; erro?: string }> = cancelarCobranca
): Promise<ResultadoLimpeza> {
  const r: ResultadoLimpeza = { canceladas: 0, ja_encerradas: 0, impedimentos: [], falhas: [] };

  for (const p of plano) {
    if (p.destino === "impede") {
      r.impedimentos.push({ asaas_id: p.cobranca.asaas_id, motivo: p.motivo });
      continue;
    }
    if (p.destino === "ja_encerrada") {
      r.ja_encerradas += 1;
      continue;
    }
    const id = p.cobranca.asaas_id as string;
    const resp = await cancelador(id);
    if (resp.cancelada) r.canceladas += 1;
    else r.falhas.push({ asaas_id: id, erro: resp.erro ?? "o gateway não confirmou o cancelamento" });
  }
  return r;
}

/**
 * PODE APAGAR? Só quando não sobrou nada vivo no gateway.
 *
 * Falha de rede conta como impedimento, e é o ponto: "não consegui falar com o
 * Asaas" não é "não havia nada lá". Tratar os dois igual é como o dinheiro
 * escapa — o delete passa, a cobrança fica, e ninguém fica sabendo.
 */
export function podeApagar(r: ResultadoLimpeza): { pode: boolean; motivo: string } {
  if (r.impedimentos.length) {
    return {
      pode: false,
      motivo:
        `${r.impedimentos.length} cobrança(s) exigem decisão no Asaas antes: ` +
        r.impedimentos.map((i) => i.motivo).join(" · "),
    };
  }
  if (r.falhas.length) {
    return {
      pode: false,
      motivo:
        `Não foi possível cancelar ${r.falhas.length} cobrança(s) no gateway: ` +
        r.falhas.map((f) => `${f.asaas_id} — ${f.erro}`).join(" · ") +
        ". A conta NÃO foi apagada, de propósito: apagar agora deixaria cobrança viva sem dono.",
    };
  }
  return { pode: true, motivo: "" };
}

/** o resumo em uma frase, para a prévia mostrar antes de qualquer clique */
export function resumoDoPlano(plano: PlanoDeLimpeza[]): string {
  const cancelar = plano.filter((p) => p.destino === "cancelar");
  const impede = plano.filter((p) => p.destino === "impede");
  const recorrentes = cancelar.filter((p) => p.cobranca.asaas_id?.startsWith("sub_"));

  if (!plano.length) return "Nenhuma cobrança no gateway para esta conta.";
  const partes: string[] = [];
  if (cancelar.length) {
    partes.push(
      `${cancelar.length} cobrança(s) serão CANCELADAS no Asaas antes de apagar` +
        (recorrentes.length ? `, sendo ${recorrentes.length} assinatura(s) recorrente(s)` : "")
    );
  }
  const encerradas = plano.length - cancelar.length - impede.length;
  if (encerradas) partes.push(`${encerradas} já estão encerradas lá`);
  if (impede.length) partes.push(`${impede.length} IMPEDEM a exclusão (pagas)`);
  return partes.join(" · ") + ".";
}
