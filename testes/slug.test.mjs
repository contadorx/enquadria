/**
 * O ENDEREÇO DA MATÉRIA — o teste do que nunca pode mudar.
 *
 * Cada matéria da Reforma passa a ter URL própria, e URL publicada é dívida:
 * o Google indexa, alguém cola num grupo, um contador salva nos favoritos. Se
 * a derivação mudar de comportamento numa refatoração futura, TODOS os
 * endereços já publicados mudam de uma vez — sem erro nenhum, sem teste
 * vermelho, só tráfego que some.
 *
 * Por isso os casos abaixo têm o resultado ESCRITO POR EXTENSO, e não
 * calculado. Um teste que recalcula a regra a partir da própria regra não
 * protege de nada.
 */
import { paraSlug, slugUnico, MAX_SLUG } from "./slug.js";

let f = 0;
const ok = (c, m, e) => {
  if (!c) { f++; console.log("FALHOU:", m, e === undefined ? "" : JSON.stringify(e)); }
  else console.log("ok:", m);
};
const igual = (achado, esperado, m) => ok(achado === esperado, m, { achado, esperado });

/* ═══════════ 1 · os títulos reais que estão no ar hoje ══════════════════ */

igual(
  paraSlug("Janela de opção pelo regime regular de IBS/CBS"),
  "janela-de-opcao-pelo-regime-regular-de-ibs-cbs",
  "a barra de IBS/CBS vira hífen — não pode sumir nem virar rota"
);
igual(
  paraSlug("NFS-e nacional passa a ser obrigatória para prestadores do Simples"),
  "nfs-e-nacional-passa-a-ser-obrigatoria-para-prestadores-do-simples",
  "o hífen que já existia no meio da palavra continua um hífen só"
);
igual(
  paraSlug("Os 27,91% que saíram na imprensa não são a alíquota de 2027"),
  "os-27-91-pct-que-sairam-na-imprensa-nao-sao-a-aliquota-de-2027",
  "o símbolo de porcentagem vira palavra — é o assunto da matéria"
);
igual(
  paraSlug("O TCU manda os cálculos da alíquota ao Senado até 15 de setembro"),
  "o-tcu-manda-os-calculos-da-aliquota-ao-senado-ate-15-de-setembro",
  "acentos viram a letra sem acento"
);
igual(
  paraSlug("Resolução CGSN nº 186/2026, art. 349 § 5º"),
  "resolucao-cgsn-n-186-2026-art-349-par-5",
  "nº, § e º viram texto legível em vez de sumirem"
);

/* ═══════════ 2 · as bordas que quebram URL ══════════════════════════════ */

igual(paraSlug("  Espaços   demais  "), "espacos-demais", "espaço em excesso não vira hífen em excesso");
igual(paraSlug("---Traço---no---meio---"), "traco-no-meio", "não sobra hífen no começo nem no fim");
igual(paraSlug("Atacado & indústria: crédito"), "atacado-e-industria-credito", "o & vira 'e'");
igual(paraSlug("MAIÚSCULAS VIRAM MINÚSCULAS"), "maiusculas-viram-minusculas", "caixa baixa sempre");
igual(paraSlug(""), "", "texto vazio devolve vazio — quem chama decide o que fazer");
igual(paraSlug("!!!???"), "", "título só de pontuação não vira endereço");

/* o corte é em palavra inteira */
{
  const longo = "a decisao de setembro muda a vida do escritorio contabil brasileiro inteiro e para sempre";
  const s = paraSlug(longo);
  ok(s.length <= MAX_SLUG, `o endereço cabe no limite (${s.length} ≤ ${MAX_SLUG})`, s);
  ok(!s.endsWith("-"), "o corte não deixa hífen solto no fim", s);
  ok(longo.split(" ").includes(s.split("-").pop()), "a última palavra do endereço é uma palavra inteira", s);
}

/* uma palavra sozinha maior que o limite não pode devolver vazio */
{
  const s = paraSlug("a".repeat(200));
  ok(s.length === MAX_SLUG, "palavra única gigante é cortada seca, não zerada", s.length);
}

/* ═══════════ 3 · duas matérias com o mesmo título ═══════════════════════ */

igual(slugUnico("CBS entra em vigor", []), "cbs-entra-em-vigor", "sem colisão, o endereço é o natural");
igual(
  slugUnico("CBS entra em vigor", ["cbs-entra-em-vigor"]),
  "cbs-entra-em-vigor-2",
  "colidiu uma vez: vira -2"
);
igual(
  slugUnico("CBS entra em vigor", ["cbs-entra-em-vigor", "cbs-entra-em-vigor-2"]),
  "cbs-entra-em-vigor-3",
  "colidiu duas: vira -3, e não -2-2"
);
igual(slugUnico("!!!", []), "materia", "título sem letra nenhuma ainda produz um endereço válido");

/* ═══════════ 4 · o endereço é ESTÁVEL — a regra em si ═══════════════════
 *
 * Esta é a verificação que justifica o arquivo: rodar duas vezes tem de dar o
 * mesmo resultado, e passar um slug de volta pela função não pode alterá-lo.
 * Se um dia a derivação virar "quase idempotente", as URLs publicadas mudam
 * na primeira reindexação e ninguém percebe. */
{
  const titulos = [
    "Janela de opção pelo regime regular de IBS/CBS",
    "Os 27,91% que saíram na imprensa não são a alíquota de 2027",
    "Campos de IBS e CBS na nota: para o Simples, a obrigatoriedade é só em 2027",
  ];
  ok(titulos.every((t) => paraSlug(t) === paraSlug(t)), "a mesma entrada dá sempre a mesma saída");
  ok(
    titulos.every((t) => paraSlug(paraSlug(t)) === paraSlug(t)),
    "passar o endereço de volta pela função não o altera (idempotente)"
  );
}

console.log(f === 0 ? "\nTODOS OS TESTES PASSARAM" : `\n${f} FALHA(S)`);
process.exit(f === 0 ? 0 : 1);
