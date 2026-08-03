"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { traduzirErroAuth, interpretarCadastro } from "@/lib/erros-auth";

export default function Login() {
  const router = useRouter();
  const [modo, setModo] = useState<"entrar" | "criar">("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [escritorio, setEscritorio] = useState("");
  const [erro, setErro] = useState<{ texto: string; culpaDoServidor: boolean } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  // cadastro feito mas ainda sem sessão: a tela PRECISA dizer isso
  const [confirmar, setConfirmar] = useState<string | null>(null);

  /**
   * Erro devolvido pelo /auth/callback — link expirado, já usado, ou aberto em
   * outro navegador. Chega pela URL porque quem detecta é o servidor.
   */
  useEffect(() => {
    // lido de window.location e não de useSearchParams: o hook exige um limite
    // de Suspense em volta da página inteira, e não vale reestruturar o login
    // para ler um parâmetro que só existe quando o link de e-mail falhou
    const vindoDoLink = new URLSearchParams(window.location.search).get("erro");
    if (vindoDoLink) setErro(traduzirErroAuth({ message: vindoDoLink, status: 400 }, "entrar"));
  }, []);

  async function enviar() {
    setErro(null);
    setOcupado(true);
    const supabase = createClient();
    const { data, error } =
      modo === "entrar"
        ? await supabase.auth.signInWithPassword({ email, password: senha })
        : await supabase.auth.signUp({
            email,
            password: senha,
            options: { data: { escritorio } },
          });
    if (error) {
      setOcupado(false);
      // nunca mostrar o erro cru: quando o servidor responde sem corpo,
      // `error.message` chega como o texto "{}" e não ajuda ninguém
      setErro(traduzirErroAuth(error, modo));
      return;
    }

    // Criar conta NÃO é entrar quando a confirmação de e-mail está ligada:
    // o signUp volta sem sessão. Empurrar para /painel aqui faz a tela
    // parecer travada, porque /painel devolve para cá sem sessão.
    if (modo === "criar") {
      const r = interpretarCadastro(data, email);
      if (r.tipo === "confirmar") {
        setOcupado(false);
        setConfirmar(r.email);
        return;
      }
      if (r.tipo === "jaExiste") {
        setOcupado(false);
        setErro({
          texto: "Já existe uma conta com este e-mail. Use “Entrar”.",
          culpaDoServidor: false,
        });
        return;
      }
    }

    /**
     * NAVEGAÇÃO DURA, não `router.push`.
     *
     * O cookie de sessão é escrito pelo navegador no fim do login. Um
     * `router.push` faz uma busca interna do Next que pode sair ANTES do
     * cookie estar disponível para o servidor — o middleware então não vê
     * sessão, devolve para /login, e a pessoa fica presa numa tela que diz
     * "Entrando…" para sempre. Foi exatamente o relato: só entrava abrindo
     * outra aba, porque a aba nova carregava com o cookie já gravado.
     *
     * `window.location.assign` recarrega de verdade: o navegador manda o
     * cookie recém-escrito e o servidor enxerga a sessão na primeira tentativa.
     */
    window.location.assign("/painel");

    /**
     * A SAÍDA DE EMERGÊNCIA.
     *
     * Segurar o "Entrando…" até a navegação foi decisão minha e estava certa —
     * mas sem um limite ela vira armadilha: se a navegação não acontece, não
     * há botão, não há mensagem, não há nada. Passados 8 segundos, devolvo o
     * controle e digo o que fazer.
     */
    setTimeout(() => {
      setOcupado(false);
      setErro({
        texto:
          "Entrei na sua conta, mas a tela não trocou. Clique aqui para abrir o painel — se insistir, recarregue a página.",
        culpaDoServidor: true,
      });
    }, 8000);
  }

  // Tela de "confirme seu e-mail". É um ESTADO, não um toast: a pessoa
  // precisa sair do navegador, abrir o e-mail e voltar — um aviso que some
  // sozinho perderia a instrução exatamente quando ela for executá-la.
  if (confirmar) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <div className="text-xl font-extrabold tracking-tight">
              ENQUADRIA<span className="text-accent">.</span>
            </div>
          </div>
          <div className="rounded border border-line bg-surface p-6 shadow-card">
            <div className="mb-3 font-mono text-[11px] uppercase tracking-wider text-accent">
              Conta criada
            </div>
            <p className="text-[13.5px] leading-relaxed">
              Enviamos um link de confirmação para{" "}
              <strong className="break-all">{confirmar}</strong>. Abra o e-mail e
              clique no link para ativar o acesso.
            </p>
            <div className="mt-4 rounded-sm border border-line bg-surface2 px-3 py-2.5">
              <p className="text-[12.5px] font-semibold leading-snug">
                Não achou? Olhe na caixa de <strong>spam</strong> ou lixo eletrônico.
              </p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                É comum na primeira mensagem que você recebe de nós. Marcando como
                “não é spam”, as próximas chegam na caixa de entrada.
              </p>
            </div>
            <p className="mt-3 text-[11.5px] text-muted">O link vale por 24 horas.</p>
            <button
              onClick={() => {
                setConfirmar(null);
                setModo("entrar");
                setSenha("");
              }}
              className="mt-5 w-full rounded-sm border border-line py-2.5 text-sm font-semibold hover:border-accent"
            >
              Voltar para entrar
            </button>
          </div>
        </div>
      </main>
    );
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
                autoComplete="organization"
                className="w-full rounded-sm border border-line px-3 py-2 text-sm outline-none focus:border-accent"
                placeholder="Marcatto Contabilidade"
              />
            </label>
          )}

          <label className="mb-3 block">
            <span className="mb-1 block text-[12.5px] font-semibold">E-mail</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-sm border border-line px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>

          <label className="mb-4 block">
            <span className="mb-1 block text-[12.5px] font-semibold">Senha</span>
            <input
              type="password"
              autoComplete={modo === "criar" ? "new-password" : "current-password"}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="w-full rounded-sm border border-line px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>

          {erro && (
            <div className="mb-3 rounded-sm bg-vermelhowash px-3 py-2 text-[12.5px] text-vermelho">
              <p>{erro.texto}</p>
              {/* o link só aparece quando a conta JÁ entrou e a tela é que não
                  trocou — nos demais erros ele mandaria a pessoa para uma tela
                  que vai devolvê-la para cá */}
              {erro.texto.includes("a tela não trocou") ? (
                <a
                  href="/painel"
                  className="mt-1 inline-block font-semibold underline underline-offset-2"
                >
                  Abrir o painel
                </a>
              ) : (
                erro.culpaDoServidor && (
                  <p className="mt-1 text-[11px] opacity-80">
                    Nada do que você digitou causou isso.
                  </p>
                )
              )}
            </div>
          )}

          <button
            onClick={enviar}
            disabled={ocupado || !email || !senha}
            className="w-full rounded-sm bg-ink py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {ocupado
              ? modo === "entrar"
                ? "Entrando…"
                : "Criando conta…"
              : modo === "entrar"
                ? "Entrar"
                : "Criar conta"}
          </button>
        </div>

        <p className="mt-4 text-[11.5px] leading-relaxed text-muted">
          O workspace do escritório é criado automaticamente no primeiro acesso.
          {modo === "criar" ? (
            <>
              {" "}Ao criar a conta você concorda com os{" "}
              <a href="/termos" className="underline underline-offset-2 hover:text-accentdeep">
                Termos de Uso
              </a>{" "}
              e com a{" "}
              <a href="/privacidade" className="underline underline-offset-2 hover:text-accentdeep">
                Política de Privacidade
              </a>
              .
            </>
          ) : null}
        </p>
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
          <a href="/termos" className="hover:text-accentdeep">Termos</a>
          <a href="/privacidade" className="hover:text-accentdeep">Privacidade</a>
          <a href="/seguranca" className="hover:text-accentdeep">Segurança</a>
          <a href="/politicas" className="hover:text-accentdeep">Políticas internas</a>
          <a href="/curso" className="hover:text-accentdeep">Curso gratuito</a>
        </p>
      </div>
    </main>
  );
}
