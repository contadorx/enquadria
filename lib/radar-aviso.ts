/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O RADAR AVISA — e lembra que já avisou.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O DEFEITO QUE ISTO CONSERTA, medido em 06/08/2026:
 *
 *   o item da NFS-e nacional entrou com severidade ALTA, vigência 01/09 e
 *   alcance de 55 empresas em 5 escritórios. E publicar não disparava nada.
 *   O único e-mail que fala de radar é o digest, agendado para o dia 1º —
 *   o aviso chegaria NO DIA da obrigação. Vinte e seis dias de antecedência
 *   viravam zero.
 *
 * ---------------------------------------------------------------------------
 * A REGRA QUE NÃO PODE SER QUEBRADA: e-mail só com número da carteira DELE.
 *
 * "Saiu a Resolução X" é o que qualquer portal manda, e é o que faz o
 * contador silenciar o remetente. "Isto atinge 12 clientes seus" é a única
 * frase que só nós conseguimos escrever — e é por isso que o alcance por
 * escritório é calculado ANTES de decidir quem recebe: escritório com zero
 * empresas atingidas não recebe nada, nem um "para seu conhecimento".
 *
 * ---------------------------------------------------------------------------
 * POR QUE O E-MAIL NÃO LISTA OS NOMES DOS CLIENTES.
 *
 * Foi considerado, porque nome é prova e prova converte. Ficou de fora por
 * duas razões: e-mail é canal que se encaminha e vaza sem intenção, e o
 * clique para ver QUAIS é exatamente o comportamento que queremos criar. O
 * número vai no e-mail; os nomes ficam na aba Reforma, a um clique.
 *
 * Funções puras — sem I/O. Quem busca do banco é a rota.
 */
import { atingidas, diasPara, type ItemRadar, type EmpresaRadar } from "./radar";

/** um item como ele vive no banco: o `ativo` importa para poder avisar */
export type ItemPublicado = ItemRadar & { ativo?: boolean; no_cockpit?: boolean };

export interface CarteiraDeTenant {
  tenant_id: string;
  escritorio: string;
  email: string | null;
  empresas: EmpresaRadar[];
}

export interface AlvoAviso {
  tenant_id: string;
  escritorio: string;
  email: string;
  empresas: number;
}

export interface DiagnosticoAviso {
  /** quem vai receber agora */
  alvos: AlvoAviso[];
  /** escritórios que o critério alcança, avisados ou não */
  alcancados: number;
  /** alcançados que já receberam este item antes */
  repetidos: number;
  /** alcançados que o critério pega mas não têm e-mail cadastrado */
  sem_email: number;
  /** quando presente, NÃO envie — e mostre isto à pessoa */
  bloqueio: string | null;
}

/**
 * QUEM RECEBE, e por quê.
 *
 * O bloqueio mais importante é o do item fora do ar. Mandar e-mail sobre uma
 * norma e o contador clicar e não achar nada na aba Reforma é pior do que não
 * mandar: queima o e-mail E a aba, de uma vez. Publicado e visível primeiro,
 * avisado depois — nunca o contrário.
 */
export function diagnosticarAviso(
  item: ItemPublicado,
  carteiras: CarteiraDeTenant[],
  jaAvisados: Iterable<string>
): DiagnosticoAviso {
  const avisados = new Set(jaAvisados);
  const alvos: AlvoAviso[] = [];
  let alcancados = 0;
  let repetidos = 0;
  let semEmail = 0;

  for (const c of carteiras) {
    const n = atingidas(item, c.empresas).length;
    if (n === 0) continue;
    alcancados++;
    if (avisados.has(c.tenant_id)) { repetidos++; continue; }
    if (!c.email) { semEmail++; continue; }
    alvos.push({ tenant_id: c.tenant_id, escritorio: c.escritorio, email: c.email, empresas: n });
  }

  alvos.sort((a, b) => b.empresas - a.empresas);

  let bloqueio: string | null = null;
  if (item.ativo === false) {
    bloqueio =
      "Este item está FORA DO AR. Quem receber o e-mail vai abrir a aba Reforma e não encontrar nada — " +
      "queima o e-mail e a aba de uma vez. Coloque no ar primeiro.";
  } else if (alcancados === 0) {
    bloqueio =
      "Nenhum escritório é alcançado por este critério. Ninguém receberia — reveja os filtros antes de avisar.";
  } else if (alvos.length === 0 && repetidos > 0) {
    bloqueio = `Os ${repetidos} escritório(s) alcançados já foram avisados sobre este item. Avisar de novo é como se perde um remetente.`;
  } else if (alvos.length === 0) {
    bloqueio = "Os escritórios alcançados não têm e-mail cadastrado.";
  }

  return { alvos, alcancados, repetidos, sem_email: semEmail, bloqueio };
}

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

/**
 * O ASSUNTO carrega o número, não a norma.
 *
 * "Resolução CGSN 189/2026" na caixa de entrada é indistinguível de
 * newsletter. "12 clientes seus" não é.
 */
export function assuntoAviso(item: ItemPublicado, empresas: number, hojeISO: string): string {
  const dias = diasPara(item.vigencia_em, hojeISO);
  const quem = `${empresas} ${plural(empresas, "cliente seu", "clientes seus")}`;
  if (dias != null && dias >= 0 && dias <= 60) {
    return `${quem} e ${dias} ${plural(dias, "dia", "dias")}: ${item.titulo}`;
  }
  return `${quem}: ${item.titulo}`;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const CORES: Record<string, string> = { alta: "#DC2626", media: "#D97706", baixa: "#64748B" };
const ROTULOS: Record<string, string> = { alta: "ALTA", media: "MÉDIA", baixa: "INFORMATIVO" };

/** o e-mail: um item, um número, uma ação, um link */
export function htmlAviso(
  item: ItemPublicado,
  alvo: AlvoAviso,
  base: string,
  hojeISO: string
): string {
  const dias = diasPara(item.vigencia_em, hojeISO);
  const cor = CORES[item.severidade] ?? "#64748B";
  const dataVig = item.vigencia_em
    ? new Date(item.vigencia_em + "T12:00:00").toLocaleDateString("pt-BR")
    : null;

  const prazo =
    dias == null
      ? ""
      : dias > 0
      ? `<p style="margin:0 0 14px;font-size:13px;color:${cor};font-weight:bold">
           Entra em vigor em ${dataVig} — faltam ${dias} ${plural(dias, "dia", "dias")}.
         </p>`
      : dias === 0
      ? `<p style="margin:0 0 14px;font-size:13px;color:${cor};font-weight:bold">Entra em vigor HOJE.</p>`
      : `<p style="margin:0 0 14px;font-size:13px;color:${cor};font-weight:bold">Já está valendo desde ${dataVig}.</p>`;

  const acao = item.o_que_fazer
    ? `<div style="background:#F8FAFC;border-left:3px solid ${cor};padding:12px 14px;margin:0 0 18px">
         <div style="font-size:11px;letter-spacing:.06em;color:#64748B;font-weight:bold;margin-bottom:5px">O QUE FAZER</div>
         <div style="font-size:14px;line-height:1.55;color:#334155">${esc(item.o_que_fazer)}</div>
       </div>`
    : "";

  const fonte = item.fonte
    ? `<p style="font-size:11.5px;color:#94A3B8;margin:0 0 4px">Fonte: ${esc(item.fonte)}</p>`
    : "";

  return `
  <div style="font-family:Arial,sans-serif;max-width:540px;margin:0 auto;color:#334155">
    <div style="border-bottom:2px solid #0B1220;padding-bottom:12px;margin-bottom:18px">
      <strong style="font-size:17px;color:#0B1220">Enquadria</strong>
      <span style="float:right;font-size:12px;color:#94A3B8">${esc(alvo.escritorio)}</span>
    </div>

    <div style="font-size:11px;letter-spacing:.08em;font-weight:bold;color:${cor};margin-bottom:6px">
      ${ROTULOS[item.severidade] ?? esc(item.severidade)} · RADAR DA TRANSIÇÃO
    </div>

    <h1 style="font-size:19px;line-height:1.3;color:#0B1220;margin:0 0 10px">${esc(item.titulo)}</h1>

    <p style="font-size:15px;font-weight:bold;color:#0B1220;margin:0 0 12px">
      Isto atinge ${alvo.empresas} ${plural(alvo.empresas, "cliente seu", "clientes seus")}.
    </p>

    ${prazo}

    <p style="font-size:14px;line-height:1.6;margin:0 0 16px">${esc(item.resumo)}</p>

    ${acao}

    <p style="text-align:center;margin:24px 0">
      <a href="${base}/painel" style="background:#06B6D4;color:#04212B;font-weight:bold;text-decoration:none;padding:13px 24px;border-radius:999px;display:inline-block">
        Ver quais ${plural(alvo.empresas, "cliente é", "clientes são")} ${plural(alvo.empresas, "atingido", "atingidos")}
      </a>
    </p>

    ${fonte}
    <p style="font-size:11px;color:#94A3B8;margin-top:20px;border-top:1px solid #EEF2F7;padding-top:12px">
      Você recebe este aviso porque a mudança atinge empresas da sua carteira no Enquadria.
      Só enviamos quando o número é maior que zero.
    </p>
  </div>`;
}

/**
 * O QUE É NOVO PARA ESTE ESCRITÓRIO — a definição que faltava ao digest.
 *
 * Sem isto, o digest reporta os mesmos marcos todo mês, com o mesmo número no
 * assunto, e o item inédito não se destaca de nada. Novo = alcança a carteira
 * dele E ainda não tem linha em `radar_avisos`.
 */
export function novosParaTenant(
  itensOrdenados: ItemPublicado[],
  empresas: EmpresaRadar[],
  jaAvisados: Iterable<string>
): { novos: ItemPublicado[]; titulo: string | null; empresasAfetadas: Set<string> } {
  const avisados = new Set(jaAvisados);
  const novos: ItemPublicado[] = [];
  const afetadas = new Set<string>();

  for (const item of itensOrdenados) {
    const alvo = atingidas(item, empresas);
    if (!alvo.length) continue;
    alvo.forEach((e) => afetadas.add(e.id));
    if (!avisados.has(item.id)) novos.push(item);
  }

  return { novos, titulo: novos[0]?.titulo ?? null, empresasAfetadas: afetadas };
}
