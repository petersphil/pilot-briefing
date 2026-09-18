/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output helps VPS/nginx+node deploys
  output: "standalone",
  poweredByHeader: false,
};

export default nextConfig;
