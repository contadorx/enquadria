import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { Regua } from "@/components/Regua";
import { BotaoSair } from "@/components/BotaoSair";
import { NavMobile } from "@/components/NavMobile";
import { navDe } from "@/lib/nav";
import { JANELA, estadoDaJanela } from "@/lib/janela";

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let escritorio = "Escritório";
  let ehSuperadmin = false;
  if (user) {
    // Tentativa 1: com is_superadmin (existe a partir da migration 0020).
    //
    // O erro é CAPTURADO de propósito. Se a coluna ainda não existir, o
    // Postgres derruba a consulta INTEIRA — e o layout perderia junto o nome do
    // escritório, sem dizer por quê. Já aconteceu neste app com a coluna de
    // impersonação; aqui a lição está aplicada: a segunda tentativa pede só o
    // essencial, e o app segue funcionando sem a aba de plataforma.
    const comFlag = await supabase
      .from("profiles")
      .select("tenant_id, is_superadmin, tenants(nome)")
      .eq("id", user.id)
      .maybeSingle();

    let perfil = comFlag.data as { tenant_id?: string; is_superadmin?: boolean; tenants?: unknown } | null;

    if (comFlag.error) {
      const semFlag = await supabase
        .from("profiles")
        .select("tenant_id, tenants(nome)")
        .eq("id", user.id)
        .maybeSingle();
      perfil = semFlag.data as typeof perfil;
    }

    const t = perfil?.tenants as { nome?: string } | { nome?: string }[] | null;
    const nome = Array.isArray(t) ? t[0]?.nome : t?.nome;
    if (nome) escritorio = nome;
    ehSuperadmin = !!perfil?.is_superadmin;
  }
  const menu = navDe(ehSuperadmin);

  // calculado aqui, no servidor: o NavMobile é componente de cliente e usar
  // Date lá dentro faria servidor e navegador renderizarem valores diferentes
  const { dias: diasRestantes, posPct: posDaJanela } = estadoDaJanela();

  return (
    <div className="min-h-screen">
      {/* No desktop, marca + régua. No celular essa barra some inteira: a régua
          não cabe em 390px e duas faixas escuras empilhadas comiam 90px de tela.
          O celular ganha uma barra única e fixa, montada no NavMobile. */}
      <header className="hidden bg-ink text-white md:block">
        <div className="flex items-center gap-5 px-5 py-3">
          <div className="text-[15px] font-extrabold tracking-tight">
            ENQUADRIA<span className="text-accentbright">.</span>
          </div>
          <div className="min-w-0 flex-1">
            <Regua abre={JANELA.abre} fecha={JANELA.fecha} />
          </div>
        </div>
      </header>

      <NavMobile
        escritorio={escritorio}
        email={user?.email}
        dias={diasRestantes}
        posPct={posDaJanela}
        ehSuperadmin={ehSuperadmin}
      />

      <div className="grid grid-cols-1 md:grid-cols-[186px_1fr]">
        <aside className="hidden border-r border-linesoft bg-surface2 py-4 md:block">
          {menu.map((g) => (
            <div key={g.grupo}>
              <div className="px-[18px] py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-slate-400">
                {g.grupo}
              </div>
              {g.itens.map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  className="block px-[18px] py-2 text-[13.5px] text-slate2 hover:bg-accentwash hover:text-accentdeep"
                >
                  {i.label}
                </Link>
              ))}
            </div>
          ))}
          <div className="mt-6 border-t border-linesoft px-[18px] pt-4">
            <p className="text-[12px] font-semibold leading-tight">{escritorio}</p>
            <p className="mt-0.5 truncate font-mono text-[10px] text-muted">{user?.email}</p>
            <BotaoSair />
          </div>
        </aside>

        {/* pb-20 no celular: a barra inferior não pode cobrir o fim do conteúdo */}
        <main className="min-w-0 px-4 pb-20 pt-5 md:px-6 md:pb-6 md:pt-6">{children}</main>
      </div>
    </div>
  );
}
