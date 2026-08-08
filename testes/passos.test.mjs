/**
 * O PASSO A PASSO — o roteiro que o assistente responde sem IA.
 *
 * POR QUE TEM TESTE. Este arquivo é a resposta para "estou perdida" — a frase
 * literal de uma contadora de 25 clientes, por WhatsApp, depois de duas
 * tentativas de começar sozinha. Um roteiro que aponta para o passo errado é
 * pior que roteiro nenhum: quem é guiado errado conclui que a ferramenta não
 * entende o trabalho dele, e não escreve de novo.
 *
 * As duas famílias de defeito cobertas aqui:
 *   1. o próximo passo pular etapa ou mandar de volta para uma já cumprida;
 *   2. a resposta fixa casar com a pergunta errada — instrução errada é pior
 *      que nenhuma instrução.
 */
import { proximoPasso, dicaDaTela, respostaLocal, sugestoes, PASSOS } from "./passos.js";

let f = 0;
const ok = (c, m, e) => {
  if (!c) { f++; console.log("FALHOU:", m, e === undefined ? "" : JSON.stringify(e)); }
  else console.log("ok:", m);
};

const sit = (o = {}) => ({
  temEscritorio: false, empresas: 0, analises: 0, laudos: 0, termos: 0, assinados: 0, ...o,
});

/* ═══════════ 1 · a ordem do trabalho, não a do cadastro ════════════════
 * Conta nova cai em IMPORTAR, não em configurar o escritório. Pedir CRC e logo
 * antes de a pessoa ver uma triagem acontecer é cobrar compromisso antes de
 * entregar valor — e quem desiste aí não reclama, só fecha a aba.
 * ══════════════════════════════════════════════════════════════════════════ */
{
  ok(proximoPasso(sit()).chave === "importar",
     "conta nova começa por importar UM cliente, não por preencher cadastro");

  ok(proximoPasso(sit({ empresas: 3 })).chave === "escritorio",
     "com carteira e sem escritório, o cadastro passa a ser o próximo");

  ok(proximoPasso(sit({ empresas: 3, temEscritorio: true })).chave === "analisar",
     "com escritório pronto, o passo é a primeira análise");

  ok(proximoPasso(sit({ empresas: 3, temEscritorio: true, analises: 1 })).chave === "laudo",
     "analisou, falta emitir");

  ok(proximoPasso(sit({ empresas: 3, temEscritorio: true, analises: 1, laudos: 1 })).chave === "termo",
     "emitiu, falta o termo");

  ok(proximoPasso(sit({ empresas: 3, temEscritorio: true, analises: 1, laudos: 1, termos: 2, assinados: 1 })).chave === "assinatura",
     "termo enviado e não assinado vira cobrança de assinatura");

  ok(proximoPasso(sit({ empresas: 3, temEscritorio: true, analises: 1, laudos: 1, termos: 2, assinados: 2 })).chave === "pronto",
     "tudo assinado: não inventa passo para justificar a própria existência");
}

/* ═══════════ 2 · todo passo diz COMO, não só O QUE ═════════════════════ */
{
  for (const p of Object.values(PASSOS)) {
    ok(p.comoFazer.length >= 2 && p.comoFazer.every((l) => l.trim().length > 10),
       `o passo "${p.chave}" tem instruções de verdade, não um rótulo`);
    ok(p.porque.trim().length > 30, `o passo "${p.chave}" explica por que ele vem agora`);
  }
}

/* ═══════════ 3 · a dica da tela — onde a pessoa travou ════════════════
 * A tela de importar com carteira vazia é exatamente onde nasceu a pergunta
 * "primeiro eu preencho aquela planilha?". A resposta tem de estar ali. */
{
  const d = dicaDaTela("/painel/importar", sit());
  ok(d && /planilha/i.test(d.titulo + d.texto),
     "em Importar com carteira vazia, a dica desarma a dúvida da planilha", d);

  ok(dicaDaTela("/painel/importar", sit({ empresas: 5 })) === null,
     "quem já importou não recebe mais a dica de importar");

  ok(dicaDaTela("/painel/importar/", sit())?.chave === "importar-vazio",
     "barra no fim da rota não muda a dica — /painel/importar e /painel/importar/ são a mesma tela");

  /* UMA TELA, UM ORIENTADOR (08/08/2026).
   * O cockpit já tem dois: a Trilha e o Empurrão. A bolha dizia por cima deles
   * exatamente a mesma ordem ("comece pela primeira empresa", "falta emitir o
   * laudo"), e três vozes com a mesma instrução fazem o leitor ignorar as três.
   * Estes dois testes agora GUARDAM o silêncio — se alguém recolocar uma dica
   * de próximo passo no cockpit, a suíte reclama. */
  ok(dicaDaTela("/painel", sit({ empresas: 5 })) === null,
     "no cockpit a bolha se cala: quem orienta ali é a Trilha ou o Empurrão");

  ok(dicaDaTela("/painel/", sit({ empresas: 5, analises: 2 })) === null,
     "e continua calada depois da análise — o Empurrão é quem pede o laudo");

  /* o escritório só é cobrado quando já existe documento saindo sem nome */
  ok(dicaDaTela("/painel/config", sit({ laudos: 1 }))?.chave === "sem-escritorio",
     "com laudo emitido e sem escritório, a cobrança do cadastro faz sentido");
  ok(dicaDaTela("/painel/config", sit({ empresas: 1 })) === null,
     "antes do primeiro laudo, ninguém é incomodado por causa de cadastro");

  ok(dicaDaTela("/painel/negocio/planos", sit({ temEscritorio: true, empresas: 5, analises: 1, laudos: 1, termos: 1, assinados: 1 })) === null,
     "tela sem dica não inventa dica");
  /* a dica do escritório vale em QUALQUER tela: o documento já está saindo sem
     nome, e esperar a pessoa passar pelo cockpit para avisar é tarde */
  ok(dicaDaTela("/painel/negocio/planos", sit({ laudos: 1 }))?.chave === "sem-escritorio",
     "mas a do escritório aparece em qualquer tela — o laudo já está saindo sem nome");
}

/* ═══════════ 4 · as respostas fixas casam com a pergunta certa ════════ */
{
  const s = sit({ empresas: 25 });

  ok(respostaLocal("estou perdida", s)?.chave === "por-onde-comeco",
     "a frase que veio no WhatsApp é reconhecida");
  ok(respostaLocal("Por onde eu começo?", s)?.chave === "por-onde-comeco",
     "com acento e maiúscula também");
  ok(/1\./.test(respostaLocal("estou perdido", s).texto),
     "e a resposta vem numerada, não em prosa");

  const pl = respostaLocal("primeiro eu preencho aquela planilha?", s);
  ok(pl?.chave === "planilha", "a pergunta literal da planilha casa");
  ok(/n[aã]o precisa de planilha/i.test(pl.texto),
     "e a resposta começa desfazendo a premissa errada, não explicando o CSV");

  ok(respostaLocal("o que é rbt12", s)?.chave === "rbt12", "RBT12 tem resposta própria");
  ok(/PGDAS/i.test(respostaLocal("onde acho a receita bruta", s).texto),
     "e ela diz ONDE achar o número, não só o que é");

  ok(respostaLocal("como funciona o termo", s)?.chave === "termo", "termo casa");
  ok(respostaLocal("qual o prazo mesmo?", s)?.chave === "prazo", "prazo casa");
  ok(respostaLocal("preciso terminar o curso antes?", s)?.chave === "curso", "curso casa");
}

/* ═══════════ 5 · e NÃO casam com pergunta de norma ════════════════════
 * Roteiro de uso é determinístico; norma é curadoria. Se um gatilho de uso
 * engolir uma pergunta tributária, o assistente passa a afirmar coisas sobre a
 * LC 214 com texto que ninguém revisou como conteúdo técnico. */
{
  const s = sit({ empresas: 10 });
  const normativas = [
    "o split payment atinge quem optar?",
    "qual a alíquota de referência da CBS em 2027?",
    "o ISS continua no DAS até quando?",
    "empresa do anexo III com fator R alto compensa optar?",
  ];
  for (const q of normativas) {
    ok(respostaLocal(q, s) === null, `pergunta de norma não vira roteiro: "${q}"`);
  }
  ok(respostaLocal("", s) === null, "pergunta vazia não casa nada");
  ok(respostaLocal("ok", s) === null, "duas letras não casam nada");
}

/* ═══════════ 6 · a resposta de "por onde começo" muda com o estado ════ */
{
  const nova = respostaLocal("por onde começo", sit()).texto;
  const comCarteira = respostaLocal("por onde começo", sit({ empresas: 25, temEscritorio: true })).texto;
  ok(/cole o CNPJ/i.test(nova), "conta vazia recebe a instrução de cadastrar");
  ok(/an[aá]lise/i.test(comCarteira) && nova !== comCarteira,
     "quem já tem carteira recebe o passo seguinte, não o mesmo texto");
}

/* ═══════════ 7 · as sugestões acompanham o momento ═══════════════════ */
{
  ok(sugestoes(sit()).some((x) => /planilha/i.test(x)),
     "na conta vazia, a dúvida da planilha é oferecida antes de ser perguntada");
  ok(sugestoes(sit({ empresas: 5 })).some((x) => /RBT12/i.test(x)),
     "com carteira, a dúvida oferecida passa a ser a da análise");
  for (const s of [sit(), sit({ empresas: 5 }), sit({ empresas: 5, analises: 1 }), sit({ empresas: 5, analises: 1, laudos: 1, termos: 1, assinados: 1 })]) {
    ok(sugestoes(s).length === 3, "sempre três sugestões — nem uma parede de opções, nem uma só");
  }
}

console.log(f ? `\n${f} FALHA(S)` : "\ntudo ok");
process.exit(f ? 1 : 0);
