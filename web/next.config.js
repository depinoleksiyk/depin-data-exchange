/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (cfg) => {
    // Solana + wallet-adapter pull in Node-only modules the browser doesn't need.
    // Shim them out and suppress the logger polyfills that ship with wallet deps.
    cfg.resolve.fallback = Object.assign({}, cfg.resolve.fallback, {
      fs: false,
      net: false,
      tls: false,
      crypto: false,
    });
    cfg.externals = [...(cfg.externals || []), 'pino-pretty', 'encoding'];
    return cfg;
  },
  async rewrites() {
    return [
      // Frontend clients call /api/v1/..., /api/health etc — pass everything
      // after /api straight through to the gateway. Using an implicit /v1/
      // prefix here was a foot-gun: gateway.ts builds URLs like /api/v1/preview
      // and the old rewrite turned them into /v1/v1/preview on the gateway.
      { source: '/api/:path*', destination: 'http://localhost:4001/:path*' },
    ];
  },
};
module.exports = nextConfig;
