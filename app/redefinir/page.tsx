"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { traduzirErroAuth } from "@/lib/erros-auth";

/**
 * NOVA SENHA — o destino do link de recuperação.
 *
 * Criada em 07/08/2026 junto com o "Esqueci minha senha": o link de recovery
 * do Supabase passa pelo /auth/callback (que troca o code por sessão) e chega
 * aqui AUTENTICADO. A página só faz uma coisa: gravar a senha nova e abrir o
 * painel.
 *
 * Quem abrir este endereço sem sessão — link vencido, URL digitada à mão —
 * recebe a explicação e o caminho de volta, não um formulário que falharia
 * no salvar. Formulário que aceita preenchimento e recusa o envio é o pior
 * dos dois mundos: cobra o trabalho e devolve erro.
 */
export default function Redefinir() {
  const [pronto, setPronto] = useState<"carregando" | "com-sessao" | "sem-sessao">("carregando");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setPronto(data.user ? "com-sessao" : "sem-sessao");
    });
  }, []);

  async function salvar() {
    setErro(null);
    setOcupado(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error) {
      setOcupado(false);
      setErro(traduzirErroAuth(error, "entrar").texto);
      return;
    }
    // navegação dura pelo mesmo motivo do login: o cookie precisa viajar
    window.location.assign("/painel");
    setTimeout(() => {
      setOcupado(false);
      setErro("Senha salva, mas a tela não trocou. Abra /painel ou recarregue a página.");
    }, 8000);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <div className="text-xl font-extrabold tracking-tight">
            ENQUADRIA<span className="text-accent">.</span>
          </div>
        </div>

        <div className="rounded border border-line bg-surface p-6 shadow-card">
          {pronto === "carregando" && (
            <p className="text-[13px] text-muted">Conferindo o link…</p>
          )}

          {pronto === "sem-sessao" && (
            <>
              <div className="mb-3 font-mono text-[11px] uppercase tracking-wider text-vermelho">
                Link vencido ou já usado
              </div>
              <p className="text-[13.5px] leading-relaxed">
                Este endereço só funciona vindo do link de recuperação, e ele vale uma vez.
                Peça um novo — leva menos de um minuto.
              </p>
              <a
                href="/login"
                className="mt-5 block w-full rounded-sm bg-ink py-2.5 text-center text-sm font-semibold text-white"
              >
                Pedir novo link em “Esqueci minha senha”
              </a>
            </>
          )}

          {pronto === "com-sessao" && (
            <>
              <div className="mb-3 font-mono text-[11px] uppercase tracking-wider text-accent">
                Crie a nova senha
              </div>
              <p className="text-[13px] leading-relaxed text-slate2">
                Você já está autenticado. Defina a senha e o painel abre em seguida.
              </p>
              <label className="mt-4 block">
                <span className="mb-1 block text-[12.5px] font-semibold">Nova senha</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className="w-full rounded-sm border border-line px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </label>
              <p className="mt-1 text-[11px] text-muted">Pelo menos 6 caracteres.</p>
              {erro && (
                <p className="mt-3 rounded-sm bg-vermelhowash px-3 py-2 text-[12.5px] text-vermelho">
                  {erro}{" "}
                  {erro.includes("não trocou") && (
                    <a href="/painel" className="font-semibold underline underline-offset-2">
                      Abrir o painel
                    </a>
                  )}
                </p>
              )}
              <button
                onClick={salvar}
                disabled={ocupado || senha.length < 6}
                className="mt-4 w-full rounded-sm bg-ink py-2.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                {ocupado ? "Salvando…" : "Salvar e entrar"}
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
