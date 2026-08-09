import Script from "next/script";
import { APP } from "@/lib/site";

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

/** o host do painel como ele foi congelado dentro do HTML aprovado */
const HOST_CRAVADO = "https://app.enquadria.com.br";

/**
 * O ENDEREÇO DO PAINEL É RESOLVIDO NA HORA DE RENDERIZAR — 08/08/2026.
 *
 * O DEFEITO, em duas partes.
 *
 * 1. O HTML aprovado traz `https://app.enquadria.com.br` cravado em cada botão
 *    (oito vezes só na home), enquanto todo o resto do código lê o host do
 *    `APP` de `lib/site.ts`, que vem de env exatamente para o preview não falar
 *    por produção. Resultado: no preview da Vercel dava para conferir o site
 *    inteiro, menos o único caminho que importa — clicar em "Fazer a triagem
 *    grátis" levava para o painel de PRODUÇÃO, com os dados de clientes reais,
 *    e a mudança em teste nunca era vista.
 *
 * 2. Os botões apontavam para a RAIZ do painel, que o `middleware.ts`
 *    redireciona 307 para `/painel`. Um salto a mais no clique de maior
 *    intenção da página — e o `components/CascaMenu.tsx`, que é a mesma barra
 *    na outra metade do site, já aponta direto para `${APP}/painel`. As duas
 *    metades faziam coisas diferentes com o mesmo botão.
 *
 * POR QUE A TROCA É AQUI, EM TEMPO DE RENDER, E NÃO NA STRING DE CADA PÁGINA.
 * Trocar o literal por `${APP}` dentro do HTML exigiria converter cinco strings
 * de mil e novecentas linhas em template literal — e nessas strings todo `${`,
 * toda crase e toda barra invertida passariam a significar outra coisa: é o
 * jeito mais barato de quebrar visualmente uma página aprovada sem ninguém
 * perceber. Além disso, `ferramentas/auditar-casca.mjs` lê o HTML como texto e
 * identifica o CTA do celular justamente por ele começar com `https:`; um
 * `${APP}` cravado no meio do `<nav>` faria a auditoria do menu acusar
 * diferença entre as duas metades do site. Aqui a string continua sendo o HTML
 * aprovado, byte a byte, e só o endereço é reescrito na saída.
 *
 * A rota é preservada quando existe (`/verificar` continua `/verificar`); o que
 * ganha `/painel` é só o link que ia para a raiz.
 */
function comEnderecoDoPainel(html: string): string {
  return html.replace(
    new RegExp(`${HOST_CRAVADO.replace(/\./g, "\\.")}(/[^"'\\s\\\\]*)?`, "g"),
    (_, rota?: string) => `${APP}${rota || "/painel"}`
  );
}

export function FolhaDoSite({ html, scripts }: { html: string; scripts: string[] }) {
  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: comEnderecoDoPainel(html) }} />
      {scripts.map((src) => (
        <Script key={src} src={src} strategy="afterInteractive" />
      ))}
    </>
  );
}
