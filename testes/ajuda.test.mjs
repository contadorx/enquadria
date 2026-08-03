/**
 * A central de ajuda: as duas regras onde o erro sai caro.
 *
 * O renderizador recebe texto escrito por pessoa e guardado no banco — se ele
 * deixar tag passar, é injeção. E o "há novidade" decide se uma correção da
 * Reforma chega ou não em quem precisa dela.
 */
import { renderizarCorpo, temNovidade, contarNovidades, urlDeEmbed, rotuloCategoria } from "./ajuda.js";

let falhas = 0;
const ok = (c, m) => { if (c) console.log("ok:", m); else { console.log("FALHOU:", m); falhas++; } };

/* ── o renderizador não deixa HTML do autor sobreviver ───────────────── */
const veneno = renderizarCorpo('<script>alert(1)</script> e <img src=x onerror=alert(2)>');
ok(!/<script/i.test(veneno), "tag script não sobrevive");
// `onerror` CONTINUA no texto — escapado, portanto inerte. O que não pode
// existir é ele dentro de uma tag de verdade, que é o que executaria.
ok(!/<img[^>]*onerror/i.test(veneno), "onerror não vive dentro de tag real");
ok(/&lt;img/.test(veneno), "a tag virou texto escapado, visível e inofensivo");
ok(/&lt;script/.test(veneno), "e vira texto visível, não some calado");

// link com esquema perigoso perde o href mas mantém o texto
const js = renderizarCorpo("[clique](javascript:alert(1))");
ok(!/javascript:/i.test(js), "href javascript: é recusado");
ok(/clique/.test(js), "mas o texto do link continua legível");

const img = renderizarCorpo("![gráfico](javascript:x)");
ok(!/<img/.test(img), "imagem com esquema perigoso não vira tag");

/* ── e formata o que deve ────────────────────────────────────────────── */
ok(/<h3[^>]*>O que muda<\/h3>/.test(renderizarCorpo("## O que muda")), "## vira subtítulo");
ok(/<strong>peso<\/strong>/.test(renderizarCorpo("o **peso** do crédito")), "negrito");
ok(/<ul/.test(renderizarCorpo("- um\n- dois")), "lista com dois itens");
ok((renderizarCorpo("- um\n- dois").match(/<li/g) || []).length === 2, "e os dois itens saem");
const link = renderizarCorpo("veja [a LC](https://x.gov.br)");
ok(/href="https:\/\/x\.gov\.br"/.test(link), "link https é preservado");
ok(/rel="noreferrer"/.test(link), "com rel de segurança");
const figura = renderizarCorpo("![tela](https://x/i.png)");
ok(/<img src="https:\/\/x\/i\.png"/.test(figura), "figura vira <img>");
ok(/alt="tela"/.test(figura), "com alt, que é o que o leitor de tela lê");

/* ── novidade: o coração do "o app avisa" ────────────────────────────── */
const art = { id: "a", atualizado_em: "2026-08-03T12:00:00Z" };
ok(temNovidade(art, null), "nunca lido é novidade");
ok(temNovidade(art, "2026-08-03T11:00:00Z"), "lido ANTES da correção volta a ser novidade");
ok(!temNovidade(art, "2026-08-03T13:00:00Z"), "lido DEPOIS não incomoda mais");
ok(temNovidade(art, "data-podre"), "data ilegível: mostra, em vez de esconder");

const artigos = [
  { id: "a", atualizado_em: "2026-08-03T12:00:00Z" },
  { id: "b", atualizado_em: "2026-08-01T10:00:00Z" },
  { id: "c", atualizado_em: "2026-07-20T10:00:00Z" },
];
ok(contarNovidades(artigos, {}) === 3, "sem leitura nenhuma, tudo é novidade");
ok(contarNovidades(artigos, { a: "2026-08-04T00:00:00Z", b: "2026-08-02T00:00:00Z" }) === 1,
   "conta só o que sobrou por ler");

/* ── vídeo: aceita o link que a pessoa copia, recusa domínio arbitrário ─ */
ok(urlDeEmbed("https://www.youtube.com/watch?v=abc123XYZ") === "https://www.youtube.com/embed/abc123XYZ",
   "youtube watch vira embed");
ok(urlDeEmbed("https://youtu.be/abc123XYZ") === "https://www.youtube.com/embed/abc123XYZ",
   "youtu.be encurtado também");
ok(urlDeEmbed("https://vimeo.com/123456789") === "https://player.vimeo.com/video/123456789", "vimeo");
ok(urlDeEmbed("https://sitequalquer.com/v") === null, "domínio arbitrário é recusado — iframe não é vale-tudo");
ok(urlDeEmbed(null) === null, "sem vídeo, sem iframe");

ok(rotuloCategoria("reforma") === "Reforma tributária", "categoria tem rótulo legível");

process.exit(falhas ? 1 : 0);
