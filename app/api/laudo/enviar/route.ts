import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { enviarEmail } from "@/lib/email";
import { htmlLaudoCliente } from "@/lib/emails-cliente";
import { ehOptar } from "@/lib/motor";
import { ehLaudoCurto } from "@/lib/laudo";

/**
 * ENVIAR O LAUDO AO CLIENTE — um ou muitos, pela mesma porta.
 *
 * POR QUE ESTA ROTA EXISTE. O laudo era emitido e ficava no painel. Nenhum
 * endpoint de laudo importava função de e-mail: a emissão terminava devolvendo
 * um id para a tela abrir numa aba, e a entrega ao cliente virava trabalho
 * manual — imprimir em PDF e anexar, uma empresa por vez. Num escritório com
 * 143 clientes e uma janela que fecha em 30 de setembro, "manual" é sinônimo
 * de "não entregue".
 *
 * UMA ROTA SÓ PARA UM E PARA MUITOS, de propósito. A lição veio do termo: hoje
 * `/api/termo` não envia e `/api/termo/lote` envia, e o cliente recebe ou não o
 * mesmo documento dependendo de qual botão o contador clicou. Duas rotas para o
 * mesmo ato produzem duas regras, e a diferença aparece como bug de percepção
 * meses depois.
 *
 * O QUE ELA NÃO FAZ: emitir. Enviar um laudo que não existe seria emitir por
 * tabela, furando o gate de plano que vive em /api/laudo. Sem laudo, o laudo
 * entra na contagem `sem_laudo` e o contador vê o número.
 */

interface Corpo {
  /** ids de análise (o caminho do cockpit) */
  analise_ids?: string[];
  /** ids de laudo (o caminho da gaveta, que já sabe o laudo) */
  laudo_ids?: string[];
  /**
   * DESTINATÁRIO CORRIGIDO NA HORA — só faz sentido no envio de UM documento.
   *
   * O `contato_email` da carteira veio de um CSV exportado sabe-se lá quando, e
   * com frequência é a caixa do escritório, não a de quem decide. Sem poder
   * corrigir aqui, o contador tinha de sair da tela, achar o bloco Contato,
   * salvar, voltar e enviar — e empresa SEM contato nenhum simplesmente não
   * recebia, porque o botão só sabia reclamar.
   *
   * A correção é GRAVADA na empresa. Corrigir e não persistir é o vazamento que
   * já existia no termo: o próximo lote usaria o endereço velho e o contador
   * corrigiria de novo, e de novo.
   */
  para?: string;
  nome?: string;
}

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "não autenticado" }, { status: 401 });

  let corpo: Corpo;
  try {
    corpo = await req.json();
  } catch {
    corpo = {};
  }
  if (!corpo.analise_ids?.length && !corpo.laudo_ids?.length) {
    return NextResponse.json({ erro: "informe analise_ids ou laudo_ids" }, { status: 400 });
  }

  const { data: perfil } = await supabase
    .from("profiles")
    .select("tenant_id, tenants(nome, crc, logo_url)")
    .eq("id", user.id)
    .maybeSingle();
  const t = perfil?.tenants as { nome?: string; crc?: string; logo_url?: string } | null;
  // o cabeçalho do e-mail é o mesmo do documento: logo, nome e CRC
  const escritorio = { nome: t?.nome || "Seu contador", crc: t?.crc, logo_url: t?.logo_url };
  /**
   * A RESPOSTA DO CLIENTE VAI PARA O CONTADOR, não para o nada. O e-mail
   * termina com "é só responder", e o remetente do Postal é `nao-responda@`:
   * sem isto, o convite a responder seria uma promessa falsa.
   */
  const responderPara = user.email ? { email: user.email, nome: escritorio.nome } : undefined;

  // A leitura dos laudos passa pelo cliente do USUÁRIO: é a RLS da carteira que
  // decide o que este contador enxerga. Nada aqui pode enviar documento alheio.
  // schema-ok: laudos.token é criado pela migration 0028 (alter dinâmico, invisível ao parser)
  let q = supabase.from("laudos").select("id, numero, token, analise_id");
  q = corpo.laudo_ids?.length
    ? q.in("id", corpo.laudo_ids)
    : q.in("analise_id", corpo.analise_ids ?? []);
  const { data: laudos, error: errL } = await q.limit(1000);
  if (errL) return NextResponse.json({ erro: errL.message }, { status: 500 });

  const pedidos = corpo.laudo_ids?.length ?? corpo.analise_ids?.length ?? 0;
  if (!laudos?.length) {
    return NextResponse.json({
      ok: true,
      enviados: 0,
      sem_contato: 0,
      sem_laudo: pedidos,
      falhas: [],
    });
  }

  const { data: analises } = await supabase
    .from("analises")
    .select("id, empresa_id, saida")
    .in(
      "id",
      laudos.map((l) => l.analise_id)
    );
  const mapaAnalise = new Map((analises ?? []).map((a) => [a.id, a]));

  const { data: empresas } = await supabase
    .from("empresas")
    .select("id, razao_social, contato_nome, contato_email, faixa")
    .in(
      "id",
      (analises ?? []).map((a) => a.empresa_id)
    );
  const mapaEmpresa = new Map((empresas ?? []).map((e) => [e.id, e]));

  const admin = createAdminClient();
  const base = new URL(req.url).origin;

  // a correção só vale quando é um documento só — em lote não há como saber a
  // qual empresa o endereço digitado pertence
  const umSo = laudos.length === 1;
  const paraManual = umSo && corpo.para?.trim() ? corpo.para.trim() : null;
  const nomeManual = umSo && corpo.nome?.trim() ? corpo.nome.trim() : null;

  let enviados = 0;
  let semContato = 0;
  const falhas: { empresa: string; erro: string }[] = [];

  for (const l of laudos) {
    const a = mapaAnalise.get(l.analise_id);
    const e = a ? mapaEmpresa.get(a.empresa_id) : null;
    if (!e) {
      semContato++;
      continue;
    }
    const destino = paraManual ?? e.contato_email;
    const destinoNome = nomeManual ?? e.contato_nome;
    if (!destino) {
      semContato++;
      continue;
    }

    // o endereço corrigido vira o contato da empresa, para o próximo lote achar
    if (paraManual && paraManual !== e.contato_email) {
      const patch: { contato_email: string; contato_nome?: string } = { contato_email: paraManual };
      if (nomeManual && nomeManual !== e.contato_nome) patch.contato_nome = nomeManual;
      await supabase.from("empresas").update(patch).eq("id", e.id);
    }
    if (!l.token) {
      falhas.push({ empresa: e.razao_social, erro: "laudo sem endereço público (rode a migration 0028)" });
      continue;
    }

    /**
     * A DECISÃO SÓ APARECE NO E-MAIL QUANDO O LAUDO A CONTÉM. Faixas C, D, MEI
     * e FORA recebem o laudo curto, que documenta o descarte e não conclui por
     * optar ou permanecer. Anunciar uma decisão que o documento não toma seria
     * o e-mail prometendo mais do que o anexo entrega.
     */
    const decisao = ehLaudoCurto(e.faixa)
      ? null
      : ehOptar(a?.saida)
      ? ("optar" as const)
      : ("permanecer" as const);

    const envio = await enviarEmail({
      para: destino,
      nome: destinoNome ?? undefined,
      assunto: `${e.razao_social} — laudo de enquadramento nº ${String(l.numero).padStart(4, "0")}`,
      html: htmlLaudoCliente({
        empresa: e.razao_social,
        escritorio,
        link: `${base}/laudo/${l.token}`,
        numero: l.numero,
        decisao,
      }),
      tag: "laudo-cliente",
      responderPara,
    });

    if (envio.enviado) enviados++;
    else falhas.push({ empresa: e.razao_social, erro: envio.motivo ?? "envio recusado" });

    /**
     * O REGISTRO VALE TANTO PARA O SUCESSO QUANTO PARA A FALHA. Um envio que
     * não some do dossiê é um envio que o contador refaz achando que nunca
     * mandou; um erro que some é um cliente que nunca recebeu e ninguém soube.
     * Grava pelo cliente de SERVIÇO porque `envios_cliente` tem RLS ligada e
     * nenhuma policy — e é seguro aqui porque `empresas` acima já voltou pela
     * RLS do usuário, provando que esta empresa é dele.
     */
    if (admin) {
      await admin.from("envios_cliente").insert({
        tenant_id: perfil?.tenant_id ?? null,
        empresa_id: e.id,
        tipo: "laudo",
        documento_id: l.id,
        para: destino,
        nome: destinoNome ?? null,
        assunto: `laudo nº ${String(l.numero).padStart(4, "0")}`,
        status: envio.enviado ? "enviado" : "erro",
        erro: envio.enviado ? null : (envio.motivo ?? "envio recusado").slice(0, 300),
        caminho: envio.caminho,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    enviados,
    sem_contato: semContato,
    sem_laudo: Math.max(0, pedidos - laudos.length),
    falhas,
  });
}
