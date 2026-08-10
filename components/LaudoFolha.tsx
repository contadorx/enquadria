import Link from "next/link";
import { BotaoImprimir } from "@/components/BotaoImprimir";
import { formatarCnpj } from "@/lib/cnpj";
import { leituraDoDinheiro } from "@/lib/roteiro";
import { CSS_IMPRESSAO } from "@/lib/impressao";
import { assinaturaTecnica, mostrarNomeEscrito, type Escritorio } from "@/lib/escritorio";
import { pct, moeda } from "@/lib/motor";
import { type Faixa } from "@/lib/triagem";
import {
  premissasComOrigem,
  memoriaDeCalculo,
  baseDeCalculo,
  quadroComparativo,
  condicoesDeValidade,
  riscosELimites,
  pressaoDoLaudo,
  absorcaoDoLaudo,
  FRONTEIRA_CONTA_NEGOCIACAO,
  tabelaDoAnexo,
  recomendacao,
  rotuloOrigem,
  ehLaudoCurto,
  BASE_LEGAL,
  NOTA_PARAMETROS,
  RESSALVA_DA_RECOMENDACAO,
  type AnaliseGravada,
} from "@/lib/laudo";

/**
 * A FOLHA DO LAUDO — só apresentação.
 *
 * Separada da rota porque o documento é o produto: precisa poder ser montado a
 * partir de dados de teste, revisado e impresso sem passar pelo banco. A rota
 * busca e congela; aqui só se desenha o que foi congelado.
 */

const COR_HEX: Record<string, string> = {
  vermelho: "#DC2626",
  amarelo: "#D97706",
  neutro: "#475569",
  verde: "#059669",
};

export interface DadosLaudo {
  numero: number;
  emitido_em: string;
  analise: AnaliseGravada;
  empresa: {
    razao_social?: string;
    cnpj?: string;
    anexo?: number;
    regime?: string;
    faixa?: string;
    motivo_triagem?: string;
  } | null;
  escritorio: Escritorio | null;
}

/**
 * `publico` só governa a NAVEGAÇÃO: quem chega pelo link enviado ao cliente não
 * tem cockpit para onde voltar. O CONTEÚDO é idêntico nos dois endereços — a
 * memória de cálculo é a peça que sustenta o honorário; entregar menos ao
 * cliente esvaziaria o documento que ele está pagando.
 */
export function LaudoFolha({ dados, publico = false }: { dados: DadosLaudo; publico?: boolean }) {
  const { analise, empresa, escritorio: t } = dados;
  const laudo = { numero: dados.numero, emitido_em: dados.emitido_em };
  const a = analise;
  const p = a.parametros ?? {};
  const rec = recomendacao(a);
  const cor = COR_HEX[rec.cor];
  const dataEmissao = new Date(laudo.emitido_em).toLocaleDateString("pt-BR");
  const numero = String(laudo.numero).padStart(4, "0");
  const faixa = (empresa?.faixa ?? "A") as Faixa;
  const curto = ehLaudoCurto(faixa);

  const premissas = premissasComOrigem(a);
  const memoria = memoriaDeCalculo(a);
  const base = baseDeCalculo(a);
  const pressao = pressaoDoLaudo(a);
  const absorcao = absorcaoDoLaudo(a);
  const quadro = quadroComparativo(a);
  const condicoes = condicoesDeValidade(a);
  const riscos = riscosELimites(a);
  const anexoTab = tabelaDoAnexo(a);
  const carimbo = p.carimbo ?? null;
  const cenarios = p.cenarios ?? [];
  const dinheiro = p.dinheiro ?? null;
  const sens = p.sensibilidade ?? [];

  const Cabecalho = (
    <>
      <div className="brand">
        <div className="firmwrap">
          {t?.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={t.logo_url} alt="" className="logo" />
          )}
          <div>
            {/* logo que já traz o nome escrito não ganha o nome de novo ao lado */}
            {mostrarNomeEscrito(t) && <div className="firm">{t?.nome ?? "Escritório"}</div>}
            {t?.crc && <div className="crc">{t.crc}</div>}
          </div>
        </div>
        <div className="wm">
          LAUDO {numero}
          <br />
          {dataEmissao}
        </div>
      </div>

      <h1>
        {curto
          ? "Laudo de enquadramento — permanência no regime atual"
          : "Laudo de enquadramento de IBS e CBS"}
      </h1>

      <div className="sec">1. Identificação</div>
      <table className="ident">
        <tbody>
          <tr>
            <td>Empresa</td>
            <td>
              {empresa?.razao_social} · {empresa?.cnpj ? formatarCnpj(empresa.cnpj) : ""}
            </td>
          </tr>
          <tr>
            <td>Regime e enquadramento</td>
            <td>
              {empresa?.regime ?? "Simples Nacional"}
              {p.anexo || empresa?.anexo ? `, Anexo ${p.anexo ?? empresa?.anexo}` : ""}
              {p.ddas?.faixa ? `, faixa ${p.ddas.faixa}` : ""}
              {/* O RÓTULO COMERCIAL SAIU DAQUI — 08/08/2026.
                  Imprimia "· triagem: Urgente / Avaliar / Baixo risco", que são
                  as etiquetas da FILA DE VENDA do contador (`lib/potencial.ts`,
                  com `cobravel: true`), não classificação técnica de nada. O
                  empresário lia "Urgente" na identificação da própria empresa,
                  num documento que não explica o que a palavra significa ali.
                  Pior: `faixa` cai em "A" por padrão quando a empresa não tem
                  triagem gravada, então empresa sem faixa nenhuma saía impressa
                  como "Urgente". A faixa continua governando o formato do laudo
                  (curto ou completo) — o que saiu foi o rótulo no papel. */}
            </td>
          </tr>
          <tr>
            <td>Receita bruta dos 12 meses</td>
            <td>{p.rbt12 != null ? moeda(p.rbt12) : "não informada"}</td>
          </tr>
          <tr>
            <td>Exercício de referência</td>
            <td>{p.exercicio ?? 2027}</td>
          </tr>
          <tr>
            <td>Laudo</td>
            <td>
              nº {numero}, emitido em {dataEmissao}
            </td>
          </tr>
          <tr>
            <td>Responsável técnico</td>
            <td>
              {t?.nome ?? "—"}
              {t?.crc ? ` · ${t.crc}` : ""}
            </td>
          </tr>
          <tr>
            <td>Verificação pública</td>
            <td>
              enquadria.com.br/verificar — código {numero} e o CNPJ da empresa
            </td>
          </tr>
        </tbody>
      </table>

      <div className="sec">2. Objeto e base legal</div>
      <p className="txt">
        {curto ? (
          <>
            Este laudo documenta a análise de <b>{empresa?.razao_social}</b> quanto à opção por apurar
            IBS e CBS fora do documento único de arrecadação do Simples Nacional, na janela de 1º a 30
            de setembro de 2026, e registra as razões pelas quais a opção <b>não se aplica</b> a esta
            empresa.
          </>
        ) : (
          <>
            Este laudo analisa se <b>{empresa?.razao_social}</b> deve optar por apurar IBS e CBS fora do
            documento único de arrecadação do Simples Nacional, na janela de 1º a 30 de setembro de
            2026, com efeito de janeiro a junho de 2027 e cancelamento admitido até o último dia de
            novembro de 2026.
          </>
        )}
      </p>
      <ul className="legal">
        {BASE_LEGAL.map((b) => (
          <li key={b.norma}>
            <b>{b.norma}</b> — {b.papel}
          </li>
        ))}
      </ul>
    </>
  );

  const Rodape = (
    <>
      <div className="sec">{curto ? "5. Conclusão e responsabilidade técnica" : "11. Conclusão e responsabilidade técnica"}</div>
      <p className="txt">
        A análise foi conduzida com as premissas declaradas na seção {curto ? "3" : "3"} e com os
        parâmetros congelados na data de emissão. Os valores apresentados são estimativa de cenário e
        não constituem apuração fiscal nem garantia de resultado. A decisão de optar ou permanecer, e
        a responsabilidade técnica sobre ela, são do profissional que assina este documento.
      </p>

      <div className="verif">
        <b>Verificação de autenticidade.</b> Este laudo pode ser conferido em{" "}
        <b>enquadria.com.br/verificar</b>, informando o número <b>{numero}</b> e o CNPJ da empresa. O
        conteúdo foi congelado na emissão e não se altera por revisões posteriores da análise.
      </div>

      {/* peça técnica é assinada por gente com CRC, não por razão social */}
      <div className="sign">{assinaturaTecnica(t)}</div>
    </>
  );

  return (
    <div className="doc">
      <div className="no-print mb-4 flex items-center justify-between">
        {publico ? (
          <span />
        ) : (
          <Link href="/painel" className="text-sm text-accentdeep">
            ← voltar ao cockpit
          </Link>
        )}
        <BotaoImprimir />
      </div>

      <div className="sheet">
        {Cabecalho}

        {/* ---------------------------------------------------- LAUDO CURTO */}
        {curto ? (
          <>
            <div className="sec">3. Premissas e critério de triagem</div>
            <p className="txt">
              A classificação partiu da atividade econômica registrada e da situação cadastral da
              empresa. {(empresa as { motivo_triagem?: string } | null)?.motivo_triagem ?? ""}
            </p>
            {premissas.length > 0 && (
              <table className="prem">
                <tbody>
                  {/* só as três que sustentam a conclusão: o resto seria enchimento */}
                  {premissas.slice(0, 3).map((pr) => (
                    <tr key={pr.pergunta}>
                      <td>{pr.pergunta}</td>
                      <td className="num">{pr.resposta}</td>
                      <td className={`org ${pr.origem === "estimada" ? "est" : ""}`}>
                        {rotuloOrigem(pr.origem)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="sec">4. Resultado</div>
            <div className="box" style={{ borderColor: cor }}>
              <b style={{ color: cor }}>{rec.titulo}.</b> {p.motivo ?? rec.descricao}
              {/* A RESSALVA ENCOSTADA NA CONCLUSÃO — 08/08/2026.
                  A caixa da recomendação é a primeira coisa que o empresário lê,
                  tem borda colorida e um verbo no imperativo; o aviso de que
                  isto é estimativa de cenário ficava na última seção, quatro
                  telas abaixo. E o laudo CURTO — que vai para o maior volume da
                  carteira — não tinha nem a nota de parâmetros nem a ressalva da
                  negociação, porque as duas moram em blocos que ele não imprime.
                  Disclaimer longe da dúvida é disclaimer que não foi lido. */}
              <div className="ressalva">{RESSALVA_DA_RECOMENDACAO}</div>
            </div>
            <p className="txt">
              A opção por apurar IBS e CBS fora do DAS pressupõe cliente pessoa jurídica que aproveite
              o crédito integral. Sem essa contrapartida, a apuração por fora acrescenta obrigação sem
              retorno correspondente. Este documento registra a análise e a conclusão pela permanência, com a mesma
              verificação pública dos demais laudos do escritório.
            </p>
            <ul className="riscos">
              {riscos.slice(0, 3).map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
            {Rodape}
          </>
        ) : (
          /* -------------------------------------------------- LAUDO COMPLETO */
          <>
            <div className="sec">3. Premissas declaradas</div>
            <table className="prem">
              <tbody>
                {premissas.map((pr) => (
                  <tr key={pr.pergunta}>
                    <td>
                      {pr.pergunta}
                      {pr.composicao && <div className="comp">{pr.composicao}</div>}
                    </td>
                    <td className="num">{pr.resposta}</td>
                    <td className={`org ${pr.origem === "estimada" ? "est" : ""}`}>
                      {rotuloOrigem(pr.origem)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {carimbo && (
              <div className="carimbo">
                <b>Alíquota utilizada: {pct(carimbo.aliquota)} (IBS + CBS, exercício {p.exercicio ?? 2027}).</b>{" "}
                {carimbo.fonte} Consulta em{" "}
                {new Date(carimbo.consultado_em).toLocaleDateString("pt-BR")}. {carimbo.nota_alternativa}
              </div>
            )}

            <div className="sec">4. Memória de cálculo</div>
            <table className="mem">
              <thead>
                <tr>
                  <th>Passo</th>
                  <th>Fórmula</th>
                  <th>Substituição</th>
                  <th>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {memoria.map((m) => (
                  <tr key={m.passo}>
                    <td>{m.passo}</td>
                    <td className="mono">{m.formula}</td>
                    <td className="mono">{m.substituicao}</td>
                    <td className="mono res">{m.resultado}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* A BASE DE CÁLCULO DO dDAS ENTRA NO LAUDO — 08/08/2026.
                `baseDeCalculo()` existe em lib/laudo.ts desde sempre, com um
                comentário dizendo em quantas linhas ela evita "a única conversa
                que ninguém quer ter": quando o teto de 5% do ISS morde, o
                `sharePC` impresso no passo 2 é MAIOR que o da tabela do anexo
                reproduzida na seção 10 do mesmo documento. Um contador que
                confira os dois encontra números diferentes e conclui que o
                laudo errou. A função nunca foi importada aqui — só pela tela
                interna do contador, que é quem menos precisa dela. */}
            {base.length > 0 && (
              <ul className="basecalc">
                {base.map((linha, i) => (
                  <li key={i}>{linha}</li>
                ))}
              </ul>
            )}

            {/* de onde vêm os cortes do método — ver NOTA_PARAMETROS em lib/laudo */}
            <p className="notaparam">{NOTA_PARAMETROS}</p>

            <div className="sec">5. Quadro comparativo</div>
            <table className="quadro">
              <thead>
                <tr>
                  <th></th>
                  <th>Dentro do DAS</th>
                  <th>IBS/CBS por fora</th>
                  <th>Diferença</th>
                </tr>
              </thead>
              <tbody>
                {quadro.map((l) => (
                  <tr key={l.rotulo}>
                    <td>{l.rotulo}</td>
                    <td className="mono">{l.dentro}</td>
                    <td className="mono">{l.fora}</td>
                    <td className="mono res">{l.diferenca}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {cenarios.length > 1 && (
              <table className="quadro">
                <thead>
                  <tr>
                    <th>Cenário de alíquota</th>
                    <th>Repasse necessário</th>
                    <th>Ganho do comprador</th>
                    <th>Saída</th>
                  </tr>
                </thead>
                <tbody>
                  {cenarios.map((c) => (
                    <tr key={c.aliquota}>
                      <td>
                        {pct(c.aliquota)} — {c.principal ? "estimativa de trabalho" : "sensibilidade"}
                      </td>
                      <td className="mono">
                        {isFinite(c.resultado.re) ? pct(c.resultado.re) : "—"}
                      </td>
                      <td className="mono">{pct(c.resultado.fc)}</td>
                      <td className="mono res">{c.resultado.saida}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {dinheiro?.receita != null && (
              <table className="quadro">
                <tbody>
                  {/**
                    * "GANHO ESTIMADO NO ANO" — o rótulo que saiu em 10/08/2026.
                    *
                    * O número é `folga × receita qualificada × receita`: a faixa
                    * de negociação INTEIRA convertida em reais, ou seja, o que a
                    * empresa levaria se capturasse tudo o que está na mesa. A
                    * seção 8 deste mesmo laudo diz, três páginas adiante, que
                    * isso depende de barganha e que nenhum número aqui garante
                    * que o repasse será aceito.
                    *
                    * Chamar o topo da faixa de "ganho estimado" é prometer
                    * resultado — e era a linha que, quatro linhas abaixo do
                    * "+R$ 55.376 de tributo", fazia o laudo parecer que se
                    * contradizia. Não se contradizia: media dois momentos e
                    * chamava um deles pelo nome errado.
                    *
                    * Vira uma FAIXA com as duas pontas à vista, e a de baixo é
                    * zero. Quem lê passa a ver que o piso do repasse não gera
                    * ganho nenhum — só evita a perda —, que é exatamente a
                    * conversa que o empresário precisa ter.
                    */}
                  <tr>
                    <td>
                      Se o repasse ficar no mínimo que equilibra
                      {a.re != null && isFinite(Number(a.re)) ? ` (${pct(Number(a.re))})` : ""}
                      <div className="comp">
                        A empresa não perde e não ganha: o reajuste apenas cobre o custo líquido.
                      </div>
                    </td>
                    <td className="mono">R$ 0</td>
                  </tr>
                  <tr>
                    <td>
                      Se o repasse for negociado até o limite do cliente
                      <div className="comp">
                        Teto da faixa de negociação da seção 8, convertido em reais — não é previsão,
                        e nada neste laudo garante que a negociação chegue lá.
                      </div>
                    </td>
                    <td className="mono res">
                      {dinheiro.ganho_anual != null && dinheiro.ganho_anual > 0
                        ? moeda(dinheiro.ganho_anual)
                        : "sem ganho no cenário"}
                    </td>
                  </tr>
                  <tr>
                    <td>Custo anual de apurar fora do DAS (premissa declarada pelo contador)</td>
                    <td className="mono">
                      {dinheiro.custo_anual != null ? moeda(dinheiro.custo_anual) : "não informado"}
                    </td>
                  </tr>
                  <tr>
                    {/* o laudo vai para a mesa do empresário: "payback" era a
                        única palavra que ele não tinha obrigação de conhecer */}
                    <td>Em quanto tempo o teto da faixa cobre esse custo</td>
                    <td className="mono">
                      {dinheiro.payback_meses != null
                        ? `${dinheiro.payback_meses.toFixed(1).replace(".", ",")} meses`
                        : "não calculado — depende do custo de apuração, que não foi informado"}
                    </td>
                  </tr>
                  <tr>
                    <td>
                      Se não houver repasse nenhum, a empresa absorve
                      <div className="comp">
                        É a outra ponta da mesma faixa, e é para onde a conta vai sem negociação.
                      </div>
                    </td>
                    <td className="mono">
                      {dinheiro.absorvido_anual != null ? moeda(dinheiro.absorvido_anual) : "—"}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}

            {/**
              * O GANHO É BRUTO, e o quadro não dizia isso.
              *
              * As duas linhas do meio já mostram "não informado" e "não
              * calculado" quando o custo de apurar não vem. Mas quem lê um
              * quadro lê a primeira linha — o ganho em reais, sempre presente —
              * e as duas de baixo passam como detalhe técnico.
              *
              * O resultado é uma assimetria de desenho: o benefício aparece por
              * padrão, o custo só quando alguém digita. Não é má-fé, e o efeito
              * é o mesmo. Uma linha resolve, e ela fica ao lado do número, não
              * no rodapé.
              */}
            {dinheiro?.receita != null && dinheiro.custo_anual == null && dinheiro.ganho_anual != null && dinheiro.ganho_anual > 0 && (
              <p className="aviso">
                {/* "o ganho acima" era a última sobra do rótulo que saiu: o número
                    ali é o TETO da faixa, e chamá-lo de ganho aqui devolveria pela
                    nota o que a tabela deixou de afirmar */}
                O teto acima é <b>bruto</b>: o custo de apurar IBS e CBS fora do DAS não foi
                informado e <b>não está descontado</b>. Apurar por fora exige escrituração,
                obrigação acessória e controle de crédito próprios — informe esse custo para que o
                laudo mostre em quanto tempo ele o cobre.
              </p>
            )}

            {/* A CONCLUSÃO EM PORTUGUÊS. O quadro entrega quatro números e
                nenhuma leitura — e é este parágrafo que o empresário repete
                para o sócio depois da reunião. Ver lib/roteiro. */}
            {leituraDoDinheiro(dinheiro) && (
              <p className="txt"><b>Em resumo.</b> {leituraDoDinheiro(dinheiro)}</p>
            )}

            <div className="sec">6. Análise de sensibilidade</div>
            <table className="quadro">
              <thead>
                <tr>
                  <th>Cenário</th>
                  <th>Repasse</th>
                  <th>Efeito na recomendação</th>
                </tr>
              </thead>
              <tbody>
                {sens.map((l) => (
                  <tr key={l.titulo}>
                    <td>
                      {l.titulo}
                      <div className="comp">{l.pergunta}</div>
                    </td>
                    <td className="mono">{l.re != null ? pct(l.re) : "—"}</td>
                    <td>{l.efeito}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="sec">7. Resultado e recomendação</div>
            <div className="box" style={{ borderColor: cor }}>
              <b style={{ color: cor }}>{rec.titulo}.</b> {rec.descricao}
              <div className="ressalva">{RESSALVA_DA_RECOMENDACAO}</div>
              {p.motivo && <div className="motivo">{p.motivo}</div>}
              {p.banda_sublimite && (
                <div className="motivo">
                  A recomendação foi levada à zona de fronteira pela proximidade do sublimite: perto
                  dele, o que já sai do DAS muda no curso do ano e a comparação se desloca.
                </div>
              )}
              {a.prioridade && (
                <div className="prio">
                  Prioridade — há sinalização comercial do cliente ou da concorrência: a decisão saiu
                  do campo estritamente fiscal.
                </div>
              )}
            </div>
            <p className="txt">
              <b>Para que esta recomendação se mantenha, precisa continuar verdadeiro:</b>
            </p>
            <ul className="cond">
              {condicoes.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>

            {/**
              * A SEÇÃO 8 É NOVA, e ela existe por um pedido que veio da prática:
              * separar o que é conta do que é negociação.
              *
              * O laudo respondia "a conta fecha?" e parava — e quem lê conclui
              * que o difícil acabou. O difícil começa ali: a opção transfere o
              * crédito ao comprador no ATO de exercer, e o preço se negocia
              * depois, quando não há mais nada para trocar.
              *
              * Nenhum número desta seção muda a recomendação. Ela é a mesma
              * conta lida em unidade de negociação, para a decisão comercial ser
              * do empresário de fato — e não por omissão do documento.
              */}
            {pressao && (
              <>
                <div className="sec">8. Pressão comercial — onde a conta acaba</div>
                <table className="quadro">
                  <tbody>
                    <tr>
                      <td>Faixa de negociação do reajuste</td>
                      <td className="mono res">{pressao.faixa}</td>
                    </tr>
                    <tr>
                      <td>
                        O que está em disputa entre a empresa e o cliente
                        <div className="comp">
                          Abaixo do piso a empresa absorve; acima do teto o crédito do cliente deixa
                          de cobrir o aumento e ele recusa. Medido em pontos de <b>reajuste de
                          preço</b> — é a mesma folga da seção 5, que a mede em pontos de{" "}
                          <b>ganho do comprador</b> e por isso sai menor.
                        </div>
                      </td>
                      <td className="mono">{pressao.excedente}</td>
                    </tr>
                    <tr>
                      {/* o rótulo nomeia o DENOMINADOR. "Parte dessa faixa" caía
                          sobre a linha de cima, que é `teto − piso`, e a conta
                          é sobre o teto — ver a nota em `pressaoDoLaudo`. */}
                      <td>Do teto que o crédito do cliente comporta, o que a empresa precisa só para não perder</td>
                      <td className="mono">{pressao.posicao}</td>
                    </tr>
                    <tr>
                      <td>Se o repasse não acontecer, a empresa absorve</td>
                      <td className="mono">
                        {pressao.absorve}
                        {pressao.absorve_reais ? ` · ${pressao.absorve_reais}/ano` : ""}
                      </td>
                    </tr>
                  </tbody>
                </table>
                <p className="txt">{pressao.leitura}</p>
                {pressao.avisos.map((av, i) => (
                  <p key={i} className={i === 0 ? "aviso" : "txt"}>
                    {av}
                  </p>
                ))}
              </>
            )}

            {/**
              * O CENÁRIO DE ABSORÇÃO — para quem declarou que não renegocia.
              *
              * Vem DEPOIS da pressão de propósito: a faixa de negociação acima
              * é a conta completa, e este bloco diz que, nesta empresa, ela
              * provavelmente não será usada. Sem ele o laudo fala em "negociar
              * 4,2%" com quem respondeu que o mercado define o preço — e um
              * documento que ignora a resposta que o próprio cliente deu é lido
              * uma vez e nunca mais.
              *
              * A saída é S3 e não S4 por causa da última linha: o motor conhece
              * a receita e não conhece a margem.
              */}
            {absorcao && (
              <>
                <div className="sec">
                  {pressao ? "8b" : "8"}. Se o preço não puder ser renegociado
                </div>
                <table className="quadro">
                  <tbody>
                    <tr>
                      <td>Custo que a empresa absorve, sem repassar nada</td>
                      <td className="mono res">
                        {absorcao.custo}
                        {absorcao.custo_reais ? ` · ${absorcao.custo_reais}/ano` : ""}
                      </td>
                    </tr>
                    <tr>
                      <td>Crédito que o comprador passa a receber, sem aumento de preço</td>
                      <td className="mono">{absorcao.entrega}</td>
                    </tr>
                  </tbody>
                </table>
                {absorcao.linhas.map((l, i) => (
                  <p key={i} className="txt">{l}</p>
                ))}
                <p className="aviso">{absorcao.pergunta}</p>
              </>
            )}

            <div className="sec">9. Riscos e limites</div>
            <ul className="riscos">
              {riscos.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
            {/* A RESSALVA DA NEGOCIAÇÃO SAIU DE DENTRO DO BLOCO DE PRESSÃO —
                08/08/2026. Ela vivia dentro de `{pressao && …}`, e
                `pressaoDoLaudo` devolve null no S1 e sempre que falta uma
                grandeza. Ou seja: os laudos em que o cliente MAIS tende a ler a
                conclusão como definitiva saíam sem a única frase que diz que
                nenhum número deste documento garante que o repasse será aceito.
                Aqui ela está ao lado dos riscos, que é onde a dúvida acontece,
                e em todo laudo completo. */}
            <p className="fronteira">{FRONTEIRA_CONTA_NEGOCIACAO}</p>

            {/* O ANEXO VEM ANTES DA CONCLUSÃO — conserto de 08/08/2026.
                O rodapé imprime a seção 11 e estava sendo inserido ANTES da
                seção 10: o documento saía numerado 9 → 11 → 10. Num laudo
                vendido como peça que sobrevive a uma pergunta do Fisco, a
                numeração fora de ordem é a primeira coisa que quem confere
                anota — e ela desqualifica o resto sem discutir o mérito. */}
            {anexoTab && (
              <>
                <div className="sec quebra">10. Anexo — tabela do Simples utilizada</div>
                {/* A CITAÇÃO ESTAVA ERRADA, e o próprio código já sabia disso
                    (ver `baseDeCalculo` em lib/laudo.ts). Estes números são os
                    Anexos XVIII a XXII da LC 214/2025, que substituíram os
                    Anexos I a V da LC 123/2006 — e divergem deles na 6ª faixa.
                    O laudo citava a LC 123 na seção 10 e a LC 214 na seção 2:
                    um contador que conferisse encontraria dois números e
                    concluiria que a conta está errada. A coluna também deixou
                    de ser "PIS/Cofins": no regime novo ela é CBS + IBS. */}
                <p className="txt">
                  Anexo {anexoTab.anexo} do Simples Nacional na redação da Lei Complementar nº
                  214/2025, art. 519, que substituiu os Anexos I a V da Lei Complementar nº
                  123/2006. A faixa desta empresa está destacada; a coluna de partilha indica a
                  fatia da carga do Simples correspondente a CBS e IBS no regime híbrido.
                </p>
                <table className="quadro">
                  <thead>
                    <tr>
                      <th>Faixa</th>
                      <th>RBT12 até</th>
                      <th>Alíquota nominal</th>
                      <th>Parcela a deduzir</th>
                      <th>Partilha CBS + IBS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {anexoTab.linhas.map((l) => (
                      <tr key={l.faixa} className={l.faixa === anexoTab.faixaAtual ? "destaque" : ""}>
                        <td className="mono">{l.faixa}</td>
                        <td className="mono">{l.ate}</td>
                        <td className="mono">{l.nominal}</td>
                        <td className="mono">{l.deduzir}</td>
                        <td className="mono">{l.sharePC}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {Rodape}
          </>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .doc { max-width: 820px; margin: 0 auto; padding: 24px; }
        .sheet { background: #fff; border: 1px solid #E2E8F0; border-radius: 8px; padding: 44px 46px; color: #334155; font-size: 12.5px; line-height: 1.6; }
        .brand { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0B1220; padding-bottom: 12px; margin-bottom: 20px; }
        .firmwrap { display: flex; align-items: center; gap: 12px; }
        .logo { max-height: 40px; max-width: 140px; object-fit: contain; }
        .firm { font-weight: 800; font-size: 17px; color: #0F172A; letter-spacing: -.01em; }
        .crc { font-size: 11px; color: #64748B; text-transform: uppercase; letter-spacing: .06em; margin-top: 3px; }
        .wm { font-family: 'IBM Plex Mono', monospace; font-size: 10px; color: #94A3B8; text-align: right; letter-spacing: .08em; }
        h1 { font-size: 18px; color: #0F172A; letter-spacing: -.02em; margin: 0 0 6px; }
        .sec { font-family: 'IBM Plex Mono', monospace; font-size: 9.5px; letter-spacing: .14em; text-transform: uppercase; color: #0E7490; margin: 20px 0 7px; border-bottom: 1px solid #EEF2F7; padding-bottom: 3px; }
        .txt { margin: 0 0 8px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
        th { text-align: left; font-family: 'IBM Plex Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: .1em; color: #64748B; border-bottom: 1px solid #CBD5E1; padding: 3px 6px 4px 0; font-weight: 500; }
        td { border-bottom: 1px solid #EEF2F7; padding: 5px 6px 5px 0; vertical-align: top; }
        .ident td:first-child { color: #64748B; width: 34%; }
        .prem td:first-child { width: 52%; }
        .prem .num { font-family: 'IBM Plex Mono', monospace; text-align: right; white-space: nowrap; width: 16%; }
        .prem .org { font-size: 10.5px; color: #64748B; text-align: right; width: 32%; }
        .prem .org.est { color: #B45309; background: #FFFBEB; }
        .comp { font-size: 10.5px; color: #64748B; line-height: 1.45; margin-top: 2px; }
        .mem td { font-size: 11.5px; }
        .mem td:first-child { width: 24%; }
        .mono { font-family: 'IBM Plex Mono', monospace; font-size: 11px; }
        .res { font-weight: 600; color: #0F172A; white-space: nowrap; }
        .quadro td:first-child { color: #334155; }
        .quadro .mono { text-align: right; white-space: nowrap; }
        .destaque td { background: #ECFEFF; font-weight: 600; }
        .legal { margin: 0 0 4px 16px; }
        .legal li, .cond li, .riscos li { margin-bottom: 5px; }
        .cond, .riscos { margin: 0 0 4px 16px; }
        .riscos li { color: #475569; font-size: 11.5px; }
        .box { border: 1px solid; background: #F8FAFC; border-radius: 6px; padding: 11px 13px; font-size: 13px; margin-bottom: 8px; }
        .motivo { margin-top: 7px; padding-top: 7px; border-top: 1px solid #E2E8F0; font-size: 12px; color: #475569; }
        .prio { border-left: 3px solid #DC2626; background: #FEF2F2; color: #A32D2D; padding: 7px 10px; font-size: 11.5px; margin-top: 8px; }
        /* ressalva ao lado de um número, não no rodapé: âmbar, porque vermelho
           no laudo é reservado a prioridade e a "não optar" */
        .aviso { border-left: 3px solid #D97706; background: #FFFBEB; color: #78350F; padding: 7px 10px; font-size: 11.5px; margin: 6px 0 0; line-height: 1.5; }
        .ressalva { margin-top: 7px; padding-top: 6px; border-top: 1px solid #EEF2F7; font-size: 10.5px; line-height: 1.55; color: #64748B; }
        .basecalc { margin: 8px 0 0 18px; font-size: 11.5px; color: #475569; line-height: 1.6; }
        .basecalc li { margin-bottom: 3px; }
        .notaparam { font-size: 10.5px; color: #64748B; line-height: 1.5; margin: 7px 0 0; }
        /* a fronteira entre a conta e a negociação: sóbria, sem cor de alarme —
           não é risco, é divisão de responsabilidade */
        .fronteira { border-top: 1px solid #CBD5E1; margin-top: 10px; padding-top: 8px; font-size: 11px; color: #475569; line-height: 1.55; }
        .carimbo { border: 1px dashed #CBD5E1; background: #F8FAFC; border-radius: 6px; padding: 9px 12px; font-size: 11px; color: #475569; line-height: 1.55; margin: 8px 0; }
        .verif { margin-top: 12px; border: 1px dashed #A5F3FC; background: #ECFEFF; border-radius: 6px; padding: 9px 12px; font-size: 10.5px; color: #0E7490; line-height: 1.55; }
        .sign { margin-top: 30px; padding-top: 8px; border-top: 1px solid #334155; width: 280px; font-size: 11px; color: #64748B; }
        ${CSS_IMPRESSAO}
        @media print {
          /* o que é específico do laudo: ele é longo, e o corpo menor evita
             uma página inteira só para o rodapé */
          .sheet { font-size: 10pt; line-height: 1.5; }
          .sec { margin: 14px 0 5px; }
          td { padding: 4px 6px 4px 0; }
          .sign { margin-top: 24px; }
        }
      ` }} />
    </div>
  );
}
