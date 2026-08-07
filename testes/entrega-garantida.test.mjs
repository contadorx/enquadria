/**
 * TESTE DA ENTREGA GARANTIDA.
 *
 * O que está em jogo aqui não é um número numa tela: é o termo de ciência que
 * o cliente do contador jurou não ter recebido. Falha silenciosa em e-mail
 * transacional não aparece em log de erro — aparece meses depois, numa
 * discussão em que alguém precisa provar o que enviou e quando.
 *
 * Os testes protegem, em ordem de dano:
 *
 *  1. NÃO REENVIAR BOUNCE. Endereço que não existe pelo Postal também não
 *     existe pela Brevo. Insistir queima o segundo caminho — e o segundo
 *     caminho é a rede de segurança de tudo.
 *  2. NÃO REENVIAR CEDO. Reenvio antes da janela faz o cliente receber o mesmo
 *     documento duas vezes, e documento duplicado gera desconfiança nos dois.
 *  3. O DISJUNTOR SÓ ABRE E SÓ FECHA COM PROVA. Fechar por tempo devolveria o
 *     tráfego a um caminho quebrado, em silêncio.
 *  4. NÃO CONCLUIR DE AMOSTRA PEQUENA. Três mensagens não fazem uma taxa.
 */
import {
  chaveSaida,
  estaPerdida,
  acaoPara,
  avaliarDisjuntor,
  deveSondar,
  caminhoDeSaida,
  resumirSaida,
  JANELA_CONFIRMACAO_MIN,
  TENTATIVAS_MAX,
  AMOSTRA_MINIMA,
} from "./entrega-garantida.js";

let f = 0;
const ok = (c, m, e) => {
  if (!c) { f++; console.log("FALHOU:", m, e === undefined ? "" : JSON.stringify(e)); }
  else console.log("ok:", m);
};

const AGORA = new Date("2026-08-07T12:00:00Z");
const hMenos = (min) => new Date(AGORA.getTime() - min * 60000).toISOString();
const linha = (x = {}) => ({
  id: "1", chave: "k", para: "a@b.com", tag: "termo", caminho: "postal",
  status: "aceito", mensagem_id: "m1", criado_em: hMenos(30),
  confirmado_em: null, tentativas: 0, ...x,
});

/* ───────────────────── 1 · a idempotência ───────────────────────────────── */
{
  ok(chaveSaida("termo", "A@B.com", "doc1") === "termo:a@b.com:doc1", "a chave normaliza o e-mail");
  ok(chaveSaida("termo", "a@b.com", "doc1") === chaveSaida("termo", " a@b.com ", "doc1"), "espaço não cria chave nova");
  ok(chaveSaida("termo", "a@b.com", "doc1") !== chaveSaida("termo", "a@b.com", "doc2"), "documentos diferentes, chaves diferentes");
  ok(chaveSaida("laudo", "a@b.com", "doc1") !== chaveSaida("termo", "a@b.com", "doc1"), "tags diferentes, chaves diferentes");
  ok(chaveSaida("termo", "a@b.com").endsWith(":sem-ref"), "sem referência não gera chave vazia");
}

/* ─────────────── 2 · o que NUNCA se reenvia ─────────────────────────────── */
{
  // bounce: a caixa não existe. Reenviar pela Brevo queima a Brevo também.
  ok(acaoPara(linha({ status: "falhou" }), AGORA) === "nada", "bounce nunca vira reenvio");
  ok(acaoPara(linha({ status: "entregue" }), AGORA) === "nada", "entregue não se reenvia");
  ok(acaoPara(linha({ status: "reenviado" }), AGORA) === "nada", "já reenviado não reenvia de novo");
  // a Brevo responde síncrono: se aceitou, não há fila nossa para represar
  ok(acaoPara(linha({ caminho: "brevo" }), AGORA) === "nada", "mensagem da Brevo não entra na vigilância");
}

/* ─────────────── 3 · a janela: nem cedo, nem tarde ──────────────────────── */
{
  ok(estaPerdida(linha({ criado_em: hMenos(5) }), AGORA) === false, "5 minutos ainda é trânsito normal");
  ok(estaPerdida(linha({ criado_em: hMenos(JANELA_CONFIRMACAO_MIN - 1) }), AGORA) === false, "um minuto antes da janela, ainda não");
  ok(estaPerdida(linha({ criado_em: hMenos(JANELA_CONFIRMACAO_MIN) }), AGORA) === true, "na janela, é perdida");
  ok(acaoPara(linha({ criado_em: hMenos(5) }), AGORA) === "nada", "e a ação de mensagem recente é não fazer nada");
  ok(acaoPara(linha(), AGORA) === "reenviar", "perdida e sem tentativa: reenvia");
}

/* ─────────────── 4 · não reenviar em laço ───────────────────────────────── */
{
  ok(acaoPara(linha({ tentativas: TENTATIVAS_MAX }), AGORA) === "desistir", "esgotadas as tentativas, desiste");
  ok(acaoPara(linha({ tentativas: TENTATIVAS_MAX + 5 }), AGORA) === "desistir", "e não volta a tentar nunca");
  ok(acaoPara(linha({ tentativas: TENTATIVAS_MAX - 1 }), AGORA) === "reenviar", "com tentativa sobrando, ainda tenta");
}

/* ─────────────── 5 · o disjuntor: só com prova ──────────────────────────── */
const fechado = { estado: "fechado", motivo: null, desde: null };
const aberto = { estado: "aberto", motivo: "teste", desde: "2026-08-07T06:00:00Z" };
{
  // amostra pequena não decide nada — em nenhuma direção
  ok(avaliarDisjuntor(fechado, { total: AMOSTRA_MINIMA - 1, perdidas: 3 }, "x").estado === "fechado",
    "três perdas em quatro mensagens NÃO abre o disjuntor");
  ok(avaliarDisjuntor(aberto, { total: 2, perdidas: 0 }, "x").estado === "aberto",
    "duas entregas não fecham o disjuntor");

  // abre com evidência
  ok(avaliarDisjuntor(fechado, { total: 10, perdidas: 5 }, "x").estado === "aberto", "50% de perda abre");
  ok(avaliarDisjuntor(fechado, { total: 10, perdidas: 2 }, "x").estado === "fechado", "20% de perda não abre");
  ok(typeof avaliarDisjuntor(fechado, { total: 10, perdidas: 5 }, "x").motivo === "string",
    "e a abertura registra o motivo — quem for ler amanhã precisa saber por quê");
  ok(avaliarDisjuntor(fechado, { total: 10, perdidas: 5 }, "2026-08-07T12:00:00Z").desde === "2026-08-07T12:00:00Z",
    "e a data, que é o que autoriza a sonda depois");

  // fecha SÓ com perda zero — uma perda no meio mantém aberto
  ok(avaliarDisjuntor(aberto, { total: 10, perdidas: 0 }, "x").estado === "fechado", "amostra limpa fecha");
  ok(avaliarDisjuntor(aberto, { total: 10, perdidas: 1 }, "x").estado === "aberto", "uma perda ainda mantém aberto");

  // e NUNCA fecha por tempo — só a sonda é autorizada pelo relógio
  ok(deveSondar(aberto, new Date("2026-08-07T11:00:00Z")) === false, "5h depois ainda não sonda");
  ok(deveSondar(aberto, new Date("2026-08-07T12:00:00Z")) === true, "6h depois, sonda");
  ok(deveSondar(fechado, new Date("2026-08-08T00:00:00Z")) === false, "disjuntor fechado não sonda nada");
  ok(deveSondar({ ...aberto, desde: null }, AGORA) === false, "sem data de abertura, não sonda");
}

/* ─────────────── 6 · por onde a mensagem sai ────────────────────────────── */
{
  ok(caminhoDeSaida(true, true, fechado) === "postal", "tudo normal: sai pelo próprio");
  ok(caminhoDeSaida(true, true, aberto) === "brevo", "disjuntor aberto: desvia mesmo com Postal configurado");
  ok(caminhoDeSaida(false, true, fechado) === "brevo", "sem Postal configurado: Brevo");
  ok(caminhoDeSaida(true, false, aberto) === "postal",
    "sem Brevo, o Postal com problema ainda é melhor que não enviar");
  ok(caminhoDeSaida(false, false, fechado) === "nenhum", "sem nenhum dos dois, diz que não há caminho");
}

/* ─────────────── 7 · a leitura humana ───────────────────────────────────── */
{
  const linhas = [
    linha({ id: "1", status: "entregue" }),
    linha({ id: "2", status: "entregue" }),
    linha({ id: "3", status: "aceito", criado_em: hMenos(2) }),
  ];
  const r = resumirSaida(linhas, fechado);
  ok(r.taxaEntrega === 100, "o que ainda está em trânsito não derruba a taxa", r.taxaEntrega);
  ok(/saudável/.test(r.leitura), "e a leitura diz que está saudável", r.leitura);

  ok(resumirSaida([], fechado).taxaEntrega === null, "sem base, taxa é nula — nunca 0%");
  ok(/Nenhuma mensagem/.test(resumirSaida([], fechado).leitura), "e a frase diz isso");

  const comPerda = resumirSaida([...linhas, linha({ id: "4", status: "perdido" })], fechado);
  ok(comPerda.taxaEntrega === 67, "perda entra no denominador", comPerda.taxaEntrega);
  ok(/não confirmou/.test(comPerda.leitura), "a leitura destaca a perda");

  // com o disjuntor aberto, a leitura fala DISSO — é a informação que manda
  const desviado = resumirSaida(linhas, aberto);
  ok(/DESLIGADO/.test(desviado.leitura), "disjuntor aberto domina a leitura", desviado.leitura);
  ok(/Nada foi perdido/.test(desviado.leitura), "e tranquiliza: o desvio funcionou");
}

console.log(f === 0 ? "\nTUDO OK (entrega garantida)" : `\n${f} FALHA(S) (entrega garantida)`);
process.exit(f === 0 ? 0 : 1);
