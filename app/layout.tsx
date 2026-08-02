import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Enquadria — decisão de enquadramento IBS/CBS",
  description:
    "Triagem da carteira, decisão de regime e prova documental para a janela de opção do Simples Nacional.",
  /**
   * O ÍCONE DO APP. Existia só no site; aqui a aba ficava com o quadrado
   * genérico do navegador — e o contador trabalha com a carteira aberta o dia
   * inteiro, muitas vezes entre dez abas. Aba sem ícone é aba que ele não
   * acha.
   *
   * Os arquivos são `app/icon.svg` e `app/apple-icon.svg`: o Next descobre
   * pelos nomes e monta as tags sozinho. É o mesmo desenho do site — a marca é
   * uma só.
   */
  icons: { icon: "/icon.svg", apple: "/apple-icon.svg" },
  applicationName: "Enquadria",
  appleWebApp: { capable: true, title: "Enquadria", statusBarStyle: "black-translucent" },
};

/**
 * Declarado explicitamente por dois motivos: `viewportFit: "cover"` é o que faz
 * o `env(safe-area-inset-bottom)` da barra inferior valer alguma coisa no
 * iPhone com faixa inferior, e o themeColor pinta a barra do navegador com o
 * mesmo tom do cabeçalho em vez do cinza padrão.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0B1220",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
