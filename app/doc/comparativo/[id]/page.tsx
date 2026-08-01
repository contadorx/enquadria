import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { BotaoImprimir } from "@/components/BotaoImprimir";
import { formatarCnpj } from "@/lib/cnpj";
import { moeda, pct } from "@/lib/motor";
import { ROTULO_SETOR, type ResultadoComparativo, type Setor } from "@/lib/comparativo";

/**
 * COMPARATIVO IMPRESSO — o entregável cobrável do motor de regimes.
 *
 * Usa os valores CONGELADOS na emissão, nunca recalcula: o documento é a prova
 * do cenário daquela data, com as premissas que o contador declarou.
 */
export default async function ComparativoDoc({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: doc } = await supabase
    .from("comparativos")
    .select("numero, emitido_em, entrada, premissas, resultado, empresa_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!doc) notFound();

  const { data: empresa } = doc.empresa_id
    ? await supabase
        .from("empresas")
        .select("razao_social, cnpj")
        .eq("id", doc.empresa_id)
        .maybeSingle()
    : { data: null };

  const { data: perfil } = await supabase
    .from("profiles")
    .select("tenants(nome, crc, logo_url)")
    .maybeSingle();
  const t = perfil?.tenants as { nome?: string; crc?: string; logo_url?: string } | null;

  const r = doc.resultado as unknown as ResultadoComparativo;
  const e = doc.entrada as unknown as ResultadoComparativo["entrada"];
  const p = doc.premissas as unknown as ResultadoComparativo["premissas"];
  const numero = String(doc.numero).padStart(4, "0");
  const dataEmissao = new Date(doc.emitido_em).toLocaleDateString("pt-BR");
  const menor = r.menor;

  return (
    <div className="doc">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href="/painel" className="text-sm text-accentdeep">← voltar</Link>
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
              <div className="firm">{t?.nome ?? "Escritório"}</div>
              {t?.crc && <div className="crc">{t.crc}</div>}
            </div>
          </div>
          <div className="wm">COMPARATIVO {numero}<br />{dataEmissao}</div>
        </div>

        <h1>Comparativo de regimes tributários</h1>
        <div className="meta">
          {empresa?.razao_social ?? "Cenário avulso"}
          {empresa?.cnpj ? ` · ${formatarCnpj(empresa.cnpj)}` : ""} ·{" "}
          {ROTULO_SETOR[e.setor as Setor]} · receita anual de {moeda(e.receita)}
        </div>

        <div className="sec">Cenário analisado</div>
        <ul>
          <li>Receita bruta anual: {moeda(e.receita)}</li>
          <li>Folha anual (com pró-labore): {moeda(e.folha)}</li>
          <li>Compras que geram crédito: {pct(e.compras_credito, 0)} da receita</li>
          <li>Margem de lucro contábil: {pct(e.margem_lucro, 0)} da receita</li>
          <li>Anexo do Simples considerado: {e.anexo}</li>
        </ul>

        <div className="sec">Carga anual estimada por regime</div>
        <table className="tb">
          <thead>
            <tr>
              <th>Regime</th>
              <th className="r">Carga anual</th>
              <th className="r">% da receita</th>
              <th className="r">Crédito ao cliente</th>
            </tr>
          </thead>
          <tbody>
            {r.regimes.map((x) => (
              <tr key={x.regime} className={menor?.regime === x.regime ? "best" : ""}>
                <td>
                  {x.nome}
                  {menor?.regime === x.regime && <b> — menor carga</b>}
                  {x.impedimento && <div className="imp">{x.impedimento}</div>}
                </td>
                <td className="r">{moeda(x.total)}</td>
                <td className="r">{pct(x.sobre_receita)}</td>
                <td className="r">{x.credito_ao_cliente > 0 ? moeda(x.credito_ao_cliente) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {menor && (
          <div className="box">
            Pelo cenário e pelas premissas declaradas, <b>{menor.nome}</b> apresenta a menor carga:{" "}
            <b>{moeda(menor.total)}</b> ao ano, equivalente a {pct(menor.sobre_receita)} da receita.
            A comparação com o regime atual e a decisão final competem ao profissional responsável.
          </div>
        )}

        <div className="sec">Composição de cada regime</div>
        {r.regimes.map((x) => (
          <div key={x.regime} className="comp">
            <div className="compt">{x.nome} — {moeda(x.total)}</div>
            <table className="tb small">
              <tbody>
                {x.composicao.map((l) => (
                  <tr key={l.rotulo}>
                    <td>
                      {l.rotulo}
                      <div className="org">{l.origem}</div>
                    </td>
                    <td className="r">{moeda(l.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        <div className="sec">Premissas declaradas</div>
        <ul>
          <li>CBS: {pct(p.cbs, 2)} · IBS: {pct(p.ibs, 2)} — a alíquota da CBS para 2027 ainda não foi publicada; o valor acima é estimativa declarada pelo profissional.</li>
          <li>ICMS efetivo: {pct(p.icms, 1)} · ISS: {pct(p.iss, 1)} — seguem integralmente exigíveis até 2029.</li>
          <li>Presunção de IRPJ: {pct(p.presuncao_irpj, 0)} · de CSLL: {pct(p.presuncao_csll, 0)}.</li>
          <li>IRPJ {pct(p.irpj, 0)} + adicional de {pct(p.adicional_irpj, 0)} sobre base anual acima de {moeda(p.limite_adicional)} · CSLL {pct(p.csll, 0)}.</li>
          <li>Encargo patronal sobre a folha: {pct(p.cpp, 1)}.</li>
        </ul>

        <div className="foot">
          Comparativo de cenários elaborado a partir das premissas declaradas acima. Não constitui
          apuração: não considera substituição tributária, benefícios setoriais, créditos
          acumulados, Imposto Seletivo, regimes específicos nem o custo de conformidade de cada
          regime. Mudança de regime produz efeitos que extrapolam esta conta. A responsabilidade
          técnica é do profissional que assina.
        </div>
        <div className="sign">Contador responsável</div>
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
        li { margin-bottom: 4px; }
        .tb { width: 100%; border-collapse: collapse; font-size: 12px; }
        .tb th { text-align: left; border-bottom: 1px solid #E2E8F0; padding: 5px 6px; font-family: 'IBM Plex Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: .1em; color: #64748B; font-weight: 500; }
        .tb td { border-bottom: 1px solid #EEF2F7; padding: 6px; vertical-align: top; }
        .tb .r { text-align: right; font-family: 'IBM Plex Mono', monospace; }
        .tb tr.best td { background: #ECFDF5; }
        .tb.small td { padding: 4px 6px; font-size: 11.5px; }
        .org { font-size: 10px; color: #94A3B8; line-height: 1.4; }
        .imp { font-size: 10.5px; color: #DC2626; }
        .box { border: 1px solid #0E7490; background: #ECFEFF; border-radius: 6px; padding: 11px 13px; font-size: 12.5px; margin-top: 12px; }
        .comp { margin-top: 12px; break-inside: avoid; }
        .compt { font-weight: 700; color: #0F172A; font-size: 12.5px; margin-bottom: 3px; }
        .foot { margin-top: 26px; padding-top: 12px; border-top: 1px solid #EEF2F7; font-size: 10px; color: #64748B; line-height: 1.6; }
        .sign { margin-top: 40px; padding-top: 8px; border-top: 1px solid #334155; width: 240px; font-size: 11px; color: #64748B; }
        @media print {
          .no-print { display: none !important; }
          .doc { padding: 0; max-width: none; }
          .sheet { border: none; border-radius: 0; padding: 0; }
          @page { margin: 18mm; }
        }
      ` }} />
    </div>
  );
}
