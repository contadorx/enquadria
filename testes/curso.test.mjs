/**
 * TESTE DO VÍDEO QUE VEM DO BANCO (curso_videos, migration 0038).
 *
 * Publicar aula deixou de ser deploy: o link mora numa tabela e a página
 * mescla com o que está no código. Duas regras erram em silêncio aqui — campo
 * vazio derrubando aula que já estava no ar, e o código vencendo o banco (o
 * contrário do que quem publica espera).
 *
 * Rodado pelo testes/rodar-tudo.mjs junto das demais suítes puras.
 */
import { comVideos, videoDaAula, MODULOS } from "./curso.js";

let f = 0;
const ok = (c, m, e) => {
  if (!c) { f++; console.log("FALHOU:", m, e === undefined ? "" : JSON.stringify(e)); }
  else console.log("ok:", m);
};

/* ══════════════ O VÍDEO QUE VEM DO BANCO (curso_videos, 0038) ══════════
 *
 * Publicar aula deixou de ser deploy: o link mora numa tabela e a página
 * mescla com o que está no código. Duas regras erram em silêncio aqui —
 * campo vazio derrubando aula que já estava no ar, e o código vencendo o
 * banco (o contrário do que quem publica espera).
 */
{
  const aula = MODULOS[0].aulas[0];

  const mesclado = comVideos(MODULOS, { [aula.slug]: "https://youtu.be/abc123XYZ" });
  ok(mesclado[0].aulas[0].video === "https://youtu.be/abc123XYZ",
     "o banco publica a aula sem passar pelo código", mesclado[0].aulas[0].video);
  ok(MODULOS[0].aulas[0].video !== "https://youtu.be/abc123XYZ",
     "e não altera a grade original — a função é pura");

  const comCodigo = [{ ...MODULOS[0], aulas: [{ ...aula, video: "https://youtu.be/DOCODIGO" }] }];
  ok(comVideos(comCodigo, { [aula.slug]: "https://youtu.be/DOBANCO" })[0].aulas[0].video === "https://youtu.be/DOBANCO",
     "havendo os dois, o banco vence: é onde está a última decisão de quem publica");
  ok(comVideos(comCodigo, { [aula.slug]: "  " })[0].aulas[0].video === "https://youtu.be/DOCODIGO",
     "campo em branco NÃO derruba a aula que já estava no ar");
  ok(comVideos(comCodigo, null)[0].aulas[0].video === "https://youtu.be/DOCODIGO",
     "banco fora do ar não apaga vídeo nenhum");
  ok(comVideos(MODULOS, { "slug-que-nao-existe": "https://youtu.be/x" })[0].aulas[0].video == null,
     "linha órfã no banco não vaza para outra aula");

  ok(videoDaAula(aula, { [aula.slug]: "https://youtu.be/UM" }) === "https://youtu.be/UM",
     "videoDaAula lê o banco");
  ok(videoDaAula({ ...aula, video: "https://youtu.be/COD" }, {}) === "https://youtu.be/COD",
     "e cai no código quando o banco não tem");
  ok(videoDaAula(aula, {}) === null, "sem nenhum dos dois, a aula fica em breve");
}

if (f) { console.log(`\n${f} FALHA(S)`); process.exit(1); }
console.log("\ncurso: tudo passou");
