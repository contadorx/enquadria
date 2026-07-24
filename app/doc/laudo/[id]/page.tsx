import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { BotaoImprimir } from "@/components/BotaoImprimir";
import { formatarCnpj } from "@/lib/cnpj";
import {
  premissasEmTexto,
  resultadoEmTexto,
  recomendacao,
  type AnaliseGravada,
} from "@/lib/laudo";

const COR_HEX: Record<string, string> = {
  vermelho: "#DC2626",
  amarelo: "#D97706",
  neutro: "#475569",
  verde: "#059669",
};

export default async function LaudoDoc({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: laudo } = await supabase
    .from("laudos")
    .select("numero, emitido_em, analise_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!laudo) notFound();

  const { data: analise } = await supabase
    .from("analises")
    .select("id, rq, ch, cl, re, fc, saida, prioridade, respostas, calculado_em, empresa_id")
    .eq("id", laudo.analise_id)
    .maybeSingle();
  if (!analise) notFound();

  const { data: empresa } = await supabase
    .from("empresas")
    .select("razao_social, cnpj, anexo, regime")
    .eq("id", analise.empresa_id)
    .maybeSingle();

  const { data: perfil } = await supabase
    .from("profiles")
    .select("tenants(nome, crc, logo_url)")
    .maybeSingle();
  const t = perfil?.tenants as { nome?: string; crc?: string; logo_url?: string } | null;

  const a = analise as unknown as AnaliseGravada;
  const rec = recomendacao(a);
  const cor = COR_HEX[rec.cor];
  const premissas = premissasEmTexto(a.respostas);
  const resultado = resultadoEmTexto(a);
  const dataEmissao = new Date(laudo.emitido_em).toLocaleDateString("pt-BR");
  const numero = String(laudo.numero).padStart(4, "0");

  return (
    <div className="doc">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href="/painel/fila" className="text-sm text-accentdeep">← voltar à fila</Link>
        <BotaoImprimir />
      </div>

      <div className="sheet">
        <div className="brand">
          <div>
            <div className="firm">{t?.nome ?? "Escritório"}</div>
            {t?.crc && <div className="crc">{t.crc}</div>}
          </div>
          <div className="wm">LAUDO {numero}<br />{dataEmissao}</div>
        </div>

        <h1>Análise de enquadramento de IBS e CBS</h1>
        <div className="meta">
          {empresa?.razao_social} · {empresa?.cnpj ? formatarCnpj(empresa.cnpj) : ""} ·{" "}
          {empresa?.regime ?? "Simples Nacional"}
          {empresa?.anexo ? `, Anexo ${empresa.anexo}` : ""} · exercício 2027
        </div>

        {a.prioridade && (
          <div className="prio">Prioridade — a decisão saiu do campo fiscal e virou questão comercial.</div>
        )}

        <div className="sec">Premissas informadas</div>
        <ul>{premissas.map((p, i) => <li key={i}>{p}</li>)}</ul>

        <div className="sec">Resultado</div>
        <ul>{resultado.map((p, i) => <li key={i}>{p}</li>)}</ul>

        <div className="sec">Recomendação</div>
        <div className="box" style={{ borderColor: cor }}>
          <b style={{ color: cor }}>{rec.titulo}.</b> {rec.descricao}
        </div>

        <div className="foot">
          Estimativa de cenário construída a partir de premissas informadas pelo contador
          responsável. Alíquota de referência da CBS sujeita a ajuste de neutralidade. Este
          documento organiza a decisão; a responsabilidade técnica é do profissional que o assina.
        </div>
        <div className="sign">Contador responsável</div>
      </div>

      <style>{`
        .doc { max-width: 780px; margin: 0 auto; padding: 24px; }
        .sheet { background: #fff; border: 1px solid #E2E8F0; border-radius: 8px; padding: 44px 46px; color: #334155; font-size: 13px; line-height: 1.6; }
        .brand { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0B1220; padding-bottom: 12px; margin-bottom: 22px; }
        .firm { font-weight: 800; font-size: 17px; color: #0F172A; letter-spacing: -.01em; }
        .crc { font-size: 11px; color: #64748B; text-transform: uppercase; letter-spacing: .06em; margin-top: 3px; }
        .wm { font-family: 'IBM Plex Mono', monospace; font-size: 10px; color: #94A3B8; text-align: right; letter-spacing: .08em; }
        h1 { font-size: 19px; color: #0F172A; letter-spacing: -.02em; margin: 0 0 4px; }
        .meta { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: #64748B; margin-bottom: 18px; }
        .prio { border-left: 3px solid #DC2626; background: #FEF2F2; color: #A32D2D; padding: 9px 12px; font-size: 12.5px; margin-bottom: 18px; }
        .sec { font-family: 'IBM Plex Mono', monospace; font-size: 9.5px; letter-spacing: .14em; text-transform: uppercase; color: #0E7490; margin: 20px 0 7px; }
        ul { margin: 0 0 4px 18px; }
        li { margin-bottom: 4px; }
        .box { border: 1px solid; background: #F8FAFC; border-radius: 6px; padding: 12px 14px; font-size: 13.5px; }
        .foot { margin-top: 26px; padding-top: 12px; border-top: 1px solid #EEF2F7; font-size: 10px; color: #64748B; line-height: 1.6; }
        .sign { margin-top: 40px; padding-top: 8px; border-top: 1px solid #334155; width: 240px; font-size: 11px; color: #64748B; }
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
