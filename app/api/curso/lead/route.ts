import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * O CURSO MORA NO SITE, não aqui.
 *
 * A página estática do curso (enquadria.com.br/curso) posta neste endpoint, e
 * navegador nenhum faz POST entre domínios sem CORS. A lista de origens é
 * fechada de propósito: e-mail de lead é dado pessoal, e endpoint aberto vira
 * formulário de spam de terceiro em dois dias.
 */
const ORIGENS = [
  "https://enquadria.com.br",
  "https://www.enquadria.com.br",
  "https://app.enquadria.com.br",
];

function cors(origem: string | null) {
  const ok = origem && ORIGENS.includes(origem);
  return {
    "Access-Control-Allow-Origin": ok ? origem : ORIGENS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: cors(req.headers.get("origin")) });
}

/**
 * O CRM SAIU DO NAVEGADOR (08/08/2026).
 *
 * O endereço do CRM e o hash que identifica o formulário estavam escritos em
 * `public/assets/guia.js` e `public/assets/curso.js` — arquivos servidos ao
 * público. Quem abrisse o código-fonte tinha, de graça, a chave para escrever
 * direto na lista: dava para injetar contato, dava para encher a base de
 * endereços de terceiros que nunca pediram nada, e não sobrava registro nenhum
 * do lado de cá dizendo de onde aquilo veio. Como o disparo era `no-cors`, o
 * navegador nem sabia dizer se tinha chegado.
 *
 * O segredo agora é variável de ambiente e o repasse acontece aqui. O
 * navegador só fala com esta rota — nosso domínio, nossa trilha: o repasse é a
 * ÚLTIMA coisa que acontece, depois da tentativa de gravar em `curso_leads`, e
 * a `origem` que vai junto é a que a rota viu, não a que o cliente diria ao
 * CRM. Se o banco estiver fora, o repasse acontece assim mesmo: um lead que
 * chegou não pode sumir porque a nossa metade da captura falhou.
 *
 * CUSTO LGPD DECLARADO: o e-mail do lead continua saindo para um operador de
 * terceiro, como já saía. O que muda é que sai do servidor — sem o IP do
 * titular, sem os cookies e sem o resto do que o navegador dele carregava — e
 * só depois de ter deixado registro no banco próprio. Sem a variável
 * configurada, nada sai: o lead fica só aqui.
 */
const CRM_TIMEOUT_MS = 5000;

/**
 * A TAG DECIDE A CADÊNCIA, e por isso deixou de vir do cliente (08/08/2026).
 *
 * Era o JavaScript público que mandava `tags` ao CRM: `Enquadria-Guia` num
 * arquivo, `Enquadria-Curso` no outro. Qualquer pessoa podia mandar a tag que
 * quisesse e jogar um contato na sequência errada — quem baixou o guia ainda
 * pode não saber que existe prazo; quem baixou os materiais do curso já sabe e
 * quer executar. Aqui a tag vem da origem que a própria rota gravou.
 */
function tagDoLead(origem: string): string {
  return origem.includes("guia") ? "Enquadria-Guia" : "Enquadria-Curso";
}

/**
 * O REPASSE NÃO PODE DERRUBAR A CAPTURA.
 *
 * Trazer o CRM para o servidor cria um risco que não existia: antes ele era um
 * `fetch` solto no navegador e ninguém esperava por ele; agora está no caminho
 * da resposta. Se o CRM estiver fora, lento ou devolvendo erro, o lead JÁ está
 * no banco e a resposta continua 200 — daí o timeout curto e o `catch` que
 * engole tudo. CRM caído não pode virar material que não libera.
 */
async function repassarAoCrm(email: string, origem: string): Promise<boolean> {
  const url = process.env.CRM_WEBHOOK_URL;
  if (!url) return false;

  const form = new URLSearchParams();
  form.append("email", email);
  form.append("source", `${origem.startsWith("site-") ? origem : `site-${origem}`}-enquadria`);
  form.append("tags", tagDoLead(origem));

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: AbortSignal.timeout(CRM_TIMEOUT_MS),
      cache: "no-store",
    });
    return r.ok;
  } catch {
    /* rede, DNS, timeout: o lead já está gravado — não é motivo para negar */
    return false;
  }
}

/**
 * O ÚNICO PONTO DE CAPTURA DO CURSO.
 *
 * Rota pública: a página do curso não tem sessão. Por isso usa service role e
 * grava numa tabela com RLS ligada e sem policy — ninguém lê isso pelo cliente.
 *
 * REGRA DE PRODUTO: o download NÃO fica refém desta rota. Se o banco estiver
 * fora, se a chave não estiver configurada, se der qualquer erro, a resposta é
 * 200 e o material libera. Prometi o material em troca do e-mail; o e-mail veio.
 * Perder um lead é ruim; quebrar a promessa da página é pior.
 */
export async function POST(req: Request) {
  const cab = cors(req.headers.get("origin"));
  let corpo: { email?: string; origem?: string; material?: string };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ ok: true, gravado: false, motivo: "corpo inválido" }, { headers: cab });
  }

  const email = (corpo.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return NextResponse.json({ erro: "Confira o e-mail — parece incompleto." }, { status: 400, headers: cab });
  }

  const origem = corpo.origem ?? "curso";

  const supabase = createAdminClient();
  if (!supabase) {
    // sem SUPABASE_SERVICE_ROLE_KEY o app segue funcionando; só não captura
    const crm = await repassarAoCrm(email, origem);
    return NextResponse.json({ ok: true, gravado: false, crm, motivo: "captura não configurada" }, { headers: cab });
  }

  const { error } = await supabase
    .from("curso_leads")
    .upsert(
      {
        email,
        origem,
        material: corpo.material ?? null,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "email" }
    );

  if (error) {
    // a migration 0022 pode ainda não ter rodado — não é motivo para negar o material
    const crm = await repassarAoCrm(email, origem);
    return NextResponse.json({ ok: true, gravado: false, crm, motivo: error.message }, { headers: cab });
  }

  const crm = await repassarAoCrm(email, origem);
  return NextResponse.json({ ok: true, gravado: true, crm }, { headers: cab });
}
