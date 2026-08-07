/**
 * TESTE DO AGENTE DA PÁGINA PÚBLICA.
 *
 * Este módulo tem um risco que os outros não têm: ele fala com DESCONHECIDO,
 * sem sessão, numa página aberta na internet. Errar aqui não aparece num log
 * de cliente pagante — aparece como um contador que leu uma bobagem e nunca
 * mais voltou, ou como uma frase nossa citada fora de contexto.
 *
 * Por isso os testes cobrem três coisas nesta ordem de importância:
 *
 *  1. A RECUSA. Pedido de decisão sobre caso concreto NÃO pode ser respondido
 *     com número. É a fronteira contra virar parecer, e ela precisa vencer
 *     qualquer outra regra que case por acaso.
 *  2. A REVISÃO. Nenhuma resposta — nem do roteiro, nem da IA — pode conter
 *     marca de terceiro, promessa de economia ou "blindagem".
 *  3. O ROTEIRO. Ordem específico → genérico: "quanto custa o curso" é sobre
 *     o curso, não sobre o preço do sistema.
 */
import {
  responderRoteiro,
  revisar,
  extrairEmail,
  perguntaValida,
  noLimite,
  contextoIA,
  resumirAgente,
  SUGESTOES,
  TETO_SESSAO,
} from "./venda.js";

let f = 0;
const ok = (c, m, e) => {
  if (!c) { f++; console.log("FALHOU:", m, e === undefined ? "" : JSON.stringify(e)); }
  else console.log("ok:", m);
};

const chave = (p) => responderRoteiro(p)?.chave ?? null;

/* ───────────────────────── 1 · a recusa, primeiro ───────────────────────── */
// O pedido de decisão vem disfarçado de pergunta simpática. A resposta certa
// nunca contém número: contém o convite para a triagem.
const casos = [
  "meu cliente do anexo III fatura 900 mil, devo optar?",
  "vale a pena optar para uma empresa de serviços?",
  "compensa optar no anexo I?",
  "faz a conta pra mim: 1,2 milhão de faturamento",
  "calcula pra mim se ele deve sair do DAS",
];
for (const c of casos) {
  const r = responderRoteiro(c);
  ok(r?.chave === "caso-concreto", `recusa: ${c.slice(0, 34)}…`, r?.chave);
  ok(r?.fonte === "recusa", "a fonte da recusa é 'recusa' (para medir quantas aparecem)", r?.fonte);
}
// e a recusa não pode terminar em beco: ela oferece o caminho
ok(responderRoteiro(casos[0])?.cta?.url.includes("app.enquadria"), "a recusa oferece a triagem");
// a recusa vence a regra genérica de preço, mesmo com a palavra 'vale'
ok(chave("vale a pena optar? quanto custa isso?") === "caso-concreto", "recusa vence preço quando as duas casam");

/* ─────────────────── 2 · a revisão de tudo que sai daqui ────────────────── */
ok(revisar("O laudo protege o cliente com a blindagem patrimonial").ok === false, "barra 'blindagem'");
ok(revisar("Garantimos economia de 30%").ok === false, "barra garantia de resultado");
ok(revisar("melhor que o Omie e o Contmatic").ok === false, "barra marca de terceiro");
ok(revisar("Melhor que o OMIE").ok === false, "a barra de marca não depende de caixa alta");
ok(revisar("Melhor que o Ômie").ok === false, "a barra de marca não depende de acento");
ok(revisar("O laudo sai com a marca do seu escritório.").ok === true, "deixa passar texto legítimo");
ok(typeof revisar("blindagem").motivo === "string", "a barra explica o motivo (vai para o log)");
// e o corpus inteiro precisa passar pela própria revisão — texto escrito à mão
// hoje é editado amanhã, e ninguém relê o arquivo inteiro antes de subir
{
  const sujo = contextoIA()
    .split("\n\n")
    .filter((b) => !revisar(b).ok);
  ok(sujo.length === 0, "todo o corpus passa na revisão", sujo.slice(0, 2));
}

/* ───────────────── 3 · roteiro: específico antes de genérico ────────────── */
ok(chave("quanto custa o curso?") === "curso-preco", "preço do curso ≠ preço do sistema", chave("quanto custa o curso?"));
ok(chave("quanto custa?") === "preco", "preço genérico cai em preço");
ok(chave("a triagem é grátis?") === "triagem-preco", "preço da triagem tem resposta própria");
ok(chave("o que o enquadria faz?") === "o-que-e", "a pergunta de abertura tem resposta");
ok(chave("até quando posso optar?") === "prazo", "prazo");
ok(chave("e depois de setembro, acaba?") === "depois-de-setembro", "a transição tem resposta própria");
ok(chave("serve para lucro presumido?") === "lucro-presumido", "presumido");
ok(chave("meu sistema já tem simulador da reforma") === "ja-tenho-simulador", "a objeção do simulador");
ok(chave("tem fidelidade?") === "fidelidade", "fidelidade");

/* A COLISÃO DO 30/11 (07/08/2026): "cancelar a opção" casava `fidelidade` pelo
   gatilho "cancelar" e respondia sobre o PLANO — para uma pergunta sobre a
   Resolução CGSN nº 186/2026. A regra específica precisa vencer a genérica, e
   a resposta precisa carregar a direção da porta: só sai quem optou, sem volta. */
ok(chave("posso cancelar a opção em novembro?") === "cancelar-opcao", "cancelar a OPÇÃO não é cancelar o plano", chave("posso cancelar a opção em novembro?"));
ok(chave("dá pra voltar atrás depois de optar?") === "cancelar-opcao", "voltar atrás é sobre a opção");
ok(chave("o cancelamento é irretratável?") === "cancelar-opcao", "irretratável casa a regra da opção");
ok(chave("quero cancelar o contrato, tem carência?") === "fidelidade", "cancelar o PLANO continua na fidelidade", chave("quero cancelar o contrato, tem carência?"));
{
  const r = responderRoteiro("posso cancelar a opção em novembro?");
  ok(/irretratável/.test(r.resposta), "a resposta diz que o cancelamento é irretratável");
  ok(/adesão tardia|não existe adesão/i.test(r.resposta), "a resposta nega a adesão tardia");
}
/* A EXCEÇÃO DO 4º TRIMESTRE: inscrição no CNPJ entre out-dez/2026 opta no ato.
   Sem a regra, "abri empresa agora" caía em `prazo` e recebia um não implícito. */
ok(chave("abri empresa agora em outubro, perdi o prazo?") === "empresa-nova", "empresa nova tem resposta própria", chave("abri empresa agora em outubro, perdi o prazo?"));
ok(chave("vou abrir um cnpj novo em novembro, e a opção?") === "empresa-nova", "cnpj novo no 4º tri");
ok(chave("o laudo sai com a minha marca?") === "laudo", "laudo");
ok(chave("preciso preencher planilha antes?") === "importar", "a dúvida da planilha (a mais cara do suporte)");
ok(chave("de onde vem esse 3,65%?") === "365", "o número que abre conversa");
ok(chave("quero falar com uma pessoa") === "humano", "pedido de humano");
ok(responderRoteiro("quero falar com alguém no whatsapp")?.pedirEmail === true, "pedido de humano captura e-mail");

// o que o roteiro NÃO sabe precisa dizer que não sabe — silêncio falso é o
// pior resultado possível: mandaria a IA nunca ser chamada
ok(responderRoteiro("o ISS continua no DAS até quando?") === null, "pergunta técnica de norma sai do roteiro");
ok(responderRoteiro("qual a alíquota do IBS em 2029?") === null, "alíquota futura sai do roteiro");
ok(responderRoteiro("") === null, "pergunta vazia não casa nada");
ok(responderRoteiro("   ") === null, "só espaço não casa nada");

// acento e caixa não podem mudar o resultado — ninguém digita com acento no chat
ok(chave("QUANTO CUSTA?") === "preco", "caixa alta não muda o roteiro");
ok(chave("ate quando posso optar") === "prazo", "sem acento não muda o roteiro");

/* ─────────────────────────── 4 · o e-mail ───────────────────────────────── */
ok(extrairEmail("pode mandar pra leandro@contadorx.com.br") === "leandro@contadorx.com.br", "acha e-mail no meio da frase");
ok(extrairEmail("meu email é ANA@ESCRITORIO.COM.BR.") === "ana@escritorio.com.br", "normaliza caixa e tira ponto final");
ok(extrairEmail("não tenho e-mail") === null, "não inventa e-mail");
ok(extrairEmail("arroba errado: ana@escritorio") === null, "endereço sem domínio não passa");

/* ─────────────────────── 5 · o que barra abuso ──────────────────────────── */
ok(perguntaValida("oi").ok === true, "pergunta curta legítima passa");
ok(perguntaValida("a").ok === false, "um caractere não é pergunta");
ok(perguntaValida("x".repeat(501)).ok === false, "texto colado gigante não passa");
ok(perguntaValida("veja http://spam.com").ok === false, "pergunta com link não passa");
ok(noLimite(TETO_SESSAO) === true, "no teto, para");
ok(noLimite(TETO_SESSAO - 1) === false, "abaixo do teto, segue");

/* ─────────────────────── 6 · as sugestões iniciais ──────────────────────── */
// elas existem para quem não sabe formular a pergunta — se alguma não casar
// com o roteiro, o clique vira uma ida à IA por nada
for (const s of SUGESTOES) {
  ok(responderRoteiro(s) !== null, `a sugestão "${s}" tem resposta pronta`);
}


/* ─────────── 7 · o portão técnico: norma não se responde no roteiro ─────── */
// "até quando" é gatilho de prazo; a pergunta abaixo é de norma. Sem o portão,
// ela receberia a resposta da janela — errada e sem ninguém perceber.
ok(responderRoteiro("o ISS continua no DAS até quando?") === null, "ISS + 'até quando' não vira resposta de prazo");
ok(responderRoteiro("como funciona o split payment?") === null, "'como funciona' + norma sai do roteiro");
ok(responderRoteiro("qual a alíquota do Anexo III em 2027?") === null, "alíquota por anexo sai do roteiro");
ok(chave("meu cliente do anexo III fatura 900 mil, devo optar?") === "caso-concreto", "a recusa atravessa o portão técnico");
ok(chave("de onde vem esse 3,65%?") === "365", "a tabela do DAS é conteúdo conferido: passa");
ok(chave("serve para lucro presumido?") === "lucro-presumido", "presumido é público, não norma: passa");


/* ───────────── 8 · o resumo de dentro: a pauta do que falta ─────────────── */
const linhas = [
  { pergunta: "Quanto custa?", fonte: "roteiro", criado_em: "2026-08-01T10:00:00Z", sessao: "a" },
  { pergunta: "Quanto custa?", fonte: "roteiro", criado_em: "2026-08-01T10:01:00Z", sessao: "a" },
  { pergunta: "O ISS continua no DAS?", fonte: "captura", criado_em: "2026-08-02T10:00:00Z", sessao: "b" },
  { pergunta: "o iss continua no das???", fonte: "captura", criado_em: "2026-08-03T10:00:00Z", sessao: "c" },
  { pergunta: "Emitem nota fiscal?", fonte: "captura", criado_em: "2026-08-04T10:00:00Z", sessao: "c" },
  { pergunta: "ana@escritorio.com.br", fonte: "captura", chave: "email-recebido", email: "ana@escritorio.com.br", criado_em: "2026-08-04T10:05:00Z", sessao: "c" },
  { pergunta: "devo optar?", fonte: "recusa", criado_em: "2026-08-05T10:00:00Z", sessao: "d" },
  { pergunta: "mais uma", fonte: "limite", criado_em: "2026-08-05T10:10:00Z", sessao: "d" },
];
const r = resumirAgente(linhas);
ok(r.total === 8, "conta tudo que passou pelo balão", r.total);
ok(r.conversas === 4, "conta conversas distintas, não mensagens", r.conversas);
ok(r.taxaRoteiro === 25, "taxa do roteiro é sobre o total", r.taxaRoteiro);
ok(r.porFonte.recusa === 1 && r.porFonte.limite === 1, "cada fonte aparece separada", r.porFonte);
// a mesma dúvida escrita de dois jeitos é UMA pauta — senão a lista vira ruído
ok(r.pauta.length === 2, "pauta agrupa a mesma pergunta escrita diferente", r.pauta);
ok(r.pauta[0].vezes === 2, "a pergunta repetida vem primeiro e traz a contagem", r.pauta[0]);
ok(r.pauta[0].ultima === "2026-08-03T10:00:00Z", "guarda a última vez que a dúvida apareceu");
// e-mail deixado no chat é conversão, não dúvida: não polui a pauta
ok(!r.pauta.some((p) => p.pergunta.includes("@")), "e-mail não entra na pauta de dúvidas");
ok(r.emails.length === 1 && r.emails[0] === "ana@escritorio.com.br", "os e-mails capturados saem à parte", r.emails);
// 'limite' não é falta de resposta: é teto. Confundir os dois inventaria trabalho
ok(!r.pauta.some((p) => p.pergunta === "mais uma"), "o teto não vira pauta");
ok(resumirAgente([]).taxaRoteiro === null, "sem base, taxa é nula — nunca 0%");
ok(resumirAgente([]).pauta.length === 0, "lista vazia não quebra");

console.log(f === 0 ? "\nTUDO OK (venda)" : `\n${f} FALHA(S) (venda)`);
process.exit(f === 0 ? 0 : 1);
