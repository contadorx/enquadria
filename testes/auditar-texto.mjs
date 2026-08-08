/**
 * AUDITORIA DE TEXTO — o limite escrito, para o texto não crescer de volta.
 *
 * POR QUE ISTO EXISTE
 *
 * Texto de interface incha sozinho, e por um motivo honesto: cada correção
 * acrescenta uma frase explicando a correção. Ninguém escreve um parágrafo de
 * 383 caracteres de uma vez — escreve trinta caracteres oito vezes, cada vez
 * com uma boa razão. Um ano depois, a tela onde o contador trabalha todo dia
 * tem sete linhas de prosa ao lado de um botão de opção.
 *
 * A limpeza de 08/08/2026 cortou ~420 palavras das telas de trabalho. Sem
 * limite escrito, elas voltam — e voltam com boas intenções. Este arquivo é o
 * limite escrito.
 *
 * O QUE ELE NÃO FAZ: não julga estilo, não julga se a frase é boa, e não olha
 * documento nenhum. O laudo, o termo, a proposta e o curso ficam de FORA de
 * propósito: lá o texto longo é o produto, e encurtar seria economizar no lugar
 * errado. Ele olha só as telas onde se trabalha sob pressa.
 *
 * REGRA DE OURO: nenhum achado sem conserto ou sem dispensa escrita. Auditor
 * que acumula alerta ignorado vira ruído, e ninguém mais lê o resultado.
 *
 * Para dispensar um caso, escreva na linha de cima do código:
 *     // texto-ok: <o motivo, em português>
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/**
 * AS TELAS DE TRABALHO — a lista é explícita, não um padrão.
 *
 * Auditar o produto inteiro traria centenas de achados legítimos (venda, curso,
 * ajuda, documentos) e o relatório viraria papel de parede. Estas são as telas
 * que o contador abre para PRODUZIR, muitas vezes por dia. É onde a palavra a
 * mais cobra pedágio toda vez.
 */
const TELAS_DE_TRABALHO = [
  "components/Cockpit.tsx",
  "components/PainelEmpresa.tsx",
  "components/FormAnalise.tsx",
  "components/Importador.tsx",
  "components/PedirDados.tsx",
  "components/Trilha.tsx",
  "components/RoteiroEmpresa.tsx",
];

/** acima disto, é parágrafo — e parágrafo na tela de trabalho vira artigo de ajuda */
const LIMITE_TRECHO = 160;
/** rótulo de botão é promessa de ação: verbo + objeto cabe em quatro palavras */
const LIMITE_BOTAO = 4;
/** a mesma frase duas vezes no mesmo arquivo é uma decisão que ninguém tomou */
const LIMITE_REPETIDA = 45;

const achados = [];
const PALAVRA = /[A-Za-zÀ-ÿ]/;

/**
 * ISTO É CLASSE DE CSS, NÃO FRASE.
 *
 * A primeira versão filtrava por palavras-chave ("rounded", "bg-", "flex") e
 * deixava passar `font-semibold text-accentdeep underline underline-offset-2` —
 * que então era acusado de "mesma frase duas vezes no arquivo". Auditor que
 * acusa CSS de ser texto perde a autoridade para acusar texto.
 *
 * O teste agora é estrutural: toda palavra parece token de utilitário (só
 * minúsculas, dígitos e pontuação de classe) e pelo menos uma tem hífen ou
 * dois-pontos. Frase de gente não sobrevive a isso.
 */
/**
 * ISTO É CÓDIGO, NÃO FRASE.
 *
 * O recorte `>(…)<` de nó de texto do JSX casa também com um pedaço de código
 * quando o `>` vem de uma seta (`=>`) e o `<` de um genérico (`useState<…>`).
 * Aconteceu em `RoteiroEmpresa.tsx` e o auditor acusou 196 "caracteres de
 * parágrafo" numa linha de TypeScript. Auditor que acusa código de ser texto
 * perde a autoridade para acusar texto — é a mesma regra do falso positivo de
 * CSS, e chegou pelo mesmo caminho.
 */
function ehCodigo(s) {
  return /=>|;\s|\bconst\b|\breturn\b|\?\?|\)\s*\.|useState|=\s*\(/.test(s);
}

function ehClasseCss(s) {
  const palavras = s.split(/\s+/);
  if (palavras.length < 2) return false;
  const token = /^[a-z0-9:_\-[\]./%(),]+$/;
  return palavras.every((p) => token.test(p)) && palavras.some((p) => /[-:]/.test(p));
}

function dispensado(linhas, i) {
  for (let k = i - 1; k >= Math.max(0, i - 3); k--) {
    if (/texto-ok:/.test(linhas[k])) return true;
  }
  return false;
}

/** limpa comentários: documentação para quem mantém não é texto de tela */
function semComentarios(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/^\s*\/\/.*$/gm, "");
}

/** a linha (1-based) em que um índice de caractere cai */
function linhaDe(src, idx) {
  return src.slice(0, idx).split("\n").length;
}

for (const rel of TELAS_DE_TRABALHO) {
  const arq = path.join(RAIZ, rel);
  if (!fs.existsSync(arq)) continue;
  const bruto = fs.readFileSync(arq, "utf8");
  const src = semComentarios(bruto);
  const linhas = bruto.split("\n");

  const vistos = new Map();

  /* ---------------------------------------------- 1 · parágrafo na tela */
  const candidatos = [];
  for (const m of src.matchAll(/>([^<>{}]{12,})</g)) {
    candidatos.push([m[1], m.index]);
  }
  for (const m of src.matchAll(/["'`]([^"'`\n]{26,})["'`]/g)) {
    candidatos.push([m[1], m.index]);
  }

  for (const [cru, idx] of candidatos) {
    const s = cru.replace(/\s+/g, " ").trim();
    if (!s.includes(" ") || !PALAVRA.test(s[0])) continue;
    if (/^[a-z-]+:|^\//.test(s)) continue;
    if (ehClasseCss(s) || ehCodigo(s)) continue;

    const linha = linhaDe(src, idx);

    if (s.length > LIMITE_TRECHO && !dispensado(linhas, linha - 1)) {
      achados.push({
        rel,
        linha,
        regra: "Parágrafo na tela de trabalho",
        msg: `${s.length} caracteres (limite ${LIMITE_TRECHO}). Corte, ou mande a explicação para um artigo de ajuda: "${s.slice(0, 70)}…"`,
      });
    }

    if (s.length >= LIMITE_REPETIDA) {
      const chave = s.toLowerCase();
      if (vistos.has(chave)) {
        if (!dispensado(linhas, linha - 1)) {
          achados.push({
            rel,
            linha,
            regra: "Mesma frase duas vezes no arquivo",
            msg: `já aparece na linha ${vistos.get(chave)}: "${s.slice(0, 70)}…"`,
          });
        }
      } else {
        vistos.set(chave, linha);
      }
    }
  }

  /* ------------------------------------- 2 · rótulo de botão sem promessa */
  for (const m of src.matchAll(/<button\b[^>]*>\s*([^<>{}]{2,60}?)\s*<\/button>/g)) {
    const rotulo = m[1].replace(/\s+/g, " ").trim();
    if (!rotulo || !PALAVRA.test(rotulo[0])) continue;
    const palavras = rotulo.split(/\s+/).length;
    const linha = linhaDe(src, m.index);
    if (palavras > LIMITE_BOTAO && !dispensado(linhas, linha - 1)) {
      achados.push({
        rel,
        linha,
        regra: "Rótulo de botão comprido",
        msg: `${palavras} palavras (limite ${LIMITE_BOTAO}): "${rotulo}"`,
      });
    }
  }
}

/* ----------------------------------------------------------- relatório */
console.log(`\nAUDITORIA DE TEXTO — ${TELAS_DE_TRABALHO.length} telas de trabalho\n`);

const REGRAS = [
  "Parágrafo na tela de trabalho",
  "Mesma frase duas vezes no arquivo",
  "Rótulo de botão comprido",
];

for (const regra of REGRAS) {
  const meus = achados.filter((a) => a.regra === regra);
  if (meus.length === 0) {
    console.log(`ok: ${regra} — nenhum`);
    continue;
  }
  console.log(`\n${regra} — ${meus.length}`);
  for (const a of meus) console.log(`   ${a.rel}:${a.linha}  ${a.msg}`);
}

if (achados.length > 0) {
  console.log(
    `\n${achados.length} achado(s). Conserte, ou escreva "// texto-ok: <motivo>" na linha de cima.`
  );
  process.exit(1);
}
console.log("\nTODOS OS TESTES PASSARAM");
