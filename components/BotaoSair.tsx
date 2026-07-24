"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

export function BotaoSair() {
  const router = useRouter();
  async function sair() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }
  return (
    <button
      onClick={sair}
      className="mt-3 text-[12px] font-semibold text-muted hover:text-vermelho"
    >
      Sair
    </button>
  );
}
