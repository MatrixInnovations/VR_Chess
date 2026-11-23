const staticExport = process.env.STATIC_EXPORT === '1'

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
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

// `output: 'export'` cannot serve custom headers. Netlify sets STATIC_EXPORT=1
// for a static publish. The default build keeps the CSP headers.
if (staticExport) {
  nextConfig.output = 'export'
  nextConfig.images = { unoptimized: true }
} else {
  nextConfig.headers = async function headers() {
    // `next dev` compiles the page with eval. Production responses stay on 'self'.
    const devScripts = process.env.NODE_ENV === 'production' ? '' : " 'unsafe-inline' 'unsafe-eval'"
    const devStyles = process.env.NODE_ENV === 'production' ? '' : " 'unsafe-inline'"
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), xr-spatial-tracking=(self)' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              `script-src 'self'${devScripts}`,
              `style-src 'self'${devStyles}`,
              "img-src 'self' data: blob:",
              // blob: is where GLTFLoader puts the textures inside the vendored controller and hand models.
              "connect-src 'self' blob: https://lichess.org",
              "worker-src 'self' blob:",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ]
  }
}

module.exports = nextConfig
