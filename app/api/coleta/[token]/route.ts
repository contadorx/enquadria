import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { PERGUNTAS, derivar, type RespostasColeta, type ChaveColeta } from "@/lib/coleta";
import { enviarEmail } from "@/lib/email";
import { htmlColetaRespondida } from "@/lib/emails-cliente";
import { donoDoTenant } from "@/lib/dono";

/**
 * A RESPOSTA DA EMPRESA — rota PÚBLICA, sem login, só com o token.
 *
 * NÃO DEVOLVE NADA ALÉM DO NECESSÁRIO. Um token na mão de quem não deveria tê-lo
 * não pode virar uma janela para a carteira: a página de resposta mostra o nome
 * da própria empresa (que quem responde já sabe) e mais nada — nem CNPJ da
 * carteira, nem análise, nem outras empresas do contador.
 *
 * VALIDA NO SERVIDOR. Os valores aceitos são os das opções declaradas em
 * `lib/coleta`. Não é paranoia: a rota é pública, e um valor inventado aqui
 * entraria na conta da decisão como se tivesse vindo da empresa.
 */

const VALIDOS: Record<ChaveColeta, number[]> = PERGUNTAS.reduce((acc, p) => {
  acc[p.chave] = p.opcoes.map((o) => o.valor);
  return acc;
}, {} as Record<ChaveColeta, number[]>);

export async function POST(req: Request, { params }: { params: { token: string } }) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ erro: "indisponível no momento" }, { status: 503 });

  let corpo: {
    respostas?: RespostasColeta;
    nome?: string;
    cargo?: string;
    observacao?: string;
  };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  const token = (params.token ?? "").toUpperCase().trim();
  const { data: coleta } = await admin
    .from("coletas")
    .select("id, status, empresa_id, tenant_id")
    .eq("token", token)
    .maybeSingle();

  if (!coleta) return NextResponse.json({ erro: "link não encontrado" }, { status: 404 });
  if (coleta.status !== "aberta") {
    return NextResponse.json(
      { erro: "Este link já foi respondido ou foi encerrado pelo seu contador." },
      { status: 409 }
    );
  }

  const nome = (corpo.nome ?? "").trim().replace(/\s+/g, " ");
  if (nome.length < 3) {
    return NextResponse.json({ erro: "Informe o seu nome." }, { status: 400 });
  }

  // só passam os valores que existem nas opções — nada de número solto
  const limpas: RespostasColeta = {};
  for (const p of PERGUNTAS) {
    const v = corpo.respostas?.[p.chave];
    if (typeof v !== "number" || !VALIDOS[p.chave].some((x) => Math.abs(x - v) < 1e-9)) {
      return NextResponse.json(
        { erro: `Falta responder: ${p.titulo}` },
        { status: 400 }
      );
    }
    limpas[p.chave] = v;
  }

  const derivadas = derivar(limpas);
  if (!derivadas) {
    return NextResponse.json({ erro: "Responda todas as perguntas." }, { status: 400 });
  }

  const { error } = await admin
    .from("coletas")
    .update({
      status: "respondida",
      respondido_em: new Date().toISOString(),
      respondente_nome: nome,
      respondente_cargo: (corpo.cargo ?? "").trim() || null,
      observacao: (corpo.observacao ?? "").trim().slice(0, 1000) || null,
      respostas: limpas,
      derivadas,
    })
    .eq("id", coleta.id)
    .eq("status", "aberta"); // trava a corrida de dois envios do mesmo formulário

  if (error) {
    return NextResponse.json({ erro: "Não consegui gravar agora. Tente de novo." }, { status: 500 });
  }

  /**
   * AVISA O CONTADOR. Antes disto a resposta voltava e ficava esperando alguém
   * abrir o dossiê por acaso — cinco das oito perguntas da análise só existem na
   * cabeça do cliente, então enquanto ninguém aplica, o contador chuta ou trava.
   * Era o ponto mais caro do silêncio: o cliente fez a parte dele e o trabalho
   * ficou parado.
   *
   * O AVISO NUNCA DERRUBA A RESPOSTA. Ela já está gravada acima; se o e-mail
   * falhar, o cliente não pode ver erro numa coisa que deu certo. Por isso o
   * try/catch engole — e o console registra, porque falha de e-mail invisível
   * é o defeito que corrói entrega por semanas sem ninguém perceber.
   */
  try {
    const dono = await donoDoTenant(admin, coleta.tenant_id);
    if (dono) {
      const { data: emp } = await admin
        .from("empresas")
        .select("razao_social")
        .eq("id", coleta.empresa_id)
        .maybeSingle();
      const base = new URL(req.url).origin;
      const envio = await enviarEmail({
        para: dono.email,
        assunto: `${(emp as { razao_social?: string } | null)?.razao_social ?? "Uma empresa"} respondeu o formulário`,
        html: htmlColetaRespondida({
          empresa: (emp as { razao_social?: string } | null)?.razao_social ?? "A empresa",
          escritorio: dono.escritorio,
          link: `${base}/painel/empresa/${coleta.empresa_id}`,
          respondente: nome,
        }),
        tag: "coleta-respondida",
      });
      if (!envio.enviado) {
        console.error(`[coleta] aviso ao contador não saiu: ${envio.motivo}`);
      }
    }
  } catch (e) {
    console.error("[coleta] falha ao avisar o contador:", e instanceof Error ? e.message : e);
  }

  return NextResponse.json({ ok: true });
}
