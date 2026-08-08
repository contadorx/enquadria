import Script from "next/script";

/**
 * A FOLHA DO SITE — o HTML aprovado, servido pelo Next.
 *
 * POR QUE `dangerouslySetInnerHTML` E NÃO JSX.
 *
 * O site institucional existe, está aprovado, foi revisado de compliance e está
 * no ar há semanas. Reescrever mil e novecentas linhas de HTML em JSX no mesmo
 * movimento em que se troca o DNS somaria um risco de regressão VISUAL a um
 * risco de INFRAESTRUTURA — e quando algo saísse torto ninguém saberia qual dos
 * dois causou.
 *
 * Aqui o HTML entra igual, byte a byte. O que mudou foi o endereço que o serve.
 * A conversão para JSX pode vir depois, página a página, com a versão antiga no
 * ar ao lado para comparar.
 *
 * O QUE ISTO NÃO É: não é conteúdo de terceiro. É o nosso próprio HTML, gerado
 * por nós, versionado no repositório. `dangerouslySetInnerHTML` é perigoso
 * quando a fonte é externa ou vem do usuário; aqui a fonte é o build.
 *
 * Os `<script src>` saem do corpo e entram por `next/script` de propósito:
 * script dentro de `innerHTML` NÃO executa — o navegador ignora, por regra da
 * própria especificação. Sem isto, o balão do agente e os formulários do site
 * apareceriam na tela e não funcionariam, que é a pior forma de quebrar.
 */
export function FolhaDoSite({ html, scripts }: { html: string; scripts: string[] }) {
  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: html }} />
      {scripts.map((src) => (
        <Script key={src} src={src} strategy="afterInteractive" />
      ))}
    </>
  );
}
