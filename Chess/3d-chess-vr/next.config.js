/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Fridae's clock lives outside this app so the lane package can keep its own tests.
    externalDir: true,
  },
  eslint: {
    // CI runs `npm run lint` (flat config, no prompts). Next's own lint
    // command is not the gate.
    ignoreDuringBuilds: true,
  },
}

module.exports = nextConfig
