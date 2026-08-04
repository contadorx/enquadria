import Link from "next/link";
import { BotaoImprimir } from "@/components/BotaoImprimir";
import { assinaturaTecnica, mostrarNomeEscrito, type Escritorio } from "@/lib/escritorio";
import { CSS_IMPRESSAO } from "@/lib/impressao";
import { moeda, pct } from "@/lib/motor";
import { ROTULO_SETOR } from "@/lib/comparativo";
import { conclusaoDaAbertura, FATOR_R_LIMITE, type EstudoAbertura } from "@/lib/abertura";

/**
 * A FOLHA DO ESTUDO DE ABERTURA — a peça que ganha o cliente.
 *
 * Quem recebe este documento AINDA NÃO É CLIENTE do escritório: é alguém que
 * pediu uma opinião sobre abrir empresa. Isso muda o desenho em três pontos:
 *
 *  1. A CONCLUSÃO VEM ANTES DA TABELA. Um prospecto não lê quatro regimes para
 *     descobrir o que fazer; ele lê a primeira linha e decide se continua.
 *
 *  2. OS TRÊS CENÁRIOS SÃO O PRODUTO. Qualquer um simula um faturamento. O que
 *     o contador entrega aqui é a resposta à pergunta que o sócio não sabe
 *     fazer: "e se vier menos do que eu espero?".
 *
 *  3. AS PREMISSAS FICAM VISÍVEIS. O faturamento é projeção DELE, a margem é
 *     estimativa, a alíquota da CBS ainda não foi publicada. Documento que
 *     esconde isso vira promessa — e promessa em matéria tributária volta.
 *
 * Mesmo componente nas duas portas (a do contador e a do link público), pelo
 * mesmo motivo do laudo: duas montagens divergiriam na primeira alteração.
 */

export interface DadosAbertura {
  numero: number;
  emitido_em: string;
  nome_negocio: string;
  responsavel?: string | null;
  estudo: EstudoAbertura;
  escritorio: Escritorio | null;
}

export function FolhaAbertura({
  dados,
  publico = false,
}: {
  dados: DadosAbertura;
  publico?: boolean;
}) {
  const { escritorio: t, estudo } = dados;
  const e = estudo.entrada;
  const p = estudo.premissas;
  const numero = String(dados.numero).padStart(4, "0");
  const dataEmissao = new Date(dados.emitido_em).toLocaleDateString("pt-BR");
  const base = estudo.cenarios.find((c) => c.chave === "base");
  const fr = estudo.fator_r;

  return (
    <div className="doc">
      <div className="no-print mb-4 flex items-center justify-between">
        {publico ? <span /> : <Link href="/painel/abertura" className="text-sm text-accentdeep">← voltar</Link>}
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
            ESTUDO {numero}
            <br />
            {dataEmissao}
          </div>
        </div>

        <h1>Estudo de abertura — em que regime este negócio deve nascer</h1>
        <div className="meta">
          {dados.nome_negocio}
          {dados.responsavel ? ` · ${dados.responsavel}` : ""} · {ROTULO_SETOR[e.setor]} ·
          faturamento projetado de {moeda(e.receita_mensal)}/mês
        </div>

        {/* A CONCLUSÃO PRIMEIRO — ver nota no topo do arquivo */}
        <div className="box">
          <b>{conclusaoDaAbertura(estudo)}</b>
        </div>

        <div className="sec">1. O que foi considerado</div>
        <table className="tb small">
          <tbody>
            <tr>
              <td>Faturamento projetado</td>
              <td className="r">{moeda(e.receita_mensal)}/mês · {moeda(e.receita_mensal * 12)}/ano</td>
            </tr>
            <tr>
              <td>Salários previstos (sem pró-labore)</td>
              <td className="r">{moeda(e.folha_mensal)}/mês</td>
            </tr>
            <tr>
              <td>Pró-labore previsto</td>
              <td className="r">{moeda(e.prolabore_mensal)}/mês</td>
            </tr>
            <tr>
              <td>Compras que geram crédito de IBS/CBS</td>
              <td className="r">{pct(e.compras_credito)} da receita</td>
            </tr>
            <tr>
              <td>Lucro esperado</td>
              <td className="r">{pct(e.margem_lucro)} da receita</td>
            </tr>
            <tr>
              <td>Quem compra desta empresa</td>
              <td className="r">{e.vende_para_pj ? "outras empresas (PJ)" : "consumidor final"}</td>
            </tr>
          </tbody>
        </table>
        <p className="org" style={{ marginTop: 6 }}>
          Estes números são projeção de quem está abrindo o negócio, não histórico. É por isso que o
          estudo roda três cenários em vez de um.
        </p>

        <div className="sec">2. A conta em três cenários</div>
        <table className="tb">
          <thead>
            <tr>
              <th>Cenário</th>
              <th>Faturamento/ano</th>
              <th>Regime de menor carga</th>
              <th className="r">Carga anual</th>
              <th className="r">% da receita</th>
            </tr>
          </thead>
          <tbody>
            {estudo.cenarios.map((c) => (
              <tr key={c.chave} className={c.chave === "base" ? "best" : undefined}>
                <td>
                  {c.rotulo}
                  {c.chave === "base" && <span className="org"> · o projetado</span>}
                </td>
                <td className="r">{moeda(c.receita_anual)}</td>
                <td>{c.menor?.nome ?? "—"}</td>
                <td className="r">{c.menor ? moeda(c.menor.total) : "—"}</td>
                <td className="r">{c.menor ? pct(c.menor.sobre_receita) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="org" style={{ marginTop: 6 }}>
          {estudo.estavel
            ? "A resposta é a mesma nos três cenários: a escolha do regime não depende de o faturamento se confirmar."
            : "Atenção: a resposta MUDA conforme o faturamento. O regime escolhido na abertura precisa ser revisto assim que os primeiros meses reais aparecerem."}
        </p>

        {base && (
          <>
            <div className="sec">3. Todos os regimes, no cenário projetado</div>
            <table className="tb">
              <thead>
                <tr>
                  <th>Regime</th>
                  <th className="r">Carga anual</th>
                  <th className="r">% da receita</th>
                  <th className="r">Crédito ao cliente PJ</th>
                </tr>
              </thead>
              <tbody>
                {base.comparativo.regimes.map((r) => (
                  <tr key={r.regime} className={r.regime === base.menor?.regime ? "best" : undefined}>
                    <td>
                      {r.nome}
                      {r.impedimento && <div className="imp">{r.impedimento}</div>}
                    </td>
                    <td className="r">{moeda(r.total)}</td>
                    <td className="r">{pct(r.sobre_receita)}</td>
                    <td className="r">{r.credito_ao_cliente ? moeda(r.credito_ao_cliente) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="org" style={{ marginTop: 6 }}>
              Anexo do Simples considerado no cenário projetado: {base.anexo}.
            </p>
          </>
        )}

        {fr.aplicavel && (
          <>
            <div className="sec">4. Fator R — a escolha que ainda está na sua mão</div>
            <p>{fr.frase}</p>
            {fr.prolabore_extra_mensal > 0 && (
              <table className="tb small">
                <tbody>
                  <tr>
                    <td>Folha atual sobre a receita</td>
                    <td className="r">{pct(fr.atual)}</td>
                  </tr>
                  <tr>
                    <td>Necessário para o Anexo III</td>
                    <td className="r">{pct(FATOR_R_LIMITE)} · {moeda(fr.folha_alvo_anual)}/ano</td>
                  </tr>
                  <tr>
                    <td>Pró-labore a acrescentar</td>
                    <td className="r">{moeda(fr.prolabore_extra_mensal)}/mês</td>
                  </tr>
                  <tr>
                    <td>INSS do sócio sobre esse acréscimo</td>
                    <td className="r">{moeda(fr.custo_extra_anual)}/ano</td>
                  </tr>
                  <tr>
                    <td>Economia de DAS ao entrar no Anexo III</td>
                    <td className="r">{moeda(fr.economia_anual)}/ano</td>
                  </tr>
                </tbody>
              </table>
            )}
            <p className="org" style={{ marginTop: 6 }}>
              O IRPF sobre o pró-labore depende da situação pessoal do sócio e não entra nesta
              conta — ela é deliberadamente conservadora.
            </p>
          </>
        )}

        {estudo.alertas.length > 0 && (
          <>
            <div className="sec">{fr.aplicavel ? "5" : "4"}. O que a conta de carga não mostra</div>
            <ul>
              {estudo.alertas.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </>
        )}

        <div className="sec">Premissas declaradas</div>
        <table className="tb small">
          <tbody>
            <tr>
              <td>CBS (estimativa — alíquota ainda não publicada)</td>
              <td className="r">{pct(p.cbs)}</td>
            </tr>
            <tr>
              <td>IBS (simbólico até 2028)</td>
              <td className="r">{pct(p.ibs)}</td>
            </tr>
            <tr>
              <td>ICMS efetivo médio · ISS do município</td>
              <td className="r">{pct(p.icms)} · {pct(p.iss)}</td>
            </tr>
            <tr>
              <td>Presunção de IRPJ · CSLL</td>
              <td className="r">{pct(p.presuncao_irpj)} · {pct(p.presuncao_csll)}</td>
            </tr>
            <tr>
              <td>Encargo patronal sobre a folha</td>
              <td className="r">{pct(p.cpp)}</td>
            </tr>
          </tbody>
        </table>

        {/*
          NÃO PROMETER VERIFICAÇÃO PÚBLICA AQUI.
          O laudo e o termo são conferíveis em /verificar porque têm âncora: o
          número mais o CNPJ, ou o hash do que foi assinado. O estudo de
          abertura não tem CNPJ — a empresa não existe — e escrever "confira em
          enquadria.com.br/verificar" seria mandar o leitor a uma tela onde ele
          não conseguiria confirmar nada. Promessa que o produto não cumpre no
          documento que abre a relação é o pior lugar possível para uma.
        */}
        <div className="verif">
          <b>Registro.</b> Estudo nº {numero}, emitido em {dataEmissao} e arquivado no escritório
          responsável. O conteúdo foi congelado na emissão: revisões posteriores geram um novo
          estudo, com número novo.
        </div>

        <div className="foot">
          Comparativo de cenários elaborado a partir de projeções informadas por quem está abrindo o
          negócio. Não constitui apuração nem garantia de resultado: não considera substituição
          tributária, benefícios setoriais, Imposto Seletivo, regimes específicos, obrigações
          acessórias nem o custo de conformidade de cada regime. A alíquota de referência de IBS/CBS
          só é fixada por Resolução do Senado até 31/10/2026. A responsabilidade técnica é do
          profissional que assina.
        </div>
        <div className="sign">{assinaturaTecnica(t)}</div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .doc { max-width: 820px; margin: 0 auto; padding: 24px; }
        .sheet { background: #fff; border: 1px solid #E2E8F0; border-radius: 8px; padding: 44px 46px; color: #334155; font-size: 12.5px; line-height: 1.6; }
        .brand { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0B1220; padding-bottom: 12px; margin-bottom: 22px; }
        .firmwrap { display: flex; align-items: center; gap: 12px; }
        .logo { max-height: 40px; max-width: 140px; object-fit: contain; }
        .firm { font-weight: 800; font-size: 17px; color: #0F172A; letter-spacing: -.01em; }
        .crc { font-size: 11px; color: #64748B; text-transform: uppercase; letter-spacing: .06em; margin-top: 3px; }
        .wm { font-family: 'IBM Plex Mono', monospace; font-size: 10px; color: #94A3B8; text-align: right; letter-spacing: .08em; }
        h1 { font-size: 19px; color: #0F172A; letter-spacing: -.02em; margin: 0 0 4px; }
        .meta { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: #64748B; margin-bottom: 18px; }
        .sec { font-family: 'IBM Plex Mono', monospace; font-size: 9.5px; letter-spacing: .14em; text-transform: uppercase; color: #0E7490; margin: 20px 0 7px; }
        ul { margin: 0 0 4px 18px; padding: 0; }
        li { margin-bottom: 5px; }
        .tb { width: 100%; border-collapse: collapse; font-size: 12px; }
        .tb th { text-align: left; border-bottom: 1px solid #E2E8F0; padding: 5px 6px; font-family: 'IBM Plex Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: .1em; color: #64748B; font-weight: 500; }
        .tb td { border-bottom: 1px solid #EEF2F7; padding: 6px; vertical-align: top; }
        .tb .r { text-align: right; font-family: 'IBM Plex Mono', monospace; }
        .tb tr.best td { background: #ECFDF5; }
        .tb.small td { padding: 4px 6px; font-size: 11.5px; }
        .org { font-size: 10px; color: #94A3B8; line-height: 1.4; }
        .imp { font-size: 10.5px; color: #DC2626; }
        .box { border: 1px solid #0E7490; background: #ECFEFF; border-radius: 6px; padding: 11px 13px; font-size: 13px; margin-top: 12px; }
        .verif { margin-top: 16px; border: 1px dashed #A5F3FC; background: #ECFEFF; border-radius: 6px; padding: 9px 12px; font-size: 10.5px; color: #0E7490; line-height: 1.55; }
        .foot { margin-top: 26px; padding-top: 12px; border-top: 1px solid #EEF2F7; font-size: 10px; color: #64748B; line-height: 1.6; }
        .sign { margin-top: 40px; padding-top: 8px; border-top: 1px solid #334155; width: 280px; font-size: 11px; color: #64748B; }
        ${CSS_IMPRESSAO}
      ` }} />
    </div>
  );
}
