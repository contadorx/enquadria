/**
 * TESTE DO MURO — a única superfície de conversão do produto.
 *
 * Aqui não se testa cálculo fiscal, se testa TEXTO E CIFRA. E os dois erram em
 * silêncio: um muro que diz "você atingiu o limite" converte menos e ninguém
 * mede; um muro que mostra R$ 47000 em vez de R$ 470 destrói a confiança na
 * hora exata em que o contador ia pagar.
 *
 * Rodado pelo testes/rodar-tudo.mjs junto das demais suítes puras.
 */
import { situacaoPlano, montarMuro, mensagemBloqueio } from "./plano.js";
let f = 0;
const ok = (c, m, e) => {
  if (!c) { f++; console.log("FALHOU:", m, e === undefined ? "" : JSON.stringify(e)); }
  else console.log("ok:", m);
};

const s = situacaoPlano(null, 2);          // grátis, 2 laudos usados
ok(s.bloqueado === true, "2 de 2 bloqueia");
const m = montarMuro(s, 600, 47000);       // R$ 470,00 em centavos
ok(m.titulo.includes("Este é o 3º"), "o muro fala do TERCEIRO laudo", m.titulo);
ok(!/limite/i.test(m.titulo + m.linhas.join(" ")), "não usa linguagem de punição", m.titulo);
ok(m.conta?.anual === 470, "preço vem em reais, não centavos", m.conta?.anual);
ok(m.conta?.honorario === 600, "usa o honorário de referência", m.conta?.honorario);
ok(m.garantia.includes("continuam válidos"), "garante o que ele já produziu");
/* o MÊS saiu do texto em 05/08/2026: o art. 41 traz março no § 10 e abril no
   § 11, e o produto não escolhe por conta própria. O argumento do anual não
   depende do mês — depende de a janela voltar. */
ok(m.nota_anual.includes("primeiro semestre de 2027"), "o argumento do anual está escrito");
ok(!/\bmarço\b|\babril\b/.test(m.nota_anual),
   "e NÃO carimba o mês da segunda janela — a norma traz dois", m.nota_anual);

// sem preço no banco, o muro não inventa cifra
const semPreco = montarMuro(s, 600, null);
ok(semPreco.conta === null, "sem plano cadastrado, nenhuma cifra é inventada");
ok(semPreco.linhas.length === 1, "cai para a linha sem número");

// assinatura ilimitada nunca bate no muro
const pro = situacaoPlano({ plano_id: "pro", limite_analises: null, valido_ate: null }, 999);
ok(pro.ilimitado && !pro.bloqueado, "PRO não bloqueia nunca");

// primeiro laudo do grátis: singular correto
const um = montarMuro(situacaoPlano(null, 1), 600, 47000);
ok(um.titulo.includes("1 laudo.") && um.titulo.includes("2º"), "singular/plural certos", um.titulo);

console.log(f === 0 ? "TODOS OS TESTES PASSARAM" : `${f} FALHAS`);
process.exit(f?1:0);
