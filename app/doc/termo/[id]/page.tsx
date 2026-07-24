import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { BotaoImprimir } from "@/components/BotaoImprimir";
import { formatarCnpj } from "@/lib/cnpj";

export default async function TermoDoc({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: termo } = await supabase
    .from("termos")
    .select("decisao, assinante_nome, assinado_em, assinatura_url, criado_em, analise_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!termo) notFound();

  const { data: analise } = await supabase
    .from("analises")
    .select("empresa_id")
    .eq("id", termo.analise_id)
    .maybeSingle();

  const { data: empresa } = analise
    ? await supabase
        .from("empresas")
        .select("razao_social, cnpj")
        .eq("id", analise.empresa_id)
        .maybeSingle()
    : { data: null };

  const { data: perfil } = await supabase
    .from("profiles")
    .select("tenants(nome, crc)")
    .maybeSingle();
  const t = perfil?.tenants as { nome?: string; crc?: string } | null;

  const optou = termo.decisao === "optar";
  const assinado = !!termo.assinado_em;

  return (
    <div className="doc">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href="/painel/fila" className="text-sm text-accentdeep">← voltar à fila</Link>
        <div className="flex gap-2">
          {termo.assinatura_url && !assinado && (
            <a
              href={termo.assinatura_url}
              target="_blank"
              rel="noreferrer"
              className="rounded-sm border border-line px-4 py-2 text-sm font-semibold text-accentdeep"
            >
              Abrir link de assinatura
            </a>
          )}
          <BotaoImprimir rotulo="Imprimir termo" />
        </div>
      </div>

      <div className="sheet">
        <div className="brand">
          <div>
            <div className="firm">{t?.nome ?? "Escritório"}</div>
            {t?.crc && <div className="crc">{t.crc}</div>}
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
            <>Aguardando assinatura de <b>{termo.assinante_nome}</b>
              {termo.assinatura_url ? " pelo link de assinatura enviado." : " — para colher presencialmente."}</>
          )}
        </div>

        <div className="foot">
          Documento arquivado no dossiê da empresa. Cópia enviada ao e-mail cadastrado e ao
          contador responsável.
        </div>
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
        .lead { margin-bottom: 4px; }
        .sec { font-family: 'IBM Plex Mono', monospace; font-size: 9.5px; letter-spacing: .14em; text-transform: uppercase; color: #0E7490; margin: 20px 0 7px; }
        ul { margin: 0 0 4px 18px; list-style: none; padding: 0; }
        li { margin-bottom: 5px; }
        .box { border: 1px solid #CAA24D33; border-color: #0E7490; background: #ECFEFF; border-radius: 6px; padding: 12px 14px; font-size: 13px; margin-top: 8px; }
        .foot { margin-top: 26px; padding-top: 12px; border-top: 1px solid #EEF2F7; font-size: 10px; color: #64748B; }
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
