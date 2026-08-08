/**
 * OS REDIRECIONAMENTOS DA MIGRAÇÃO.
 *
 * O site viveu meses no HostGator com endereços terminados em `.html`. Esses
 * endereços estão em e-mails enviados, no rodapé de PDFs que circulam, em
 * mensagens de WhatsApp e — se algum já foi indexado — no Google. Trocar de
 * hospedagem sem eles é transformar cada link antigo num 404.
 *
 * 308 (permanente) de propósito: é o que faz o buscador transferir o histórico
 * do endereço velho para o novo, em vez de tratar os dois como páginas
 * diferentes competindo entre si.
 */
const antigo = (de, para) => ({ source: de, destination: para, permanent: true });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // as fontes vêm do CDN em runtime; sem isso o build tenta baixá-las
  optimizeFonts: false,

  async redirects() {
    return [
      antigo("/index.html", "/"),
      antigo("/como-funciona.html", "/como-funciona"),
      antigo("/precos.html", "/precos"),
      antigo("/faq.html", "/faq"),
      antigo("/politicas.html", "/politicas"),
      antigo("/privacidade.html", "/privacidade"),
      antigo("/seguranca.html", "/seguranca"),
      antigo("/termos.html", "/termos"),
      antigo("/guia/index.html", "/guia"),
      antigo("/curso/index.html", "/curso"),
      /* as nove aulas eram páginas soltas; agora são uma rota com slug. O
         mapeamento é por número porque é assim que os links antigos existem. */
      antigo("/curso/aula-:n(\\d+).html", "/curso"),
    ];
  },
};
export default nextConfig;
