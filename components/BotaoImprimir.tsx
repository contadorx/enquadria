"use client";
export function BotaoImprimir({ rotulo = "Baixar PDF" }: { rotulo?: string }) {
  return (
    <button
      onClick={() => window.print()}
      className="no-print rounded-sm bg-ink px-4 py-2 text-sm font-semibold text-white"
    >
      {rotulo}
    </button>
  );
}
