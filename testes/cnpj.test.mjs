/**
 * TESTE DO CNPJ — numérico e ALFANUMÉRICO.
 *
 * O CNPJ alfanumérico entrou em vigor em 31/07/2026 (IN RFB 2.229/2024): as
 * 12 primeiras posições aceitam letra maiúscula, os 2 dígitos verificadores
 * seguem numéricos, e o DV continua módulo 11 — com cada caractere valendo
 * seu código ASCII menos 48.
 *
 * A COBAIA `PC3D315K000193` não foi inventada: é o CNPJ de homologação
 * publicado para os testes da SEFAZ-RS. Se o algoritmo daqui aceita esse e
 * continua aceitando os numéricos reais, ele está certo pelos dois lados.
 *
 * O que este arquivo protege, acima de tudo, é o modo de falha ANTIGO: com
 * `replace(/\D/g, "")` seguido de `padStart(14, "0")`, o CNPJ `PC3D315K000193`
 * virava `00003315000193` — catorze caracteres, formato perfeito, empresa
 * errada. Aceitar calado é pior que recusar, porque vai parar num laudo
 * assinado. Os casos marcados "CORRUPÇÃO" existem por isso.
 *
 * Rodado por testes/rodar-tudo.mjs.
 */

import { limparCnpj, normalizarCnpj, formatarCnpj, mascararCnpj, cnpjValido, ehAlfanumerico } from "./cnpj.js";
import { extrairCnpjs } from "./csv.js";

let f = 0;
const t = (nome, real, esperado) => {
  const bate = JSON.stringify(real) === JSON.stringify(esperado);
  if (!bate) { f++; console.log("FALHOU:", nome, JSON.stringify({ esperado, veio: real })); }
  else console.log("ok:", nome);
};

/* ── válidos: alfanuméricos ─────────────────────────────────────────── */
t("SEFAZ-RS PC3D315K000193 é válido", cnpjValido("PC3D315K000193"), true);
t("com pontuação também", cnpjValido("PC.3D3.15K/0001-93"), true);
t("minúscula é aceita e normalizada", cnpjValido("pc3d315k000193"), true);
t("reconhece como alfanumérico", ehAlfanumerico("PC3D315K000193"), true);

/* ── válidos: numéricos (a regra nova é superconjunto da antiga) ────── */
t("11222333000181 continua válido", cnpjValido("11.222.333/0001-81"), true);
t("07526557000100 continua válido", cnpjValido("07.526.557/0001-00"), true);
t("22333444000181 continua válido", cnpjValido("22.333.444/0001-81"), true);
// o modelo de CSV do produto trazia 22.333.444/0001-55, que tem DV errado: o
// contador baixava o exemplo e a terceira linha vinha "descartada". Corrigido
// em lib/csv.ts e em components/Importador.tsx; este caso trava a volta.
t("o CNPJ errado que estava no modelo é recusado", cnpjValido("22.333.444/0001-55"), false);
t("numérico não é alfanumérico", ehAlfanumerico("11222333000181"), false);

/* ── inválidos ──────────────────────────────────────────────────────── */
t("DV errado no alfanumérico", cnpjValido("PC3D315K000194"), false);
t("DV errado no numérico", cnpjValido("11222333000182"), false);
t("catorze iguais", cnpjValido("11111111111111"), false);
t("catorze letras iguais", cnpjValido("AAAAAAAAAAAAAA"), false);
t("curto demais", cnpjValido("PC3D315K00019"), false);
t("letra no dígito verificador é inválido", cnpjValido("PC3D315K0001A3"), false);
t("vazio", cnpjValido(""), false);
t("só pontuação", cnpjValido("../--"), false);

/* ── CORRUPÇÃO: o bug antigo não pode voltar ────────────────────────── */
t("CORRUPÇÃO: limparCnpj preserva as letras",
  limparCnpj("PC.3D3.15K/0001-93"), "PC3D315K000193");
t("CORRUPÇÃO: normalizarCnpj NÃO enche de zero à esquerda",
  normalizarCnpj("PC.3D3.15K/0001-93"), "PC3D315K000193");
t("CORRUPÇÃO: nunca produzir 00003315000193",
  normalizarCnpj("PC3D315K000193") === "00003315000193", false);
t("formatarCnpj mantém as letras",
  formatarCnpj("PC3D315K000193"), "PC.3D3.15K/0001-93");
t("mascararCnpj mantém a raiz alfanumérica",
  mascararCnpj("PC3D315K000193"), "PC.***.***/0001-93");

/* ── o padding numérico, que existe por causa do Excel ──────────────── */
// O Excel trata a coluna de CNPJ como número e come o zero da frente. Antes o
// parser validava ANTES de normalizar, então esses caíam como "descartadas"
// mesmo com o padding existindo no código — ele nunca era alcançado.
t("numérico com zero comido pela planilha é recomposto",
  normalizarCnpj("7526557000100"), "07526557000100");
t("e o recomposto é aceito", cnpjValido("7526557000100"), true);
t("dois zeros comidos também", normalizarCnpj("526557000100").length, 14);
t("11 dígitos NÃO viram CNPJ (é CPF, ou lixo)", cnpjValido("07526557000"), false);
t("um dígito solto não vira 00000000000001",
  normalizarCnpj("1").length === 14, false);
t("alfanumérico curto NÃO vira empresa inventada",
  normalizarCnpj("PC3D315K00019").length === 14, false);
t("alfanumérico curto é recusado", cnpjValido("PC3D315K00019"), false);

/* ── extração de texto colado ───────────────────────────────────────── */
t("extrai alfanumérico de linha colada",
  JSON.stringify(extrairCnpjs("PC.3D3.15K/0001-93")), JSON.stringify(["PC3D315K000193"]));
t("extrai misturado, um por linha",
  JSON.stringify(extrairCnpjs("PC.3D3.15K/0001-93\n11.222.333/0001-81")),
  JSON.stringify(["PC3D315K000193", "11222333000181"]));
t("extrai com o nome da empresa junto (colagem de planilha)",
  JSON.stringify(extrairCnpjs("Aurora Autopeças\t11.222.333/0001-81\nCasa Nova\tPC3D315K000193")),
  JSON.stringify(["11222333000181", "PC3D315K000193"]));
t("palavra de 14 letras não vira CNPJ",
  JSON.stringify(extrairCnpjs("DISTRIBUIDORAX")), JSON.stringify([]));
t("CPF continua fora", JSON.stringify(extrairCnpjs("123.456.789-09")), JSON.stringify([]));

console.log(f === 0 ? "TODOS OS TESTES PASSARAM" : `${f} FALHAS`);
process.exit(f ? 1 : 0);
