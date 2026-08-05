#!/usr/bin/env node
/**
 * CONFERIDOR DE PARTILHA — a checagem que pegou a resposta inventada.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * POR QUE ISTO EXISTE.
 *
 * Em 05/08/2026 uma consulta normativa devolveu tabelas de partilha do Simples
 * para 2027 que pareciam impecáveis. Duas contas de dez segundos derrubaram:
 *
 *   1. a partilha do Anexo XVIII faixa 6 somava 85,40%, e toda linha de
 *      partilha do Simples soma 100%;
 *   2. a razão IBS/(CBS+IBS) dava 17,8% em todos os anexos — que é a razão
 *      PIS/(Cofins+PIS) de hoje. Ou seja: as colunas antigas tinham sido
 *      renomeadas. Nas faixas conferidas em fonte oficial essa razão é ~1,1%,
 *      coerente com IBS de 0,1% contra CBS de ~8,7%.
 *
 * O problema não é a resposta ter errado. É que ela CONFIRMAVA exatamente o que
 * o produto já usava — e confirmação falsa do que se quer ouvir é o único tipo
 * de erro que ninguém procura.
 *
 * Daí esta ferramenta. Toda resposta normativa que traga números de partilha
 * passa por aqui ANTES de virar linha de código ou frase de laudo.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * COMO USAR
 *
 *   node ferramentas/conferir-partilha.mjs                → autoteste
 *   node ferramentas/conferir-partilha.mjs resposta.json  → confere um arquivo
 *
 * Sem argumento ele roda o autoteste, que TEM de acusar 4 reprovações e sair
 * com código 1. Desligar qualquer trava faz o autoteste gritar.
 *
 * A única coisa que o autoteste não consegue guardar é o próprio código de
 * saída — um script não testa o `exit` de si mesmo. Se mexer nessa parte,
 * confira à mão:
 *
 *   node ferramentas/conferir-partilha.mjs > /dev/null; test $? -eq 1 && echo ok
 *
 * (a primeira versão imprimia "2 reprovadas" e saía com 0 — verde no script,
 *  vermelho na tela. Foi assim que apareceu.)
 *
 * O JSON é uma lista de linhas de partilha:
 *
 *   [{ "anexo": "XVIII", "faixa": 6,
 *      "IRPJ": 5.50, "CSLL": 3.50, "CBS": 28.27, "IBS": 6.13, "CPP": 42.00 }]
 *
 * Chaves aceitas: IRPJ, CSLL, Cofins, PIS, CBS, IBS, CPP, IPI, ICMS, ISS.
 * Sai com código 1 se qualquer linha reprovar — dá para pôr em script.
 */

import fs from "node:fs";

/* a razão esperada em 2027-2028: IBS 0,1% contra CBS = referência − 0,1 p.p.
   (~8,7%). O valor exato depende da referência que o Senado fixar até
   31/10/2026, então a faixa aceita é generosa de propósito: o que se quer pegar
   é a ordem de grandeza errada (17,8%), não o terceiro decimal. */
const RAZAO_ESPERADA = 0.1 / 8.8;      // ≈ 1,14%
const RAZAO_MIN = 0.005;               // 0,5%
const RAZAO_MAX = 0.030;               // 3,0%
const TOLERANCIA_SOMA = 0.01;          // ponto percentual

const TRIBUTOS = ["IRPJ", "CSLL", "Cofins", "PIS", "CBS", "IBS", "CPP", "IPI", "ICMS", "ISS"];

/** partilha oficial de HOJE (Receita Federal), para flagrar o relabel */
const OFICIAL_FAIXA6 = {
  I:   { IRPJ: 13.5, CSLL: 10.0, Cofins: 28.27, PIS: 6.13, CPP: 42.1 },
  II:  { IRPJ: 8.5, CSLL: 7.5, Cofins: 20.96, PIS: 4.54, CPP: 23.5, IPI: 35.0 },
  III: { IRPJ: 35.0, CSLL: 15.0, Cofins: 16.03, PIS: 3.47, CPP: 30.5 },
  IV:  { IRPJ: 53.5, CSLL: 21.5, Cofins: 20.55, PIS: 4.45 },
  V:   { IRPJ: 35.0, CSLL: 15.5, Cofins: 16.44, PIS: 3.56, CPP: 29.5 },
};
/** os anexos novos e a quem correspondem */
const EQUIVALE = { XVIII: "I", XIX: "II", XX: "III", XXI: "IV", XXII: "V" };

const num = (x) => (typeof x === "number" && isFinite(x) ? x : 0);
const pct = (x, c = 2) => `${(x * 100).toFixed(c).replace(".", ",")}%`;

export function conferir(linha) {
  const rotulo = `Anexo ${linha.anexo ?? "?"} faixa ${linha.faixa ?? "?"}`;
  const achados = [];

  /* ── T1 · a soma ────────────────────────────────────────────────────── */
  const soma = TRIBUTOS.reduce((t, k) => t + num(linha[k]), 0);
  const somaOk = Math.abs(soma - 100) <= TOLERANCIA_SOMA;
  if (!somaOk) {
    achados.push({
      grave: true,
      teste: "soma da partilha",
      diz: `${soma.toFixed(2).replace(".", ",")}%`,
      esperado: "100,00%",
      nota: "toda linha de partilha do Simples soma 100% — se não soma, a linha está errada ou incompleta",
    });
  }

  /* ── T2 · a razão IBS/(CBS+IBS) ─────────────────────────────────────── */
  const cbs = num(linha.CBS), ibs = num(linha.IBS);
  if (cbs > 0 || ibs > 0) {
    const total = cbs + ibs;
    const razao = total > 0 ? ibs / total : 0;
    const dentro = razao >= RAZAO_MIN && razao <= RAZAO_MAX;
    if (!dentro) {
      achados.push({
        grave: true,
        teste: "razão IBS ÷ (CBS+IBS)",
        diz: pct(razao),
        esperado: `entre ${pct(RAZAO_MIN)} e ${pct(RAZAO_MAX)} (referência ${pct(RAZAO_ESPERADA)})`,
        nota:
          razao > 0.1
            ? "razão nessa ordem é a de PIS/(Cofins+PIS) de hoje: as colunas antigas foram RENOMEADAS, não recalculadas"
            : "razão fora da ordem de grandeza de IBS 0,1% contra CBS ~8,7%",
      });
    }
  }

  /**
   * ── o relabel, dito com todas as letras ─────────────────────────────────
   *
   * HONESTIDADE SOBRE ESTA TRAVA: ela é REDUNDANTE por construção. Se CBS e IBS
   * forem a Cofins e o PIS de hoje, a razão acima já reprovou — não existe linha
   * que caia aqui e passe lá. Ela não detecta nada novo.
   *
   * Fica mesmo assim porque diagnóstico não é detecção. "razão fora da faixa"
   * manda conferir; "são exatamente a Cofins e o PIS da tabela de hoje, com
   * outro nome" diz o que aconteceu e encerra a discussão com quem respondeu.
   */
  const eq = EQUIVALE[String(linha.anexo)];
  const of = eq && Number(linha.faixa) === 6 ? OFICIAL_FAIXA6[eq] : null;
  if (of) {
    if (Math.abs(cbs - of.Cofins) < 0.005 && Math.abs(ibs - of.PIS) < 0.005) {
      achados.push({
        grave: true,
        teste: "relabel de coluna",
        diz: `CBS ${cbs} · IBS ${ibs}`,
        esperado: "valores próprios de 2027",
        nota: `são exatamente a Cofins (${of.Cofins}) e o PIS (${of.PIS}) da tabela de hoje, com outro nome`,
      });
    }
    /* as demais colunas não deveriam mudar nas faixas 1-5; na 6 também não há
       motivo declarado para mudarem. Divergência aqui não reprova sozinha, mas
       precisa aparecer. */
    for (const k of ["IRPJ", "CSLL", "CPP", "IPI"]) {
      if (of[k] == null && !linha[k]) continue;
      const a = num(linha[k]), b = num(of[k]);
      if (Math.abs(a - b) > 0.005) {
        achados.push({
          grave: false,
          teste: `coluna ${k}`,
          diz: `${a.toFixed(2)}%`,
          esperado: `${b.toFixed(2)}% (tabela oficial de hoje)`,
          nota: "divergência sem justificativa declarada — peça a fonte",
        });
      }
    }
  }

  return { rotulo, soma, achados, passou: !achados.some((a) => a.grave) };
}

export function relatorio(linhas) {
  let reprovadas = 0;
  console.log("\nCONFERIDOR DE PARTILHA — soma 100% · razão IBS/(CBS+IBS) · relabel\n");
  for (const l of linhas) {
    const r = conferir(l);
    console.log(`${r.passou ? "ok  " : "FALHA"}  ${r.rotulo}  ·  soma ${r.soma.toFixed(2).replace(".", ",")}%`);
    for (const a of r.achados) {
      console.log(`        ${a.grave ? "✗" : "·"} ${a.teste}: diz ${a.diz}, esperado ${a.esperado}`);
      console.log(`          ${a.nota}`);
    }
    if (!r.passou) reprovadas++;
  }
  console.log(
    `\n${linhas.length} linha(s) conferida(s) · ${reprovadas} reprovada(s)` +
      (reprovadas ? "\n\nNÃO use estes números. Peça a fonte, com link que abra.\n" : "\n")
  );
  return reprovadas;
}

/* ── execução direta ──────────────────────────────────────────────────── */
const arquivo = process.argv[2];
if (arquivo) {
  const linhas = JSON.parse(fs.readFileSync(arquivo, "utf8"));
  process.exit(relatorio(Array.isArray(linhas) ? linhas : [linhas]) ? 1 : 0);
} else {
  /**
   * SEM ARGUMENTO, ISTO É O AUTOTESTE — e ele precisa SAIR COM 1.
   *
   * A primeira versão imprimia "2 reprovadas" e saía com 0. Um conferidor que
   * acusa a falha e devolve sucesso ao shell é pior que nenhum: quem puser isto
   * num script vai receber verde. Foi pego quebrando o próprio conferidor de
   * propósito e olhando o `echo $?` — não pela leitura.
   *
   * As linhas abaixo isolam cada trava. Sem isolar, desligar uma trava não muda
   * o veredicto (as linhas de verdade tropeçam em várias ao mesmo tempo) e o
   * teste de sabotagem não prova nada.
   */
  console.log("\n(sem arquivo: autoteste — passe um .json para conferir uma resposta)");
  const reprovadas = relatorio([
    /* o que a resposta de 05/08/2026 afirmou — tropeça em tudo */
    { anexo: "XVIII", faixa: 6, IRPJ: 5.5, CSLL: 3.5, CBS: 28.27, IBS: 6.13, CPP: 42.0 },
    /* soma 100% e mesmo assim é a tabela velha renomeada: só a razão pega */
    { anexo: "XX", faixa: 6, IRPJ: 35.0, CSLL: 15.0, CBS: 16.03, IBS: 3.47, CPP: 30.5 },
    /* ISOLA A SOMA: razão certa (0,15/14,00 = 1,07%), faixa 4, falta o ICMS */
    { anexo: "XIX", faixa: 4, IRPJ: 5.5, CSLL: 3.5, CBS: 13.85, IBS: 0.15, CPP: 37.5, IPI: 7.5 },
    /* ISOLA A RAZÃO: soma 100%, faixa 4 (não dispara o relabel), colunas velhas */
    { anexo: "XVIII", faixa: 4, IRPJ: 5.5, CSLL: 3.5, CBS: 12.74, IBS: 2.76, CPP: 42.0, ICMS: 33.5 },
    /* CONTROLE: faixa conferida em fonte oficial — tem de passar */
    { anexo: "XVIII", faixa: 4, IRPJ: 5.5, CSLL: 3.5, CBS: 15.33, IBS: 0.17, CPP: 42.0, ICMS: 33.5 },
  ]);
  if (reprovadas !== 4) {
    console.log(`AUTOTESTE FALHOU: esperava 4 linhas reprovadas, deu ${reprovadas}.`);
    process.exit(2);
  }
  process.exit(1);
}
