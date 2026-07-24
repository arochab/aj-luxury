import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Les visuels sont déjà optimisés en WebP. Cela évite un proxy d'images
    // inutile dans l'aperçu Vinext/Cloudflare.
    unoptimized: true,
  },
};

export default nextConfig;
