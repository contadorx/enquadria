import { MARCOS, type FaseAtual } from "@/lib/janela";

/**
 * A régua da janela — o elemento de assinatura do produto.
 * O Enquadria É o prazo; a interface lembra disso o tempo todo sem gritar.
 *
 * POR QUE ELA TEM DOIS TRECHOS. A primeira versão ia de 1º a 30 de setembro e,
 * a partir de outubro, ficava cheia com o rótulo "janela encerrada" — no lugar
 * mais visível da tela, todos os dias, para quem tinha acabado de assinar. A
 * régua passou a acompanhar o CALENDÁRIO: fechada a decisão, ela mostra o
 * trecho seguinte (alíquota até 31/10, cancelamento até 30/11), que é onde
 * está a segunda onda de trabalho cobrável. Ver lib/janela.ts.
 */
export function Regua({
  abre,
  fecha,
  fase,
  hoje = new Date(),
}: {
  abre: string;
  fecha: string;
  fase?: FaseAtual;
  hoje?: Date;
}) {
  const agora = hoje.getTime();
  const fimDe = (iso: string) => new Date(iso + "T23:59:59Z").getTime();

  /**
   * TRÊS TRECHOS, NÃO DOIS — conserto de 08/08/2026.
   *
   * A régua tinha só a decisão (1º→30/09) e o pós-janela (30/09→30/11). A
   * partir de 1º/12/2026 o segundo trecho expirava e ela CAÍA DE VOLTA no
   * primeiro: barra 100% cheia rotulada "1 SET … 30 SET", no lugar mais
   * visível da tela, ao lado de um selo dizendo "próxima janela em 2027".
   * Ou seja: consertaram o rótulo em lib/janela.ts e a régua ficou para trás,
   * reproduzindo exatamente o defeito que o arquivo diz ter eliminado — o
   * produto parecendo encerrado para quem acabou de assinar.
   *
   * O terceiro trecho vai do fim do cancelamento à próxima janela prevista. É
   * previsão, não norma — e o selo, que vem de `faseDaJanela`, já carrega o
   * "(prevista)" que diz isso.
   */
  const trecho = (() => {
    if (agora <= fimDe(fecha)) {
      return { ini: abre, fim: fecha, marcas: ["1 SET", "10", "20", "30 SET"] };
    }
    if (agora <= fimDe(MARCOS.cancelavel_ate)) {
      return { ini: fecha, fim: MARCOS.cancelavel_ate, marcas: ["30 SET", "31 OUT", "30 NOV"] };
    }
    return {
      ini: MARCOS.cancelavel_ate,
      fim: MARCOS.proxima_prevista,
      marcas: ["30 NOV", "regime em vigor", "próxima janela"],
    };
  })();

  const ini = new Date(trecho.ini).getTime();
  const fim = new Date(trecho.fim).getTime();
  /* trecho degenerado (datas iguais ou invertidas) zeraria a barra em vez de
     enchê-la — e barra vazia num prazo vencido lê como "não começou" */
  const pos = fim > ini ? Math.min(Math.max((agora - ini) / (fim - ini), 0), 1) * 100 : 100;

  const marcas = trecho.marcas;

  // sem a fase (chamadas antigas), cai no comportamento de antes
  const rotulo =
    fase?.selo ??
    (() => {
      const d = Math.max(Math.ceil((new Date(fecha).getTime() - agora) / 86400000), 0);
      return d > 0 ? `faltam ${d} dias` : "janela encerrada";
    })();

  return (
    <div className="flex min-w-0 flex-1 items-center gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex justify-between font-mono text-[9px] tracking-[0.1em] text-slate-300/60">
          {marcas.map((m) => (
            <span key={m}>{m}</span>
          ))}
        </div>
        <div className="relative my-2 h-px bg-slate-300/25">
          <div
            className="absolute left-0 top-0 h-px bg-accentbright"
            style={{ width: `${pos}%` }}
          />
          <div className="absolute -top-[3px] h-[7px] w-px bg-slate-300/30" style={{ left: "33%" }} />
          <div className="absolute -top-[3px] h-[7px] w-px bg-slate-300/30" style={{ left: "66%" }} />
          <div
            className="absolute -top-1 h-[9px] w-px bg-accentbright"
            style={{ left: `${pos}%` }}
          />
        </div>
      </div>
      <div
        title={fase?.chamada}
        className="whitespace-nowrap font-mono text-[11px] tracking-wide text-accentbright"
      >
        {rotulo}
      </div>
    </div>
  );
}
