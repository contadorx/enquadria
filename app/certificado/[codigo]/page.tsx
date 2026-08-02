import Link from "next/link";
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase-admin";
import { BotaoImprimir } from "@/components/BotaoImprimir";
import { CURSO, MODULOS } from "@/lib/curso";

/**
 * O CERTIFICADO — página pública, conferível por qualquer pessoa.
 *
 * Mesmo princípio do laudo: o documento traz um código e o código abre uma
 * página que confirma nome, curso e data. Certificado em PDF que só existe no
 * computador de quem baixou não confirma nada a ninguém.
 *
 * Rota PÚBLICA: o middleware protege apenas /painel e /doc. A leitura usa
 * service role porque a tabela tem RLS ligada e nenhuma policy — e devolve
 * SÓ o que vai impresso. O e-mail de quem concluiu não sai daqui.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Certificado — ${CURSO.nome} | Enquadria`,
  robots: { index: false, follow: false },
};

interface Certificado {
  codigo: string;
  nome: string;
  crc: string | null;
  curso: string;
  aulas: number;
  minutos: number;
  emitido_em: string;
}

export default async function CertificadoPage({ params }: { params: { codigo: string } }) {
  const codigo = decodeURIComponent(params.codigo).toUpperCase().trim();
  const supabase = createAdminClient();

  let cert: Certificado | null = null;
  if (supabase) {
    const { data } = await supabase
      .from("curso_certificados")
      .select("codigo, nome, crc, curso, aulas, minutos, emitido_em")
      .eq("codigo", codigo)
      .maybeSingle();
    cert = (data as Certificado) ?? null;
  }

  if (!cert) {
    return (
      <div className="mx-auto max-w-xl px-5 py-16 text-center">
        <h1 className="text-[22px] font-bold text-ink">Código não encontrado</h1>
        <p className="mt-2 text-[15px] text-slate2">
          Não localizamos nenhum certificado com o código <b className="font-mono">{codigo}</b>.
          Confira se copiou o código inteiro, incluindo os traços.
        </p>
        <Link
          href="/curso"
          className="mt-6 inline-block rounded-sm bg-ink px-5 py-3 text-[14px] font-semibold text-white"
        >
          Ver o curso
        </Link>
      </div>
    );
  }

  const data = new Date(cert.emitido_em);
  const dataLonga = data.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const horas = Math.floor(cert.minutos / 60);
  const minutos = cert.minutos % 60;
  const carga = horas > 0 ? `${horas}h${String(minutos).padStart(2, "0")}` : `${minutos} minutos`;

  return (
    <div className="cert-doc">
      <div className="no-print mx-auto mb-4 flex max-w-[900px] items-center justify-between px-5 pt-6">
        <Link href="/curso" className="text-sm text-accentdeep">
          ← voltar ao curso
        </Link>
        <BotaoImprimir />
      </div>

      <div className="folha">
        <div className="borda">
          <div className="topo">
            <div className="marca">
              ENQUADRIA<span>.</span>
            </div>
            <div className="cod">
              CERTIFICADO
              <br />
              {cert.codigo}
            </div>
          </div>

          <div className="miolo">
            <div className="chapeu">Certificado de conclusão</div>
            <div className="nome">{cert.nome}</div>
            {cert.crc && <div className="crc">{cert.crc}</div>}

            <p className="texto">
              concluiu as <b>{cert.aulas} aulas</b> do curso <b>{cert.curso}</b>, sobre a opção de
              apuração de IBS e CBS fora do documento único de arrecadação do Simples Nacional
              aberta pela Resolução CGSN nº 186/2026, com carga horária de <b>{carga}</b>.
            </p>

            <div className="modulos">
              {MODULOS.map((m) => (
                <div key={m.numero} className="mod">
                  <span className="mn">Módulo {m.numero}</span>
                  <span className="mt">{m.titulo}</span>
                  <span className="ma">{m.aulas.length} aulas</span>
                </div>
              ))}
            </div>

            <div className="rodape">
              <div className="assin">
                <div className="linha" />
                <div className="quem">Leandro Oliveira</div>
                <div className="cargo">Contador e economista · Enquadria</div>
              </div>
              <div className="quando">
                <div className="dt">{dataLonga}</div>
                <div className="verif">
                  Confira este certificado em
                  <br />
                  <b>app.enquadria.com.br/certificado/{cert.codigo}</b>
                </div>
              </div>
            </div>
          </div>

          <div className="nota">
            Certificado de participação em curso livre, sem vínculo com instituição de ensino e sem
            carga horária reconhecida para fins de educação continuada. A conclusão é registrada a
            partir do acompanhamento do próprio participante. O conteúdo do curso apresenta
            estimativas de cenário; a decisão e a responsabilidade técnica são do contador que assina.
          </div>
        </div>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .cert-doc { background: #F1F5F9; min-height: 100vh; padding-bottom: 40px; }
        .folha { max-width: 900px; margin: 0 auto; background: #fff; border: 1px solid #E2E8F0; border-radius: 10px; padding: 18px; box-shadow: 0 30px 60px -30px rgba(11,18,32,.35); }
        .borda { border: 2px solid #0B1220; border-radius: 6px; padding: 34px 40px 26px; position: relative; }
        .borda::after { content: ""; position: absolute; inset: 8px; border: 1px solid #CFFAFE; border-radius: 3px; pointer-events: none; }
        .topo { display: flex; justify-content: space-between; align-items: flex-start; position: relative; z-index: 1; }
        .marca { font-size: 19px; font-weight: 800; letter-spacing: -.02em; color: #0B1220; }
        .marca span { color: #06B6D4; }
        .cod { font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; letter-spacing: .12em; color: #64748B; text-align: right; line-height: 1.7; }
        .miolo { text-align: center; padding: 26px 0 8px; position: relative; z-index: 1; }
        .chapeu { font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; letter-spacing: .28em; text-transform: uppercase; color: #0E7490; }
        .nome { font-size: 38px; font-weight: 800; letter-spacing: -.03em; color: #0B1220; margin: 14px 0 2px; line-height: 1.1; }
        .crc { font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: #64748B; margin-bottom: 6px; }
        .texto { max-width: 62ch; margin: 16px auto 0; font-size: 15px; line-height: 1.75; color: #334155; }
        .texto b { color: #0B1220; }
        .modulos { display: grid; gap: 6px; max-width: 520px; margin: 26px auto 0; text-align: left; }
        .mod { display: flex; align-items: baseline; gap: 12px; border-bottom: 1px solid #EEF2F7; padding-bottom: 6px; }
        .mod .mn { font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; color: #0E7490; width: 74px; flex: none; }
        .mod .mt { flex: 1; font-size: 14px; font-weight: 600; color: #0B1220; }
        .mod .ma { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: #64748B; }
        .rodape { display: flex; justify-content: space-between; align-items: flex-end; gap: 30px; margin-top: 40px; text-align: left; }
        .assin .linha { width: 230px; border-top: 1px solid #334155; margin-bottom: 7px; }
        .assin .quem { font-weight: 700; color: #0B1220; font-size: 14px; }
        .assin .cargo { font-size: 11.5px; color: #64748B; }
        .quando { text-align: right; }
        .quando .dt { font-family: 'IBM Plex Mono', monospace; font-size: 12.5px; color: #0B1220; }
        .quando .verif { font-size: 10px; color: #64748B; line-height: 1.6; margin-top: 8px; }
        .quando .verif b { font-family: 'IBM Plex Mono', monospace; color: #0E7490; }
        .nota { margin-top: 22px; padding-top: 12px; border-top: 1px solid #EEF2F7; font-size: 9.5px; line-height: 1.65; color: #94A3B8; text-align: center; position: relative; z-index: 1; }
        @media (max-width: 700px) {
          .folha { border: 0; border-radius: 0; padding: 10px; }
          .borda { padding: 22px 18px 18px; }
          .nome { font-size: 26px; }
          .rodape { flex-direction: column; align-items: flex-start; gap: 22px; }
          .quando { text-align: left; }
        }
        @media print {
          .no-print { display: none !important; }
          html, body { background: #fff !important; }
          .cert-doc { background: #fff; padding: 0; }
          .folha { border: 0; box-shadow: none; max-width: none; padding: 0; }
          @page { size: A4 landscape; margin: 12mm; }
        }
      `,
        }}
      />
    </div>
  );
}
