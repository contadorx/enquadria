/**
 * TESTE DO CPF/CNPJ DO PAGADOR.
 *
 * Este campo derrubou o caminho do dinheiro inteiro em silêncio: o Asaas
 * exige `cpfCnpj` para criar cliente, a aplicação não mandava, o erro era
 * engolido e o botão "Assinar" não fazia nada — sem aviso nenhum.
 *
 * Por isso os testes aqui insistem em dois pontos: um documento inválido
 * precisa ser recusado ANTES de sair da tela (senão volta o silêncio), e a
 * recusa precisa dizer O QUE está errado — faltou dígito é um conserto,
 * dígito verificador errado é outro.
 *
 * Rodado pelo testes/rodar-tudo.mjs junto das demais suítes puras.
 */
import {
  cpfValido,
  tipoDocumento,
  documentoValido,
  formatarDocumento,
  criticaDocumento,
  limparDocumento,
} from "./documento.js";

let f = 0;
const ok = (c, m, e) => {
  if (!c) { f++; console.log("FALHOU:", m, e === undefined ? "" : JSON.stringify(e)); }
  else console.log("ok:", m);
};

/* ───────────────────────────────── CPF ──────────────────────────────── */
ok(cpfValido("529.982.247-25") === true, "CPF válido com máscara passa");
ok(cpfValido("52998224725") === true, "e sem máscara também");
ok(cpfValido("529.982.247-26") === false, "dígito verificador errado é recusado");
ok(cpfValido("111.111.111-11") === false,
   "os repetidos passam na conta dos dígitos e não existem — precisam ser barrados");
ok(cpfValido("000.000.000-00") === false, "zeros idem");
ok(cpfValido("5299822472") === false, "10 dígitos não é CPF");
ok(cpfValido("") === false, "vazio não é CPF");

/* ───────────────────────────────── tipo ─────────────────────────────── */
ok(tipoDocumento("529.982.247-25") === "cpf", "11 dígitos válidos = CPF");
ok(tipoDocumento("11.222.333/0001-81") === "cnpj", "14 dígitos válidos = CNPJ");
ok(tipoDocumento("11.222.333/0001-82") === "invalido", "CNPJ com dígito errado é inválido");
ok(tipoDocumento("123") === "invalido", "pedaço de número não vira documento");
// o tipo sai do TAMANHO: perguntar "é CPF ou CNPJ?" é atrito à toa no checkout
ok(documentoValido("52998224725") && documentoValido("11222333000181"),
   "os dois formatos são aceitos sem a pessoa precisar declarar qual é");

/* ───────────────────────────────── formato ──────────────────────────── */
ok(formatarDocumento("52998224725") === "529.982.247-25", "CPF sai com máscara", formatarDocumento("52998224725"));
ok(formatarDocumento("11222333000181") === "11.222.333/0001-81", "CNPJ idem", formatarDocumento("11222333000181"));
ok(limparDocumento("529.982.247-25") === "52998224725", "a limpeza tira só a pontuação");

/* ───────────────────────── a crítica que a tela mostra ──────────────── */
ok(criticaDocumento("52998224725") === null, "documento bom não gera crítica");
{
  const c = criticaDocumento("");
  ok(/Informe/.test(c), "vazio pede o dado", c);
}
{
  const c = criticaDocumento("5299822472");
  ok(/11 e um CNPJ tem 14/.test(c) && /10/.test(c),
     "tamanho errado diz quantos dígitos vieram — é o conserto mais comum", c);
}
{
  const c = criticaDocumento("529.982.247-26");
  ok(/CPF não passa/.test(c), "CPF com dígito errado é dito como CPF, não como 'documento'", c);
}
{
  const c = criticaDocumento("11.222.333/0001-82");
  ok(/CNPJ não passa/.test(c), "e o CNPJ como CNPJ", c);
}

if (f) { console.log(`\n${f} FALHA(S)`); process.exit(1); }
console.log("\ndocumento: tudo passou");
