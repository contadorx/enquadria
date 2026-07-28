import { createClient } from "@/lib/supabase-server";
import { NegocioAbas } from "@/components/NegocioAbas";

export const dynamic = "force-dynamic";

export default async function NegocioLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: perfil } = await supabase
    .from("profiles")
    .select("is_superadmin")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  if (!(perfil as { is_superadmin?: boolean } | null)?.is_superadmin) {
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-line bg-surface p-8 text-center">
        <p className="text-[15px] font-bold">Área restrita</p>
        <p className="mt-2 text-[13px] text-muted">
          Esta é a visão do dono da plataforma. Se é você, marque o seu perfil como superadmin
          (bloco de bootstrap da migration 0020).
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-[19px] font-bold tracking-tight">Negócio</h1>
      <p className="mt-0.5 max-w-[70ch] text-[13px] text-muted">
        O Enquadria visto por dentro: receita, cobrança, réguas de e-mail e o desenho dos planos.
      </p>
      <NegocioAbas />
      <div className="mt-5">{children}</div>
    </div>
  );
}
