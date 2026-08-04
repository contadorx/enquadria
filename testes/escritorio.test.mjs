/**
 * TESTE DA IDENTIDADE NO DOCUMENTO.
 *
 * Três regras que erram em silêncio — nenhuma delas quebra build, todas
 * aparecem no papel que o cliente recebe:
 *
 *  · logo com nome + nome escrito ao lado = cabeçalho duplicado;
 *  · laudo assinado por razão social em vez de gente com CRC;
 *  · convite de indicação com o mesmo nome duas vezes na frase.
 *
 * Rodado pelo testes/rodar-tudo.mjs junto das demais suítes puras.
 */
import { mostrarNomeEscrito, assinaturaTecnica, comoChamar } from "./escritorio.js";

let f = 0;
const ok = (c, m, e) => {
  if (!c) { f++; console.log("FALHOU:", m, e === undefined ? "" : JSON.stringify(e)); }
  else console.log("ok:", m);
};

/* ─────────────────────────────── o nome ao lado do logo ─────────────── */
ok(mostrarNomeEscrito(null) === true, "sem escritório nenhum, imprime o nome (falha segura)");
ok(mostrarNomeEscrito({ nome: "Contabilidade X" }) === true, "sem logo, o nome SEMPRE aparece");
ok(
  mostrarNomeEscrito({ nome: "Contabilidade X", logo_url: "https://x/l.png" }) === true,
  "logo sem a marcação continua com o nome ao lado — o padrão não apaga ninguém"
);
ok(
  mostrarNomeEscrito({ nome: "X", logo_url: "https://x/l.png", logo_com_nome: true }) === false,
  "logo que já traz o nome não repete o nome ao lado"
);
ok(
  mostrarNomeEscrito({ nome: "X", logo_com_nome: true }) === true,
  "marcação sem logo não pode apagar o nome — senão o documento sai sem identificação"
);

/* ─────────────────────────────── quem assina ────────────────────────── */
ok(
  assinaturaTecnica({ nome: "Contabilidade X", crc: "CRC 1SP 000", responsavel: "Leandro Oliveira" }) ===
    "Leandro Oliveira · Contabilidade X — CRC 1SP 000",
  "pessoa antes do escritório, CRC no fim"
);
ok(
  assinaturaTecnica({ nome: "Contabilidade X", crc: "CRC 1SP 000" }) ===
    "Contabilidade X — CRC 1SP 000",
  "sem nome de pessoa, assina o escritório"
);
ok(assinaturaTecnica(null) === "Contador responsável", "sem nada, um genérico honesto");
ok(
  !/@/.test(assinaturaTecnica({ nome: "X", responsavel: "Fulano" })),
  "e-mail nunca vira assinatura"
);

/* ─────────────────────────────── quem indicou ───────────────────────── */
{
  const r = comoChamar({ nome: "Contabilidade X", responsavel: "Leandro" });
  ok(r.quem === "Leandro" && r.casa === "Contabilidade X", "pessoa e casa vêm separadas");
}
{
  // o bug real: nome do escritório nos dois campos produzia
  // "Contabilidade X, do Contabilidade X, indicou você"
  const r = comoChamar({ nome: "Contabilidade X" });
  ok(r.quem === "Contabilidade X" && r.casa === null,
     "sem nome pessoal, a casa é omitida para a frase não repetir", r);
}
{
  const r = comoChamar(null);
  ok(r.quem === "Um colega contador" && r.casa === null, "sem cadastro, um genérico");
}

if (f) { console.log(`\n${f} FALHA(S)`); process.exit(1); }
console.log("\nescritorio: tudo passou");
