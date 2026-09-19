/** @type {import('next').NextConfig} */
const isCapacitor = process.env.CAPACITOR_BUILD === "1";

const nextConfig = {
  // Server/WHM deploy: standalone. Capacitor Android: static export to `out/`.
  output: isCapacitor ? "export" : "standalone",
  poweredByHeader: false,
  ...(isCapacitor
    ? {
        images: { unoptimized: true },
        // Ensure trailing paths work inside the Android WebView asset server
        trailingSlash: true,
      }
    : {}),
  // Allow importing the airport DB JSON from /data
  webpack: (config) => {
    return config;
  },
};

export default nextConfig;
