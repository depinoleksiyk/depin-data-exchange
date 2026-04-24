/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, crypto: false, stream: false, buffer: false };
    return config;
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
