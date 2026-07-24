"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

export default function Login() {
  const router = useRouter();
  const [modo, setModo] = useState<"entrar" | "criar">("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [escritorio, setEscritorio] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function enviar() {
    setErro(null);
    setOcupado(true);
    const supabase = createClient();
    const { error } =
      modo === "entrar"
        ? await supabase.auth.signInWithPassword({ email, password: senha })
        : await supabase.auth.signUp({
            email,
            password: senha,
            options: { data: { escritorio } },
          });
    setOcupado(false);
    if (error) {
      setErro(error.message);
      return;
    }
    router.push("/painel");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <div className="text-xl font-extrabold tracking-tight">
            ENQUADRIA<span className="text-accent">.</span>
          </div>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            Janela de setembro · efeito 2027
          </p>
        </div>

        <div className="rounded border border-line bg-surface p-6 shadow-card">
          <div className="mb-5 flex gap-1">
            {(["entrar", "criar"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setModo(m)}
                className={`rounded-sm px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider ${
                  modo === m ? "bg-ink text-white" : "text-muted hover:text-slate1"
                }`}
              >
                {m === "entrar" ? "Entrar" : "Criar conta"}
              </button>
            ))}
          </div>

          {modo === "criar" && (
            <label className="mb-3 block">
              <span className="mb-1 block text-[12.5px] font-semibold">Nome do escritório</span>
              <input
                value={escritorio}
                onChange={(e) => setEscritorio(e.target.value)}
                className="w-full rounded-sm border border-line px-3 py-2 text-sm outline-none focus:border-accent"
                placeholder="Marcatto Contabilidade"
              />
            </label>
          )}

          <label className="mb-3 block">
            <span className="mb-1 block text-[12.5px] font-semibold">E-mail</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-sm border border-line px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>

          <label className="mb-4 block">
            <span className="mb-1 block text-[12.5px] font-semibold">Senha</span>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="w-full rounded-sm border border-line px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>

          {erro && (
            <p className="mb-3 rounded-sm bg-vermelhowash px-3 py-2 text-[12.5px] text-vermelho">
              {erro}
            </p>
          )}

          <button
            onClick={enviar}
            disabled={ocupado || !email || !senha}
            className="w-full rounded-sm bg-ink py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {ocupado ? "..." : modo === "entrar" ? "Entrar" : "Criar conta"}
          </button>
        </div>

        <p className="mt-4 text-[11.5px] leading-relaxed text-muted">
          O workspace do escritório é criado automaticamente no primeiro acesso.
        </p>
      </div>
    </main>
  );
}
