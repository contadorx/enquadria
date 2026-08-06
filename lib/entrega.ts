/**
 * ENTREGA E LEITURA — o que aconteceu DEPOIS de "enviado".
 *
 * O painel dizia "enviado" e parava aí. Mas "enviado" só quer dizer que o
 * provedor aceitou a mensagem: não diz se ela chegou, se caiu em spam, se
 * bateu num endereço morto ou se alguém leu. Os webhooks do Postal e da Brevo
 * já gravam isso em `email_eventos` desde a 0050 — o dado existia e não
 * aparecia em lugar nenhum.
 *
 * Este arquivo é o casamento entre as duas tabelas, e é puro porque casar
 * evento com envio é justamente onde se erra em silêncio: um casamento errado
 * não quebra nada, só faz uma campanha boa parecer campanha morta.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * O QUE ABERTURA NÃO É — repetido aqui de propósito, onde o número é montado.
 *
 * O pixel de abertura é bloqueado por padrão em boa parte dos clientes, e o
 * Apple Mail Privacy Protection carrega TODAS as imagens, inflando o contrário.
 * Abertura é PISO e serve para comparar uma campanha com outra. O CLIQUE exige
 * ação humana e é o número em que se decide.
 */

export interface EnvioBase {
  id: string;
  para: string;
  regra: string | null;
  criado_em: string;
}

export interface EventoBase {
  envio_id: string | null;
  para: string;
  regra: string | null;
  /** entregue | aberto | clique | bounce | spam | recusado */
  evento: string;
  ocorreu_em: string;
}

export interface EstadoEntrega {
  entregue: string | null;
  aberto: string | null;
  clique: string | null;
  falha: { tipo: string; em: string } | null;
}

const vazio = (): EstadoEntrega => ({ entregue: null, aberto: null, clique: null, falha: null });
const norm = (e: string) => (e ?? "").trim().toLowerCase();

/** 5 minutos de folga: relógio do provedor não é o nosso */
const FOLGA_MS = 5 * 60 * 1000;

/**
 * CASA EVENTO COM ENVIO. Duas vias, nesta ordem:
 *
 *   1. `envio_id`, quando o webhook conseguiu ligar na hora que chegou;
 *   2. pelo par (destinatário, momento): o envio mais RECENTE para aquele
 *      endereço que aconteceu ANTES do evento.
 *
 * A segunda via existe porque `envio_id` fica nulo com frequência — o webhook
 * procura o envio no instante em que o evento chega e nem sempre acha. Sem ela,
 * metade dos eventos ficaria órfã e o painel mostraria zero abertura, que é
 * indistinguível de campanha ruim.
 *
 * Evento ANTERIOR ao envio nunca casa: seria atribuir a leitura de um e-mail à
 * mensagem seguinte, e é assim que uma régua nova nasce com métrica emprestada.
 */
export function casarEventos(
  envios: EnvioBase[],
  eventos: EventoBase[]
): { estados: Map<string, EstadoEntrega>; orfaos: number } {
  const estados = new Map<string, EstadoEntrega>();
  for (const e of envios) estados.set(e.id, vazio());

  /* por destinatário, do mais recente para o mais antigo */
  const porEmail = new Map<string, EnvioBase[]>();
  for (const e of envios) {
    const k = norm(e.para);
    if (!porEmail.has(k)) porEmail.set(k, []);
    porEmail.get(k)!.push(e);
  }
  /* `Array.from` em vez de iterar o Map direto: o target do tsconfig do app é
     conservador e `for…of` sobre `.values()` não compila lá. */
  Array.from(porEmail.keys()).forEach((k) => {
    porEmail.get(k)!.sort((a: EnvioBase, b: EnvioBase) => Date.parse(b.criado_em) - Date.parse(a.criado_em));
  });

  let orfaos = 0;

  for (const ev of eventos) {
    let alvo: string | null = ev.envio_id && estados.has(ev.envio_id) ? ev.envio_id : null;

    if (!alvo) {
      const quando = Date.parse(ev.ocorreu_em);
      const candidatos = porEmail.get(norm(ev.para)) ?? [];
      const achado = candidatos.find(
        (c) => Number.isFinite(quando) && Date.parse(c.criado_em) - FOLGA_MS <= quando
      );
      alvo = achado?.id ?? null;
    }

    if (!alvo) { orfaos++; continue; }

    const est = estados.get(alvo)!;
    switch (ev.evento) {
      case "entregue":
        /* o PRIMEIRO horário de cada tipo. Provedor reenvia webhook, e a
           segunda entrega do mesmo evento não é um fato novo. */
        if (!est.entregue || ev.ocorreu_em < est.entregue) est.entregue = ev.ocorreu_em;
        break;
      case "aberto":
        if (!est.aberto || ev.ocorreu_em < est.aberto) est.aberto = ev.ocorreu_em;
        break;
      case "clique":
        if (!est.clique || ev.ocorreu_em < est.clique) est.clique = ev.ocorreu_em;
        break;
      case "bounce":
      case "spam":
      case "recusado":
        /* FALHA MANDA. Um e-mail entregue e depois marcado como spam não é um
           sucesso com ressalva: é um endereço que não pode receber de novo. */
        if (!est.falha || ev.ocorreu_em < est.falha.em) est.falha = { tipo: ev.evento, em: ev.ocorreu_em };
        break;
      default:
        break; // evento desconhecido não conta como nada
    }
  }

  return { estados, orfaos };
}

/** o rótulo curto que vai na tabela — o estágio mais avançado alcançado */
export function rotuloEntrega(e: EstadoEntrega | undefined): {
  texto: string;
  nivel: "falha" | "clique" | "aberto" | "entregue" | "enviado";
} {
  if (!e) return { texto: "enviado", nivel: "enviado" };
  if (e.falha) return { texto: e.falha.tipo, nivel: "falha" };
  if (e.clique) return { texto: "clicou", nivel: "clique" };
  if (e.aberto) return { texto: "abriu", nivel: "aberto" };
  if (e.entregue) return { texto: "entregue", nivel: "entregue" };
  return { texto: "enviado", nivel: "enviado" };
}

export interface Resumo {
  enviados: number;
  entregues: number;
  abertos: number;
  cliques: number;
  falhas: number;
  /** enviados sem NENHUM evento — a medida de "o webhook está chegando?" */
  sem_evento: number;
}

export function resumir(envios: EnvioBase[], estados: Map<string, EstadoEntrega>): Resumo {
  const r: Resumo = { enviados: envios.length, entregues: 0, abertos: 0, cliques: 0, falhas: 0, sem_evento: 0 };
  for (const e of envios) {
    const s = estados.get(e.id);
    if (!s || (!s.entregue && !s.aberto && !s.clique && !s.falha)) { r.sem_evento++; continue; }
    if (s.falha) r.falhas++;
    /* ENTREGUE É IMPLÍCITO. Quem abriu, recebeu — mesmo que o webhook de
       entrega tenha se perdido. Contar só o evento explícito faria a taxa de
       entrega ficar ABAIXO da de abertura, número que ninguém consegue ler. */
    if (s.entregue || s.aberto || s.clique) r.entregues++;
    if (s.aberto || s.clique) r.abertos++;
    if (s.clique) r.cliques++;
  }
  return r;
}

/** o mesmo resumo, quebrado por regra — é onde se vê qual texto funciona */
export function resumirPorRegra(
  envios: EnvioBase[],
  estados: Map<string, EstadoEntrega>
): { regra: string; resumo: Resumo }[] {
  const grupos = new Map<string, EnvioBase[]>();
  for (const e of envios) {
    const k = e.regra ?? "(sem regra)";
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(e);
  }
  return Array.from(grupos.entries())
    .map(([regra, lista]) => ({ regra, resumo: resumir(lista, estados) }))
    .sort((a, b) => b.resumo.enviados - a.resumo.enviados);
}

/** percentual com uma casa; devolve null quando não há base — 0% mente */
export function taxa(parte: number, total: number): number | null {
  if (!total) return null;
  return Math.round((parte / total) * 1000) / 10;
}
