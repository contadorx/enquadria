/**
 * A NOVIDADE — o e-mail que fala com a base inteira.
 *
 * POR QUE ESTE ARQUIVO EXISTE. Todo o resto do sistema de e-mail dispara por
 * comportamento e atinge uma pessoa por vez. Este atinge todo mundo de uma vez,
 * por decisão minha, e não tem CTRL+Z. Erro aqui não custa um assinante: custa
 * a reputação do domínio — e domínio queimado derruba o laudo, o termo e a
 * cobrança junto com a newsletter.
 *
 * As três coisas que precisam estar certas antes de qualquer envio:
 *   1. quem recebe (e principalmente quem NÃO recebe);
 *   2. o que impede o segundo disparo;
 *   3. o que o HTML diz — inclusive o rodapé de descadastro.
 */
import { criticar, selecionarPublico, chaveEnvio, paragrafos, htmlNovidade } from "./novidade.js";

let f = 0;
const ok = (c, m, e) => {
  if (!c) { f++; console.log("FALHOU:", m, e === undefined ? "" : JSON.stringify(e)); }
  else console.log("ok:", m);
};

const boa = {
  assunto: "A aba Reforma agora mostra o que atinge a sua carteira",
  titulo: "O que mudou nesta semana",
  corpo: "A aba Reforma virou uma lista só, com filtros e a data do efeito.\n\nQuem não leu aparece em negrito.",
  imagem_url: null, imagem_alt: null, link_url: null, link_texto: null,
};

/* ═══════════ 1 · o que trava e o que só avisa ═══════════════════════════ */
{
  ok(criticar(boa).erros.length === 0, "uma novidade completa não tem erro", criticar(boa));

  const curta = { ...boa, assunto: "Oi" };
  ok(criticar(curta).erros.length === 1, "assunto de duas letras trava o envio");

  const semCorpo = { ...boa, corpo: "Novidade!" };
  ok(criticar(semCorpo).erros.some((e) => /corpo/i.test(e)),
     "corpo curto trava: disparo à base inteira exige mais que uma linha");

  const gritando = { ...boa, assunto: "NOVIDADE IMPORTANTE NO ENQUADRIA" };
  ok(criticar(gritando).alertas.length > 0 && criticar(gritando).erros.length === 0,
     "assunto em maiúsculas avisa, mas não trava");
}

/* ═══════════ 2 · link e imagem meia-boca não passam ═════════════════════ */
{
  const linkTorto = { ...boa, link_url: "app.enquadria.com.br/painel", link_texto: "Abrir" };
  ok(criticar(linkTorto).erros.length === 1, "link sem https:// trava — endereço quebrado em massa");

  const semTexto = { ...boa, link_url: "https://app.enquadria.com.br/painel", link_texto: "" };
  ok(criticar(semTexto).erros.some((e) => /botão/i.test(e)), "link sem texto de botão trava");

  const imgSemAlt = { ...boa, imagem_url: "https://x.com.br/a.png", imagem_alt: "" };
  ok(criticar(imgSemAlt).erros.length === 0 && criticar(imgSemAlt).alertas.length > 0,
     "imagem sem descrição avisa (quem bloqueia imagem não vê nada), mas não trava");
}

/* ═══════════ 3 · quem NÃO recebe — o teste que mais importa ═════════════
 * Cada linha aqui é um jeito de queimar o domínio ou de desrespeitar alguém.
 * ══════════════════════════════════════════════════════════════════════════ */
{
  const p = selecionarPublico(
    [
      { email: "a@x.com.br", nome: "A" },
      { email: "A@X.com.br ", nome: "A de novo" }, // mesma caixa, outra grafia
      { email: "saiu@x.com.br" },
      { email: "bounce@x.com.br" },
      { email: "jafoi@x.com.br" },
      { email: "sem-arroba" },
      { email: "" },
      { email: "b@x.com.br" },
    ],
    {
      descadastrados: ["SAIU@x.com.br"],
      queimados: ["bounce@x.com.br"],
      jaReceberam: ["jafoi@x.com.br"],
    }
  );
  const emails = p.alvos.map((a) => a.email);
  ok(emails.join() === "a@x.com.br,b@x.com.br", "sobram só os dois endereços válidos e novos", emails);

  const motivos = Object.fromEntries(p.descartados.map((d) => [d.email, d.motivo]));
  ok(motivos["a@x.com.br"] === "repetido na lista",
     "maiúscula e espaço não criam um segundo destinatário — é a mesma caixa");
  ok(motivos["saiu@x.com.br"] === "pediu para não receber", "descadastro vale mesmo com outra grafia");
  ok(motivos["bounce@x.com.br"]?.startsWith("e-mail queimado"), "bounce/spam fica de fora");
  ok(motivos["jafoi@x.com.br"] === "já recebeu esta novidade", "quem já recebeu não recebe de novo");
  ok(p.descartados.filter((d) => d.motivo === "endereço inválido").length === 2,
     "endereço sem arroba e vazio não entram na fila");
}

/* ═══════════ 4 · a trava do disparo duplicado ══════════════════════════
 * A chave é o que torna o envio em LOTES seguro: recarregar a página no meio
 * do disparo não pode mandar tudo de novo. */
{
  ok(chaveEnvio("abc", "Fulano@X.com ") === "novidade:abc:fulano@x.com",
     "a chave normaliza o e-mail — senão a mesma caixa recebe duas vezes");
  ok(chaveEnvio("abc", "a@x.com") !== chaveEnvio("def", "a@x.com"),
     "novidades diferentes não compartilham trava");
}

/* ═══════════ 5 · parágrafos ═══════════════════════════════════════════ */
{
  ok(paragrafos("um\n\ndois").length === 2, "linha em branco separa parágrafo");
  ok(paragrafos("uma frase\nquebrada").length === 1, "quebra simples NÃO cria parágrafo novo");
  ok(paragrafos("  \n\n  ").length === 0, "só espaço não vira parágrafo vazio no e-mail");
}

/* ═══════════ 6 · o HTML: escape, descadastro e o link em texto ═════════ */
{
  const html = htmlNovidade(
    { ...boa, titulo: 'Perigo <script>alert("x")</script>', link_url: "https://app.enquadria.com.br/painel", link_texto: "Abrir o painel" },
    { nome: "Leandro", linkDescadastro: "https://app.enquadria.com.br/descadastro?e=a%40b.com&t=xyz" }
  );

  ok(!html.includes("<script>"), "conteúdo digitado é escapado — o corpo é texto, não HTML");
  ok(html.includes("&lt;script&gt;"), "e o que foi digitado continua legível, só que escapado");
  ok(html.includes("Olá, Leandro."), "o nome do destinatário entra na saudação");
  ok(html.includes("/descadastro?e=a%40b.com&amp;t=xyz"),
     "o link de descadastro está no HTML — sem ele isto é spam, não campanha");
  ok(/Avisos da sua conta/.test(html),
     "o rodapé diz que laudo, termo e cobrança continuam chegando");
  /* o rodapé transacional dizia "e-mail automático da sua conta" — mentira num
     comunicado, e mentira no rodapé é o que faz marcar como spam */
  ok(/Você recebe isto porque tem uma conta/.test(html) && !/e-mail automático da sua conta/.test(html),
     "a novidade se apresenta como comunicado, não como aviso automático");
  ok((html.match(/https:\/\/app\.enquadria\.com\.br\/painel/g) ?? []).length >= 2,
     "o endereço do botão aparece também em texto — cliente que bloqueia CSS some com o botão");
}

/* ═══════════ 7 · sem imagem não sobra tag vazia ═══════════════════════ */
{
  const html = htmlNovidade(boa, {});
  ok(!html.includes("<img"), "novidade sem imagem não leva <img> vazio (que vira quadrado quebrado)");
  ok(html.includes("Olá."), "sem nome, a saudação não fica 'Olá, .'");
}

console.log(f ? `\n${f} FALHA(S)` : "\ntudo ok");
process.exit(f ? 1 : 0);
