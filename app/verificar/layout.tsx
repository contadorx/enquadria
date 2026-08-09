import type { Metadata } from "next";

/**
 * O METADADO DA VERIFICAÇÃO PÚBLICA — 08/08/2026.
 *
 * O DEFEITO: `/verificar` está no sitemap (`lib/site.ts`) desde que a página
 * existe, mas o `page.tsx` é `"use client"` — e componente de cliente não pode
 * exportar `metadata`. O Next não avisa: ele simplesmente não encontra nenhum,
 * cai no `title` e na `description` genéricos do layout raiz ("Enquadria —
 * decisão de enquadramento IBS/CBS") e não emite canonical nenhum. Resultado:
 * a página que o sitemap convida a indexar chegava ao índice sem título
 * próprio, sem descrição própria e sem declarar seu endereço — e, como o mesmo
 * código também responde em `app.enquadria.com.br/verificar`, sem canonical
 * eram duas versões idênticas disputando a mesma consulta.
 *
 * POR QUE UM LAYOUT E NÃO UM COMPONENTE SERVIDOR: o formulário inteiro é
 * estado (modo, campos, resultado, erro) e vive no cliente. Quebrá-lo em uma
 * casca servidora só para pendurar metadado moveria JSX que funciona; o layout
 * exporta o `metadata` sem tocar em uma linha da tela.
 *
 * ELE NÃO DESENHA NADA de propósito: o `CascaPublica` da página já é a casca,
 * e um segundo invólucro aqui seria um cabeçalho duplicado.
 */

const TITULO = "Verificar um laudo ou termo de ciência — Enquadria";
const RESUMO =
  "Confirme a autenticidade de um laudo de enquadramento ou de um termo de " +
  "ciência emitido pelo Enquadria: empresa, escritório emissor, data e " +
  "assinatura. Sem conta e sem cadastro.";

export const metadata: Metadata = {
  title: TITULO,
  description: RESUMO,
  alternates: { canonical: "/verificar" },
  openGraph: {
    title: TITULO,
    description: RESUMO,
    url: "/verificar",
    siteName: "Enquadria",
    locale: "pt_BR",
    type: "website",
  },
};

export default function VerificarLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
