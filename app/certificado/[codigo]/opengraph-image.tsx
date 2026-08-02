import { ImageResponse } from "next/og";
import { buscarCertificado, desenho, opcoesImagem } from "@/lib/cert-imagem";

/**
 * A prévia que o LinkedIn, o WhatsApp e o Telegram mostram quando alguém cola
 * o link do certificado. Sem isto, o link vira uma tira cinza sem nada.
 */
export const runtime = "nodejs";
export const alt = "Certificado — A decisão de setembro | Enquadria";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Imagem({ params }: { params: { codigo: string } }) {
  const cert = await buscarCertificado(decodeURIComponent(params.codigo));
  if (!cert) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0B1220",
            color: "#fff",
            fontSize: 44,
            fontWeight: 700,
            fontFamily: "sans-serif",
          }}
        >
          Enquadria — certificado não encontrado
        </div>
      ),
      size
    );
  }
  return new ImageResponse(desenho(cert, false), await opcoesImagem(size));
}
