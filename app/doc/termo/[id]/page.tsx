import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { BotaoImprimir } from "@/components/BotaoImprimir";
import { formatarCnpj } from "@/lib/cnpj";
import { trilhaEmTexto } from "@/lib/esign";

export default async function TermoDoc({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: termo } = await supabase
    .from("termos")
    .select(
      "decisao, assinante_nome, assinante_cpf, assinante_email, assinado_em, assinatura_status, token, metodo, hash_documento, evidencia, carimbo, criado_em, analise_id, snapshot"
    )
    .eq("id", params.id)
    .maybeSingle();
  if (!termo) notFound();

  /**
   * Como no laudo: o termo é prova e lê o que foi congelado na criação. O
   * hash_documento continua sendo a garantia de integridade do que o signatário
   * aceitou; o snapshot garante que a APRESENTAÇÃO também não mude depois.
   */
  const snap = termo.snapshot as {
    decisao?: "optar" | "permanecer";
    empresa?: { razao_social?: string; cnpj?: string };
    escritorio?: { nome?: string; crc?: string; logo_url?: string };
  } | null;

  let empresa: { razao_social?: string; cnpj?: string } | null = snap?.empresa ?? null;
  let t: { nome?: string; crc?: string; logo_url?: string } | null = snap?.escritorio ?? null;

  if (!empresa) {
    const { data: analise } = await supabase
      .from("analises")
      .select("empresa_id")
      .eq("id", termo.analise_id)
      .maybeSingle();
    const { data: emp } = analise
      ? await supabase
          .from("empresas")
          .select("razao_social, cnpj")
          .eq("id", analise.empresa_id)
          .maybeSingle()
      : { data: null };
    empresa = emp;
  }

  if (!t?.nome) {
    const { data: perfil } = await supabase
      .from("profiles")
      .select("tenants(nome, crc, logo_url)")
      .maybeSingle();
    t = perfil?.tenants as { nome?: string; crc?: string; logo_url?: string } | null;
  }

  const optou = (snap?.decisao ?? termo.decisao) === "optar";
  const assinado = termo.assinatura_status === "assinado" || !!termo.assinado_em;
  const trilha = assinado
    ? trilhaEmTexto({
        assinante_nome: termo.assinante_nome,
        assinante_cpf: termo.assinante_cpf,
        assinante_email: termo.assinante_email,
        assinado_em: termo.assinado_em,
        metodo: termo.metodo,
        hash_documento: termo.hash_documento,
        evidencia: termo.evidencia as never,
        carimbo: termo.carimbo as never,
      })
    : [];

  return (
    <div className="doc">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href="/painel/fila" className="text-sm text-accentdeep">← voltar à fila</Link>
        <div className="flex gap-2">
          {!assinado && termo.token && (
            <a
              href={`/assinar/${termo.token}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-sm border border-line px-4 py-2 text-sm font-semibold text-accentdeep"
            >
              Abrir página de assinatura
            </a>
          )}
          <BotaoImprimir rotulo="Imprimir termo" />
        </div>
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
          <div className="wm">TERMO<br />{assinado ? "ASSINADO" : "ASSINATURA ELETRÔNICA"}</div>
        </div>

        <h1>Termo de ciência e decisão</h1>
        <div className="meta">
          {empresa?.razao_social} · {empresa?.cnpj ? formatarCnpj(empresa.cnpj) : ""} ·
          prazo legal: 1 a 30 de setembro de 2026 · efeito a partir de 2027
        </div>

        <p className="lead">
          A empresa declara que recebeu a análise de enquadramento, compreendeu os cenários
          apresentados e as premissas utilizadas, e formaliza sua decisão quanto ao recolhimento
          de IBS e CBS a partir de 2027.
        </p>

        <div className="sec">Decisão da empresa</div>
        <ul>
          <li>{optou ? "☑" : "☐"} <b>Optar pelo regime híbrido</b> — recolhimento fora do DAS</li>
          <li>{optou ? "☐" : "☑"} <b>Permanecer no regime tradicional</b></li>
        </ul>

        <div className="sec">Ciência dos efeitos</div>
        <ul>
          <li>A opção vale por semestre e não pode ser alterada no período.</li>
          <li>Quem não optar dentro do prazo permanece no regime tradicional.</li>
          <li>A decisão afeta preço, crédito ao cliente e competitividade.</li>
        </ul>

        <div className="box">
          {assinado ? (
            <>Assinado eletronicamente por <b>{termo.assinante_nome}</b> em{" "}
              {new Date(termo.assinado_em!).toLocaleString("pt-BR")}.</>
          ) : (
            <>Aguardando assinatura de <b>{termo.assinante_nome}</b> pela página de assinatura enviada
              (ou colha presencialmente e arquive).</>
          )}
        </div>

        {assinado && trilha.length > 0 && (
          <>
            <div className="sec">Trilha de auditoria</div>
            <ul>{trilha.map((l, i) => <li key={i} style={{ wordBreak: "break-all" }}>{l}</li>)}</ul>
          </>
        )}

        {termo.hash_documento && (
          <div className="verif">
            <b>Verificação de autenticidade.</b> Qualquer pessoa pode conferir este termo em{" "}
            <b>enquadria.com.br/verificar</b>, informando o código abaixo:
            <div className="cod">{termo.hash_documento}</div>
          </div>
        )}

        <div className="foot">
          Documento arquivado no dossiê da empresa. A validade da assinatura eletrônica decorre da
          Lei nº 14.063/2020 e da MP nº 2.200-2/2001, com a trilha de auditoria acima.
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
        .lead { margin-bottom: 4px; }
        .sec { font-family: 'IBM Plex Mono', monospace; font-size: 9.5px; letter-spacing: .14em; text-transform: uppercase; color: #0E7490; margin: 20px 0 7px; }
        ul { margin: 0 0 4px 18px; list-style: none; padding: 0; }
        li { margin-bottom: 5px; }
        .box { border: 1px solid #CAA24D33; border-color: #0E7490; background: #ECFEFF; border-radius: 6px; padding: 12px 14px; font-size: 13px; margin-top: 8px; }
        .foot { margin-top: 26px; padding-top: 12px; border-top: 1px solid #EEF2F7; font-size: 10px; color: #64748B; }
        .verif { margin-top: 16px; border: 1px dashed #A5F3FC; background: #ECFEFF; border-radius: 6px; padding: 9px 12px; font-size: 10.5px; color: #0E7490; line-height: 1.55; }
        .cod { font-family: 'IBM Plex Mono', monospace; font-size: 9.5px; color: #334155; word-break: break-all; margin-top: 4px; letter-spacing: .02em; }
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
