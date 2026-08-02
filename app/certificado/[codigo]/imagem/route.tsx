import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { buscarCertificado, desenho, opcoesImagem } from "@/lib/cert-imagem";

/**
 * A imagem para BAIXAR e postar.
 *
 * ?f=quadrado devolve 1080×1080 (feed do Instagram e afins); sem parâmetro,
 * 1200×630, que é o formato do post do LinkedIn e da prévia de link.
 *
 * É o mesmo desenho da prévia — de propósito. Se a pessoa posta a imagem e o
 * link mostra outra coisa, o material parece improvisado.
 */
export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: { codigo: string } }) {
  const cert = await buscarCertificado(decodeURIComponent(params.codigo));
  if (!cert) return NextResponse.json({ erro: "certificado não encontrado" }, { status: 404 });

  const quadrado = new URL(req.url).searchParams.get("f") === "quadrado";
  const size = quadrado ? { width: 1080, height: 1080 } : { width: 1200, height: 630 };

  const img = new ImageResponse(desenho(cert, quadrado), await opcoesImagem(size));
  const buf = await img.arrayBuffer();

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="certificado-enquadria-${cert.codigo}${quadrado ? "-quadrado" : ""}.png"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
