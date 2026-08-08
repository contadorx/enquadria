/**
 * TESTE DA COLETA — a tradução da resposta da empresa para a conta da decisão.
 *
 * Este é o ponto mais delicado da funcionalidade: o dono da empresa clica em
 * "a maioria grandes" e isso vira um número que entra no laudo assinado pelo
 * contador. Se a tradução escorregar, ninguém percebe — a tela continua
 * mostrando uma frase razoável e a conta usa outro valor.
 *
 * Como rodar (o projeto não tem runner; é TypeScript compilado na hora):
 *
 *   npx tsc lib/coleta.ts --outDir .tmp-testes --module esnext --target es2020 \
 *     --moduleResolution bundler --skipLibCheck
 *   cp testes/coleta.test.mjs .tmp-testes/ && cd .tmp-testes && node coleta.test.mjs
 */

import {
  PERGUNTAS,
  TOTAL_PERGUNTAS,
  derivar,
  respondidas,
  rotuloDaResposta,
  novoToken,
} from "./coleta.js";

let falhas = 0;
function ok(nome, condicao, detalhe) {
  if (condicao) {
    console.log("ok:", nome);
  } else {
    falhas++;
    console.log("FALHOU:", nome, detalhe !== undefined ? `→ ${JSON.stringify(detalhe)}` : "");
  }
}

const COMPLETA = {
  b2b: 0.7,
  fora_simples: 0.9,
  exig: 1,
  preco: 2,
  conc: 1,
  cred: 0.6,
};

// ---------------------------------------------------------------- estrutura
ok("são seis perguntas", TOTAL_PERGUNTAS === 6, TOTAL_PERGUNTAS);
ok(
  "nenhuma chave repetida",
  new Set(PERGUNTAS.map((p) => p.chave)).size === PERGUNTAS.length
);
ok(
  "toda pergunta tem pelo menos duas opções",
  PERGUNTAS.every((p) => p.opcoes.length >= 2)
);
ok(
  "nenhuma pergunta repete o mesmo valor em duas opções",
  PERGUNTAS.every((p) => new Set(p.opcoes.map((o) => o.valor)).size === p.opcoes.length)
);

// A REGRA DE LINGUAGEM É TESTÁVEL, então é testada: quem responde é o dono da
// empresa. Uma sigla que escape para cá derruba a taxa de resposta e ninguém
// vai saber por quê — o formulário simplesmente volta vazio.
// siglas: palavra inteira e com maiúscula, senão "DAS" casa dentro de
// "Das suas vendas" e o teste vira alarme falso — que é pior do que não ter teste
const SIGLAS = ["IBS", "CBS", "DAS", "RBT12", "ICMS", "ISS", "PIS", "COFINS", "CNAE"];
const TERMOS = [
  "anexo", "não cumulativ", "crédito presumido", "simples nacional",
  "alíquota", "lucro real", "lucro presumido", "regime", "tributári", "fator r",
];
for (const p of PERGUNTAS) {
  const texto = `${p.titulo} ${p.ajuda} ${p.opcoes.map((o) => o.rotulo).join(" ")}`;
  const achou = [
    ...SIGLAS.filter((s) => new RegExp(`\\b${s}\\b`).test(texto)),
    ...TERMOS.filter((t) => texto.toLowerCase().includes(t)),
  ];
  ok(`sem jargão em "${p.chave}"`, achou.length === 0, achou);
}

// as frações têm de ser fração; um "70" no lugar de "0,7" multiplicaria a
// receita qualificada por cem e mudaria a saída da árvore inteira
for (const chave of ["b2b", "fora_simples", "cred"]) {
  const p = PERGUNTAS.find((x) => x.chave === chave);
  ok(
    `${chave} vem em fração de 0 a 1`,
    p.opcoes.every((o) => o.valor >= 0 && o.valor <= 1),
    p.opcoes.map((o) => o.valor)
  );
}

// ----------------------------------------------------------------- derivar
const d = derivar(COMPLETA);
ok("derivar devolve as seis casas do motor", d !== null && Object.keys(d).length === 6, d);
ok("b2b passa direto", d.b2b === 0.7, d.b2b);
ok("qual vem de fora_simples", d.qual === 0.9, d.qual);
ok("cred passa direto", d.cred === 0.6, d.cred);
ok("preco passa direto", d.preco === 2, d.preco);
ok("conc passa direto", d.conc === 1, d.conc);
ok("exig passa direto", d.exig === 1, d.exig);
ok(
  "derivar NÃO inventa folha — ela é do contador",
  !("folha" in d),
  Object.keys(d)
);

// incompleto não deriva: meia resposta virando conta é o defeito que este
// retorno nulo existe para impedir
for (const p of PERGUNTAS) {
  const parcial = { ...COMPLETA };
  delete parcial[p.chave];
  ok(`sem "${p.chave}" não deriva`, derivar(parcial) === null);
}
ok("vazio não deriva", derivar({}) === null);

// valor fora da lista de opções não pode chegar até aqui pela tela, mas a rota
// é pública: o teste registra que zero é resposta válida em `exig` e `conc`, e
// que ausência é diferente de zero
ok("exig = 0 é resposta, não ausência", derivar({ ...COMPLETA, exig: 0 })?.exig === 0);
ok("conc = 0 é resposta, não ausência", derivar({ ...COMPLETA, conc: 0 })?.conc === 0);
ok("preco = 0 é resposta, não ausência", derivar({ ...COMPLETA, preco: 0 })?.preco === 0);

// ------------------------------------------------------------- respondidas
ok("conta as respondidas", respondidas(COMPLETA) === 6, respondidas(COMPLETA));
ok("conta zero no início", respondidas({}) === 0);
ok("conta parcial", respondidas({ b2b: 0.5, conc: 0 }) === 2);
ok(
  "zero conta como respondida",
  respondidas({ exig: 0 }) === 1,
  respondidas({ exig: 0 })
);

// ------------------------------------------------------------------ rótulo
ok(
  "rótulo devolve o texto que a empresa marcou",
  rotuloDaResposta("preco", 2) === "Consigo, mas com negociação",
  rotuloDaResposta("preco", 2)
);
ok("rótulo de valor inexistente é nulo", rotuloDaResposta("preco", 9) === null);
ok("rótulo de resposta ausente é nulo", rotuloDaResposta("preco", undefined) === null);

// ------------------------------------------------------------------- token
const bytes = new Uint8Array(20).map((_, i) => (i * 37) % 256);
const t = novoToken(bytes);
ok("token tem 20 caracteres", t.length === 20, t);
ok("token não usa I, O, 0 nem 1", !/[IO01]/.test(t), t);
ok(
  "token é determinístico para os mesmos bytes",
  novoToken(bytes) === t
);
ok(
  "bytes diferentes dão tokens diferentes",
  novoToken(new Uint8Array(20).map((_, i) => (i * 11 + 3) % 256)) !== t
);

console.log(falhas === 0 ? "\nTODOS OS TESTES PASSARAM" : `\n${falhas} TESTE(S) FALHARAM`);
process.exit(falhas === 0 ? 0 : 1);
