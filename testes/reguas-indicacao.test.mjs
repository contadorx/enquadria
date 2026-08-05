/**
 * A CADÊNCIA DE RECUPERAÇÃO DOS INDICADOS — e as quatro travas que a impedem
 * de virar spam.
 *
 * O indicado NÃO é cliente: ele nunca pediu e-mail nosso, recebeu um convite
 * porque um colega digitou o e-mail dele. Isso torna a régua legítima e frágil
 * ao mesmo tempo — e o que queima não é só a relação com ele, é a reputação do
 * remetente, que é o ativo do qual a régua de COBRANÇA depende.
 *
 * As travas testadas aqui, em ordem de dano se falharem:
 *
 *   1. quem já é usuário SAI, mesmo com o status desatualizado no banco;
 *   2. teto DURO de 3 e-mails por indicação, para sempre;
 *   3. degrau escolhido de trás para a frente — senão uma indicação velha
 *      recebe os três e-mails em três dias;
 *   4. qualquer sinal negativo encerra.
 */
import {
  planejarIndicacoes, reconciliar, funilDeIndicacoes, leituraDoFunil,
  DEGRAUS_INDICACAO, DEGRAU_PAROU, TETO_POR_INDICACAO,
} from "./reguas-indicacao.js";

let f = 0;
const ok = (c, m, e) => {
  if (!c) { f++; console.log("FALHOU:", m, e === undefined ? "" : JSON.stringify(e)); }
  else console.log("ok:", m);
};

const HOJE = new Date("2026-08-05T12:00:00Z");
const diasAtras = (n) => new Date(HOJE.getTime() - n * 86_400_000).toISOString();

const ind = (x = {}) => ({
  id: "i1", tenant_id: "t1", indicador_nome: "Leandro", nome: "Maria Silva",
  email: "maria@escritorio.com.br", status: "convidado",
  convite_em: diasAtras(5), cadastrou_em: null, virou_cliente_em: null, ...x,
});

const REGRAS = [
  ...DEGRAUS_INDICACAO.map((d) => ({
    chave: d.chave, nome: d.nome, categoria: "indicacao", descricao: null, ativa: true,
    dias: d.dias, assunto: "{{nome}}, o {{indicador}} te indicou", corpo: "Olá {{nome}}, faz {{dias}} dias.",
    ordem: 1,
  })),
  {
    chave: DEGRAU_PAROU.chave, nome: DEGRAU_PAROU.nome, categoria: "indicacao", descricao: null,
    ativa: true, dias: 7, assunto: "{{nome}}, você criou a conta e parou",
    corpo: "O {{indicador}} te indicou.", ordem: 2,
  },
];

const ctx = (x = {}) => ({
  indicacoes: [ind()], regras: REGRAS, jaEnviados: new Set(),
  emailsDeUsuarios: new Set(), emailsQueimados: new Set(), hoje: HOJE, ...x,
});

/* ═══════════ 1 · o degrau certo, na hora certa ═════════════════════════ */
ok(planejarIndicacoes(ctx({ indicacoes: [ind({ convite_em: diasAtras(1) })] })).envios.length === 0,
   "1 dia depois do convite: ainda não é hora");
ok(planejarIndicacoes(ctx()).envios[0]?.regra === "indicacao_d3", "5 dias: o primeiro degrau");
ok(planejarIndicacoes(ctx({ indicacoes: [ind({ convite_em: diasAtras(12) })] })).envios[0]?.regra === "indicacao_d10",
   "12 dias e nenhum enviado: entra no SEGUNDO, não no primeiro");

/**
 * A TRAVA 3, e ela é a que produz o dano mais rápido.
 *
 * Uma indicação de 40 dias que nunca recebeu nada precisa cair no ÚLTIMO
 * degrau. Percorrendo do menor para o maior, ela receberia o "faz 3 dias que
 * você foi indicado" quarenta dias depois — e depois os outros dois, um por
 * dia, porque todos já venceram. Três e-mails em três dias para quem nunca
 * pediu nada é exatamente como se queima um domínio.
 */
{
  const p = planejarIndicacoes(ctx({ indicacoes: [ind({ convite_em: diasAtras(40) })] }));
  ok(p.envios[0]?.regra === "indicacao_d21",
     "40 dias sem nenhum e-mail: entra direto no ÚLTIMO degrau, não no primeiro", p.envios[0]?.regra);
  ok(p.envios.length === 1, "e sai UM e-mail, não três");
}
{
  /* o degrau seguinte só depois do anterior ter saído */
  const jaEnviados = new Set(["indicacao_d3:i1"]);
  ok(planejarIndicacoes(ctx({ indicacoes: [ind({ convite_em: diasAtras(5) })], jaEnviados })).envios.length === 0,
     "com o d3 já enviado e só 5 dias, não manda o d10 antes da hora");
  ok(planejarIndicacoes(ctx({ indicacoes: [ind({ convite_em: diasAtras(12) })], jaEnviados })).envios[0]?.regra === "indicacao_d10",
     "e aos 12 dias manda o d10");
}

/* ═══════════ 2 · o teto duro ═══════════════════════════════════════════ */
{
  const jaEnviados = new Set(["indicacao_d3:i1", "indicacao_d10:i1", "indicacao_d21:i1"]);
  const p = planejarIndicacoes(ctx({ indicacoes: [ind({ convite_em: diasAtras(90) })], jaEnviados }));
  ok(p.envios.length === 0, "três já saíram: acabou, para sempre");
  ok(/teto de 3/.test(p.parados[0]?.motivo ?? ""), "e o motivo diz que foi o teto", p.parados[0]);
  ok(TETO_POR_INDICACAO === 3, "o teto está declarado, não escondido no laço");
}

/* ═══════════ 3 · quem sai da cadência ══════════════════════════════════ */
const paraOu = (x, re) => {
  const p = planejarIndicacoes(ctx(x));
  return p.envios.length === 0 && re.test(p.parados[0]?.motivo ?? "");
};
ok(paraOu({ indicacoes: [ind({ status: "cliente", convite_em: diasAtras(30) })] }, /já virou cliente/),
   "quem virou cliente sai");
ok(paraOu({ indicacoes: [ind({ virou_cliente_em: diasAtras(2), convite_em: diasAtras(30) })] }, /já virou cliente/),
   "…inclusive pela data, quando o status ficou para trás");
ok(paraOu({ indicacoes: [ind({ status: "recusou", convite_em: diasAtras(30) })] }, /recusou/), "quem recusou sai");
ok(paraOu({ indicacoes: [ind({ convite_em: diasAtras(30) })], emailsQueimados: new Set(["maria@escritorio.com.br"]) },
          /queimado/),
   "e-mail que bateu, marcou spam ou pediu para sair: encerra");
ok(paraOu({ indicacoes: [ind({ email: "sem-arroba", convite_em: diasAtras(30) })] }, /inválido/),
   "e-mail inválido não vira envio");

/**
 * A TRAVA 1 — a mais cara quando falha.
 *
 * O status é escrito por webhook e por gatilho de cadastro; qualquer um pode
 * falhar em silêncio. Aí o banco diz "convidado" para quem já é usuário, e sai
 * um "venha conhecer" para quem paga. O estrago não é com o indicado: é com
 * quem indicou.
 */
{
  const emailsDeUsuarios = new Set(["maria@escritorio.com.br"]);
  const r = reconciliar(ind({ convite_em: diasAtras(30) }), emailsDeUsuarios);
  ok(r.status === "cadastrou", "a existência do usuário vence o campo do banco", r.status);
  ok(r.cadastro_estimado === true, "e a data fica marcada como ESTIMADA — não sabemos desde quando");
  /**
   * O RELÓGIO COMEÇA AGORA. Descobrimos que ela é usuária, não desde quando.
   * Contar a partir do convite mandaria na mesma hora um "você criou a conta e
   * parou" para quem talvez tenha entrado ontem. O custo de esperar é uma
   * semana; o custo do contrário é um e-mail errado para quem acabou de chegar.
   */
  const p = planejarIndicacoes(ctx({ indicacoes: [ind({ convite_em: diasAtras(30) })], emailsDeUsuarios }));
  ok(p.envios.length === 0 && /ainda não venceu/.test(p.parados[0].motivo),
     "e HOJE não sai nada: o prazo do abandono começa a contar da descoberta", p.parados[0]);

  /* uma semana depois, aí sim */
  const oitoDias = new Date(HOJE.getTime() + 8 * 86_400_000);
  const p2 = planejarIndicacoes(ctx({
    indicacoes: [ind({ convite_em: diasAtras(30), status: "cadastrou", cadastrou_em: HOJE.toISOString() })],
    hoje: oitoDias,
  }));
  ok(p2.envios[0]?.regra === DEGRAU_PAROU.chave,
     "oito dias depois, recebe o e-mail de quem cadastrou e parou — não o de convite", p2.envios[0]?.regra);
}
ok(reconciliar(ind({ email: "MARIA@Escritorio.com.BR", convite_em: diasAtras(30) }),
               new Set(["maria@escritorio.com.br"])).status === "cadastrou",
   "a comparação de e-mail ignora caixa — senão a trava não vale nada na prática");

/* ═══════════ 4 · quem cadastrou e parou ════════════════════════════════ */
ok(planejarIndicacoes(ctx({ indicacoes: [ind({ status: "cadastrou", cadastrou_em: diasAtras(3) })] })).envios.length === 0,
   "cadastrou há 3 dias: ainda não é abandono");
{
  const p = planejarIndicacoes(ctx({ indicacoes: [ind({ status: "cadastrou", cadastrou_em: diasAtras(9) })] }));
  ok(p.envios[0]?.regra === DEGRAU_PAROU.chave, "cadastrou há 9 dias e parou: entra na régua própria");
  ok(!/convite/.test(p.envios[0]?.assunto ?? ""), "e recebe o texto do abandono, não o do convite");
}

/* ═══════════ 5 · o e-mail nomeia quem indicou ══════════════════════════ */
{
  const e = planejarIndicacoes(ctx()).envios[0];
  ok(e.assunto === "Maria, o Leandro te indicou", "o assunto usa o primeiro nome e NOMEIA o indicador", e.assunto);
  ok(/faz 5 dias/.test(e.corpo), "e as variáveis do corpo são aplicadas");
  ok(e.chave_unica === "indicacao_d3:i1", "a chave é degrau:indicação — é ela que sustenta teto e dedupe");
  ok(/indicado por Leandro/.test(e.motivo), "o motivo registrado explica de onde veio");
}
{
  /* sem o nome do indicador o e-mail não pode virar frio e anônimo */
  const e = planejarIndicacoes(ctx({ indicacoes: [ind({ indicador_nome: null })] })).envios[0];
  ok(/um colega/.test(e.assunto), "sem o nome, cai em 'um colega' — nunca em vazio", e.assunto);
}

/* ═══════════ 6 · regra inativa e fonte quebrada ════════════════════════ */
{
  const regras = REGRAS.map((r) => (r.chave === "indicacao_d3" ? { ...r, ativa: false } : r));
  const p = planejarIndicacoes(ctx({ regras }));
  ok(p.envios.length === 0 && /não está cadastrado ou está inativo/.test(p.parados[0].motivo),
     "regra desligada não manda — e diz que foi por isso, não some calada");
}
{
  const p = planejarIndicacoes(ctx({ erro: "timeout no banco" }));
  ok(p.envios.length === 0 && /fonte indisponível/.test(p.parados[0].motivo),
     "fonte quebrada NÃO vira fila vazia — zero e zero é o que um dia tranquilo também devolve");
}

/* ═══════════ 7 · o funil, e a coragem de dizer 'não faça régua' ════════ */
{
  const lista = [
    ind({ id: "a", status: "convidado", convite_em: diasAtras(40) }),
    ind({ id: "b", status: "convidado", convite_em: diasAtras(2) }),
    ind({ id: "c", status: "cadastrou", cadastrou_em: diasAtras(10) }),
    ind({ id: "d", status: "cliente", virou_cliente_em: diasAtras(5) }),
    ind({ id: "e", status: "recusou" }),
  ];
  const fn = funilDeIndicacoes(lista, HOJE);
  ok(fn.convidados === 5 && fn.cadastraram === 2 && fn.clientes === 1 && fn.recusaram === 1, "o funil conta", fn);
  ok(fn.parados === 1, "parados = convidado há mais de 21 dias sem cadastro — o estoque recuperável", fn.parados);
  ok(Math.abs(fn.taxa_cadastro - 0.4) < 1e-9, "taxa de cadastro sobre o total");
  ok(Math.abs(fn.taxa_cliente - 0.5) < 1e-9, "e taxa de cliente sobre quem se cadastrou");
}
ok(funilDeIndicacoes([], HOJE).taxa_cadastro === null,
   "sem base, a taxa é null e não zero — 0% afirmaria algo que não se sabe");
ok(/Nenhuma indicação/.test(leituraDoFunil(funilDeIndicacoes([], HOJE))), "base vazia diz isso");
{
  const poucas = Array.from({ length: 3 }, (_, k) => ind({ id: `p${k}` }));
  ok(/pouco para tirar conclusão/.test(leituraDoFunil(funilDeIndicacoes(poucas, HOJE))),
     "com 3 indicações, a leitura recusa falar de taxa");
}
{
  /* 20 convites, 1 cadastro: o problema é o convite, e a frase diz isso */
  const muitas = Array.from({ length: 20 }, (_, k) =>
    ind({ id: `m${k}`, status: k === 0 ? "cadastrou" : "convidado", cadastrou_em: k === 0 ? diasAtras(5) : null })
  );
  const txt = leituraDoFunil(funilDeIndicacoes(muitas, HOJE));
  ok(/problema do CONVITE/.test(txt),
     "taxa baixa aponta para o convite — três e-mails a mais não consertam oferta que não convence", txt);
  ok(/não da recuperação/.test(txt), "…dizendo explicitamente que não é a régua");
}

/* ═══════════ 8 · planejar não altera nada ══════════════════════════════ */
{
  const entrada = [ind({ convite_em: diasAtras(30) })];
  const copia = JSON.stringify(entrada);
  planejarIndicacoes(ctx({ indicacoes: entrada, emailsDeUsuarios: new Set(["maria@escritorio.com.br"]) }));
  ok(JSON.stringify(entrada) === copia,
     "a reconciliação devolve cópia: o status do banco não é reescrito por um planejamento");
}

console.log(f === 0 ? "\nOK" : `\n${f} FALHA(S)`);
process.exit(f === 0 ? 0 : 1);
