import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { BotaoImprimir } from "@/components/BotaoImprimir";
import { formatarCnpj } from "@/lib/cnpj";
import {
  premissasEmTexto,
  resultadoEmTexto,
  recomendacao,
  baseDeCalculo,
  dDASestimado,
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
    .select("numero, emitido_em, analise_id, snapshot")
    .eq("id", params.id)
    .maybeSingle();
  if (!laudo) notFound();

  /**
   * O laudo é PROVA: lê o que foi congelado na emissão, não o estado atual da
   * análise. Sem isso, revisar a análise reescreveria retroativamente um
   * documento já entregue e com termo assinado. Laudos emitidos antes da
   * migration 0014 caem no caminho antigo (leitura ao vivo).
   */
  const snap = laudo.snapshot as {
    analise?: Record<string, unknown>;
    empresa?: { razao_social?: string; cnpj?: string; anexo?: number; regime?: string };
    escritorio?: { nome?: string; crc?: string; logo_url?: string };
    janela?: string | null;
  } | null;

  let analise: Record<string, unknown> | null = snap?.analise ?? null;
  let empresa: { razao_social?: string; cnpj?: string; anexo?: number; regime?: string } | null =
    snap?.empresa ?? null;
  let t: { nome?: string; crc?: string; logo_url?: string } | null = snap?.escritorio ?? null;

  if (!analise) {
    const { data: aoVivo } = await supabase
      .from("analises")
      .select("id, rq, ch, cl, re, fc, saida, prioridade, respostas, calculado_em, empresa_id, parametros")
      .eq("id", laudo.analise_id)
      .maybeSingle();
    if (!aoVivo) notFound();
    analise = aoVivo as unknown as Record<string, unknown>;

    const { data: emp } = await supabase
      .from("empresas")
      .select("razao_social, cnpj, anexo, regime")
      .eq("id", aoVivo.empresa_id)
      .maybeSingle();
    empresa = emp;
  }

  if (!t) {
    const { data: perfil } = await supabase
      .from("profiles")
      .select("tenants(nome, crc, logo_url)")
      .maybeSingle();
    t = perfil?.tenants as { nome?: string; crc?: string; logo_url?: string } | null;
  }

  const a = analise as unknown as AnaliseGravada;
  const rec = recomendacao(a);
  const cor = COR_HEX[rec.cor];
  const premissas = premissasEmTexto(a.respostas);
  const resultado = resultadoEmTexto(a);
  const base = baseDeCalculo(a);
  const estimado = dDASestimado(a);
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

        {base.length > 0 && (
          <>
            <div className="sec">Base de cálculo</div>
            <ul>{base.map((p, i) => <li key={i}>{p}</li>)}</ul>
            {estimado && (
              <div className="prio" style={{ borderColor: "#D97706", background: "#FFFBEB", color: "#92580A" }}>
                RBT12 não informada nesta análise: a parcela do DAS foi estimada pelo topo da faixa.
                Informe a receita bruta dos 12 meses para o número exato.
              </div>
            )}
          </>
        )}

        <div className="sec">Recomendação</div>
        <div className="box" style={{ borderColor: cor }}>
          <b style={{ color: cor }}>{rec.titulo}.</b> {rec.descricao}
        </div>

        <div className="foot">
          Estimativa de cenário construída a partir de premissas informadas pelo contador
          responsável. Alíquota de referência da CBS sujeita a ajuste de neutralidade. Este
          documento organiza a decisão; a responsabilidade técnica é do profissional que o assina.
          {snap?.analise && (
            <>
              {" "}
              Os valores acima foram registrados na emissão e não se alteram por revisões
              posteriores da análise.
            </>
          )}
        </div>
        <div className="verif">
          <b>Verificação de autenticidade.</b> Este laudo pode ser conferido em{" "}
          <b>enquadria.com.br/verificar</b>, informando o número{" "}
          <b>{numero}</b> e o CNPJ da empresa.
        </div>

        <div className="sign">Contador responsável</div>
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
        .prio { border-left: 3px solid #DC2626; background: #FEF2F2; color: #A32D2D; padding: 9px 12px; font-size: 12.5px; margin-bottom: 18px; }
        .sec { font-family: 'IBM Plex Mono', monospace; font-size: 9.5px; letter-spacing: .14em; text-transform: uppercase; color: #0E7490; margin: 20px 0 7px; }
        ul { margin: 0 0 4px 18px; }
        li { margin-bottom: 4px; }
        .box { border: 1px solid; background: #F8FAFC; border-radius: 6px; padding: 12px 14px; font-size: 13.5px; }
        .foot { margin-top: 26px; padding-top: 12px; border-top: 1px solid #EEF2F7; font-size: 10px; color: #64748B; line-height: 1.6; }
        .verif { margin-top: 12px; border: 1px dashed #A5F3FC; background: #ECFEFF; border-radius: 6px; padding: 9px 12px; font-size: 10.5px; color: #0E7490; line-height: 1.55; }
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
