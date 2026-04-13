/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, crypto: false, stream: false, buffer: false };
    return config;
  },
  async rewrites() {
    return [
      { source: '/api/:path*', destination: 'http://localhost:4001/v1/:path*' },
    ];
  },
};
module.exports = nextConfig;
