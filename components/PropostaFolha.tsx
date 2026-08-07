import { BotaoImprimir } from "@/components/BotaoImprimir";
import { formatarCnpj } from "@/lib/cnpj";
import { CSS_IMPRESSAO } from "@/lib/impressao";
import { assinaturaTecnica, mostrarNomeEscrito, type Escritorio } from "@/lib/escritorio";
import { moeda } from "@/lib/motor";
import { dataBR, type Proposta } from "@/lib/proposta";

/**
 * A FOLHA DA PROPOSTA — só apresentação, como a folha do laudo.
 *
 * Ela imita o laudo de propósito: mesma tipografia, mesmo cabeçalho, mesma
 * margem de impressão. O contador manda os dois documentos para a mesma pessoa
 * na mesma semana — se parecerem montados em lugares diferentes, o white-label
 * deixa de valer.
 *
 * UMA DIFERENÇA DELIBERADA: aqui não há memória de cálculo, número de decisão
 * nem recomendação com cifra. Isso é o que a proposta VENDE. Entregar o
 * resultado junto com o orçamento é dar de graça o serviço que se está
 * cobrando — e, pior, entregar recomendação sem a memória que a sustenta.
 */

export interface DadosProposta {
  numero: number;
  emitido_em: string;
  proposta: Proposta;
  escritorio: Escritorio | null;
}

export function PropostaFolha({ dados, publico = false }: { dados: DadosProposta; publico?: boolean }) {
  const { proposta: p, escritorio: t } = dados;
  const numero = String(dados.numero).padStart(4, "0");
  const dataEmissao = new Date(dados.emitido_em).toLocaleDateString("pt-BR");

  return (
    <div className="doc">
      <div className="no-print mb-3 flex items-center justify-between">
        <span className="text-[12px] text-muted">
          {publico ? "Proposta de honorários" : "Confira antes de enviar — o valor é editável na tela da empresa."}
        </span>
        <BotaoImprimir />
      </div>

      <div className="sheet">
        <div className="brand">
          <div className="firmwrap">
            {t?.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={t.logo_url} alt="" className="logo" />
            )}
            <div>
              {mostrarNomeEscrito(t) && <div className="firm">{t?.nome ?? "Escritório"}</div>}
              {t?.crc && <div className="crc">{t.crc}</div>}
            </div>
          </div>
          <div className="wm">
            PROPOSTA {numero}
            <br />
            {dataEmissao}
          </div>
        </div>

        <h1>Proposta de honorários — apuração de IBS e CBS</h1>

        <div className="sec">1. Destinatário</div>
        <table className="ident">
          <tbody>
            <tr>
              <td>Empresa</td>
              <td>
                <b>{p.destinatario.nome}</b>
              </td>
            </tr>
            <tr>
              <td>CNPJ</td>
              <td className="mono">{formatarCnpj(p.destinatario.cnpj) || p.destinatario.cnpj}</td>
            </tr>
          </tbody>
        </table>

        <div className="sec">2. Por que esta proposta</div>
        {p.contexto.map((c) => (
          <p className="txt" key={c.slice(0, 40)}>
            {c}
          </p>
        ))}

        {p.situacao.length > 0 && (
          <>
            <div className="sec">3. O que já sabemos desta empresa</div>
            <ul className="lista">
              {p.situacao.map((s) => (
                <li key={s.slice(0, 40)}>{s}</li>
              ))}
            </ul>
          </>
        )}

        <div className="sec">{p.situacao.length > 0 ? "4" : "3"}. O que está incluído</div>
        {p.escopo.map((b) => (
          <div className="bloco" key={b.titulo}>
            <div className="btit">{b.titulo}</div>
            <ul className="lista">
              {b.itens.map((i) => (
                <li key={i.slice(0, 40)}>{i}</li>
              ))}
            </ul>
          </div>
        ))}

        <div className="sec">{p.situacao.length > 0 ? "5" : "4"}. Honorários</div>
        <table className="valores">
          <tbody>
            {p.investimento.linhas.map((l) => (
              <tr key={l.rotulo}>
                <td>
                  <b>{l.rotulo}</b>
                  <div className="comp">{l.explica}</div>
                </td>
                <td className="num">{moeda(l.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="sec">{p.situacao.length > 0 ? "6" : "5"}. Prazos e condições</div>
        <ul className="lista">
          {p.prazos.map((x) => (
            <li key={x.slice(0, 40)}>{x}</li>
          ))}
        </ul>
        <ul className="lista cond">
          {p.condicoes.map((x) => (
            <li key={x.slice(0, 40)}>{x}</li>
          ))}
        </ul>

        <div className="validade">
          Proposta válida até <b>{dataBR(p.validade)}</b>.
          {p.validadeLimitadaPelaJanela && (
            <>
              {" "}
              O prazo acompanha o encerramento da janela de opção em 30 de setembro de 2026 — depois
              dessa data a decisão desta janela não pode mais ser exercida.
            </>
          )}
        </div>

        <div className="aceite">
          <div className="atit">De acordo</div>
          <div className="linhas">
            <div className="linha">
              <span>Assinatura do representante legal</span>
            </div>
            <div className="linha curta">
              <span>Data</span>
            </div>
          </div>
        </div>

        <div className="sign">{assinaturaTecnica(t)}</div>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
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
        td { border-bottom: 1px solid #EEF2F7; padding: 5px 6px 5px 0; vertical-align: top; }
        .ident td:first-child { color: #64748B; width: 34%; }
        .mono { font-family: 'IBM Plex Mono', monospace; font-size: 11px; }
        /* o reset global do app zera o marcador da lista; aqui a lista é do
           DOCUMENTO e precisa parecer uma lista no papel */
        .lista { list-style: disc; margin: 0 0 8px 18px; padding: 0; }
        .lista li { margin-bottom: 4px; }
        .bloco { margin-bottom: 10px; }
        .btit { font-weight: 700; color: #0F172A; font-size: 12.5px; margin-bottom: 3px; }
        .valores td { padding: 8px 6px 8px 0; }
        .valores .num { font-family: 'IBM Plex Mono', monospace; font-size: 14px; font-weight: 700; color: #0F172A; text-align: right; white-space: nowrap; width: 30%; }
        .comp { font-size: 10.5px; color: #64748B; line-height: 1.45; margin-top: 2px; }
        .cond li { color: #475569; font-size: 11.5px; }
        /* a validade é a informação que faz a proposta ser respondida — ela
           precisa saltar sem parecer aviso de cobrança */
        .validade { margin-top: 12px; border-left: 3px solid #0E7490; background: #ECFEFF; padding: 9px 12px; font-size: 12px; color: #0E7490; line-height: 1.55; }
        .aceite { margin-top: 26px; border-top: 1px dashed #CBD5E1; padding-top: 14px; }
        .atit { font-family: 'IBM Plex Mono', monospace; font-size: 9.5px; letter-spacing: .14em; text-transform: uppercase; color: #64748B; margin-bottom: 20px; }
        .linhas { display: flex; gap: 26px; }
        .linha { flex: 1; border-top: 1px solid #334155; padding-top: 5px; font-size: 10.5px; color: #64748B; }
        .linha.curta { max-width: 180px; }
        .sign { margin-top: 34px; padding-top: 8px; border-top: 1px solid #334155; width: 280px; font-size: 11px; color: #64748B; }
        ${CSS_IMPRESSAO}
        @media print {
          .sheet { font-size: 10.5pt; }
          .sec { margin: 14px 0 5px; }
          /* o bloco de aceite não pode ser partido entre duas páginas: assinatura
             separada do texto que ela aceita é assinatura sem objeto */
          .aceite { break-inside: avoid; page-break-inside: avoid; }
        }
      `,
        }}
      />
    </div>
  );
}
