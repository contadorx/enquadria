import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { COLUNAS_ESCRITORIO, mostrarNomeEscrito, type Escritorio } from "@/lib/escritorio";
import { comResponsavel } from "@/lib/escritorio-server";
import { CSS_IMPRESSAO } from "@/lib/impressao";
import { BotaoImprimir } from "@/components/BotaoImprimir";
import { pct, SAIDAS, type Saida } from "@/lib/motor";
import { ROTULO_FAIXA, type Faixa } from "@/lib/triagem";

const ORDEM: Faixa[] = ["A", "B", "C", "D", "MEI", "FORA"];

/**
 * Relatório do escritório — a visão consolidada da carteira para a janela.
 * É o "relatório" que o painel promete: onde o escritório está, o que já
 * decidiu, e quanto de trabalho cobrável ainda há na fila. Imprimível.
 */
export default async function Relatorio() {
  const supabase = createClient();

  /* com equipe, `.maybeSingle()` sem filtro de id devolve várias linhas e o
     cabeçalho cai no genérico — mesma nota do laudo */
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: perfil } = await supabase
    .from("profiles")
    .select(`tenant_id, tenants(${COLUNAS_ESCRITORIO})`)
    .eq("id", user?.id ?? "")
    .maybeSingle();
  const t = await comResponsavel(
    supabase,
    (perfil?.tenants as Escritorio | null) ?? null,
    (perfil?.tenant_id as string | null) ?? null
  );

  const { data: empresas } = await supabase.from("empresas").select("faixa");
  const contagem = ORDEM.reduce((a, f) => ({ ...a, [f]: 0 }), {} as Record<Faixa, number>);
  for (const e of empresas ?? []) {
    const f = e.faixa as Faixa | null;
    if (f && f in contagem) contagem[f]++;
  }

  const { data: analises } = await supabase.from("analises").select("saida, status");
  const porSaida: Record<string, number> = { S1: 0, S2: 0, S3: 0, S4: 0, S5: 0 };
  for (const a of analises ?? []) {
    const s = a.saida as Saida | null;
    if (s) porSaida[s]++;
  }
  const decididas = (analises ?? []).filter((a) =>
    ["laudo_emitido", "termo_enviado", "decidida"].includes(a.status as string)
  ).length;

  const { count: laudos } = await supabase
    .from("laudos")
    .select("id", { count: "exact", head: true });
  const { data: termos } = await supabase.from("termos").select("assinado_em, assinatura_status");
  const assinados = (termos ?? []).filter(
    (x) => x.assinatura_status === "assinado" || x.assinado_em
  ).length;

  /**
   * ANEXO — o serviço invisível vira lista visível.
   * O trabalho de decidir cliente a cliente não aparece em lugar nenhum quando
   * é bem feito. Esta lista é o que o escritório mostra para justificar o
   * honorário — e para provar, depois, que avaliou e comunicou cada empresa.
   */
  const { data: linhasAnalise } = await supabase
    .from("analises")
    .select("id, empresa_id, saida, calculado_em")
    .order("calculado_em", { ascending: false })
    .limit(300);

  const idsAnalise = (linhasAnalise ?? []).map((a) => a.id);
  const { data: empresasDoc } = idsAnalise.length
    ? await supabase
        .from("empresas")
        .select("id, razao_social, cnpj")
        .in("id", (linhasAnalise ?? []).map((a) => a.empresa_id))
    : { data: [] as { id: string; razao_social: string; cnpj: string }[] };
  const { data: laudosDoc } = idsAnalise.length
    ? await supabase.from("laudos").select("analise_id, numero").in("analise_id", idsAnalise)
    : { data: [] as { analise_id: string; numero: number }[] };
  const { data: termosDoc } = idsAnalise.length
    ? await supabase
        .from("termos")
        .select("analise_id, assinatura_status, assinado_em")
        .in("analise_id", idsAnalise)
    : { data: [] as { analise_id: string; assinatura_status: string | null; assinado_em: string | null }[] };

  const mapaEmp = new Map((empresasDoc ?? []).map((e) => [e.id, e]));
  const mapaLaudo = new Map((laudosDoc ?? []).map((l) => [l.analise_id, l]));
  const mapaTermo = new Map((termosDoc ?? []).map((x) => [x.analise_id, x]));

  const anexo = (linhasAnalise ?? [])
    .map((a) => {
      const e = mapaEmp.get(a.empresa_id);
      if (!e) return null;
      const l = mapaLaudo.get(a.id);
      const tm = mapaTermo.get(a.id);
      return {
        nome: e.razao_social,
        cnpj: e.cnpj,
        saida: a.saida as Saida | null,
        laudo: l?.numero ?? null,
        assinado: tm ? tm.assinatura_status === "assinado" || !!tm.assinado_em : false,
        temTermo: !!tm,
      };
    })
    .filter(Boolean) as {
    nome: string;
    cnpj: string;
    saida: Saida | null;
    laudo: number | null;
    assinado: boolean;
    temTermo: boolean;
  }[];

  const total = empresas?.length ?? 0;
  const fila = contagem.A + contagem.B;
  const hoje = new Date().toLocaleDateString("pt-BR");

  return (
    <div className="doc">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href="/painel" className="text-sm text-accentdeep">← voltar</Link>
        <BotaoImprimir rotulo="Baixar relatório em PDF" />
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
          <div className="wm">RELATÓRIO DA JANELA<br />{hoje}</div>
        </div>

        <h1>Diagnóstico da carteira — enquadramento IBS/CBS 2027</h1>
        <div className="meta">
          Janela de opção: 1 a 30 de setembro de 2026 · {total} empresas na carteira
        </div>

        <div className="sec">Triagem da carteira</div>
        <table className="tbl">
          <tbody>
            {ORDEM.map((f) => (
              <tr key={f}>
                <td>{ROTULO_FAIXA[f]}</td>
                <td className="n">{contagem[f]}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="sec">Trabalho da janela</div>
        <ul>
          <li>{fila} empresas nas faixas de análise (urgente + avaliar)</li>
          <li>{decididas} análises concluídas · {laudos ?? 0} laudos emitidos</li>
          <li>{assinados} termos de ciência assinados</li>
          <li>{Math.max(fila - decididas, 0)} empresas ainda sem decisão registrada</li>
        </ul>

        <div className="sec">Recomendações emitidas</div>
        <table className="tbl">
          <tbody>
            {(["S5", "S4", "S3", "S2", "S1"] as Saida[]).map((s) => (
              <tr key={s}>
                <td>{s} · {SAIDAS[s].titulo}</td>
                <td className="n">{porSaida[s]}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {anexo.length > 0 && (
          <>
            <div className="sec quebra">Anexo — decisões registradas</div>
            <p className="anexoint">
              Relação das empresas avaliadas nesta carteira, com a recomendação registrada, o
              laudo emitido e a ciência do cliente. É o registro do que foi analisado e comunicado.
            </p>
            <table className="tb anexo">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>CNPJ</th>
                  <th>Recomendação</th>
                  <th className="c">Laudo</th>
                  <th className="c">Ciência</th>
                </tr>
              </thead>
              <tbody>
                {anexo.map((x, i) => (
                  <tr key={i}>
                    <td>{x.nome}</td>
                    <td className="mono">{x.cnpj}</td>
                    <td>{x.saida ? `${x.saida} · ${SAIDAS[x.saida].titulo}` : "—"}</td>
                    <td className="c mono">{x.laudo ? String(x.laudo).padStart(4, "0") : "—"}</td>
                    <td className="c">
                      {x.assinado ? "assinada" : x.temTermo ? "pendente" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {anexo.length >= 300 && (
              <p className="anexoint">Exibindo as 300 análises mais recentes.</p>
            )}
          </>
        )}

        <div className="foot">
          Visão consolidada gerada pelo Enquadria a partir das análises registradas até a data.
          Cada recomendação é estimativa de cenário sob premissas informadas; a responsabilidade
          técnica é do contador responsável. Percentuais e classificações servem à priorização
          do trabalho, não substituem apuração com dados fiscais efetivos. Cada laudo listado pode
          ser conferido em enquadria.com.br/verificar.
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
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
        .sec { font-family: 'IBM Plex Mono', monospace; font-size: 9.5px; letter-spacing: .14em; text-transform: uppercase; color: #0E7490; margin: 20px 0 7px; }
        .anexoint { font-size: 11.5px; color: #64748B; margin: 0 0 8px; }
        .anexo { font-size: 11px; }
        .anexo th, .anexo td { padding: 4px 6px; }
        .anexo .c { text-align: center; }
        .anexo .mono { font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; }
        @media print { .quebra { break-before: page; } }
        .tbl { width: 100%; border-collapse: collapse; }
        .tbl td { padding: 7px 0; border-bottom: 1px solid #EEF2F7; }
        .tbl .n { text-align: right; font-family: 'IBM Plex Mono', monospace; }
        ul { margin: 0 0 4px 18px; }
        li { margin-bottom: 4px; }
        .foot { margin-top: 26px; padding-top: 12px; border-top: 1px solid #EEF2F7; font-size: 10px; color: #64748B; line-height: 1.6; }
        ${CSS_IMPRESSAO}
      ` }} />
    </div>
  );
}
