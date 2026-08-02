"use client";

import { useState } from "react";

/**
 * O QUE FAZER COM O CERTIFICADO DEPOIS DE EMITIDO.
 *
 * Três coisas diferentes, que costumam ser confundidas em uma só:
 *
 * 1. ADICIONAR AO PERFIL — entra na seção "Licenças e certificados" do
 *    LinkedIn, com nome, data, código e link de verificação. É o que fica.
 * 2. POSTAR — abre o compositor do LinkedIn com o link; a prévia usa a imagem
 *    gerada pelo opengraph-image. É o que dá alcance.
 * 3. BAIXAR A IMAGEM — para quem prefere subir como imagem, ou postar em rede
 *    que não lê prévia de link (Instagram, story).
 *
 * O botão de adicionar ao perfil usa `organizationName`. Se um dia existir
 * página da empresa no LinkedIn, troque por `organizationId=<id numérico>` —
 * aí o logo aparece no perfil de quem adicionou. Os dois não podem ir juntos.
 */
export function CompartilharCertificado({
  codigo,
  emitidoEm,
  curso,
}: {
  codigo: string;
  emitidoEm: string;
  curso: string;
}) {
  const [copiado, setCopiado] = useState(false);
  const url = `https://app.enquadria.com.br/certificado/${codigo}`;
  const d = new Date(emitidoEm);

  const linkedinPerfil =
    "https://www.linkedin.com/profile/add?" +
    new URLSearchParams({
      startTask: "CERTIFICATION_NAME",
      name: curso,
      organizationName: "Enquadria",
      issueYear: String(d.getFullYear()),
      issueMonth: String(d.getMonth() + 1),
      certId: codigo,
      certUrl: url,
    }).toString();

  const linkedinPost =
    "https://www.linkedin.com/sharing/share-offsite/?url=" + encodeURIComponent(url);

  const zap =
    "https://wa.me/?text=" +
    encodeURIComponent(`Concluí o curso "${curso}", do Enquadria. Certificado: ${url}`);

  const botao =
    "inline-flex items-center gap-2 rounded-sm px-3.5 py-2.5 text-[13.5px] font-semibold";

  return (
    <div className="no-print mx-auto mt-6 max-w-[900px] px-5">
      <div className="rounded-lg border border-line bg-surface p-5">
        <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted">
          Mostrar para quem interessa
        </div>
        <p className="mt-1.5 max-w-[64ch] text-[13.5px] text-slate2">
          O link é público e o código confere o certificado sem login — qualquer pessoa que receber
          consegue confirmar que é verdadeiro.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={linkedinPerfil}
            target="_blank"
            rel="noreferrer"
            className={`${botao} bg-[#0A66C2] text-white`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14zm1.78 13.02H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z" />
            </svg>
            Adicionar ao perfil do LinkedIn
          </a>

          <a href={linkedinPost} target="_blank" rel="noreferrer" className={`${botao} border border-line text-slate2`}>
            Publicar no LinkedIn
          </a>

          <a href={zap} target="_blank" rel="noreferrer" className={`${botao} border border-line text-slate2`}>
            WhatsApp
          </a>

          <button
            onClick={() => {
              navigator.clipboard?.writeText(url);
              setCopiado(true);
              setTimeout(() => setCopiado(false), 2000);
            }}
            className={`${botao} border border-line text-slate2`}
          >
            {copiado ? "Link copiado ✓" : "Copiar link"}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-linesoft pt-3">
          <span className="text-[12.5px] text-muted">Imagem para postar:</span>
          <a
            href={`/certificado/${codigo}/imagem`}
            className="text-[12.5px] font-semibold text-accentdeep underline underline-offset-2"
          >
            1200×630 (post e prévia de link)
          </a>
          <a
            href={`/certificado/${codigo}/imagem?f=quadrado`}
            className="text-[12.5px] font-semibold text-accentdeep underline underline-offset-2"
          >
            1080×1080 (feed quadrado)
          </a>
        </div>

        <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
          No LinkedIn, “adicionar ao perfil” já vai com o nome do curso, a data, o código{" "}
          <b className="font-mono">{codigo}</b> e o link de verificação preenchidos. Confira antes de
          salvar — o LinkedIn deixa editar tudo na hora.
        </p>
      </div>
    </div>
  );
}
