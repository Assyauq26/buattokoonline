// Fail closed even when Next CLI is invoked without npm scripts.
require('node:child_process').execFileSync(process.execPath, [require('node:path').join(__dirname, 'scripts/security/prepare-braces.mjs')], { stdio: 'inherit' });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: { "/*": ["./src/modules/regions/data/snapshot.json.gz"] },
  async headers() {
    return [{ source: "/api/v1/admin/store-appearance", headers: [{ key: "Cache-Control", value: "private, no-store" }, { key: "Vary", value: "Cookie" }] }, { source: "/admin/customize", headers: [{ key: "Cache-Control", value: "private, no-store" }] }, { source: "/api/v1/admin/store-branding/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }, { key: "Vary", value: "Cookie" }] }, { source: "/store-customize-preview", headers: [
      { key: "Cache-Control", value: "private, no-store" },
      { key: "Content-Security-Policy", value: "connect-src 'none'; form-action 'none'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ] }];
  },
  webpack(config, { isServer, dev }) {
    if (!isServer && !dev) config.module.rules.push({ test: /next[\/]dist[\/]compiled[\/]react-dom[\/]cjs[\/]react-dom-client\.production\.js$/, use: [require.resolve('./scripts/webpack/react-runtime-backports-loader.cjs')] });
    return config;
  },
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  experimental: {
    cpus: 1,
    serverActions: {
      bodySizeLimit: "4.25mb",
    },
  },
};

module.exports = nextConfig;
