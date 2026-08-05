import { formatarCnpj } from "@/lib/cnpj";
import { assinaturaTecnica, mostrarNomeEscrito, type Escritorio } from "@/lib/escritorio";
import { CSS_IMPRESSAO } from "@/lib/impressao";
import {
  CIENCIA_DOS_EFEITOS, ROTULO_TIPO, fraseDaDecisao, nomeCorrompido, AVISO_NOME_CORROMPIDO,
  AGUARDANDO_DECISAO,
  type Recomendacao, type TipoDecisao,
} from "@/lib/termo";

/**
 * A FOLHA DO TERMO — o documento em si, separado de quem o abre.
 *
 * Existe porque o mesmo papel precisa sair igual por duas portas diferentes:
 *
 *  · o CONTADOR, logado, abrindo pelo dossiê (/doc/termo/[id]);
 *  · o CLIENTE, sem conta nenhuma, abrindo pelo link do e-mail (/termo/[token]).
 *
 * Enquanto o layout morava dentro da página do contador, a segunda porta não
 * existia — e o e-mail de confirmação prometia "guardar uma cópia do termo"
 * levando para uma tela que mostrava só um aviso verde e o hash. Prova que uma
 * das partes não consegue imprimir não é prova: é a palavra do contador.
 *
 * Duas partes lendo folhas diferentes seria pior que folha nenhuma. Por isso o
 * CSS mora aqui dentro, junto do markup, e não na página.
 */

export interface DadosFolhaTermo {
  empresa: { razao_social?: string | null; cnpj?: string | null } | null;
  escritorio: Escritorio | null;
  decisao: "optar" | "permanecer";
  /**
   * A RECOMENDAÇÃO — congelada na emissão, nunca recalculada. Ausente nos
   * termos anteriores a 05/08/2026, e a folha continua saindo sem ela: termo
   * antigo é prova do que foi assinado, não rascunho para completar.
   */
  recomendacao?: Recomendacao | null;
  tipo_decisao?: TipoDecisao | null;
  motivo_divergencia?: string | null;
  /** o link do laudo que embasa — o documento sem ele é opinião */
  laudo_url?: string | null;
  laudo_numero?: number | null;
  /** o que a empresa precisa observar; derivado, nunca genérico */
  pontos?: string[];
  /**
   * A LISTA DE CIÊNCIA CONGELADA no snapshot da emissão.
   *
   * Imprimir a constante VIVA era um defeito de prova: quando a lista cresceu
   * de 4 para 7 itens em 05/08/2026, os termos já assinados passaram a EXIBIR
   * 7 cláusulas — e o hash deles cobre 4. O papel dizia que o signatário deu
   * ciência de um texto que não existia no dia em que ele assinou.
   *
   * Ausente só em termos anteriores ao snapshot; aí a constante é o que há.
   */
  clausulas?: string[] | null;
  assinado: boolean;
  assinante_nome?: string | null;
  assinado_em?: string | null;
  hash_documento?: string | null;
  /** linhas prontas da trilha de auditoria (lib/esign → trilhaEmTexto) */
  trilha?: string[];
}

export function FolhaTermo({
  empresa,
  escritorio: t,
  decisao,
  recomendacao,
  tipo_decisao,
  motivo_divergencia,
  laudo_url,
  laudo_numero,
  pontos = [],
  clausulas,
  assinado,
  assinante_nome,
  assinado_em,
  hash_documento,
  trilha = [],
}: DadosFolhaTermo) {
  const optou = decisao === "optar";

  return (
    <>
      <div className="sheet">
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
            TERMO
            <br />
            {assinado ? "ASSINADO" : "ASSINATURA ELETRÔNICA"}
          </div>
        </div>

        <h1>Termo de ciência e decisão</h1>
        <div className="meta">
          {empresa?.razao_social} · {empresa?.cnpj ? formatarCnpj(empresa.cnpj) : ""} · prazo legal:
          1 a 30 de setembro de 2026 · efeito a partir de 2027
        </div>

        {/* O nome entra no conteúdo que é HASHEADO. Sair assinado com acento
            corrompido é documento devolvido — e a assinatura não conserta, ela
            só garante que ninguém mexeu depois. */}
        {nomeCorrompido(empresa?.razao_social) && (
          <div className="box">
            <b>Atenção antes de assinar.</b> {AVISO_NOME_CORROMPIDO}
          </div>
        )}

        <p className="lead">
          A empresa declara que recebeu a análise de enquadramento, compreendeu os cenários
          apresentados e as premissas utilizadas, e formaliza sua decisão quanto ao recolhimento de
          IBS e CBS a partir de 2027.
        </p>

        {/**
          * A ORDEM É O DESENHO: recomendação → laudo → pontos → DECISÃO.
          *
          * A recomendação vem primeiro porque informa a decisão, e vem em corpo
          * NORMAL, não em destaque. O documento é o termo da decisão do
          * empresário; se a recomendação virar o título, o papel passa a
          * parecer que quem decidiu foi o contador — o oposto do objetivo.
          */}
        {recomendacao && (
          <>
            <div className="sec">Recomendação técnica</div>
            <p className="txt">
              A análise recomenda{" "}
              <b>
                {recomendacao.decisao === "optar"
                  ? "OPTAR pelo regime híbrido"
                  : "PERMANECER no regime tradicional"}
              </b>{" "}
              — {recomendacao.titulo}.
            </p>
            {!!recomendacao.baseado_em.length && (
              <>
                <p className="txt" style={{ marginBottom: 2 }}>Baseado em:</p>
                <ul>
                  {recomendacao.baseado_em.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </>
            )}
            {laudo_url && (
              <p className="txt">
                A memória de cálculo completa — os números, a fórmula e o resultado — está no{" "}
                <a href={laudo_url}>
                  laudo nº {String(laudo_numero ?? 0).padStart(4, "0")}
                </a>
                , que é parte integrante deste termo.
              </p>
            )}
          </>
        )}

        {!!pontos.length && (
          <>
            <div className="sec">Pontos que a empresa deve observar</div>
            <p className="txt">
              A recomendação acima vale enquanto os pontos abaixo se mantiverem. Se algum deles
              mudar, a conta muda — e a decisão merece ser revista na janela seguinte.
            </p>
            <ul>
              {pontos.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </>
        )}

        <div className="sec">Decisão da empresa</div>
        {/**
          * TERMO EMITIDO E NÃO ASSINADO NÃO TEM DECISÃO — desde 05/08/2026 ela
          * é escolhida por quem assina, na página de assinatura.
          *
          * Antes as duas caixinhas vinham marcadas na emissão, e a via impressa
          * de um termo pendente já afirmava o que a empresa tinha decidido —
          * antes de ela decidir. Imprimir escolha que ninguém fez é o oposto do
          * que um termo de ciência serve para provar.
          */}
        {!tipo_decisao && !assinado ? (
          <p className="txt">{AGUARDANDO_DECISAO}</p>
        ) : (
          <>
            {tipo_decisao && recomendacao && (
              <p className="txt">
                <b>{ROTULO_TIPO[tipo_decisao]}.</b>{" "}
                {fraseDaDecisao({ tipo: tipo_decisao, decisao, motivo: motivo_divergencia }, recomendacao)}
              </p>
            )}
            <ul>
              <li>
                {optou ? "☑" : "☐"} <b>Optar pelo regime híbrido</b> — recolhimento fora do DAS
              </li>
              <li>
                {optou ? "☐" : "☑"} <b>Permanecer no regime tradicional</b>
              </li>
            </ul>
          </>
        )}

        {/**
          * O MOTIVO DA DIVERGÊNCIA, em destaque e com a autoria declarada.
          *
          * "O cliente preferiu não optar por razões comerciais" escrito pelo
          * CONTADOR é o contador caracterizando a razão do cliente — e é
          * exatamente essa frase que se contesta depois. O quadro diz de quem
          * são as palavras.
          */}
        {tipo_decisao === "divergir" && (
          <div className="box">
            <b>Motivo da decisão, nas palavras da empresa:</b>
            <br />
            {motivo_divergencia || "—"}
            <br />
            <span style={{ fontSize: "0.9em" }}>
              Razão declarada pela empresa. A análise técnica permanece como emitida e não foi
              alterada por esta decisão.
            </span>
          </div>
        )}
        {tipo_decisao === "adiar" && motivo_divergencia && (
          <div className="box">
            <b>Observação da empresa:</b> {motivo_divergencia}
          </div>
        )}

        <div className="sec">Ciência dos efeitos</div>
        {/**
          * A LISTA MORA EM `lib/termo.ts` porque ela é conteúdo jurídico, não
          * layout — e porque o item do art. 41 § 5º (o cadeado do ressarcimento)
          * precisa estar aqui E no laudo, sem chance de os dois divergirem.
          *
          * "Vale por semestre e não pode ser alterada" era verdade pela metade:
          * quem pede ressarcimento de crédito não volta ao DAS no ano corrente
          * nem no seguinte. É justamente o perfil que a conta mais manda optar.
          */}
        {/* a lista CONGELADA na emissão — é ela que entrou no hash. A constante
            viva só entra em termo anterior ao snapshot, onde não há o que
            congelar. Ver o comentário da prop `clausulas`. */}
        <ul>
          {(clausulas ?? CIENCIA_DOS_EFEITOS).map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>

        <div className="box">
          {assinado ? (
            <>
              Assinado eletronicamente por <b>{assinante_nome}</b>
              {assinado_em ? <> em {new Date(assinado_em).toLocaleString("pt-BR")}</> : null}.
            </>
          ) : (
            <>
              Aguardando assinatura de <b>{assinante_nome}</b> pela página de assinatura enviada (ou
              colha presencialmente e arquive).
            </>
          )}
        </div>

        {assinado && trilha.length > 0 && (
          <>
            <div className="sec">Trilha de auditoria</div>
            <ul>
              {trilha.map((l, i) => (
                <li key={i} style={{ wordBreak: "break-all" }}>
                  {l}
                </li>
              ))}
            </ul>
          </>
        )}

        {hash_documento && (
          <div className="verif">
            <b>Verificação de autenticidade.</b> Qualquer pessoa pode conferir este termo em{" "}
            <b>enquadria.com.br/verificar</b>, informando o código abaixo:
            <div className="cod">{hash_documento}</div>
          </div>
        )}

        <div className="sign">{assinaturaTecnica(t)}</div>

        <div className="foot">
          Documento arquivado no dossiê da empresa. A validade da assinatura eletrônica decorre da
          Lei nº 14.063/2020 e da MP nº 2.200-2/2001, com a trilha de auditoria acima.
        </div>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .doc { max-width: 780px; margin: 0 auto; padding: 24px; }
        .sheet { background: #fff; border: 1px solid #E2E8F0; border-radius: 8px; padding: 44px 46px; color: #334155; font-size: 13px; line-height: 1.6; }
        .brand { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0B1220; padding-bottom: 12px; margin-bottom: 22px; }
        .firmwrap { display: flex; align-items: center; gap: 12px; }
        .logo { max-height: 40px; max-width: 140px; object-fit: contain; }
        .firm { font-weight: 800; font-size: 17px; color: #0F172A; letter-spacing: -.01em; }
        .crc { font-size: 11px; color: #64748B; text-transform: uppercase; letter-spacing: .06em; margin-top: 3px; }
        .wm { font-family: 'IBM Plex Mono', monospace; font-size: 10px; color: #94A3B8; text-align: right; letter-spacing: .08em; }
        h1 { font-size: 19px; color: #0F172A; letter-spacing: -.02em; margin: 0 0 4px; }
        .meta { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: #64748B; margin-bottom: 18px; }
        .lead { margin-bottom: 4px; }
        .sec { font-family: 'IBM Plex Mono', monospace; font-size: 9.5px; letter-spacing: .14em; text-transform: uppercase; color: #0E7490; margin: 20px 0 7px; }
        ul { margin: 0 0 4px 18px; list-style: none; padding: 0; }
        li { margin-bottom: 5px; }
        .box { border: 1px solid #0E7490; background: #ECFEFF; border-radius: 6px; padding: 12px 14px; font-size: 13px; margin-top: 8px; }
        .sign { margin-top: 26px; padding-top: 22px; border-top: 1px solid #CBD5E1; font-size: 12px; font-weight: 700; color: #0F172A; text-align: center; width: 320px; margin-left: auto; margin-right: auto; }
        .foot { margin-top: 18px; padding-top: 12px; border-top: 1px solid #EEF2F7; font-size: 10px; color: #64748B; }
        .verif { margin-top: 16px; border: 1px dashed #A5F3FC; background: #ECFEFF; border-radius: 6px; padding: 9px 12px; font-size: 10.5px; color: #0E7490; line-height: 1.55; }
        .cod { font-family: 'IBM Plex Mono', monospace; font-size: 9.5px; color: #334155; word-break: break-all; margin-top: 4px; letter-spacing: .02em; }
        ${CSS_IMPRESSAO}
      `,
        }}
      />
    </>
  );
}
