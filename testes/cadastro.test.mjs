/**
 * A VARREDURA DO CADASTRO — o que conta como mudança.
 *
 * A regra que esta suíte protege acima de todas: **alarme falso é pior que
 * alarme nenhum**. Um aviso por semana em cada carteira, por diferença de
 * grafia ou por campo que veio vazio, ensina o contador a ignorar a lista — e
 * aí o dia em que um cliente for baixado passa despercebido junto com o resto.
 */
import { compararCadastro, proximasAConferir } from "./cadastro.js";

let f = 0;
const ok = (c, m, e) => {
  if (!c) { f++; console.log("FALHOU:", m, e === undefined ? "" : JSON.stringify(e)); }
  else console.log("ok:", m);
};

const base = {
  situacao: "ATIVA",
  cnae_principal: "4711-3/02",
  porte: "ME",
  regime: "Simples Nacional",
};

/* ═════════ 1 · nada mudou é nada ═══════════════════════════════════════ */
{
  ok(compararCadastro(base, base).length === 0, "cadastro igual não gera mudança");
  ok(compararCadastro(base, { ...base, situacao: "ativa" }).length === 0,
     "diferença de caixa alta/baixa não é mudança");
  ok(compararCadastro(base, { ...base, cnae_principal: "4711302" }).length === 0,
     "CNAE com e sem máscara é o mesmo CNAE");
}

/* ═════════ 2 · CAMPO VAZIO NÃO É MUDANÇA ═══════════════════════════════
 * A base responder vazio para um campo que respondeu ontem é muito mais
 * provavelmente falha de leitura do que perda de informação. Tratar ausência
 * como fato geraria um alarme por semana em cada carteira. */
{
  for (const campo of ["situacao", "cnae_principal", "porte", "regime"]) {
    const r = compararCadastro(base, { ...base, [campo]: null });
    ok(r.length === 0, `${campo} vazio na resposta não vira mudança`, r);
    const r2 = compararCadastro(base, { ...base, [campo]: "  " });
    ok(r2.length === 0, `${campo} em branco também não`, r2);
  }
}

/* ═════════ 3 · a mudança que mais importa: baixada ═════════════════════ */
{
  const r = compararCadastro(base, { ...base, situacao: "BAIXADA" });
  ok(r.length === 1 && r[0].campo === "situacao", "baixada é detectada", r);
  ok(r[0].muda_triagem === true, "e ela muda a triagem");
  ok(/continua na sua fila/.test(r[0].texto),
     "o texto diz a consequência, não só o fato", r[0].texto);
}

/* ═════════ 4 · virar MEI tira da regra ════════════════════════════════ */
{
  const r = compararCadastro(base, { ...base, porte: "MEI" });
  ok(r.length === 1 && r[0].muda_triagem === true, "virar MEI muda a triagem", r);
  ok(/ME e EPP/.test(r[0].texto), "e o texto diz por quê", r[0].texto);

  const volta = compararCadastro({ ...base, porte: "MEI" }, { ...base, porte: "EPP" });
  ok(volta.length === 1 && volta[0].muda_triagem === true,
     "deixar de ser MEI também muda — a empresa ENTRA na regra");
}

/* ═════════ 5 · sair do Simples encerra a decisão ══════════════════════ */
{
  const r = compararCadastro(base, { ...base, regime: "Lucro Presumido" });
  ok(r.length === 1 && r[0].campo === "regime", "saída do Simples é detectada", r);
  ok(/não há decisão a tomar/.test(r[0].texto), "e o texto diz o efeito", r[0].texto);

  /* "Simples Nacional" e "SIMPLES" são o mesmo regime lido de dois jeitos —
     é o mesmo normalizador da triagem, e ele não pode gerar alarme falso */
  ok(compararCadastro(base, { ...base, regime: "SIMPLES" }).length === 0,
     "grafia diferente do mesmo regime não é mudança");
}

/* ═════════ 6 · várias de uma vez ══════════════════════════════════════ */
{
  const r = compararCadastro(base, {
    situacao: "BAIXADA", cnae_principal: "6201-5/01", porte: "EPP", regime: "Lucro Real",
  });
  ok(r.length === 4, "as quatro mudanças saem juntas", r.map((x) => x.campo));
  ok(r.filter((x) => x.muda_triagem).length >= 3, "e a maioria mexe na triagem");
}

/* ═════════ 7 · a fila da varredura não deixa ninguém para trás ════════ */
{
  const carteira = [
    { id: "a", cadastro_conferido_em: "2026-08-07" },
    { id: "b", cadastro_conferido_em: null },
    { id: "c", cadastro_conferido_em: "2026-01-01" },
  ];
  const f1 = proximasAConferir(carteira, 2).map((x) => x.id);
  ok(f1[0] === "b", "quem nunca foi conferido vai primeiro", f1);
  ok(f1[1] === "c", "depois quem foi conferido há mais tempo", f1);
  ok(proximasAConferir(carteira, 10).length === 3, "a fatia não inventa empresa");
}

console.log(f === 0 ? "\nOK" : `\n${f} FALHA(S)`);
process.exit(f === 0 ? 0 : 1);
