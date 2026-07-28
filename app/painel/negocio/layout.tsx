import { createClient } from "@/lib/supabase-server";
import { NegocioAbas } from "@/components/NegocioAbas";

export const dynamic = "force-dynamic";

export default async function NegocioLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: perfil, error } = await supabase
    .from("profiles")
    .select("is_superadmin, email")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  const p = perfil as { is_superadmin?: boolean; email?: string } | null;

  if (!p?.is_superadmin) {
    // A tela conta EXATAMENTE o que o servidor enxergou. Sem isto, "não aparece
    // a aba" vira adivinhação: pode ser migration não rodada, flag não marcada
    // ou sessão de outro usuário — e as três se parecem.
    const semColuna = !!error && /is_superadmin/i.test(error.message);

    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-line bg-surface p-7">
        <p className="text-[15px] font-bold">Área restrita — e aqui está o porquê</p>

        <div className="mt-4 space-y-1.5 rounded bg-surface2 p-4 font-mono text-[11.5px]">
          <p>sessão ativa: <b>{user ? "SIM" : "NÃO"}</b></p>
          <p>id do usuário: <b>{user?.id || "(vazio)"}</b></p>
          <p>e-mail da sessão: <b>{user?.email || "(vazio)"}</b></p>
          <p>perfil encontrado: <b>{p ? "SIM" : "NÃO"}</b></p>
          <p>coluna is_superadmin existe: <b>{semColuna ? "NÃO" : "SIM"}</b></p>
          <p>is_superadmin do perfil: <b>{p?.is_superadmin ? "true" : "false"}</b></p>
          {error && <p className="text-vermelho">erro: {error.message}</p>}
        </div>

        {semColuna ? (
          <div className="mt-4 text-[13px] leading-relaxed">
            <p className="font-semibold">A migration 0020 ainda não foi rodada neste banco.</p>
            <p className="mt-1 text-muted">
              Abra o SQL Editor do Supabase e rode <code>0020_negocio.sql</code> inteira. Ela cria a coluna, as
              réguas, os recursos e as funções que esta aba usa.
            </p>
          </div>
        ) : (
          <div className="mt-4 text-[13px] leading-relaxed">
            <p className="font-semibold">A migration rodou, mas o seu perfil não está marcado como dono.</p>
            <p className="mt-1 text-muted">Rode isto uma vez no SQL Editor do Supabase e recarregue a página:</p>
            <pre className="mt-2 overflow-x-auto rounded bg-ink p-3 font-mono text-[11.5px] text-white">
{`update public.profiles
   set is_superadmin = true
 where id = '${user?.id || "SEU_ID"}';`}
            </pre>
            <p className="mt-2 text-[11.5px] text-muted">
              O id acima é o da sua sessão — pode copiar como está. Depois de rodar, faça logout e login (o menu é
              montado no servidor a cada carga, mas a sessão em cache pode segurar a página antiga).
            </p>
          </div>
        )}
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
