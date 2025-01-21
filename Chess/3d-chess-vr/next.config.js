/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compiler: {
    emotion: true,
  },
  eslint: {
    ignoreDuringBuilds: true, // This disables ESLint during build
  }
}

module.exports = nextConfig
