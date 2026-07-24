/**
 * A régua da janela — o elemento de assinatura do produto.
 * O Enquadria É o prazo; a interface lembra disso o tempo todo sem gritar.
 */
export function Regua({
  abre,
  fecha,
  hoje = new Date(),
}: {
  abre: string;
  fecha: string;
  hoje?: Date;
}) {
  const ini = new Date(abre).getTime();
  const fim = new Date(fecha).getTime();
  const agora = hoje.getTime();
  const bruto = (agora - ini) / (fim - ini);
  const pos = Math.min(Math.max(bruto, 0), 1) * 100;
  const dias = Math.max(Math.ceil((fim - agora) / 86400000), 0);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex justify-between font-mono text-[9px] tracking-[0.1em] text-slate-300/60">
          <span>1 SET</span>
          <span>10</span>
          <span>20</span>
          <span>30 SET</span>
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
      <div className="whitespace-nowrap font-mono text-[11px] tracking-wide text-accentbright">
        {dias > 0 ? `faltam ${dias} dias` : "janela encerrada"}
      </div>
    </div>
  );
}
