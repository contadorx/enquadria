/**
 * CSV da carteira — parse e mapeamento de colunas.
 *
 * O contador exporta a carteira de sistemas diferentes, então os cabeçalhos
 * variam. Em vez de exigir um formato rígido (que ele não vai seguir), a gente
 * reconhece as colunas por sinônimos e aceita o mínimo: CNPJ e razão social.
 * Todo o resto — CNAE, porte, situação — a gente enriquece contra a Receita.
 */

import Papa from "papaparse";
import { normalizarCnpj, cnpjValido } from "./cnpj";

export interface LinhaCarteira {
  cnpj: string;
  razao_social: string;
  cnae_principal?: string;
  porte?: string;
  situacao?: string;
  regime?: string;
  anexo?: number;
  faturamento_faixa?: string;
  /** RBT12 em R$ (receita bruta dos 12 meses) — base da alíquota efetiva */
  rbt12?: number;
  /** quem assina o termo pela empresa */
  contato_nome?: string;
  /** para onde vai o link de assinatura */
  contato_email?: string;
  contato_telefone?: string;
}

/** aceita o e-mail só se parecer e-mail — lixo na coluna não vira convite errado */
export function emailValido(bruto?: string | null): string | undefined {
  const s = (bruto || "").trim().toLowerCase();
  if (!s) return undefined;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? s : undefined;
}

/**
 * O NÚMERO SEM O CORTE — separado de `parseValorBRL` em 08/08/2026.
 *
 * O corte de R$ 1.000 continua onde estava e pelo mesmo motivo: ele é o que
 * impede um rótulo de faixa ("3", "2 a 4") de virar receita. O que faltava era
 * a TELA saber por que o valor foi recusado. Antes, quem exporta faturamento em
 * milhares ("480" para R$ 480.000) subia a carteira inteira, nenhuma linha
 * virava RBT12 e a única frase que aparecia era "Nenhuma linha trouxe RBT12" —
 * que descreve o resultado e esconde a causa.
 *
 * Com a normalização isolada aqui, `pareceValorEmMilhares` reconhece o caso sem
 * repetir a lógica de vírgula e milhar, e sem afrouxar a regra do parser.
 */
function numeroBRL(bruto?: string | null): number | undefined {
  if (!bruto) return undefined;
  let s = String(bruto).trim();
  // rótulos de faixa e percentuais não são RBT12
  if (/%|mi\b|milh|acima|até|ate|entre|\ba\b/i.test(s)) return undefined;
  s = s.replace(/r\$|\s/gi, "");
  if (s.includes(",")) {
    // vírgula é decimal no padrão BR → pontos são milhar
    s = s.replace(/\./g, "").replace(",", ".");
  } else if ((s.match(/\./g) || []).length > 1) {
    // vários pontos → todos milhar
    s = s.replace(/\./g, "");
  } else if (/\.\d{3}$/.test(s)) {
    // um ponto seguido de 3 dígitos → milhar (450.000)
    s = s.replace(/\./g, "");
  }
  const n = Number(s.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Interpreta um valor monetário BR ("1.200.000,00", "R$ 450000", "1200000")
 * como número. Devolve undefined para rótulos de faixa ("3,6mi", "acima",
 * "20–40%") ou qualquer coisa abaixo de R$ 1.000 — que não é RBT12 real.
 */
export function parseValorBRL(bruto?: string | null): number | undefined {
  const n = numeroBRL(bruto);
  return n !== undefined && n >= 1000 ? n : undefined;
}

/**
 * O valor é número de verdade, só que pequeno demais para ser RBT12 — o sinal
 * de planilha escrita em milhares. Serve só para a tela explicar a recusa; a
 * regra de aceitação não muda, porque multiplicar por mil no chute gravaria
 * receita inventada no laudo.
 */
export function pareceValorEmMilhares(bruto?: string | null): boolean {
  const n = numeroBRL(bruto);
  return n !== undefined && n > 0 && n < 1000;
}

/**
 * A LINHA QUE NÃO ENTROU, COM NOME — conserto de 08/08/2026.
 *
 * `descartadas` e `duplicadas` eram só números, e número não devolve cliente:
 * a tela dizia "2 descartadas" sobre uma carteira de 300 empresas e o contador
 * não tinha como saber QUAIS duas ficaram de fora. Ele descobria semanas depois,
 * quando um cliente não aparecia na fila — se descobrisse.
 *
 * Guardamos o CNPJ COMO VEIO no arquivo (não o normalizado): é assim que ele
 * vai procurar a linha na planilha dele. A razão social pode estar vazia, e por
 * isso vem como `null` em vez de string vazia — quem mostra decide o rótulo.
 */
export interface LinhaRejeitada {
  motivo: "cnpj_invalido" | "duplicada";
  /** o valor da coluna de CNPJ exatamente como estava no arquivo */
  cnpj_bruto: string;
  /** null quando a linha não trouxe razão social */
  razao_social: string | null;
}

/** teto do que a lista guarda — a CONTAGEM continua exata, só a lista para */
const MAX_REJEITADAS = 50;

export interface ResultadoParse {
  linhas: LinhaCarteira[];
  descartadas: number;
  duplicadas: number;
  /** quem foi descartado e por quê (limitado a 50 itens; os contadores são exatos) */
  rejeitadas: LinhaRejeitada[];
  /** problemas de formato que o papaparse relatou, já em português */
  erros_leitura: string[];
  /** linhas em que a coluna de receita trouxe algo e nada virou RBT12 */
  rbt12_recusados: number;
  /** dentre os recusados, os que são número abaixo de mil (planilha em milhares) */
  rbt12_em_milhares: number;
  total_lidas: number;
  colunas_reconhecidas: Partial<Record<keyof LinhaCarteira, string>>;
  colunas_ignoradas: string[];
}

/**
 * `parsed.errors` NUNCA ERA LIDO — conserto de 08/08/2026.
 *
 * O papaparse relata aspas abertas e não fechadas, linha com menos ou mais
 * colunas que o cabeçalho e separador indecifrável. O código descartava tudo
 * isso: uma aspa solta na razão social engole o resto do arquivo dentro de um
 * campo só, o parse "termina bem", e a carteira de 300 empresas chega com 40 —
 * sem uma palavra na tela. O contador conclui que o produto perdeu a carteira.
 *
 * A mensagem do papaparse é em inglês e cita o índice da linha de DADOS
 * (0-based). Aqui ela vira português e vira NÚMERO DE LINHA DO ARQUIVO, que é o
 * que ele vê ao abrir a planilha: o cabeçalho é a linha 1, então a linha de
 * dados 0 é a linha 2.
 */
const ERROS_PARSE: Record<string, string> = {
  MissingQuotes:
    "há aspas abertas e não fechadas — daqui em diante o arquivo entrou todo dentro de um campo só",
  InvalidQuotes: "há aspas fora de lugar no meio de um campo",
  TooFewFields: "esta linha tem menos colunas que o cabeçalho",
  TooManyFields:
    "esta linha tem mais colunas que o cabeçalho — costuma ser vírgula dentro de um campo sem aspas",
  UndetectableDelimiter:
    "não identifiquei o separador das colunas (vírgula, ponto e vírgula ou tabulação)",
};

/** o que basta para traduzir; não depende do tipo interno do papaparse */
interface ErroDeLeitura {
  code?: string;
  message?: string;
  row?: number;
  index?: number;
}

export function traduzirErrosParse(erros: ErroDeLeitura[], fonte = ""): string[] {
  const vistos = new Set<string>();
  const fora: string[] = [];
  /* `row` conta linhas de DADOS e, no caso das aspas abertas, aponta para
     DEPOIS do estrago — o campo engoliu as linhas seguintes, então a próxima
     linha de dados é a última. Quando o papaparse informa a posição exata em
     caracteres (`index`), contar as quebras até ali dá a linha de verdade, que
     é a que ele vai abrir na planilha. */
  const porIndice = (i?: number) =>
    typeof i === "number" && i >= 0 && i <= fonte.length && fonte.length > 0
      ? fonte.slice(0, i).split("\n").length
      : null;
  for (const e of erros ?? []) {
    const texto =
      (e.code && ERROS_PARSE[e.code]) ||
      "o arquivo não está no formato de tabela nesta altura";
    const linha =
      (e.code === "MissingQuotes" || e.code === "InvalidQuotes" ? porIndice(e.index) : null) ??
      (typeof e.row === "number" ? e.row + 2 : null);
    const msg = linha ? `Linha ${linha}: ${texto}.` : `${texto[0].toUpperCase()}${texto.slice(1)}.`;
    if (vistos.has(msg)) continue;
    vistos.add(msg);
    fora.push(msg);
  }
  /* quatro exemplos e a contagem do resto: arquivo desalinhado gera um erro por
     linha, e mil avisos iguais escondem o primeiro, que é o que importa */
  if (fora.length > 4) {
    const resto = fora.length - 4;
    return [...fora.slice(0, 4), `E mais ${resto} ${resto === 1 ? "linha" : "linhas"} com problema.`];
  }
  return fora;
}

const SINONIMOS: Record<keyof LinhaCarteira, string[]> = {
  cnpj: ["cnpj", "cnpj/cpf", "documento", "cnpjcpf", "inscricao"],
  razao_social: ["razao social", "razao", "nome", "empresa", "razaosocial", "nome empresarial", "cliente"],
  cnae_principal: ["cnae", "cnae principal", "cnae fiscal", "atividade", "cnaeprincipal", "cnae_principal"],
  porte: ["porte", "porte empresa", "porte da empresa"],
  situacao: ["situacao", "situacao cadastral", "status"],
  /* 07/08/2026, primeira carteira real: os sistemas n\u00e3o exportam "regime" \u2014
     exportam "Optante pelo Simples", "Situa\u00e7\u00e3o Simples Nacional", "Op\u00e7\u00e3o
     Simples". Sem estes sin\u00f4nimos a coluna ca\u00eda em `situacao` (valor
     "Optante" \u2192 FORA) ou era ignorada (o "N\u00e3o" do Presumido se perdia e a
     empresa entrava na fila como optante). */
  regime: [
    "regime", "regime tributario", "tributacao", "enquadramento",
    "simples nacional", "optante pelo simples", "optante simples",
    "opcao pelo simples", "opcao simples", "situacao simples", "optante",
    "simples", "sn",
  ],
  anexo: ["anexo", "anexo simples"],
  faturamento_faixa: ["faturamento", "faixa faturamento", "receita", "rbt12", "faturamento 12m"],
  rbt12: ["rbt 12", "receita bruta 12 meses", "receita bruta acumulada", "receita bruta", "faturamento anual", "faturamento 12 meses", "rbt12 valor"],
  contato_nome: ["contato", "responsavel", "socio", "nome do contato", "nome contato", "representante", "signatario"],
  contato_email: ["email", "e-mail", "email contato", "e-mail do contato", "email responsavel", "mail"],
  contato_telefone: ["telefone", "celular", "whatsapp", "fone", "tel"],
};

const semAcento = (s: string) =>
  (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

/**
 * O SIN\u00d4NIMO MAIS ESPEC\u00cdFICO VENCE \u2014 n\u00e3o o primeiro campo declarado.
 *
 * A vers\u00e3o anterior percorria os campos em ordem fixa, e "Situa\u00e7\u00e3o Simples
 * Nacional" casava `situacao` (declarado antes de `regime`): a coluna inteira
 * ia para o campo errado e a triagem lia "Optante" como situa\u00e7\u00e3o cadastral.
 * Ordenando os pares por comprimento do sin\u00f4nimo, "situacao simples" (16)
 * vence "situacao" (8), "anexo simples" vence "simples", e a ordem de
 * declara\u00e7\u00e3o deixa de ser uma armadilha.
 *
 * Sin\u00f4nimo de at\u00e9 3 letras ("sn") s\u00f3 casa por IGUALDADE: por `includes`,
 * duas letras dentro de qualquer palavra virariam mapeamento falso.
 */
const PARES = Object.entries(SINONIMOS)
  .flatMap(([campo, nomes]) => nomes.map((n) => ({ campo: campo as keyof LinhaCarteira, n })))
  .sort((a, b) => b.n.length - a.n.length);

/**
 * A PALAVRA "ANEXO" DECIDE ANTES DE QUALQUER SINÔNIMO — conserto de 08/08/2026.
 *
 * "Anexo Simples Nacional" é o cabeçalho mais comum de export contábil, e ele
 * casava `regime`: "simples nacional" tem 16 caracteres e vencia "anexo
 * simples", de 13. A coluna com os valores 1..5 ia para o campo de REGIME, e
 * `leRegime("3")` devolvia "fora" — a carteira inteira de Anexo II a V sumia
 * da fila rotulada "Empresa já fora do Simples", em silêncio, e a rede do
 * importador não disparava porque ela só acende acima de 80% de FORA (o Anexo
 * I continuava entrando como optante).
 *
 * Ordenar por comprimento resolve colisões entre sinônimos parecidos, mas não
 * resolve esta: qualquer sinônimo de regime que apareça DENTRO do nome da
 * coluna de anexo vence pelo tamanho. Aqui a regra é semântica, não métrica —
 * cabeçalho que começa com "anexo" é anexo, e ponto.
 */
/**
 * A COLUNA QUE PARECE OUTRA — conserto de 08/08/2026.
 *
 * Três colisões de sinônimo, todas caladas, todas com o mesmo formato: o
 * cabeçalho CONTÉM a palavra certa e significa outra coisa. Comprimento de
 * string não resolve nenhuma delas — o que resolve é dizer o que a palavra
 * seguinte faz com o sentido, como já se faz com "anexo".
 *
 *  · "Inscrição Estadual" e "Inscrição Municipal" casavam `cnpj` pelo sinônimo
 *    "inscricao". Se a IE viesse ANTES do CNPJ no arquivo, ela ficava com a
 *    vaga: todo CNPJ era inválido, a carteira inteira caía como descartada e —
 *    o pior — `colunas_reconhecidas.cnpj` EXISTIA, então o erro específico
 *    ("não encontrei a coluna de CNPJ") não disparava e o contador lia a
 *    mensagem errada, mandando conferir os documentos que estavam certos.
 *
 *  · "Nome Fantasia" casava `razao_social` pelo sinônimo "nome". O nome
 *    fantasia não tem valor jurídico, e ia parar na CAPA DO LAUDO e no termo
 *    que o cliente assina. Ignorá-lo é melhor do que usá-lo mesmo quando é a
 *    única coluna de nome: sem razão social, o campo vem da Receita ao
 *    confirmar, que é a fonte certa para um documento assinado.
 *
 *  · "Contador Responsável" casava `contato_nome` pelo sinônimo "responsavel".
 *    O signatário do termo do cliente virava o próprio contador — o documento
 *    saía com a pessoa errada assinando pela empresa.
 *
 * VETO NÃO É REMAPEAMENTO: a coluna vetada fica FORA do mapa e aparece na lista
 * "colunas do arquivo que não usei", na tela. Visível e ignorada é melhor que
 * mapeada e errada, que é exatamente o defeito que estamos consertando.
 */
const VETOS: Partial<Record<keyof LinhaCarteira, RegExp>> = {
  cnpj: /\b(estadual|municipal|suframa)\b/,
  razao_social: /\bfantasia\b/,
  contato_nome: /\b(contador|contadora|contabil|escritorio)/,
};

function casarColuna(cabecalho: string): keyof LinhaCarteira | null {
  const h = semAcento(cabecalho);
  if (/^anexo\b/.test(h)) return "anexo";
  for (const { campo, n } of PARES) {
    if (h === n || (n.length > 3 && h.includes(n))) {
      const veto = VETOS[campo];
      return veto && veto.test(h) ? null : campo;
    }
  }
  return null;
}

/**
 * O anexo vem como "3", "Anexo III", "ANEXO V" ou "III". Só dígito perdia os
 * romanos e caía no chute por CNAE, calado.
 */
const ROMANOS: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5 };

export function parseAnexo(bruto?: string | null): number | undefined {
  const v = semAcento(bruto ?? "");
  if (!v) return undefined;
  const digitos = v.replace(/\D/g, "");
  if (digitos) {
    const n = parseInt(digitos, 10);
    return n >= 1 && n <= 5 ? n : undefined;
  }
  /* a palavra "anexo" sai ANTES da leitura do romano: o "x" dela é algarismo
     romano e transformava "Anexo III" em "xiii" */
  const romano = v.replace(/anexo/g, " ").replace(/[^iv]/g, "");
  return ROMANOS[romano];
}

export function parsearCarteira(texto: string): ResultadoParse {
  const parsed = Papa.parse<Record<string, string>>(texto, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const cabecalhos = parsed.meta.fields ?? [];
  const mapa: Partial<Record<keyof LinhaCarteira, string>> = {};
  const ignoradas: string[] = [];

  for (const h of cabecalhos) {
    const campo = casarColuna(h);
    if (campo && !mapa[campo]) mapa[campo] = h;
    else ignoradas.push(h);
  }

  const vistos = new Set<string>();
  const linhas: LinhaCarteira[] = [];
  const rejeitadas: LinhaRejeitada[] = [];
  let descartadas = 0;
  let duplicadas = 0;
  let rbt12Recusados = 0;
  let rbt12EmMilhares = 0;

  const pega = (row: Record<string, string>, campo: keyof LinhaCarteira) => {
    const col = mapa[campo];
    return col ? (row[col] ?? "").trim() : "";
  };

  /** guarda o nome da linha perdida enquanto ainda dá para saber qual era */
  const anotarRejeitada = (
    row: Record<string, string>,
    cnpjBruto: string,
    motivo: LinhaRejeitada["motivo"]
  ) => {
    if (rejeitadas.length >= MAX_REJEITADAS) return;
    rejeitadas.push({
      motivo,
      cnpj_bruto: cnpjBruto,
      razao_social: pega(row, "razao_social") || null,
    });
  };

  for (const row of parsed.data) {
    const cnpjBruto = pega(row, "cnpj");
    if (!cnpjValido(cnpjBruto)) {
      descartadas++;
      anotarRejeitada(row, cnpjBruto, "cnpj_invalido");
      continue;
    }
    const cnpj = normalizarCnpj(cnpjBruto);
    if (vistos.has(cnpj)) {
      duplicadas++;
      anotarRejeitada(row, cnpjBruto, "duplicada");
      continue;
    }
    vistos.add(cnpj);

    const anexo = parseAnexo(pega(row, "anexo"));

    const fatRaw = pega(row, "faturamento_faixa");
    const rbtRaw = pega(row, "rbt12");
    const rbt12 = parseValorBRL(rbtRaw) ?? parseValorBRL(fatRaw);

    /* a coluna trouxe alguma coisa e nada virou receita: a tela precisa saber
       distinguir "o arquivo não tem RBT12" de "o arquivo tem e eu recusei" */
    if (rbt12 === undefined && (rbtRaw || fatRaw)) {
      rbt12Recusados++;
      if (pareceValorEmMilhares(rbtRaw) || pareceValorEmMilhares(fatRaw)) rbt12EmMilhares++;
    }

    linhas.push({
      cnpj,
      razao_social: pega(row, "razao_social") || "(sem razão social)",
      cnae_principal: pega(row, "cnae_principal") || undefined,
      porte: pega(row, "porte") || undefined,
      situacao: pega(row, "situacao") || undefined,
      regime: pega(row, "regime") || undefined,
      anexo,
      faturamento_faixa: fatRaw || rbtRaw || undefined,
      rbt12,
      contato_nome: pega(row, "contato_nome") || undefined,
      contato_email: emailValido(pega(row, "contato_email")),
      contato_telefone: pega(row, "contato_telefone") || undefined,
    });
  }

  return {
    linhas,
    descartadas,
    duplicadas,
    rejeitadas,
    erros_leitura: traduzirErrosParse(parsed.errors ?? [], texto),
    rbt12_recusados: rbt12Recusados,
    rbt12_em_milhares: rbt12EmMilhares,
    total_lidas: parsed.data.length,
    colunas_reconhecidas: mapa,
    colunas_ignoradas: ignoradas,
  };
}

/**
 * CNPJs COLADOS → lista limpa.
 *
 * Serve ao caminho "cole a lista" da importação, que existe porque o export do
 * sistema é o maior ponto de abandono do produto. O texto colado vem sujo: de
 * planilha (com tabulação e o nome da empresa junto), de WhatsApp, de PDF.
 *
 * A EXTRAÇÃO É POR TOKEN, NÃO POR BUSCA NO TEXTO INTEIRO. A primeira versão
 * procurava o padrão do CNPJ com uma expressão que aceitava espaço no meio;
 * como quebra de linha é espaço, ela emendava os documentos de linhas seguidas
 * num número de 42 dígitos e descartava tudo — justamente no caso mais comum,
 * um CNPJ por linha. Partindo o texto por qualquer caractere que não caiba
 * dentro de um CNPJ, cada token é avaliado sozinho: CPF (11 dígitos),
 * telefone, data e valor em reais caem fora pelo tamanho, sem precisar de uma
 * regra especial para cada um.
 *
 * ACEITA ALFANUMÉRICO. Partir o texto em `[^\d.\-/]` quebrava no meio de um
 * CNPJ com letra: "PC3D315K000193" virava os tokens "3", "315" e "000193" e
 * sumia inteiro. Agora a letra faz parte do token, e o filtro exige o formato
 * — 12 alfanuméricas + 2 dígitos — o que já derruba a palavra de 14 letras
 * que venha arrastada junto de uma planilha.
 *
 * Não valida dígito verificador de propósito — quem faz isso é o parser, e é
 * lá que o contador vê quantos foram descartados.
 */
export function extrairCnpjs(texto: string): string[] {
  return (texto || "")
    .toUpperCase()
    .split(/[^0-9A-Z.\-/]+/)
    .map((s) => s.replace(/[^0-9A-Z]/g, ""))
    .filter((s) => /^[0-9A-Z]{12}\d{2}$/.test(s));
}

/** monta o CSV de uma coluna que o parser já sabe ler */
export function csvDeCnpjs(cnpjs: string[]): string {
  return "cnpj\n" + cnpjs.join("\n");
}

/**
 * O PRIMEIRO CASO — uma empresa só, para quem quer ver funcionando antes de
 * usar dado de cliente real.
 *
 * A hesitação apareceu literal numa conversa de WhatsApp (05-06/08/2026): a
 * pessoa criou a conta e parou antes de colar o CNPJ de um cliente. Não é
 * desconfiança do produto — é que subir a carteira é entregar o ativo do
 * escritório a um sistema que ela ainda não viu funcionar.
 *
 * Um caso só, e não a carteira de exemplo, por um motivo: a promessa aqui é
 * "veja o fluxo INTEIRO em dois minutos", e fluxo inteiro é uma empresa até o
 * laudo. Três empresas viram uma lista para triar, que é outro assunto.
 *
 * É a MESMA empresa do vídeo de demonstração e da massa de teste. Coerência
 * entre o que o vídeo mostra e o que o produto oferece não é capricho: quem
 * assiste e depois clica espera reconhecer a tela.
 */
export const CSV_PRIMEIRO_CASO = `cnpj,razao_social,cnae_principal,porte,regime,rbt12,contato,email
50.100.002/0001-20,Metalúrgica Ponte Nova Ltda (exemplo),2599-3/99,EPP,Simples Nacional,3400000,Sônia Ferraz (exemplo),exemplo@enquadria.com.br`;

export const CSV_EXEMPLO = `cnpj,razao_social,cnae_principal,porte,regime,rbt12,contato,email
11.222.333/0001-81,Distribuidora Aurora Autopeças Ltda,4649-4/08,EPP,Simples Nacional,480000,Marcos Aurélio,marcos@aurora.com.br
07.526.557/0001-00,Casa Nova Restaurante ME,5611-2/01,ME,Simples Nacional,220000,Helena Prado,helena@casanova.com.br
22.333.444/0001-81,Transportes Vale Verde Ltda,4930-2/02,EPP,Simples Nacional,1200000,Jorge Valle,jorge@valeverde.com.br`;


/**
 * DECODIFICAR O ARQUIVO — antes de qualquer parse.
 *
 * `File.text()` decodifica SEMPRE como UTF-8. O Excel em portugues exporta CSV
 * em Windows-1252 por padrao, e o resultado e silencioso e caro: a razao social
 * chega com acento corrompido e e ASSIM que vai para o banco, para o laudo e
 * para o termo que o cliente assina.
 *
 * Silencioso e a palavra: nada falha, nada avisa. O contador so descobre quando
 * o cliente recebe um documento com o nome da propria empresa errado.
 *
 * A deteccao e por TENTATIVA, nao por adivinhacao:
 *
 *  1. BOM de UTF-8 -> e UTF-8, remove o BOM e decodifica.
 *  2. Sem BOM -> tenta UTF-8 em modo ESTRITO. Texto latin1 com acento produz
 *     sequencia invalida em UTF-8 e o decoder lanca — e o sinal que precisamos.
 *  3. Falhou -> Windows-1252, que cobre o que o Excel brasileiro gera.
 *
 * A ordem importa: todo texto latin1 SEM acento tambem e UTF-8 valido, e nesse
 * caso as duas decodificacoes dao o mesmo resultado. Elas so divergem onde ha
 * acento, que e exatamente onde a deteccao precisa acertar.
 */
export function decodificarCsv(bytes: ArrayBuffer): { texto: string; codificacao: string } {
  const arr = new Uint8Array(bytes);

  if (arr.length >= 3 && arr[0] === 0xef && arr[1] === 0xbb && arr[2] === 0xbf) {
    return {
      texto: new TextDecoder("utf-8").decode(arr.subarray(3)),
      codificacao: "utf-8 (com BOM)",
    };
  }

  try {
    const texto = new TextDecoder("utf-8", { fatal: true }).decode(arr);
    return { texto, codificacao: "utf-8" };
  } catch {
    return {
      texto: new TextDecoder("windows-1252").decode(arr),
      codificacao: "windows-1252 (Excel)",
    };
  }
}

/**
 * Sobrou acento corrompido?
 *
 * Rede de seguranca para o arquivo que JA chega danificado da origem — ai nao
 * ha decodificacao que conserte, porque o estrago aconteceu antes. Detectar e
 * AVISAR e tudo o que da para fazer, e e melhor que gravar calado.
 *
 * As sequencias procuradas sao o resultado de ler UTF-8 como latin1. Nenhuma
 * delas aparece em portugues escrito corretamente.
 */
export function pareceMojibake(texto: string): boolean {
  return /\u00C3[\u00A0-\u00BF]|\u00C2[\u00A0-\u00BF]|\uFFFD/.test(texto);
}


/**
 * PLANILHA DO EXCEL -> o mesmo texto CSV que o parser ja sabe ler.
 *
 * O contador vive no Excel. Exigir "Salvar como CSV UTF-8" antes de subir a
 * carteira e transferir para ele um problema de codificacao que e nosso — e
 * cada passo a mais na importacao e uma empresa que fica sem ser analisada.
 *
 * A conversao passa pelo CSV de proposito, em vez de produzir linhas direto:
 * assim existe UM parser, com UM conjunto de regras de sinonimo de coluna e de
 * validacao de CNPJ. Dois caminhos de leitura divergem na primeira correcao.
 *
 * `raw: false` faz o SheetJS entregar o valor JA formatado como a celula
 * aparece na tela. Sem isso, CNPJ armazenado como numero volta em notacao
 * cientifica e RBT12 volta com 14 casas decimais.
 */
export async function planilhaParaCsv(bytes: ArrayBuffer): Promise<string> {
  const XLSX = await import("xlsx");
  const livro = XLSX.read(bytes, { type: "array", cellDates: false });

  const primeira = livro.SheetNames[0];
  if (!primeira) throw new Error("A planilha não tem nenhuma aba.");

  /**
   * `raw: true` e a conversao feita AQUI, nao pelo SheetJS.
   *
   * O caminho obvio (`sheet_to_csv`) respeita o FORMATO da celula, e o Excel
   * guarda CNPJ como numero: 07526557000100 volta como "7.52656E+12". O parser
   * entao descarta a linha como CNPJ invalido, e o contador ve "1 descartada"
   * sem entender por que.
   *
   * Lendo o valor bruto, `String(7526557000100)` devolve os digitos. Um CNPJ
   * tem 14 digitos (~1e13) e o inteiro seguro do JavaScript vai ate 9e15 — nao
   * ha perda de precisao nesta faixa.
   */
  const linhas = XLSX.utils.sheet_to_json<unknown[]>(livro.Sheets[primeira], {
    header: 1,
    raw: true,
    blankrows: false,
  });

  const celula = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    // inteiro vira digito puro; decimal mantem o ponto (RBT12 com centavos)
    const texto = typeof v === "number" ? (Number.isInteger(v) ? String(v) : String(v)) : String(v);
    // aspas duplas ao redor so quando necessario, no padrao CSV
    return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };

  return linhas.map((l) => (l ?? []).map(celula).join(",")).join("\n");
}

/** Reconhece pela extensão — é o que o contador enxerga. */
export function ehPlanilha(nome: string): boolean {
  return /\.(xlsx|xlsm|xls)$/i.test((nome ?? "").trim());
}
