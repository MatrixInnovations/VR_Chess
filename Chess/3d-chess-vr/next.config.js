/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // CI runs `npm run lint` (flat config, no prompts). Next's own lint
    // command is not the gate.
    ignoreDuringBuilds: true,
  },
}

module.exports = nextConfig
