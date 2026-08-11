"use client";

import { pct } from "@/lib/motor";

/**
 * A decisão em uma linha: o repasse necessário cabe dentro do ganho do comprador?
 * É o único gráfico do produto — e o que nenhum simulador do mercado mostra.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AS DUAS BARRAS ESTAVAM EM UNIDADES DIFERENTES — conserto de 10/08/2026.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A barra de cima desenhava `fc`, o ganho do comprador por operação. A de baixo
 * desenhava `re`, o aumento de PREÇO. São grandezas distintas, e a distância
 * entre elas na tela não era a folga que a frase logo abaixo anunciava:
 *
 *     barras:  7,1% − 5,3% = 1,8 pontos
 *     frase:   "sobra folga de 2,3 pontos para a negociação"
 *
 * O motor calcula a folga sobre o repasse LÍQUIDO — o que o comprador sente
 * depois de creditar parte do aumento —, e é esse número que pertence à mesma
 * régua de `fc`. Com `re` cru na barra, o gráfico mostrava a empresa em posição
 * pior do que o texto dizia, e quem lê um gráfico não confere o texto.
 *
 * Pior era a legenda: "Teto do aumento de preço que ele absorve e ainda sai
 * ganhando", pendurada em `fc`. Esse teto existe, mas vale `fc ÷ (1 − alíquota)`
 * — 7,8% neste caso, não 7,1%. A tela afirmava um limite de negociação 0,7
 * ponto abaixo do que o laudo imprime na seção da pressão comercial, e é um
 * limite que o contador leva para a mesa.
 *
 * Agora as duas barras medem a MESMA coisa: pontos que o comprador sente. O
 * preço continua à vista, como segunda linha do rótulo, porque é ele que se
 * negocia — mas não é ele que se compara com o ganho.
 */
export function Gauge({
  re,
  reLiquido,
  fc,
}: {
  /** o aumento de preço a negociar — o número que vai para a mesa */
  re: number;
  /** o que o comprador SENTE desse aumento, já descontado o crédito */
  reLiquido: number;
  /** o ganho do comprador por operação */
  fc: number;
}) {
  /* a barra desenhada é sempre a líquida: é a que divide régua com `fc` */
  const desenhar = isFinite(reLiquido) ? reLiquido : re;
  const escala = Math.max(fc, isFinite(desenhar) ? desenhar : fc) || 1;
  const larguraFc = (fc / escala) * 100;
  const larguraRe = (Math.min(isFinite(desenhar) ? desenhar : escala, escala) / escala) * 100;
  const estourou = isFinite(desenhar) && desenhar > fc;
  /* preço e líquido só divergem quando há alíquota; se coincidirem, repetir o
     mesmo número em duas linhas faria a tela parecer quebrada */
  const mostrarPreco = isFinite(re) && isFinite(reLiquido) && Math.abs(re - reLiquido) > 1e-9;

  return (
    <div>
      <div className="mb-4">
        <div className="mb-1.5 flex items-baseline justify-between text-[12.5px]">
          <span>Quanto o comprador ganha de crédito</span>
          <b className="font-mono text-base font-semibold">{pct(fc)}</b>
        </div>
        <div className="h-[26px] overflow-hidden rounded-sm bg-linesoft">
          <div
            className="h-full rounded-sm transition-all duration-300"
            style={{
              width: `${larguraFc}%`,
              background:
                "repeating-linear-gradient(135deg,#CFFAFE 0 6px,#A5F3FC 6px 12px)",
            }}
          />
        </div>
        <p className="mt-1.5 text-[11.5px] text-muted">
          Por operação, é o que ele deixa de gastar comprando de quem apurou por fora.
        </p>
      </div>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[12.5px]">
          <span>Repasse de que a empresa precisa</span>
          <b className="shrink-0 font-mono text-base font-semibold">
            {mostrarPreco ? pct(reLiquido) : pct(re)}
          </b>
        </div>
        <div className="h-[26px] overflow-hidden rounded-sm bg-linesoft">
          <div
            className={`h-full rounded-sm transition-all duration-300 ${
              estourou ? "bg-vermelho" : "bg-ink"
            }`}
            style={{ width: `${larguraRe}%` }}
          />
        </div>
        <p className="mt-1.5 text-[11.5px] text-muted">
          {mostrarPreco ? (
            <>
              São <b>{pct(re)}</b> no preço; o comprador sente <b>{pct(reLiquido)}</b>, porque parte
              volta a ele como crédito. A barra mostra o que ele sente — é o que se compara com o
              ganho de cima.
            </>
          ) : (
            "Aumento de preço nas vendas a empresa que deixa a companhia neutra."
          )}
        </p>
        {/**
          * A DISTÂNCIA É NOMEADA, NÃO NUMERADA.
          *
          * A primeira versão deste conserto escrevia "sobram 2,3 pontos entre as
          * duas barras". Só que 7,1 − 4,9, os números impressos ao lado, dão
          * 2,2: a folga é 2,27 e cada ponta arredonda para o seu lado. O convite
          * a subtrair os rótulos produz um erro que não existe.
          *
          * E a linha da decisão, logo abaixo, já diz "sobra folga de 2,3 pontos"
          * — vinda do motor, com precisão cheia, e é a MESMA frase que o laudo
          * imprime. Um segundo lugar na tela com o mesmo nome e outro valor é
          * exatamente o defeito que este arquivo acabou de consertar nas barras.
          * A folga tem um dono só.
          */}
        <p className="mt-1.5 text-[11.5px] text-muted">
          {estourou
            ? "O repasse ultrapassa o ganho do comprador — não há folga a negociar."
            : "A distância entre as duas barras é a folga da negociação, em números logo abaixo."}
        </p>
      </div>
    </div>
  );
}
