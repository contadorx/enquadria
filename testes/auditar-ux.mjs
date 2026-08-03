/**
 * AUDITORIA DE UX — os defeitos que passam em todo teste automático.
 *
 * POR QUE ISTO EXISTE
 *
 * Dois botões seguidos foram reportados como "não funciona", e nenhum dos dois
 * estava quebrado. "Ler CNPJs" montava a prévia noventa linhas abaixo, fora da
 * tela. "Usar estas respostas" preenchia um formulário que também estava fora
 * da tela, na mesma aba. Os dois passavam em typecheck, em build e em teste de
 * unidade — porque o código estava certo. O que estava errado era a PERCEPÇÃO:
 * quando o efeito de um clique aparece a mais de uma tela de distância do
 * clique, quem clicou conclui que o clique falhou. E conclui certo, do ponto de
 * vista dele.
 *
 * Este arquivo procura essa família de defeito por análise estática. Cada regra
 * nasceu de um bug real ou de um modo de falha que a interface já teve.
 *
 * O QUE ELE NÃO É: não é um juiz de estética. Ele não olha cor, espaçamento nem
 * hierarquia — isso continua sendo olho humano. Ele olha CAUSA E EFEITO.
 *
 * REGRA DE OURO DESTE ARQUIVO: nenhum achado sem conserto ou sem dispensa
 * escrita. Auditor que acumula alerta ignorado vira ruído, e em pouco tempo
 * ninguém lê o resultado — o mesmo destino do teste que falha sozinho.
 *
 * Para dispensar um caso, escreva na linha de cima do código:
 *     // ux-ok: <o motivo, em português>
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PASTAS = ["components", "app"];

/** distância, em linhas, a partir da qual o efeito já não está no campo de visão */
const LONGE = 60;

const achados = [];
const arquivos = [];

function varrer(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) varrer(p);
    else if (e.name.endsWith(".tsx")) arquivos.push(p);
  }
}
for (const p of PASTAS) {
  const dir = path.join(RAIZ, p);
  if (fs.existsSync(dir)) varrer(dir);
}

const rel = (f) => path.relative(RAIZ, f);

function achado(arq, linha, regra, msg) {
  achados.push({ arq: rel(arq), linha, regra, msg });
}

/** dispensa explícita na linha anterior */
function dispensado(linhas, i) {
  for (let k = i - 1; k >= Math.max(0, i - 3); k--) {
    if (/ux-ok:/.test(linhas[k])) return true;
  }
  return false;
}

for (const arq of arquivos) {
  const txt = fs.readFileSync(arq, "utf8");
  const linhas = txt.split("\n");

  // mapa: estado → setter, e onde cada estado é LIDO no JSX
  const estados = {};
  for (const m of txt.matchAll(/const\s*\[\s*(\w+)\s*,\s*(set\w+)\s*\]\s*=\s*useState/g)) {
    estados[m[2]] = m[1];
  }

  /**
   * TODAS as linhas em que cada estado é lido — e depois a MAIS PRÓXIMA do
   * clique, não a primeira.
   *
   * A primeira versão pegava a primeira ocorrência e acusava dois botões que
   * estão colados no seu próprio efeito: o campo de código fica na linha de
   * cima do botão "Reenviar", mas a primeira leitura da variável estava numa
   * validação lá em cima, dentro de uma função. Distância até a leitura mais
   * próxima é a pergunta certa — se o estado aparece perto, a pessoa VÊ.
   */
  const leituras = {};
  for (const [setter, nome] of Object.entries(estados)) {
    const re = new RegExp(`[{(\\s=]${nome}\\s*(&&|\\?|\\)|\\}|\\.|$)`);
    const onde = [];
    for (let i = 0; i < linhas.length; i++) if (re.test(linhas[i])) onde.push(i + 1);
    leituras[setter] = onde;
  }

  /**
   * Estados de PLUMBING não são o efeito que o usuário procura: "ocupado",
   * "carregando" e "erro" existem para dar resposta imediata, e por definição
   * ficam junto do botão. Contá-los como efeito distante gera alarme onde a
   * interface está certa.
   */
  const ehPlumbing = (nome) =>
    /^(ocupado|carregando|enviando|salvando|testando|erro|recado|copiado|etapa)$/i.test(nome);

  // corpo de cada função declarada, para resolver onClick={nomeDaFuncao}
  const corpos = {};
  for (const m of txt.matchAll(/(?:async\s+)?function\s+(\w+)\s*\([^)]*\)\s*\{/g)) {
    const ini = m.index;
    let nivel = 0, fim = ini;
    for (let i = txt.indexOf("{", ini); i < txt.length; i++) {
      if (txt[i] === "{") nivel++;
      else if (txt[i] === "}") { nivel--; if (nivel === 0) { fim = i; break; } }
    }
    corpos[m[1]] = txt.slice(ini, fim + 1);
  }

  /** junta ao corpo o de cada função local que ele chama (um nível) */
  function expandir(corpo, todos) {
    if (!corpo) return corpo;
    let junto = corpo;
    for (const m of corpo.matchAll(/\b(\w+)\s*\(/g)) {
      const outro = todos[m[1]];
      if (outro && outro !== corpo) junto += "\n" + outro;
    }
    return junto;
  }

  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    const nLinha = i + 1;

    /* ───────────────────────────────────────────────── REGRA 1
       O EFEITO LONGE DO CLIQUE — o bug do "Ler CNPJs" e do "Usar respostas".
       Um clique cujo único efeito observável é um estado lido muito abaixo,
       sem rolar a tela, sem navegar e sem dizer nada. */
    /**
     * Também conta como "clique" a função passada por prop a um componente
     * filho (aoAplicar={aplicarColeta}). Foi por aí que o botão "Usar estas
     * respostas" escapou da primeira versão desta regra: o onClick mora em
     * PedirDados, mas o efeito acontece no pai. Sem isto o auditor só enxerga
     * metade da interface.
     */
    const clique =
      l.match(/onClick=\{(?:\(\)\s*=>\s*)?(\w+)[\s(}]/) ||
      l.match(/\b(?:ao|on)[A-Z]\w*=\{(\w+)\}/);
    if (clique && !dispensado(linhas, i)) {
      /**
       * Segue UM nível de chamada local. Extrair `rolarAtePrevia()` para uma
       * função auxiliar é boa prática — o auditor não pode punir isso, senão
       * ensina a duplicar código para calar o alarme.
       */
      const corpo = expandir(corpos[clique[1]], corpos);
      if (corpo) {
        /**
         * LIMPAR ESTADO NÃO É AVISAR.
         *
         * A primeira versão tratava qualquer `setErro(...)` como feedback — e
         * quase todo handler começa com `setErro(null)` para apagar a mensagem
         * anterior. Resultado: a regra dispensava exatamente os dois botões que
         * ela nasceu para pegar. Chamada com `null` é faxina, não resposta.
         */
        const semFaxina = corpo.replace(/set\w+\s*\(\s*(null|""|''|false)\s*\)/g, "");

        /**
         * POLÍTICA, NÃO ADIVINHAÇÃO.
         *
         * Tentei inferir se o usuário "viu alguma coisa" e a inferência falhou
         * três vezes seguidas, cada vez de um jeito:
         *   · `setErro(null)` no começo do handler contou como aviso — limpar
         *     não é avisar;
         *   · `setErro("...")` no ramo de FALHA dispensou o handler inteiro,
         *     mas no caminho de sucesso não aparecia nada;
         *   · um rótulo cinza de quatro palavras a 41 linhas contou como
         *     resposta, e foi exatamente o botão que o usuário reportou como
         *     quebrado.
         *
         * Inferir "viu" é insolúvel por análise estática: ver um rótulo mudar
         * não é ver o RESULTADO. Então a regra virou política, e a política é
         * simples de cumprir e impossível de fingir: se o resultado do clique
         * nasce a mais de uma tela de distância, LEVE O OLHO ATÉ LÁ — role,
         * navegue ou abra. Se houver um motivo para não levar, escreva-o num
         * `// ux-ok:` e a exceção fica registrada com nome e razão.
         */
        const avisa =
          /scrollIntoView|router\.(push|replace)|window\.(open|location)|alert\(|confirm\(/.test(corpo);
        if (!avisa) {
          for (const m of semFaxina.matchAll(/(set\w+)\s*\(/g)) {
            const nome = estados[m[1]];
            if (!nome || ehPlumbing(nome)) continue;
            const onde = leituras[m[1]] ?? [];
            if (onde.length === 0) continue;
            const perto = Math.min(...onde.map((x) => Math.abs(x - nLinha)));
            if (perto > LONGE) {
              achado(arq, nLinha, "efeito-longe-do-clique",
                `onClick=${clique[1]} muda "${nome}", e a leitura mais próxima está a ${perto} ` +
                `linhas daqui. Quem clica não vê nada mudar. Role até o resultado, ou confirme na hora.`);
              break;
            }
          }
        }
      }
    }

    /* ───────────────────────────────────────────────── REGRA 2
       BOTÃO CINZA QUE NÃO SE EXPLICA. Desabilitado sem motivo visível é
       indistinguível de quebrado: a pessoa clica, nada acontece, e conclui
       que o sistema falhou. */
    const desab = l.match(/\bdisabled=\{([^}]*)\}/);
    if (desab && !dispensado(linhas, i)) {
      /**
       * DESABILITADO MOMENTÂNEO NÃO PRECISA SE EXPLICAR.
       *
       * `disabled={pend}` enquanto a requisição está no ar dura um segundo e é
       * exatamente o comportamento certo. O que confunde é o botão que nasce
       * cinza e FICA cinza — porque falta um dado que a pessoa não sabe qual é.
       * A distinção entre os dois é o que separa este auditor de um gerador de
       * ruído.
       */
      const soPlumbing = /^[!\s]*(pend|ocupado|carregando|enviando|salvando|emitindo|testando|isPending|enviado)[\s|&!]*$/i
        .test(desab[1].trim());

      // rótulo que muda ("Lido ✓", "Emitindo…") já é a explicação
      const bloco = linhas.slice(i, Math.min(linhas.length, i + 12)).join("\n");
      const rotuloMuda = /\{[^}]*\?[^}]*:[^}]*\}/.test(bloco);

      const trecho = linhas.slice(Math.max(0, i - 10), Math.min(linhas.length, i + 16)).join("\n");
      const explica = /title=|aria-label=|não dá para|precisa|falta|indisponível|preencha|informe|escolha|selecione|aguarde|\.\.\.|…/i.test(trecho);

      if (!soPlumbing && !rotuloMuda && !explica) {
        achado(arq, nLinha, "desabilitado-sem-motivo",
          `disabled={${desab[1].trim()}} — nasce cinza e nada por perto diz o que destrava.`);
      }
    }

    /* ───────────────────────────────────────────────── REGRA 3
       AÇÃO DE REDE SEM ESTADO DE ESPERA. Sem isso a pessoa clica de novo — e
       em rota que grava, clicar duas vezes cria dois registros. */
    const handler = l.match(/on(?:Click|Submit)=\{(?:\(\)\s*=>\s*)?(\w+)[\s(}]/);
    if (handler && !dispensado(linhas, i)) {
      const corpo = expandir(corpos[handler[1]], corpos);
      if (corpo && /fetch\(/.test(corpo)) {
        // qualquer `disabled=` no próprio botão já é a trava do clique duplo —
        // não importa o nome do estado por trás (setEmitindo, um Set de lidos…)
        const bloco = linhas.slice(Math.max(0, i - 6), Math.min(linhas.length, i + 8)).join("\n");
        const temEspera =
          /disabled=\{/.test(bloco) ||
          /set\w*(Ocupado|Enviando|Carregando|Etapa|Testando|Salvando|Emitindo|Pend)\w*\s*\(/i.test(corpo);
        if (!temEspera) {
          achado(arq, nLinha, "rede-sem-espera",
            `${handler[1]} chama a rede e não marca estado de espera — dá para clicar duas vezes.`);
        }
      }
    }

    /* ───────────────────────────────────────────────── REGRA 4
       ERRO ENGOLIDO NA INTERFACE. `catch {}` vazio num componente é uma falha
       que o usuário vive e ninguém vê. (No servidor há casos legítimos de
       degradar em silêncio; aqui, não.) */
    if (/catch\s*(\(\w*\))?\s*\{\s*\}/.test(l) && !dispensado(linhas, i)) {
      achado(arq, nLinha, "erro-engolido",
        "catch vazio: a ação falha e a tela não conta.");
    }
  }
}

/* ───────────────────────────────────────────────────────── relatório */
const porRegra = {};
for (const a of achados) (porRegra[a.regra] ??= []).push(a);

console.log(`\nAUDITORIA DE UX — ${arquivos.length} arquivos de tela\n`);

const REGRAS = {
  "efeito-longe-do-clique": "Efeito do clique fora do campo de visão",
  "desabilitado-sem-motivo": "Botão desabilitado sem explicação",
  "rede-sem-espera": "Ação de rede sem estado de espera",
  "erro-engolido": "Erro engolido pela interface",
};

for (const [regra, titulo] of Object.entries(REGRAS)) {
  const lista = porRegra[regra] ?? [];
  if (lista.length === 0) {
    console.log(`ok: ${titulo} — nenhum`);
  } else {
    console.log(`\nFALHOU: ${titulo} — ${lista.length}`);
    for (const a of lista) console.log(`   ${a.arq}:${a.linha}\n     ${a.msg}`);
  }
}

console.log(
  achados.length === 0
    ? "\nTODOS OS TESTES PASSARAM"
    : `\n${achados.length} FALHAS`
);
process.exit(achados.length ? 1 : 0);
