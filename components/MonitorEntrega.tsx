import { monitorar, type Disjuntor, type EstadoVarredura } from "@/lib/entrega-garantida";

/**
 * O MONITOR DA ENTREGA — só desenho.
 *
 * Ele existe porque a trava da varredura (ver `lib/entrega-garantida`, seção
 * 2b) protege o sistema de si mesmo e NÃO devolve a proteção de entrega:
 * enquanto o webhook estiver mudo, mensagem pode se perder sem ninguém saber.
 * Esse estado vivia no JSON de retorno do cron e no log da Vercel — dois
 * lugares onde ninguém passa.
 *
 * Fica no TOPO da tela de E-mails, antes de qualquer métrica: número de
 * abertura não significa nada se a entrega está fora do ar, e a ordem visual
 * precisa dizer isso.
 */

const ESTILO: Record<string, { caixa: string; titulo: string; selo: string; rotulo: string }> = {
  critico: {
    caixa: "border-vermelho bg-vermelhowash",
    titulo: "text-vermelho",
    selo: "bg-vermelho text-white",
    rotulo: "AÇÃO NECESSÁRIA",
  },
  atencao: {
    caixa: "border-amarelo bg-amarelowash",
    titulo: "text-amarelo",
    selo: "bg-amarelo text-white",
    rotulo: "ATENÇÃO",
  },
  ok: {
    caixa: "border-line bg-surface",
    titulo: "text-slate2",
    selo: "bg-verdewash text-verde",
    rotulo: "EM ORDEM",
  },
};

export function MonitorEntrega({
  varredura,
  disjuntor,
  agora,
}: {
  varredura: EstadoVarredura;
  disjuntor: Disjuntor;
  /** vem do servidor: `new Date()` no cliente faria servidor e navegador
      discordarem e a hidratação quebraria sem dizer por quê */
  agora: string;
}) {
  const m = monitorar(varredura, disjuntor, new Date(agora));
  const e = ESTILO[m.nivel] ?? ESTILO.ok;

  return (
    <div className={`mb-5 rounded border p-4 ${e.caixa}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 font-mono text-[9.5px] tracking-[0.14em] ${e.selo}`}>
          {e.rotulo}
        </span>
        <span className={`text-[14px] font-bold ${e.titulo}`}>{m.titulo}</span>
      </div>

      <p className="mt-1.5 max-w-[80ch] text-[12.5px] leading-relaxed text-slate2">{m.detalhe}</p>

      {m.acao && (
        <p className="mt-2 max-w-[80ch] border-t border-line/60 pt-2 text-[12.5px] leading-relaxed">
          <b>O que fazer:</b> {m.acao}
        </p>
      )}
    </div>
  );
}
