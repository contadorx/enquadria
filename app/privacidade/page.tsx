import type { Metadata } from "next";
import { DocumentoLegal, docPorSlug } from "@/components/DocumentoLegal";

const doc = docPorSlug("privacidade");

export const metadata: Metadata = {
  title: `${doc?.titulo} | Enquadria`,
  description: doc?.resumo,
  /* Site e app passaram a morar no MESMO deploy: esta página É a página do
     site. O canônico é ela mesma, e o noindex que existia aqui — herdado de
     quando o app era outro host — mandava o buscador ignorar a única cópia
     que existe. Quem impede a duplicata agora é o middleware, que devolve
     `X-Robots-Tag: noindex` quando a URL é servida pelo host `app.`. */
  alternates: { canonical: "/privacidade" },
};

export default function Pagina() {
  return <DocumentoLegal slug="privacidade" />;
}
