"use client";

import { passosDaEsteira, type EstadoEsteira } from "@/lib/cockpit";

/**
 * OS PASSOS DAQUELA EMPRESA, na própria linha da fila.
 *
 * A fila dizia o que falta ("Confirmar premissas", "Emitir laudo") e não dizia
 * o que já foi feito. Numa carteira de duzentas, a diferença entre uma empresa
 * que acabou de entrar e uma que já tem laudo, termo e assinatura pendente era
 * um chip de texto no meio de outros — e o contador relia a linha inteira para
 * descobrir em que pé estava cada uma.
 *
 * Cinco marcas, sempre na mesma ordem, sempre no mesmo lugar: dados · análise ·
 * laudo · termo · assinatura. Cheio = feito. Contornado = é o passo da vez.
 * Vazio = ainda não. Lê-se de relance, sem ler palavra nenhuma — que é o ponto:
 * quem varre trinta linhas não lê, reconhece forma.
 *
 * Fora da janela (MEI, empresa baixada) não tem esteira, e mostrar cinco marcas
 * vazias sugeriria trabalho que não existe. Nesses casos o componente não
 * desenha nada.
 */
export function PassosEmpresa({
  estado,
  compacto = false,
}: {
  estado: EstadoEsteira;
  /** na linha da fila, menor; no cabeçalho da empresa, com rótulo */
  compacto?: boolean;
}) {
  const passos = passosDaEsteira(estado);
  if (!passos) return null;

  const feitos = passos.filter((p) => p.feito).length;

  return (
    <span
      className="inline-flex items-center gap-[3px]"
      title={passos
        .map((p) => `${p.feito ? "✓" : p.atual ? "→" : "·"} ${p.rotulo}`)
        .join("\n")}
      aria-label={`${feitos} de ${passos.length} passos concluídos`}
    >
      {passos.map((p) => (
        <span
          key={p.chave}
          className={`rounded-[1px] ${compacto ? "h-1.5 w-3" : "h-2 w-4"} ${
            p.feito
              ? "bg-verde"
              : p.atual
                ? "bg-surface ring-1 ring-inset ring-accentdeep"
                : "bg-line"
          }`}
        />
      ))}
      {!compacto && (
        <span className="ml-1.5 font-mono text-[10.5px] text-muted">
          {feitos}/{passos.length}
        </span>
      )}
    </span>
  );
}
