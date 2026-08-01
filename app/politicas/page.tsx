import type { Metadata } from "next";
import { DocumentoLegal, docPorSlug } from "@/components/DocumentoLegal";

const doc = docPorSlug("politicas");

export const metadata: Metadata = {
  title: `${doc?.titulo} | Enquadria`,
  description: doc?.resumo,
  // o documento canônico é o do site institucional; esta cópia serve a quem
  // está dentro do app e não deve duplicar conteúdo na busca
  alternates: { canonical: "https://enquadria.com.br/politicas" },
  robots: { index: false, follow: true },
};

export default function Pagina() {
  return <DocumentoLegal slug="politicas" />;
}
