import { createClient } from "@/lib/supabase-server";
import { Cockpit, type Aviso } from "@/components/Cockpit";
import { contarEsteira, montarFila, type AnaliseCru, type ColetaCru, type EmpresaCru, type Linha } from "@/lib/cockpit";
import { estadoDaJanela, faseDaJanela, chamadaDaCarteira } from "@/lib/janela";
import { decidir, PARAMETROS_2027, type Respostas } from "@/lib/motor";
import { atingidas, ordenar, type EmpresaRadar, type ItemRadar } from "@/lib/radar";
import { abertosPorEmpresa, novosDesde } from "@/lib/apontamentos";
import { derivaDe } from "@/lib/deriva";

/**
 * O COCKPIT — a única tela de trabalho do contador.
 *
 * Aqui só se BUSCA e se CALCULA; a interação inteira vive no componente de
 * cliente. Os avisos são montados neste servidor de propósito: eles nascem de
 * cruzamentos (radar × carteira, análise × parâmetros vigentes) que exigiriam
 * mandar a carteira inteira com respostas e parâmetros para o navegador.
 *
 * Regra do aviso, herdada do digest: aviso que não vira item de fila não entra.
 */

export const dynamic = "force-dynamic";

/** marcos da transição que atingem clientes desta carteira */
async function avisosDoRadar(
  supabase: ReturnType<typeof createClient>,
  linhas: Linha[],
  empresasRadar: EmpresaRadar[]
): Promise<Aviso[]> {
  const { data: itens, error } = await supabase
    .from("radar_itens")
    .select("id, titulo, resumo, o_que_fazer, fonte, publicado_em, vigencia_em, severidade, criterio")
    .eq("ativo", true)
    /* SÓ ALERTA INTERROMPE. Publicação marcada como notícia (`no_cockpit`
       falso) vive só na aba Reforma: o cockpit é fila de trabalho, e um aviso
       aqui tira a pessoa do que ela estava fazendo. A coluna nasceu na 0056
       com default true, então nada muda para os itens que já existiam.

       Até 06/08 este filtro existia só no comentário — a intenção descrita e o
       código sem ela. Notícia entrava no cockpit do mesmo jeito. */
    .eq("no_cockpit", true);
  // a tabela só existe a partir da migration 0011; sem ela o cockpit segue inteiro
  if (error || !itens?.length) return [];

  const { data: leituras } = await supabase.from("radar_leituras").select("item_id");
  const lidos = new Set((leituras ?? []).map((l) => l.item_id));

  const hoje = new Date().toISOString().slice(0, 10);
  const avisos: Aviso[] = [];
  for (const item of ordenar(itens as unknown as ItemRadar[], hoje)) {
    const alvo = atingidas(item, empresasRadar);
    if (alvo.length === 0) continue; // notícia sem cliente atingido é ruído
    /* LIDO SOME DAQUI, SEM EXCEÇÃO.
     *
     * A regra anterior era "já lido não repete no topo", com um `&&
     * avisos.length >= 1` no fim: o primeiro item lido continuava aparecendo
     * quando era o único da lista. Na prática, o botão "marcar como lido" não
     * mudava nada na tela — clicava, recarregava, o aviso continuava lá.
     *
     * Botão que não muda o que está na tela é pior do que botão nenhum: ensina
     * a não confiar na interface. Nada se perde ao sumir daqui — o histórico
     * inteiro, lido e não lido, vive na aba Reforma, que é feed. */
    if (lidos.has(item.id)) continue;
    avisos.push({
      id: item.id,
      tipo: "radar",
      titulo: `${alvo.length} ${alvo.length === 1 ? "cliente seu é atingido" : "clientes seus são atingidos"} por: ${item.titulo}`,
      detalhe: item.resumo,
      o_que_fazer: item.o_que_fazer,
      fonte: item.fonte,
      empresas: alvo.map((e) => e.id),
      nao_lido: !lidos.has(item.id),
    });
    if (avisos.length >= 3) break; // o topo da fila não é um feed de notícias
  }
  void linhas;
  return avisos;
}

export default async function Painel() {
  const supabase = createClient();

  // o escritório identificado é o passo 1 da trilha — e o que vai na capa do laudo
  const { data: { user } } = await supabase.auth.getUser();
  const { data: perfil } = user
    ? await supabase.from("profiles").select("tenants(nome, crc)").eq("id", user.id).maybeSingle()
    : { data: null };
  const tt = perfil?.tenants as { nome?: string; crc?: string } | { nome?: string; crc?: string }[] | null;
  const tenant = Array.isArray(tt) ? tt[0] : tt;
  const temEscritorio = !!tenant?.nome && tenant.nome !== "Escritório" && !!tenant?.crc;

  const { data: empresas } = await supabase
    .from("empresas")
    .select(
      // schema-ok: regime gravado por /api/importar (0004) e editável por /api/empresa
      "id, cnpj, razao_social, cnae_principal, regime, faixa, motivo_triagem, prioridade_maxima, rbt12, anexo, contato_nome, contato_email"
    )
    .is("arquivada_em", null)
    .limit(2000);

  const { data: analises } = await supabase
    .from("analises")
    .select("id, empresa_id, saida, re, prioridade, parametros, respostas, calculado_em")
    .limit(2000);

  /**
   * LAUDOS E TERMOS SEM TETO ERAM UM TETO ESCONDIDO — conserto de 08/08/2026.
   *
   * Estas duas consultas não pediam `.limit()`, e consulta sem limite não é
   * consulta sem corte: vale o teto padrão do PostgREST (mil linhas). Passando
   * disso, `laudoPorAnalise` e `termoPorAnalise` perdiam as linhas excedentes —
   * e a fila voltava a dizer "Emitir laudo" para empresas que JÁ TÊM documento,
   * em silêncio. O clique reemitia.
   *
   * É a pior forma do defeito: não dá erro, não aparece em log, e só acontece
   * com o escritório grande, que é justamente o que não se pode perder. Peço
   * explicitamente o mesmo teto das outras consultas desta página e comparo com
   * o que voltou — se bater no teto, a tela avisa em vez de mentir.
   */
  const TETO_FILA = 2000;
  const { data: laudos } = await supabase
    .from("laudos")
    .select("id, analise_id, numero")
    .limit(TETO_FILA);
  const { data: termos } = await supabase
    .from("termos")
    .select("id, analise_id, token, assinatura_status, assinado_em")
    .limit(TETO_FILA);

  /* emitir laudo é fato do passado e não desacontece: esta contagem ignora
     arquivamento de propósito — ver `jaEmitiuLaudo` no Cockpit */
  const { count: laudosDeSempre } = await supabase
    .from("laudos")
    .select("id", { count: "exact", head: true });

  const bateuNoTeto =
    (empresas?.length ?? 0) >= TETO_FILA ||
    (analises?.length ?? 0) >= TETO_FILA ||
    (laudos?.length ?? 0) >= TETO_FILA ||
    (termos?.length ?? 0) >= TETO_FILA;

  /* quem já respondeu o formulário — a informação que só existia dentro de
     cada empresa e que o contador precisa VER na fila */
  const { data: coletas } = await supabase
    .from("coletas")
    .select("empresa_id, status, respondido_em, aplicada_em")
    .limit(2000);

  /**
   * OS APONTAMENTOS DA REFORMA, NA FILA — 08/08/2026.
   *
   * O monitor roda todo dia às 5h, cruza cada norma nova com a carteira e grava
   * um apontamento por empresa atingida. Isso é a única coisa do produto que
   * continua produzindo trabalho cobrável depois que a janela fecha — e não
   * tinha superfície nenhuma: `abertosPorEmpresa()` e `novosDesde()` existiam
   * em lib/apontamentos.ts, com comentários dizendo para que serviam, e eram
   * chamadas só pelos testes. O contador só descobria os apontamentos se
   * navegasse até uma sub-aba dentro de "Aprender", sem badge, sem selo, sem
   * nada que o levasse até lá.
   *
   * O `try` é o mesmo padrão do layout: as migrations 0063/0064 ainda não
   * estão aplicadas em produção, e o cockpit não pode cair por causa de uma
   * tabela que ainda não existe.
   */
  let apontamentosAbertos: Record<string, number> = {};
  let empresasComNovidade: string[] = [];
  try {
    const { data: aps } = await supabase
      .from("apontamentos")
      .select("empresa_id, status, criado_em")
      .limit(2000);
    const lista = (aps ?? []) as { empresa_id: string; status: string; criado_em: string }[];
    apontamentosAbertos = abertosPorEmpresa(
      lista as unknown as Parameters<typeof abertosPorEmpresa>[0]
    );
    /* `novosDesde(…, null)` devolve os abertos; o filtro por `novo` é o que
       separa "ainda não olhei" de "já tratei". Sem data de última visita
       gravada, anunciar por data chamaria de novidade o que já foi visto. */
    empresasComNovidade = Array.from(
      new Set(
        novosDesde(lista as unknown as Parameters<typeof novosDesde>[0], null)
          .filter((a) => a.status === "novo")
          .map((a) => (a as unknown as { empresa_id: string }).empresa_id)
      )
    );
  } catch {
    /* migration não aplicada: a fila segue sem o selo */
  }

  const linhas = montarFila(
    (empresas ?? []) as EmpresaCru[],
    (analises ?? []) as AnaliseCru[],
    laudos ?? [],
    termos ?? [],
    (coletas ?? []) as ColetaCru[],
    apontamentosAbertos
  );
  const esteira = contarEsteira(linhas);
  const janela = estadoDaJanela();
  const fase = faseDaJanela();

  /* ─────────────────────────────────────────────────────────────── avisos
   * O ANEXO VEM DE `empresas`, NÃO DE `linhas` — e este é o conserto de um
   * defeito que só apareceu quando o radar publicou o primeiro item com
   * critério por anexo, em 06/08/2026.
   *
   * `Linha` (lib/cockpit) não carrega `anexo`: ela é a fila de trabalho, e
   * anexo não aparece nela. O mapeamento antigo preenchia `anexo: null`, e
   * `afeta()` descarta empresa com anexo nulo quando o critério pede anexo.
   *
   * Resultado, silencioso e completo: o item da NFS-e, com critério
   * `anexos [3,4,5]`, atingia 39 empresas segundo a função `radar_alcance()`
   * do banco e segundo a rota de aviso — e ZERO aqui. O e-mail saiu dizendo
   * "39 clientes seus", o contador abriu o app e não viu nada.
   *
   * A lista de empresas já vinha com `anexo` na query acima. Era só usá-la.
   * Duas leituras da mesma carteira que discordam falham sempre assim:
   * ninguém enxerga, porque nada quebra.
   * ───────────────────────────────────────────────────────────────────── */
  const saidaPorEmpresa = new Map(
    (analises ?? []).map((a) => [a.empresa_id as string, (a.saida ?? null) as string | null])
  );
  const empresasRadar: EmpresaRadar[] = (empresas ?? []).map((e) => ({
    id: e.id as string,
    razao_social: e.razao_social as string,
    cnpj: e.cnpj as string,
    anexo: (e as { anexo?: number | null }).anexo ?? null,
    faixa: (e.faixa ?? null) as string | null,
    cnae_principal: (e.cnae_principal ?? null) as string | null,
    saida: saidaPorEmpresa.get(e.id as string) ?? null,
    tem_analise: saidaPorEmpresa.has(e.id as string),
  }));

  const avisos: Aviso[] = await avisosDoRadar(supabase, linhas, empresasRadar);

  // REVISÃO DA CARTEIRA — o que muda de recomendação com os parâmetros vigentes.
  // Era uma tela inteira; virou um aviso, porque só interessa quando gera trabalho.
  const { data: param } = await supabase
    .from("parametros_exercicio")
    .select("aliquota_cbs, aliquota_ibs, fronteira_min, fronteira_max")
    .eq("exercicio", 2027)
    .maybeSingle();

  if (param) {
    const vigentes = {
      aliquota: Number(param.aliquota_cbs) + Number(param.aliquota_ibs),
      fronteiraMin: Number(param.fronteira_min),
      fronteiraMax: Number(param.fronteira_max),
    };
    const mudaram: string[] = [];
    for (const a of analises ?? []) {
      const respostas = a.respostas as unknown as Respostas | null;
      const p = a.parametros as { das?: number } | null;
      if (!respostas || !a.saida) continue;
      const novo = decidir(respostas, {
        ...PARAMETROS_2027,
        ...vigentes,
        das: p?.das ?? PARAMETROS_2027.das,
      });
      if (novo.saida !== a.saida) mudaram.push(a.empresa_id);
    }
    if (mudaram.length > 0) {
      avisos.push({
        id: "revisao-parametros",
        tipo: "revisao",
        titulo: `${mudaram.length} ${
          mudaram.length === 1 ? "análise muda" : "análises mudam"
        } de recomendação com os parâmetros vigentes`,
        detalhe:
          "As análises foram gravadas com os parâmetros da época. Recalculando com os valores atuais do exercício, a saída do motor seria outra.",
        /**
         * 08/08/2026: este texto mandava "reabra cada empresa, confira as
         * premissas e salve de novo". Numa carteira de duzentas isso não
         * acontece — e era exatamente o trabalho que o produto vende por
         * e-mail quando a alíquota de referência sair. O botão de revisão em
         * lote agora existe; o texto passa a explicar o que ele faz, e por que
         * ele NÃO reescreve o que já foi entregue.
         */
        o_que_fazer:
          "Use “Revisar a carteira” aqui ao lado: ela recalcula todas as empresas com os parâmetros vigentes, sobre as mesmas respostas, criando uma rodada nova. A rodada anterior fica inteira, e o laudo já emitido não muda — documento entregue é imutável por desenho.",
        empresas: mudaram,
        acao_revisao: true,
      });
    }
  }

  /**
   * O QUE A REFORMA TROUXE PARA A CARTEIRA — 08/08/2026.
   *
   * O monitor cruza cada norma nova com a carteira todo dia às 5h e grava um
   * apontamento por empresa atingida. Isso é a única coisa do produto que
   * continua produzindo trabalho cobrável depois que a janela fecha — e não
   * chegava ao contador: a tela vive numa sub-aba dentro de "Aprender", sem
   * nada que levasse até lá.
   *
   * Entra como aviso, e não como bloco novo, de propósito: o cockpit já tem
   * uma lista de "o que existe para fazer", com o botão que traz as empresas
   * para a fila. Inventar uma segunda superfície de novidade seria ensinar o
   * contador a ignorar as duas.
   */
  if (empresasComNovidade.length > 0) {
    avisos.push({
      id: "apontamentos-novos",
      tipo: "revisao",
      titulo: `${empresasComNovidade.length} ${
        empresasComNovidade.length === 1 ? "cliente seu tem" : "clientes seus têm"
      } ponto da Reforma ainda não tratado`,
      detalhe:
        "O monitor cruza cada norma nova com a sua carteira e aponta, empresa por empresa, quem é atingido.",
      o_que_fazer:
        "Traga estas empresas para a fila e trate uma a uma na aba Apontamentos: cada ponto vira “tratado”, “não se aplica” ou “virou serviço”.",
      empresas: empresasComNovidade,
    });
  }

  /**
   * A DERIVA DO MOTOR CHEGA A QUEM ASSINA — conserto de 08/08/2026.
   *
   * `lib/deriva.ts` roda o motor de hoje sobre os PARÂMETROS CONGELADOS de cada
   * análise e marca `critica` quando a saída muda e já existe laudo emitido ou
   * termo assinado. É a peça mais bem pensada do produto — e vivia só em
   * `/painel/negocio`, que `layout.tsx` barra para quem não é superadmin.
   *
   * Ou seja: quem tem o CRC, assinou o documento e vai ligar para o cliente não
   * tinha nenhuma superfície dizendo "duas das suas análises com termo assinado
   * mudariam de recomendação hoje". Quem tinha era o dono da plataforma, que
   * não pode ligar para o cliente de ninguém.
   *
   * O aviso é diferente do de parâmetros logo acima: aquele mede mudança de
   * ALÍQUOTA (o número do exercício), este mede mudança de REGRA (o motor). Os
   * dois podem existir ao mesmo tempo e pedem conversas diferentes — por isso
   * não foram fundidos.
   */
  const comLaudo = new Set((laudos ?? []).map((l) => l.analise_id as string));
  const comTermoAssinado = new Set(
    (termos ?? [])
      .filter((t) => t.assinatura_status === "assinado" || !!t.assinado_em)
      .map((t) => t.analise_id as string)
  );
  const nomePorEmpresa = new Map((empresas ?? []).map((e) => [e.id as string, e.razao_social as string]));

  const derivadas = (analises ?? [])
    .map((a) =>
      derivaDe({
        id: a.id as string,
        tenant_id: null,
        tenant_nome: null,
        empresa_id: a.empresa_id as string,
        empresa_nome: nomePorEmpresa.get(a.empresa_id as string) ?? null,
        calculado_em: (a.calculado_em as string) ?? null,
        saida: (a.saida as string) ?? null,
        rq: null,
        ch: null,
        cl: null,
        re: (a.re as number) ?? null,
        fc: null,
        respostas: (a.respostas as Record<string, number>) ?? null,
        parametros: (a.parametros as Record<string, unknown>) ?? null,
        tem_laudo: comLaudo.has(a.id as string),
        laudo_numero: null,
        laudo_emitido_em: null,
        termo_assinado: comTermoAssinado.has(a.id as string),
      })
    )
    .filter((l) => l.critica);

  if (derivadas.length > 0) {
    const empresasDerivadas = (analises ?? [])
      .filter((a) => derivadas.some((d) => d.id === a.id))
      .map((a) => a.empresa_id as string);
    avisos.push({
      id: "deriva-do-motor",
      tipo: "revisao",
      titulo: `${derivadas.length} ${
        derivadas.length === 1 ? "documento já emitido mudaria" : "documentos já emitidos mudariam"
      } de recomendação com a regra de hoje`,
      detalhe:
        "O método de cálculo foi revisado depois que estes documentos saíram. Rodando a regra atual sobre as MESMAS premissas congeladas, a recomendação seria outra.",
      o_que_fazer:
        "O documento entregue não muda sozinho, e nem deve. Abra cada empresa, confira e decida se vale emitir uma segunda via — e ligue para o cliente antes que ele descubra pela verificação.",
      empresas: Array.from(new Set(empresasDerivadas)),
    });
  }

  /* o aviso que impede a fila de mentir calada quando a carteira passa do teto
     desta tela — sem ele, "Emitir laudo" reaparece em empresa que já tem um */
  if (bateuNoTeto) {
    avisos.push({
      id: "teto-da-fila",
      tipo: "revisao",
      titulo: "A carteira passou do que esta tela carrega de uma vez",
      detalhe:
        "O cockpit lê até 2.000 registros de cada tipo. Acima disso, alguma linha pode aparecer sem o laudo ou o termo que já existe — e a ação sugerida sai errada.",
      o_que_fazer:
        "Use a busca e os filtros para trabalhar por recorte, e arquive as empresas que saíram da carteira. Se isso virar rotina, me avise: a fila precisa paginar no servidor.",
      empresas: [],
    });
  }

  // laudo emitido e ninguém para assinar: trabalho parado por falta de cadastro
  const semContato = linhas.filter((l) => l.laudo_id && !l.termo_id && !l.tem_contato);
  if (semContato.length > 0) {
    avisos.push({
      id: "sem-contato",
      tipo: "contato",
      titulo: `${semContato.length} ${
        semContato.length === 1 ? "empresa tem laudo" : "empresas têm laudo"
      } e nenhum contato para assinar o termo`,
      detalhe: "Sem nome e e-mail do responsável o termo de ciência não sai — e a prova não fecha.",
      empresas: semContato.map((l) => l.id),
    });
  }

  return (
    <div>
      <div className="mb-3">
        <h1 className="text-[19px] font-bold tracking-tight">Cockpit da carteira</h1>
        <p className="mt-0.5 text-[13px] text-muted">
          {chamadaDaCarteira(fase.fase, esteira.decidem, esteira.importadas)}
        </p>
      </div>

      <Cockpit
        linhas={linhas}
        esteira={esteira}
        dias={janela.dias}
        posPct={janela.posPct}
        fase={fase}
        avisos={avisos}
        totalCarteira={linhas.length}
        temEscritorio={temEscritorio}
        /* contado na tabela e não na fila: a fila exclui empresa arquivada, e
           era isso que fazia o assistente de primeiros passos renascer para
           quem já tinha emitido laudo (08/08/2026) */
        jaEmitiuLaudo={(laudosDeSempre ?? 0) > 0}
      />
    </div>
  );
}
