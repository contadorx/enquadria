import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
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

  const { data: perfil } = await supabase
    .from("profiles")
    .select("tenants(nome, crc, logo_url)")
    .maybeSingle();
  const t = perfil?.tenants as { nome?: string; crc?: string; logo_url?: string } | null;

  const { data: empresas } = await supabase.from("empresas").select("faixa");
  const contagem = ORDEM.reduce((a, f) => ({ ...a, [f]: 0 }), {} as Record<Faixa, number>);
  for (const e of empresas ?? []) {
    const f = e.faixa as Faixa | null;
    if (f && f in contagem) contagem[f]++;
  }

  const { data: analises } = await supabase.from("analises").select("saida, status");
  const porSaida: Record<string, number> = { S1: 0, S2: 0, S3: 0, S4: 0 };
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
  const { data: termos } = await supabase.from("termos").select("assinado_em");
  const assinados = (termos ?? []).filter((x) => x.assinado_em).length;

  const total = empresas?.length ?? 0;
  const fila = contagem.A + contagem.B;
  const hoje = new Date().toLocaleDateString("pt-BR");

  return (
    <div className="doc">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href="/painel/janela" className="text-sm text-accentdeep">← voltar</Link>
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
              <div className="firm">{t?.nome ?? "Escritório"}</div>
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
            {(["S4", "S3", "S2", "S1"] as Saida[]).map((s) => (
              <tr key={s}>
                <td>{s} · {SAIDAS[s].titulo}</td>
                <td className="n">{porSaida[s]}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="foot">
          Visão consolidada gerada pelo Enquadria a partir das análises registradas até a data.
          Cada recomendação é estimativa de cenário sob premissas informadas; a responsabilidade
          técnica é do contador responsável. Percentuais e classificações servem à priorização
          do trabalho, não substituem apuração com dados fiscais efetivos.
        </div>
      </div>

      <style>{`
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
        .tbl { width: 100%; border-collapse: collapse; }
        .tbl td { padding: 7px 0; border-bottom: 1px solid #EEF2F7; }
        .tbl .n { text-align: right; font-family: 'IBM Plex Mono', monospace; }
        ul { margin: 0 0 4px 18px; }
        li { margin-bottom: 4px; }
        .foot { margin-top: 26px; padding-top: 12px; border-top: 1px solid #EEF2F7; font-size: 10px; color: #64748B; line-height: 1.6; }
        @media print {
          .no-print { display: none !important; }
          .doc { padding: 0; max-width: none; }
          .sheet { border: none; border-radius: 0; padding: 0; }
          @page { margin: 22mm; }
        }
      `}</style>
    </div>
  );
}
