"use client";

import { useEffect, useState } from "react";
import { AssistenteFlutuante } from "@/components/AssistenteFlutuante";
import { NpsModal } from "@/components/NpsModal";
import { devePerguntarNps } from "@/lib/nps";
import type { Situacao } from "@/lib/passos";

/**
 * O QUE FLUTUA POR CIMA DE TODAS AS TELAS: o assistente e o convite de NPS.
 *
 * Vive num componente só porque as duas coisas competem pelo mesmo espaço e
 * pela mesma atenção. Juntas no código, a regra de convivência fica explícita
 * — e ela é uma: **o NPS não aparece com o assistente aberto**. Interromper
 * alguém no meio de uma dúvida para perguntar se ela recomendaria o produto é
 * a maneira mais rápida de receber uma nota baixa merecida.
 *
 * A decisão de QUANDO perguntar é de lib/nps, testada. Aqui só se junta o
 * que o servidor sabe (laudos, última resposta) com o que só o navegador sabe
 * (a dispensa, que é de um dispositivo só e não justifica tabela).
 */
export function CamadaGlobal({
  assistenteAtivo,
  laudos,
  respondidoEm,
  situacao,
}: {
  assistenteAtivo: boolean;
  laudos: number;
  respondidoEm: string | null;
  /** onde o escritório está na esteira — é o que deixa o assistente proativo */
  situacao?: Situacao;
}) {
  const [perguntarNps, setPerguntarNps] = useState(false);

  useEffect(() => {
    let dispensadoEm: string | null = null;
    let respLocal: string | null = null;
    try {
      dispensadoEm = localStorage.getItem("enquadria_nps_dispensado");
      respLocal = localStorage.getItem("enquadria_nps_respondido");
    } catch {
      /* sem storage: decide só com o que veio do servidor */
    }

    setPerguntarNps(
      devePerguntarNps({
        laudos,
        // o servidor é a fonte da verdade; o navegador só ajuda a evitar o
        // piscar do convite entre a resposta e o próximo carregamento
        respondidoEm: respondidoEm ?? respLocal,
        dispensadoEm,
        hoje: new Date().toISOString().slice(0, 10),
      })
    );
  }, [laudos, respondidoEm]);

  return (
    <>
      <AssistenteFlutuante ativo={assistenteAtivo} situacao={situacao} />
      <NpsModal mostrar={perguntarNps} />
    </>
  );
}
