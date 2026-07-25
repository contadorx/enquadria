import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-admin";
import { formatarCnpj } from "@/lib/cnpj";
import { CLAUSULAS_CIENCIA } from "@/lib/esign";
import { Assinatura } from "@/components/Assinatura";

export const dynamic = "force-dynamic";

export default async function AssinarPage({ params }: { params: { token: string } }) {
  const supabase = createAdminClient();

  if (!supabase) {
    return (
      <Casca>
        <div className="rounded border border-line bg-surface p-6 text-center text-[14px] text-slate2">
          Assinatura eletrônica temporariamente indisponível. Peça ao seu contador para tentar novamente em instantes.
        </div>
      </Casca>
    );
  }

  const { data: termo } = await supabase
    .from("termos")
    .select("status, decisao, assinante_nome, assinado_em, metodo, hash_documento, analise_id")
    .eq("token", params.token)
    .maybeSingle();
  if (!termo) notFound();

  const { data: analise } = await supabase
    .from("analises")
    .select("empresa_id")
    .eq("id", termo.analise_id)
    .maybeSingle();
  const { data: empresa } = analise
    ? await supabase.from("empresas").select("razao_social, cnpj").eq("id", analise.empresa_id).maybeSingle()
    : { data: null };

  if (termo.status === "assinado") {
    return (
      <Casca>
        <div className="rounded border border-verde bg-verdewash p-6 text-center">
          <h2 className="text-[18px] font-bold text-ink">Termo já assinado</h2>
          <p className="mt-1 text-[13.5px] text-slate2">
            Este termo foi assinado por <b>{termo.assinante_nome}</b>
            {termo.assinado_em ? ` em ${new Date(termo.assinado_em).toLocaleString("pt-BR")}` : ""}.
          </p>
          <p className="mt-3 break-all font-mono text-[10.5px] text-muted">hash: {termo.hash_documento}</p>
        </div>
      </Casca>
    );
  }

  return (
    <Casca>
      <Assinatura
        token={params.token}
        empresa={empresa?.razao_social ?? "Empresa"}
        cnpj={empresa?.cnpj ? formatarCnpj(empresa.cnpj) : ""}
        decisao={(termo.decisao ?? "permanecer") as "optar" | "permanecer"}
        clausulas={CLAUSULAS_CIENCIA}
        hash={termo.hash_documento ?? ""}
      />
    </Casca>
  );
}

function Casca({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg px-4 py-10">
      <div className="mx-auto max-w-[560px]">
        <div className="mb-5 flex items-center gap-2">
          <svg width="26" height="26" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0B1220" /><path d="M20 16h24M20 16v32M20 48h24M20 32h16" stroke="#06B6D4" strokeWidth="5" strokeLinecap="round" fill="none" /><circle cx="46" cy="32" r="4" fill="#06B6D4" /></svg>
          <span className="text-[17px] font-extrabold tracking-tight text-ink">Enquadria</span>
        </div>
        {children}
        <p className="mt-5 text-center text-[11px] text-muted">
          Assinatura eletrônica com validade jurídica (Lei 14.063/2020). Documento e trilha ficam arquivados no dossiê do contador.
        </p>
      </div>
    </div>
  );
}
