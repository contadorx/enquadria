import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase-admin";
import { FormColeta } from "@/components/FormColeta";

/**
 * A PÁGINA QUE A EMPRESA ABRE — pública, sem login, só com o token.
 *
 * Rota fora do middleware de propósito: pedir cadastro ao dono da empresa para
 * responder seis perguntas é o mesmo que não perguntar nada.
 *
 * `noindex`: o link é de uma empresa específica e não tem nada que fazer no
 * Google. E a página mostra o nome da própria empresa e mais nada — quem
 * responde já sabe onde trabalha; qualquer campo além disso seria vazamento da
 * carteira do contador para quem tiver o link na mão.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Algumas perguntas do seu contador | Enquadria",
  robots: { index: false, follow: false },
};

export default async function ColetaPage({ params }: { params: { token: string } }) {
  const admin = createAdminClient();
  if (!admin) {
    return (
      <Casca>
        <Aviso titulo="Indisponível no momento">
          Não consegui abrir o formulário agora. Tente daqui a pouco ou avise o seu contador.
        </Aviso>
      </Casca>
    );
  }

  const token = decodeURIComponent(params.token).toUpperCase().trim();
  const { data: coleta } = await admin
    .from("coletas")
    .select("empresa_id, status, respondido_em")
    .eq("token", token)
    .maybeSingle();

  if (!coleta) notFound();

  const { data: empresa } = await admin
    .from("empresas")
    .select("razao_social")
    .eq("id", coleta.empresa_id)
    .maybeSingle();
  const nome = (empresa?.razao_social as string) ?? "sua empresa";

  if (coleta.status === "respondida") {
    return (
      <Casca>
        <Aviso titulo="Já respondido">
          As respostas da <b>{nome}</b> já chegaram
          {coleta.respondido_em
            ? ` em ${new Date(coleta.respondido_em as string).toLocaleDateString("pt-BR")}`
            : ""}
          . Se precisar corrigir alguma coisa, fale com o seu contador — ele abre um link novo.
        </Aviso>
      </Casca>
    );
  }

  if (coleta.status !== "aberta") {
    return (
      <Casca>
        <Aviso titulo="Link encerrado">
          Este link foi encerrado pelo seu contador. Peça um novo a ele.
        </Aviso>
      </Casca>
    );
  }

  return (
    <Casca>
      <div className="mb-6">
        <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-accentdeep">
          Perguntas do seu contador
        </div>
        <h1 className="mt-1.5 text-[26px] font-extrabold leading-tight tracking-tight text-ink">
          Seis perguntas sobre a {nome}
        </h1>
        <p className="mt-2.5 max-w-[52ch] text-[14.5px] leading-relaxed text-slate2">
          Elas levam uns três minutos. Seu contador precisa disso para calcular uma decisão que a
          sua empresa tem prazo para tomar — e são coisas que só quem toca o negócio sabe
          responder. Não existe resposta certa ou errada: responda pelo que acontece de verdade.
        </p>
      </div>
      <FormColeta token={token} empresa={nome} />
    </Casca>
  );
}

function Aviso({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-line bg-surface p-6 text-center">
      <h2 className="text-[18px] font-bold text-ink">{titulo}</h2>
      <p className="mx-auto mt-1.5 max-w-[46ch] text-[14px] leading-relaxed text-slate2">{children}</p>
    </div>
  );
}

function Casca({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg px-4 py-8">
      <div className="mx-auto max-w-[620px]">
        <div className="mb-6 flex items-center gap-2">
          <svg width="26" height="26" viewBox="0 0 64 64">
            <rect width="64" height="64" rx="14" fill="#0B1220" />
            <path
              d="M20 16h24M20 16v32M20 48h24M20 32h16"
              stroke="#06B6D4"
              strokeWidth="5"
              strokeLinecap="round"
              fill="none"
            />
            <circle cx="46" cy="32" r="4" fill="#06B6D4" />
          </svg>
          <span className="text-[17px] font-extrabold tracking-tight text-ink">Enquadria</span>
        </div>
        {children}
        <p className="mt-6 text-center text-[11px] leading-relaxed text-muted">
          Este formulário foi aberto pelo escritório de contabilidade que atende a sua empresa. As
          respostas vão só para ele. Nenhum dado é usado para outra finalidade, e o link pode ser
          encerrado a qualquer momento.
        </p>
      </div>
    </div>
  );
}
