"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Marca um item do radar como lido para este escritório.
 *
 * Só aparece nos itens que atingem clientes da carteira — marcar como lido algo
 * que não te afeta não significa nada.
 */
export function MarcarLido({ itemId, lido }: { itemId: string; lido: boolean }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [feito, setFeito] = useState(lido);

  async function alternar() {
    setOcupado(true);
    try {
      const resp = await fetch("/api/radar/leitura", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId, lido: !feito }),
      });
      if (resp.ok) {
        setFeito(!feito);
        router.refresh();
      }
    } finally {
      setOcupado(false);
    }
  }

  return (
    <button
      onClick={alternar}
      disabled={ocupado}
      className={`whitespace-nowrap rounded-sm border px-2.5 py-1 text-[11.5px] font-semibold disabled:opacity-40 ${
        feito
          ? "border-line text-muted"
          : "border-accentdeep text-accentdeep"
      }`}
    >
      {ocupado ? "..." : feito ? "Marcar como não lido" : "Marcar como lido"}
    </button>
  );
}
