/**
 * A NOVIDADE — o único e-mail do produto que não nasce de um comportamento.
 *
 * As réguas disparam por FATO: importou, não importou, esbarrou no limite,
 * venceu a fatura. A novidade é o contrário — ela é uma decisão minha de
 * contar alguma coisa para a base inteira. Por isso ela é a mais perigosa dos
 * e-mails do sistema, e por isso este arquivo é puro e vem com teste:
 *
 *   · disparo em massa não tem CTRL+Z;
 *   · um texto ruim não custa um assinante, custa a REPUTAÇÃO do domínio — e
 *     domínio queimado derruba o laudo, o termo e a cobrança junto.
 *
 * Aqui dentro estão as três coisas que precisam estar certas antes de qualquer
 * envio: quem recebe, o que o HTML diz, e o que impede o segundo disparo.
 */

import { escapar, moldura, MARCA } from "./mailer/templates";

export interface Novidade {
  id?: string;
  assunto: string;
  titulo: string;
  /** texto corrido; linha em branco separa parágrafo */
  corpo: string;
  imagem_url?: string | null;
  imagem_alt?: string | null;
  link_url?: string | null;
  link_texto?: string | null;
}

export interface Destinatario {
  email: string;
  nome?: string | null;
  tenant_id?: string | null;
}

/* ==========================================================================
 * 1 · VALIDAÇÃO — o que impede o envio, e o que é só um aviso
 *
 * A diferença importa: erro trava o botão; alerta aparece e deixa enviar. Se
 * tudo travasse, eu acabaria contornando a validação. Se nada travasse, um
 * link com `htp://` iria para a base inteira.
 * ========================================================================== */

export interface Critica {
  erros: string[];
  alertas: string[];
}

const urlOk = (u: string) => /^https:\/\/[^\s]+\.[^\s]+/i.test(u.trim());

export function criticar(n: Novidade): Critica {
  const erros: string[] = [];
  const alertas: string[] = [];

  const assunto = n.assunto.trim();
  if (assunto.length < 8) erros.push("O assunto está curto demais — escreva pelo menos 8 caracteres.");
  if (assunto.length > 80) alertas.push("Assunto com mais de 80 caracteres é cortado no celular.");
  if (/!{1,}/.test(assunto)) alertas.push("Exclamação no assunto empurra para a aba Promoções.");
  if (assunto === assunto.toUpperCase() && /[A-ZÀ-Ú]/.test(assunto))
    alertas.push("Assunto todo em maiúsculas é lido como spam pelos filtros.");

  if (n.titulo.trim().length < 5) erros.push("O título dentro do e-mail está curto demais.");
  if (n.corpo.trim().length < 40)
    erros.push("O corpo está curto demais para valer um disparo à base inteira.");

  if (n.imagem_url && !urlOk(n.imagem_url))
    erros.push("A imagem precisa de um endereço https:// completo.");
  if (n.imagem_url && !n.imagem_alt?.trim())
    alertas.push("Sem descrição da imagem: quem bloqueia imagem (a maioria) não vê nada ali.");

  if (n.link_url && !urlOk(n.link_url))
    erros.push("O link precisa de um endereço https:// completo.");
  if (n.link_url && !n.link_texto?.trim())
    erros.push("O botão precisa de um texto — 'clique aqui' não conta como um.");
  if (!n.link_url && n.link_texto?.trim())
    alertas.push("Tem texto de botão mas não tem link: o botão não vai aparecer.");

  return { erros, alertas };
}

/* ==========================================================================
 * 2 · QUEM RECEBE
 *
 * Três filtros, nesta ordem, e nenhum deles é opcional:
 *
 *   · e-mail inválido some (bounce queima domínio);
 *   · repetido some (duas pessoas do mesmo escritório com o mesmo endereço
 *     receberiam duas vezes a mesma mensagem);
 *   · descadastrado e queimado somem — o primeiro por respeito, o segundo por
 *     sobrevivência.
 *
 * A comparação é sempre em minúsculas e sem espaço: "Joao@X.com " e
 * "joao@x.com" são a mesma caixa, e o descadastro de um tem de valer no outro.
 * ========================================================================== */

export interface Publico {
  alvos: Destinatario[];
  descartados: { email: string; motivo: string }[];
}

export function selecionarPublico(
  candidatos: Destinatario[],
  fora: { descadastrados?: string[]; queimados?: string[]; jaReceberam?: string[] } = {}
): Publico {
  const norm = (e: string) => e.trim().toLowerCase();
  const desc = new Set((fora.descadastrados ?? []).map(norm));
  const queim = new Set((fora.queimados ?? []).map(norm));
  const ja = new Set((fora.jaReceberam ?? []).map(norm));

  const vistos = new Set<string>();
  const alvos: Destinatario[] = [];
  const descartados: { email: string; motivo: string }[] = [];

  for (const c of candidatos) {
    const email = norm(c.email ?? "");
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      descartados.push({ email: c.email ?? "(vazio)", motivo: "endereço inválido" });
      continue;
    }
    if (vistos.has(email)) {
      descartados.push({ email, motivo: "repetido na lista" });
      continue;
    }
    vistos.add(email);
    if (desc.has(email)) { descartados.push({ email, motivo: "pediu para não receber" }); continue; }
    if (queim.has(email)) { descartados.push({ email, motivo: "e-mail queimado (bounce ou spam)" }); continue; }
    if (ja.has(email)) { descartados.push({ email, motivo: "já recebeu esta novidade" }); continue; }
    alvos.push({ ...c, email });
  }

  return { alvos, descartados };
}

/** a trava do disparo duplicado — a mesma forma usada pelas réguas */
export function chaveEnvio(novidadeId: string, email: string): string {
  return `novidade:${novidadeId}:${email.trim().toLowerCase()}`;
}

/* ==========================================================================
 * 3 · O HTML
 *
 * Usa a moldura de sempre (`lib/mailer/templates`) para a novidade chegar com
 * a mesma cara do resto do produto. As diferenças em relação ao transacional
 * são deliberadas e são só duas: pode ter UMA imagem, e tem descadastro.
 * ========================================================================== */

/** quebra o texto em parágrafos; linha em branco separa, linha simples não */
export function paragrafos(corpo: string): string[] {
  return corpo
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim().replace(/\n/g, " "))
    .filter(Boolean);
}

export function htmlNovidade(
  n: Novidade,
  opcoes: { nome?: string | null; linkDescadastro?: string | null; base?: string } = {}
): string {
  const base = opcoes.base ?? "https://app.enquadria.com.br";
  const saudacao = opcoes.nome?.trim() ? `Olá, ${escapar(opcoes.nome.trim())}.` : "Olá.";

  const imagem = n.imagem_url
    ? `<div style="margin:22px 0">
         <img src="${escapar(n.imagem_url)}" alt="${escapar(n.imagem_alt ?? "")}"
              width="496" style="width:100%;max-width:496px;height:auto;border-radius:8px;border:1px solid #e2e8f0;display:block">
         ${n.imagem_alt ? `<div style="font-size:12px;color:#6b7280;margin-top:6px">${escapar(n.imagem_alt)}</div>` : ""}
       </div>`
    : "";

  /* O BOTÃO REPETE O ENDEREÇO EM TEXTO. Cliente de e-mail que bloqueia CSS
     transforma botão em nada visível — e um anúncio sem caminho é um anúncio
     desperdiçado. É a mesma regra dos templates transacionais. */
  const botaoLink =
    n.link_url && n.link_texto
      ? `<p style="margin:26px 0 8px">
           <a href="${escapar(n.link_url)}" style="background:${MARCA};color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;display:inline-block;font-weight:600">${escapar(n.link_texto)}</a>
         </p>
         <p style="font-size:13px;color:#6b7280;margin:0">Se o botão não funcionar, copie este endereço:<br>
         <span style="word-break:break-all">${escapar(n.link_url)}</span></p>`
      : "";

  const miolo = `
    <p style="margin:0 0 16px">${saudacao}</p>
    <h1 style="font-size:19px;line-height:1.3;margin:0 0 14px;color:${MARCA}">${escapar(n.titulo)}</h1>
    ${paragrafos(n.corpo).map((p) => `<p style="margin:0 0 14px">${escapar(p)}</p>`).join("\n    ")}
    ${imagem}
    ${botaoLink}
    <p style="margin:26px 0 0;font-size:13px;color:#6b7280">— Leandro, Enquadria · <a href="${base}/painel" style="color:${MARCA}">abrir o painel</a></p>`;

  /* O DESCADASTRO FICA NO RODAPÉ, VISÍVEL E EM TEXTO NORMAL. Esconder o link
     não faz ninguém continuar recebendo: faz clicar em "isto é spam", que é o
     botão que realmente machuca o domínio — e que também derruba a entrega do
     laudo e da cobrança. */
  const rodape = opcoes.linkDescadastro
    ? `<br><a href="${escapar(opcoes.linkDescadastro)}" style="color:#6b7280">Não quero mais receber novidades do Enquadria</a>.
       <br><span style="color:#9ca3af">Avisos da sua conta — laudo, termo, cobrança — continuam chegando.</span>`
    : "";

  return moldura(
    n.titulo,
    miolo,
    rodape,
    "Você recebe isto porque tem uma conta no Enquadria."
  );
}

/** o assunto vai como está: sem prefixo, sem emoji, sem "[Novidade]" */
export function assuntoNovidade(n: Novidade): string {
  return n.assunto.trim();
}
