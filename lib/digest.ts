/**
 * DIGEST MENSAL — o pulso que chega sem o contador precisar lembrar do app.
 *
 * REGRA QUE DEFINE O PRODUTO: só se manda e-mail quando há ALGO CONCRETO da
 * carteira dele. Nada de "resumo do mês" com zero pendência e zero impacto —
 * isso vira ruído, o contador silencia o remetente, e aí perdemos o canal
 * justamente quando tivermos algo importante para dizer.
 *
 * `montarDigest` decide se vale enviar (`vale_enviar`) e monta o conteúdo.
 * Puro, sem I/O, testável.
 */

export interface DadosDigest {
  escritorio: string;
  /** empresas nas faixas de análise */
  fila: number;
  /** análises já salvas */
  analisadas: number;
  /** laudos emitidos */
  laudos: number;
  /** termos criados */
  termos: number;
  /** termos assinados */
  assinados: number;
  /** honorário de referência para o potencial */
  honorario: number;
  /** marcos do radar que atingem clientes desta carteira */
  radar_marcos: number;
  radar_clientes: number;
  radar_titulo: string | null;
  /** dias até o fechamento da janela (negativo = já fechou) */
  dias_janela: number | null;
}

export interface Digest {
  vale_enviar: boolean;
  motivo_nao_enviar?: string;
  assunto: string;
  /** frases já prontas, em ordem de importância */
  destaques: string[];
  /** a única ação recomendada */
  chamada: { texto: string; caminho: string } | null;
  potencial_na_mesa: number;
}

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function montarDigest(d: DadosDigest): Digest {
  const semAnalise = Math.max(d.fila - d.analisadas, 0);
  const semLaudo = Math.max(d.analisadas - d.laudos, 0);
  const aguardandoAssinatura = Math.max(d.termos - d.assinados, 0);
  const potencial = semAnalise * d.honorario;

  const destaques: string[] = [];
  let chamada: Digest["chamada"] = null;

  // 1. o que muda a conta de clientes reais vem primeiro
  if (d.radar_clientes > 0) {
    destaques.push(
      `${d.radar_marcos} ${d.radar_marcos === 1 ? "marco da transição atinge" : "marcos da transição atingem"} ${d.radar_clientes} ${d.radar_clientes === 1 ? "cliente seu" : "clientes seus"}${d.radar_titulo ? `. O mais relevante: ${d.radar_titulo}` : ""}.`
    );
    chamada = { texto: "Ver quais clientes são afetados", caminho: "/painel" };
  }

  // 2. prazo, quando ainda existe
  if (d.dias_janela != null && d.dias_janela > 0 && semAnalise > 0) {
    destaques.push(
      `Faltam ${d.dias_janela} dias para o fim da janela e ${semAnalise} ${semAnalise === 1 ? "empresa da sua carteira segue" : "empresas da sua carteira seguem"} sem decisão registrada — ${brl(potencial)} de honorário na mesa.`
    );
    chamada = { texto: "Analisar em lote", caminho: "/painel" };
  } else if (semAnalise > 0) {
    destaques.push(
      `${semAnalise} ${semAnalise === 1 ? "empresa segue" : "empresas seguem"} sem decisão registrada na sua carteira.`
    );
    if (!chamada) chamada = { texto: "Abrir o cockpit", caminho: "/painel" };
  }

  // 3. o que está parado na esteira
  if (aguardandoAssinatura > 0) {
    destaques.push(
      `${aguardandoAssinatura} ${aguardandoAssinatura === 1 ? "termo aguarda" : "termos aguardam"} assinatura do cliente. Documento não assinado não protege ninguém.`
    );
    if (!chamada) chamada = { texto: "Cobrar assinatura", caminho: "/painel" };
  }
  if (semLaudo > 0) {
    destaques.push(
      `${semLaudo} ${semLaudo === 1 ? "análise está" : "análises estão"} sem laudo emitido — trabalho feito que ainda não virou papel cobrável.`
    );
    if (!chamada) chamada = { texto: "Emitir laudos", caminho: "/painel" };
  }

  // 4. reconhecimento quando está tudo em dia (mas isso sozinho NÃO gera e-mail)
  const tudoEmDia =
    destaques.length === 0 && d.assinados > 0 && d.assinados === d.termos && semAnalise === 0;
  if (tudoEmDia) {
    destaques.push(
      `Sua carteira está em dia: ${d.assinados} ${d.assinados === 1 ? "decisão registrada e assinada" : "decisões registradas e assinadas"}.`
    );
  }

  const vale_enviar = d.radar_clientes > 0 || semAnalise > 0 || aguardandoAssinatura > 0 || semLaudo > 0;

  const assunto =
    d.radar_clientes > 0
      ? `${d.radar_clientes} ${d.radar_clientes === 1 ? "cliente seu é afetado" : "clientes seus são afetados"} por mudanças da reforma`
      : semAnalise > 0 && d.dias_janela != null && d.dias_janela > 0
      ? `Faltam ${d.dias_janela} dias e ${semAnalise} ${semAnalise === 1 ? "cliente seu" : "clientes seus"} sem decisão`
      : aguardandoAssinatura > 0
      ? `${aguardandoAssinatura} ${aguardandoAssinatura === 1 ? "termo aguarda" : "termos aguardam"} assinatura`
      : "Sua carteira no Enquadria";

  return {
    vale_enviar,
    motivo_nao_enviar: vale_enviar ? undefined : "nada de concreto para reportar neste ciclo",
    assunto,
    destaques,
    chamada,
    potencial_na_mesa: potencial,
  };
}

/** HTML do e-mail — sóbrio, sem imagem, com uma única chamada */
export function htmlDigest(d: Digest, escritorio: string, base: string): string {
  const itens = d.destaques
    .map(
      (t) =>
        `<li style="margin-bottom:10px;line-height:1.55">${t}</li>`
    )
    .join("");
  const cta = d.chamada
    ? `<p style="text-align:center;margin:26px 0">
         <a href="${base}${d.chamada.caminho}" style="background:#06B6D4;color:#04212B;font-weight:bold;text-decoration:none;padding:13px 24px;border-radius:999px;display:inline-block">${d.chamada.texto}</a>
       </p>`
    : "";
  return `
  <div style="font-family:Arial,sans-serif;max-width:540px;margin:0 auto;color:#334155">
    <div style="border-bottom:2px solid #0B1220;padding-bottom:12px;margin-bottom:18px">
      <strong style="font-size:17px;color:#0B1220">Enquadria</strong>
      <span style="float:right;font-size:12px;color:#94A3B8">${escritorio}</span>
    </div>
    <p style="font-size:15px;margin-bottom:14px">O que mudou na sua carteira:</p>
    <ul style="padding-left:18px;font-size:14px">${itens}</ul>
    ${cta}
    <p style="font-size:11px;color:#94A3B8;margin-top:24px;border-top:1px solid #EEF2F7;padding-top:12px">
      Você recebe este resumo porque tem uma carteira ativa no Enquadria. Ele só é enviado quando há algo concreto a informar.
    </p>
  </div>`;
}
