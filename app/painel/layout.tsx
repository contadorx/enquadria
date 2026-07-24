import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { Regua } from "@/components/Regua";
import { BotaoSair } from "@/components/BotaoSair";

const JANELA = { abre: "2026-09-01", fecha: "2026-09-30" };

const LINKS = [
  { grupo: "Janela 2027", itens: [
    { href: "/painel", label: "Painel" },
    { href: "/painel/importar", label: "Importar" },
    { href: "/painel/carteira", label: "Carteira" },
    { href: "/painel/fila", label: "Fila de análise" },
    { href: "/painel/janela", label: "Painel da janela" },
  ]},
  { grupo: "Escritório", itens: [
    { href: "/painel/planos", label: "Planos" },
    { href: "/painel/config", label: "Configurações" },
  ]},
];

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let escritorio = "Escritório";
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("tenant_id, tenants(nome)")
      .eq("id", user.id)
      .maybeSingle();
    const t = data?.tenants as { nome?: string } | { nome?: string }[] | null;
    const nome = Array.isArray(t) ? t[0]?.nome : t?.nome;
    if (nome) escritorio = nome;
  }

  return (
    <div className="min-h-screen">
      <header className="flex items-center gap-5 bg-ink px-5 py-3 text-white">
        <div className="text-[15px] font-extrabold tracking-tight">
          ENQUADRIA<span className="text-accentbright">.</span>
        </div>
        <Regua abre={JANELA.abre} fecha={JANELA.fecha} />
      </header>

      <div className="grid grid-cols-1 md:grid-cols-[186px_1fr]">
        <aside className="hidden border-r border-linesoft bg-surface2 py-4 md:block">
          {LINKS.map((g) => (
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

        <main className="min-w-0 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
