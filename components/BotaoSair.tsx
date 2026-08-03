"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

export function BotaoSair() {
  const router = useRouter();
  const [saindo, setSaindo] = useState(false);

  async function sair() {
    if (saindo) return; // clicar duas vezes não ajuda e confunde
    setSaindo(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    // `saindo` continua verdadeiro: a navegação ainda vem, e é ela que demora.
    // Soltar aqui devolveria um botão "Sair" clicável numa tela que já está
    // trocando de página.
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={sair}
      disabled={saindo}
      className="mt-3 text-[12px] font-semibold text-muted hover:text-vermelho disabled:opacity-50"
    >
      {saindo ? "Saindo…" : "Sair"}
    </button>
  );
}
