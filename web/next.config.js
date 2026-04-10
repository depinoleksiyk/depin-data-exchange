/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      { source: '/api/:path*', destination: 'http://localhost:4001/v1/:path*' },
    ];
  },
};
module.exports = nextConfig;
