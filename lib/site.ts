/**
 * O ENDEREÇO CANÔNICO DO SITE — um lugar só.
 *
 * O mesmo código responde por dois domínios: `enquadria.com.br` (o site, que é
 * o que deve aparecer no Google) e `app.enquadria.com.br` (o painel, que não
 * deve aparecer em lugar nenhum). Sem uma constante, o canonical, o sitemap, o
 * robots e as URLs dos e-mails divergem — e conteúdo igual em dois endereços
 * divide a autoridade do domínio entre eles, que é o oposto do objetivo da
 * migração.
 *
 * Vem de env para o preview da Vercel não anunciar o domínio de produção.
 */
export const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://enquadria.com.br").replace(
  /\/$/,
  ""
);

/** o host do painel — para onde o site manda quem vai trabalhar */
export const APP = (process.env.NEXT_PUBLIC_APP_URL || "https://app.enquadria.com.br").replace(
  /\/$/,
  ""
);

/** as páginas do site que entram no índice, com o peso relativo entre elas */
export const PAGINAS_PUBLICAS: { rota: string; prioridade: number; frequencia: "daily" | "weekly" | "monthly" }[] = [
  { rota: "/", prioridade: 1, frequencia: "weekly" },
  { rota: "/como-funciona", prioridade: 0.8, frequencia: "monthly" },
  /* o conteúdo que muda com a regulamentação: é o que dá motivo de voltar ao
     site, e por isso a frequência é semanal e a prioridade alta */
  { rota: "/reforma", prioridade: 0.9, frequencia: "weekly" },
  { rota: "/precos", prioridade: 0.8, frequencia: "monthly" },
  /* saiu do MENU, não do índice: o guia continua público e indexado, alcançado
     pelo rodapé, pelo curso e pelo pé da Reforma. Tirar do menu foi parar de
     disputar o mesmo clique com o curso — não despublicar. */
  { rota: "/guia", prioridade: 0.7, frequencia: "monthly" },
  { rota: "/faq", prioridade: 0.6, frequencia: "monthly" },
  { rota: "/curso", prioridade: 0.9, frequencia: "weekly" },
  { rota: "/exemplo", prioridade: 0.6, frequencia: "monthly" },
  { rota: "/verificar", prioridade: 0.4, frequencia: "monthly" },
  { rota: "/politicas", prioridade: 0.2, frequencia: "monthly" },
  { rota: "/privacidade", prioridade: 0.2, frequencia: "monthly" },
  { rota: "/termos", prioridade: 0.2, frequencia: "monthly" },
  { rota: "/seguranca", prioridade: 0.3, frequencia: "monthly" },
];
