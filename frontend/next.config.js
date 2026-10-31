/** @type {import('next').NextConfig} */
const nextConfig = {
  // Export statique : « npm run build » produit le dossier « out/ », hébergeable gratuitement
  // comme site statique (Render Static Site) : pas de mise en veille côté site web.
  output: 'export',
  // Chaque page devient /page/index.html : fonctionne sur n'importe quel hébergeur statique.
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
};

module.exports = nextConfig;
