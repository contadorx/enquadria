/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // as fontes vêm do CDN em runtime; sem isso o build tenta baixá-las
  optimizeFonts: false,
};
export default nextConfig;
