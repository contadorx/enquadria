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
    .select("razao_social, tenant_id")
    .eq("id", coleta.empresa_id)
    .maybeSingle();
  const nome = (empresa?.razao_social as string) ?? "sua empresa";

  /**
   * A MARCA QUE APARECE É A DO ESCRITÓRIO, não a nossa.
   *
   * Quem abre este link é cliente do contador, e nunca ouviu falar de
   * Enquadria. Página com marca desconhecida pedindo dados do faturamento
   * parece golpe — e não se responde a golpe. Mesma regra do laudo e do
   * comparativo: o escritório na frente, a ferramenta discreta no rodapé.
   *
   * Sem tenant configurado, cai numa casca neutra: melhor sóbrio e sem marca
   * nenhuma do que exibir a nossa no lugar da dele.
   */
  const { data: tenant } = empresa?.tenant_id
    ? await admin
        .from("tenants")
        .select("nome, crc, logo_url")
        .eq("id", empresa.tenant_id)
        .maybeSingle()
    : { data: null };
  const escritorio = (tenant ?? null) as { nome?: string; crc?: string; logo_url?: string } | null;

  if (coleta.status === "respondida") {
    return (
      <Casca escritorio={escritorio}>
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
      <Casca escritorio={escritorio}>
        <Aviso titulo="Link encerrado">
          Este link foi encerrado pelo seu contador. Peça um novo a ele.
        </Aviso>
      </Casca>
    );
  }

  return (
    <Casca escritorio={escritorio}>
      <div className="mb-6">
        <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-accentdeep">
          Perguntas {escritorio?.nome ? `de ${escritorio.nome}` : "do seu contador"}
        </div>
        <h1 className="mt-1.5 text-[26px] font-extrabold leading-tight tracking-tight text-ink">
          Seis perguntas sobre a {nome}
        </h1>
        <p className="mt-2.5 max-w-[52ch] text-[14.5px] leading-relaxed text-slate2">
          Elas levam uns três minutos. {escritorio?.nome ?? "Seu contador"} precisa disso para calcular uma decisão que a
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

interface Escritorio {
  nome?: string;
  crc?: string;
  logo_url?: string;
}

function Casca({
  children,
  escritorio,
}: {
  children: React.ReactNode;
  escritorio?: Escritorio | null;
}) {
  const nome = escritorio?.nome?.trim();
  return (
    <div className="min-h-screen bg-bg px-4 py-8">
      <div className="mx-auto max-w-[620px]">
        {/* O TOPO É DO ESCRITÓRIO. Logo quando existir; nome e CRC quando não
            houver imagem; e nada, se o contador ainda não configurou — a
            página fica sóbria em vez de exibir uma marca que o cliente dele
            não conhece. */}
        {(escritorio?.logo_url || nome) && (
          <div className="mb-6 flex items-center gap-3 border-b border-line pb-4">
            {escritorio?.logo_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={escritorio.logo_url}
                alt={nome ? `Logo de ${nome}` : "Logo do escritório"}
                className="max-h-[46px] max-w-[170px] object-contain"
              />
            ) : (
              <span className="text-[17px] font-extrabold tracking-tight text-ink">{nome}</span>
            )}
            {escritorio?.logo_url && nome && (
              <span className="text-[14px] font-semibold text-slate2">{nome}</span>
            )}
            {escritorio?.crc && (
              <span className="ml-auto font-mono text-[11px] text-muted">{escritorio.crc}</span>
            )}
          </div>
        )}
        {children}
        <p className="mt-6 text-center text-[11px] leading-relaxed text-muted">
          Este formulário foi aberto por{" "}
          {nome ? <b className="font-semibold text-slate2">{nome}</b> : "pelo escritório de contabilidade"},
          que atende a sua empresa. As respostas vão só para ele, não são usadas para outra
          finalidade, e o link pode ser encerrado a qualquer momento.
        </p>
        <p className="mt-2 text-center font-mono text-[10px] text-muted">
          formulário gerado no Enquadria
        </p>
      </div>
    </div>
  );
}
