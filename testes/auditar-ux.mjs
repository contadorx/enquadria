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

      /**
       * O VOCABULÁRIO É UM PROXY, e proxy incompleto acusa código correto.
       *
       * "Digite o e-mail para liberar o envio" explica tanto quanto "Informe o
       * e-mail" — e a primeira versão desta lista não tinha "digite", então a
       * auditoria reprovou uma explicação perfeitamente clara. Sempre que isso
       * acontecer, o certo é ampliar a lista, não reescrever o texto do produto
       * para agradar ao verificador: quem existe para o usuário é o texto.
       */
      const trecho = linhas.slice(Math.max(0, i - 10), Math.min(linhas.length, i + 16)).join("\n");
      const explica =
        /title=|aria-label=|não dá para|precisa|falta|indisponível|preencha|informe|digite|escolha|selecione|aguarde|libera|destrava|complet[ea]|inválid|\.\.\.|…/i.test(
          trecho
        );

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

/* ───────────────────────────────────────────────── REGRA 5
   ESPERA QUE ACABA ANTES DO EFEITO.

   Relato real: "no login, após a validação ele não fica pensando ou indicando
   que vai entrar, parecendo erro". O botão TINHA estado de espera — a regra 3
   passava. O defeito era outro: o código soltava a espera assim que a API
   respondia e só então navegava. Entre soltar e a página nova aparecer existe
   um intervalo em que a tela está parada com o botão pronto para clicar de
   novo. Para quem olha, isso não é "carregando": é "não funcionou".

   A espera precisa durar até o EFEITO, não até a resposta.

   Duas formas do mesmo defeito, ambas cobertas aqui:
     (a) set…(false) e depois router.push/refresh no mesmo trecho;
     (b) navegar depois de um await sem nenhum estado de espera no arquivo. */
{
  const ESPERA = /set\w*(Ocupado|Carregando|Enviando|Salvando|Emitindo|Testando|Processando|Gerando|Saindo|Loading|Busy)\w*/i;
  for (const arq of arquivos) {
    const txt = fs.readFileSync(arq, "utf8");
    const linhas = txt.split("\n");

    // (a) soltou a espera no caminho FELIZ e ainda navegou depois.
    //
    // O critério NÃO é "existe set…(false) antes do push": soltar a espera
    // para sair cedo por erro é correto. O que separa os dois casos é a
    // PROFUNDIDADE. Um set…(false) dentro de um `if` que retorna está mais
    // indentado que a navegação — é saída antecipada. Um set…(false) no
    // mesmo nível da navegação está no caminho que segue até ela: a espera
    // morre e a tela fica parada até a página nova aparecer.
    const nivel = (l) => l.length - l.trimStart().length;
    for (let i = 0; i < linhas.length; i++) {
      if (!new RegExp(ESPERA.source + "\\(false\\)", "i").test(linhas[i])) continue;
      if (dispensado(linhas, i)) continue;
      const nSet = nivel(linhas[i]);

      for (let j = i + 1; j < Math.min(linhas.length, i + 60); j++) {
        const t = linhas[j];
        // um return no mesmo nível (ou acima) encerra este caminho: tudo bem
        if (/^\s*return\b/.test(t) && nivel(t) <= nSet) break;
        // só NAVEGAÇÃO conta. router.refresh() revalida dados sem trocar de
        // página: a pessoa continua vendo a tela, e soltar a espera ali é
        // o comportamento certo, não o defeito.
        if (!/router\.push|window\.location/.test(t)) continue;
        if (nivel(t) >= nSet) {
          achado(arq, i + 1, "espera-solta-antes-do-fim",
            "solta o estado de espera no mesmo nível da navegação — entre soltar e a página nova aparecer, a tela fica parada com o botão pronto para clicar de novo.");
        }
        break;
      }
    }

    // (b) navega depois de esperar a rede, sem nunca marcar espera
    if (/router\.push/.test(txt) && /await\s/.test(txt)) {
      const temEspera = ESPERA.test(txt) || /useTransition\(/.test(txt);
      if (!temEspera) {
        const nLinha = linhas.findIndex((l) => /router\.push/.test(l)) + 1;
        if (!dispensado(linhas, nLinha - 1)) {
          achado(arq, nLinha, "espera-solta-antes-do-fim",
            "espera a rede e navega sem nenhum indicador — nada na tela diz que algo está acontecendo.");
        }
      }
    }
  }
}

/* ───────────────────────────────────────────────── REGRA 6
   GRAVOU NO NAVEGADOR E NÃO AVISOU O SERVIDOR.

   Relato real: "coloquei dados do escritório e ele não executou a primeira
   atividade do onboarding". Os dados ESTAVAM salvos no banco. O que não
   aconteceu foi o `/painel` — server component — recalcular. Ele havia
   derivado "escritório identificado?" no render anterior e continuou servindo
   do cache. Para quem usa, o sistema simplesmente ignorou o que foi digitado.

   Quem grava pelo cliente Supabase do navegador precisa chamar
   router.refresh(): é o que invalida o cache das rotas de servidor. */
{
  for (const arq of arquivos) {
    const txt = fs.readFileSync(arq, "utf8");
    const linhas = txt.split("\n");
    const grava = /\.from\("[^"]+"\)\s*\.\s*(update|insert|upsert|delete)\(/.exec(txt);
    if (!grava) continue;
    if (/router\.refresh|useTransition\(/.test(txt)) continue;
    const nLinha = txt.slice(0, grava.index).split("\n").length;
    if (dispensado(linhas, nLinha - 1)) continue;
    achado(arq, nLinha, "gravou-sem-avisar-servidor",
      `${grava[1]} no banco pelo navegador sem router.refresh() — as telas de servidor seguem mostrando o valor antigo.`);
  }
}

/* ───────────────────────────────────────────────────────── relatório */
/* ═══ 7 · MAPA INDEXADO POR DADO DO BANCO, SEM `?.` ═══════════════════════
 *
 * `EXPLICA_FAIXA[l.faixa].oQueE` derrubou o cockpit inteiro em 08/08/2026 com
 * "Application error: a client-side exception has occurred" — a tela em branco
 * que não volta nem recarregando, no meio de um deploy de produção.
 *
 * A chave vinha do BANCO, e banco devolve o que quiser: `null` numa empresa
 * antiga, uma faixa nova amanhã. O TypeScript não pega, porque o tipo declarado
 * promete o que o dado não garante. Um `?.` teria custado dois caracteres.
 *
 * Procura MAPA_MAIÚSCULO[algo.dinamico].propriedade sem interrogação. Índice
 * literal (`X["a"]`) e com `?.` passam.
 */
{
  const PADRAO = /\b([A-Z][A-Z0-9_]{3,})\[\s*([a-z][\w.]*)\s*\]\s*\.\s*(\w+)/g;
  for (const arq of arquivos) {
    const linhas = fs.readFileSync(arq, "utf8").split("\n");
    linhas.forEach((linha, i) => {
      if (/^\s*(\*|\/\/)/.test(linha)) return;
      for (const m of linha.matchAll(PADRAO)) {
        if (dispensado(linhas, i)) continue;
        achado(
          arq,
          i + 1,
          "mapa-sem-guarda",
          `${m[1]}[${m[2]}].${m[3]} — chave que não existe derruba a tela inteira. Use ${m[1]}[${m[2]}]?.${m[3]}`
        );
      }
    });
  }
}

const porRegra = {};
for (const a of achados) (porRegra[a.regra] ??= []).push(a);

console.log(`\nAUDITORIA DE UX — ${arquivos.length} arquivos de tela\n`);

const REGRAS = {
  "efeito-longe-do-clique": "Efeito do clique fora do campo de visão",
  "desabilitado-sem-motivo": "Botão desabilitado sem explicação",
  "rede-sem-espera": "Ação de rede sem estado de espera",
  "erro-engolido": "Erro engolido pela interface",
  "espera-solta-antes-do-fim": "Espera que termina antes do efeito",
  "gravou-sem-avisar-servidor": "Gravou no banco e não invalidou a tela",
  "mapa-sem-guarda": "Mapa indexado por dado do banco, sem `?.`",
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
