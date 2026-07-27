"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";

/**
 * EQUIPE — o escritório inteiro na mesma carteira.
 *
 * Sem isso, dois funcionários da mesma casa criam dois workspaces e cada um
 * enxerga metade dos clientes. Convite por e-mail: quem se cadastra com o
 * endereço convidado cai direto no escritório certo.
 */

interface Membro {
  id: string;
  email: string;
  nome: string | null;
  role: string;
}
interface Convite {
  id: string;
  email: string;
  papel: string;
  expira_em: string;
  criado_em: string;
}

const ROTULO_PAPEL: Record<string, string> = {
  owner: "Responsável",
  admin: "Administrador",
  membro: "Membro",
};

export default function Equipe() {
  const [membros, setMembros] = useState<Membro[]>([]);
  const [convites, setConvites] = useState<Convite[]>([]);
  const [meuPapel, setMeuPapel] = useState<string>("membro");
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState("membro");
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function carregar() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: ms } = await supabase.from("profiles").select("id, email, nome, role");
    const { data: cs } = await supabase
      .from("convites")
      .select("id, email, papel, expira_em, criado_em")
      .is("aceito_em", null)
      .order("criado_em", { ascending: false });
    setMembros((ms ?? []) as Membro[]);
    setConvites((cs ?? []) as Convite[]);
    const eu = (ms ?? []).find((m) => m.id === user?.id);
    setMeuPapel(eu?.role ?? "membro");
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  const podeConvidar = meuPapel === "owner" || meuPapel === "admin";

  async function convidar() {
    setOcupado(true);
    setErro(null);
    setAviso(null);
    try {
      const resp = await fetch("/api/equipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, papel }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.erro ?? "falha ao convidar");
      setAviso(
        json.email_enviado
          ? `Convite enviado para ${email}.`
          : `Convite registrado para ${email}. O envio automático de e-mail não está configurado — avise a pessoa para se cadastrar com esse mesmo endereço.`
      );
      setEmail("");
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "erro inesperado");
    } finally {
      setOcupado(false);
    }
  }

  async function revogar(id: string) {
    setOcupado(true);
    try {
      await fetch(`/api/equipe?id=${id}`, { method: "DELETE" });
      await carregar();
    } finally {
      setOcupado(false);
    }
  }

  if (carregando) return <div className="text-sm text-muted">Carregando a equipe…</div>;

  return (
    <div>
      <h1 className="text-[19px] font-bold tracking-tight">Equipe</h1>
      <p className="mt-0.5 max-w-[72ch] text-[13px] text-muted">
        Todo mundo do escritório trabalha na mesma carteira. Quem for convidado e se cadastrar com
        o e-mail convidado entra direto aqui, sem reimportar nada.
      </p>

      {aviso && (
        <p className="mt-4 rounded-sm border border-accent bg-accentwash px-3.5 py-2.5 text-[13px] text-slate2">
          {aviso}
        </p>
      )}
      {erro && (
        <p className="mt-4 rounded-sm bg-vermelhowash px-3 py-2 text-[13px] text-vermelho">{erro}</p>
      )}

      {podeConvidar && (
        <div className="mt-5 rounded border border-line bg-surface p-4 shadow-card">
          <div className="mb-3 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
            Convidar para o escritório
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="email@escritorio.com.br"
              className="flex-1 rounded-sm border border-line px-3 py-2 text-[13.5px] outline-none focus:border-accent"
            />
            <select
              value={papel}
              onChange={(e) => setPapel(e.target.value)}
              className="rounded-sm border border-line px-3 py-2 text-[13.5px] outline-none focus:border-accent"
            >
              <option value="membro">Membro</option>
              <option value="admin">Administrador</option>
            </select>
            <button
              onClick={convidar}
              disabled={ocupado || !email}
              className="whitespace-nowrap rounded-sm bg-ink px-4 py-2 text-[13.5px] font-semibold text-white disabled:opacity-40"
            >
              {ocupado ? "..." : "Convidar"}
            </button>
          </div>
          <p className="mt-2 text-[11.5px] text-muted">
            Membro usa o sistema normalmente. Administrador também pode convidar outras pessoas.
          </p>
        </div>
      )}

      <div className="mt-5">
        <div className="mb-2 text-[15px] font-bold">
          Na equipe <span className="font-normal text-muted">({membros.length})</span>
        </div>
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <table className="w-full border-collapse text-[13.5px] min-w-[380px] md:min-w-0">
            <thead>
              <tr>
                {["Pessoa", "E-mail", "Papel"].map((h) => (
                  <th
                    key={h}
                    className="border-b border-line px-2.5 pb-2 text-left font-mono text-[9.5px] font-medium uppercase tracking-[0.12em] text-muted"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {membros.map((m) => (
                <tr key={m.id}>
                  <td className="border-b border-linesoft px-2.5 py-2.5 font-semibold">
                    {m.nome ?? "—"}
                  </td>
                  <td className="border-b border-linesoft px-2.5 py-2.5 font-mono text-[12px] text-muted">
                    {m.email}
                  </td>
                  <td className="border-b border-linesoft px-2.5 py-2.5">
                    <span className="rounded-full bg-surface2 px-2.5 py-1 text-[11.5px] font-semibold text-slate2">
                      {ROTULO_PAPEL[m.role] ?? m.role}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {convites.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 text-[15px] font-bold">
            Convites pendentes <span className="font-normal text-muted">({convites.length})</span>
          </div>
          <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
            <table className="w-full border-collapse text-[13.5px] min-w-[600px] md:min-w-0">
              <tbody>
                {convites.map((c) => (
                  <tr key={c.id}>
                    <td className="border-b border-linesoft px-2.5 py-2.5 font-mono text-[12px]">
                      {c.email}
                    </td>
                    <td className="border-b border-linesoft px-2.5 py-2.5 text-[12px] text-muted">
                      {ROTULO_PAPEL[c.papel] ?? c.papel} · expira em{" "}
                      {new Date(c.expira_em).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="border-b border-linesoft px-2.5 py-2.5 text-right">
                      {podeConvidar && (
                        <button
                          onClick={() => revogar(c.id)}
                          disabled={ocupado}
                          className="rounded-sm border border-line px-3 py-1.5 text-[12.5px] font-semibold text-slate2 disabled:opacity-40"
                        >
                          Revogar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="mt-5 max-w-[80ch] text-[11px] leading-relaxed text-muted">
        Todos os membros enxergam a mesma carteira e os mesmos documentos. A responsabilidade
        técnica de cada laudo continua sendo do profissional que o assina.
      </p>
    </div>
  );
}
